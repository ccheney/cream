//! Trade Updates WebSocket Client
//!
//! Connects to Alpaca's Trade Updates stream for real-time order events
//! including fills, cancellations, rejections, and status changes.
//!
//! # Stream URL
//!
//! - Production: `wss://api.alpaca.markets/stream`
//! - Sandbox: `wss://paper-api.alpaca.markets/stream`
//!
//! # Protocol
//!
//! Uses JSON encoding with a different authentication flow than market data streams.
//! After connecting, send authenticate action then listen request for `trade_updates`.

use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;
use tokio_util::sync::CancellationToken;

use super::auth::{AuthHandler, Credentials};
use super::codec::{CodecError, JsonCodec};
use super::heartbeat::{HeartbeatConfig, HeartbeatEvent, HeartbeatManager, HeartbeatState};
use super::messages::{AlpacaMessage, TradeUpdateMessage};
use super::reconnect::{ReconnectConfig, ReconnectPolicy};

// =============================================================================
// Error Type
// =============================================================================

/// Errors that can occur in the Trade Updates client.
#[derive(Debug, thiserror::Error)]
pub enum TradingClientError {
    /// WebSocket connection failed.
    #[error("WebSocket connection failed: {0}")]
    ConnectionFailed(String),

    /// WebSocket error.
    #[error("WebSocket error: {0}")]
    WebSocket(#[from] tokio_tungstenite::tungstenite::Error),

    /// Authentication failed.
    #[error("authentication failed: {0}")]
    AuthenticationFailed(#[from] super::auth::AuthError),

    /// Codec error.
    #[error("codec error: {0}")]
    Codec(#[from] CodecError),

    /// Channel send error.
    #[error("channel send error")]
    ChannelSend,

    /// Maximum reconnection attempts exceeded.
    #[error("maximum reconnection attempts exceeded")]
    MaxReconnectAttemptsExceeded,

    /// Connection closed.
    #[error("connection closed")]
    ConnectionClosed,
}

// =============================================================================
// Trading Client Events
// =============================================================================

/// Events emitted by the Trade Updates client.
#[derive(Debug, Clone)]
pub enum TradingEvent {
    /// Successfully connected and authenticated.
    Connected,
    /// Disconnected from server.
    Disconnected,
    /// Reconnecting to server.
    Reconnecting {
        /// Reconnection attempt number.
        attempt: u32,
    },
    /// Received a trade update.
    TradeUpdate(Box<TradeUpdateMessage>),
    /// Listening to trade updates confirmed.
    Listening,
    /// Error occurred.
    Error(String),
}

// =============================================================================
// Trading Client Configuration
// =============================================================================

/// Configuration for the Trade Updates client.
#[derive(Debug, Clone)]
pub struct TradingClientConfig {
    /// WebSocket URL.
    pub url: String,
    /// API credentials.
    pub credentials: Credentials,
    /// Reconnection configuration.
    pub reconnect: ReconnectConfig,
    /// Heartbeat configuration.
    pub heartbeat: HeartbeatConfig,
}

impl TradingClientConfig {
    /// Create a new configuration.
    #[must_use]
    pub fn new(url: String, credentials: Credentials) -> Self {
        Self {
            url,
            credentials,
            reconnect: ReconnectConfig::default(),
            heartbeat: HeartbeatConfig::default(),
        }
    }

    /// Create configuration for paper trading environment.
    #[must_use]
    pub fn paper(credentials: Credentials) -> Self {
        Self::new(
            "wss://paper-api.alpaca.markets/stream".to_string(),
            credentials,
        )
    }

    /// Create configuration for live trading environment.
    #[must_use]
    pub fn live(credentials: Credentials) -> Self {
        Self::new("wss://api.alpaca.markets/stream".to_string(), credentials)
    }
}

// =============================================================================
// Trading Client
// =============================================================================

/// Trade Updates WebSocket client.
///
/// Manages the connection lifecycle for trade updates including:
/// - Authentication (different flow than market data)
/// - Heartbeat monitoring
/// - Automatic reconnection with exponential backoff
pub struct TradingClient {
    config: TradingClientConfig,
    codec: JsonCodec,
    event_tx: mpsc::Sender<TradingEvent>,
    cancel: CancellationToken,
}

impl TradingClient {
    /// Create a new Trade Updates client.
    #[must_use]
    pub const fn new(
        config: TradingClientConfig,
        event_tx: mpsc::Sender<TradingEvent>,
        cancel: CancellationToken,
    ) -> Self {
        Self {
            config,
            codec: JsonCodec::new(),
            event_tx,
            cancel,
        }
    }

    /// Run the Trade Updates client connection loop.
    ///
    /// This method connects to the WebSocket server, authenticates,
    /// and processes messages until cancelled or an unrecoverable error occurs.
    ///
    /// # Errors
    ///
    /// Returns `TradingClientError` if the connection fails after exhausting
    /// reconnect attempts or if a non-recoverable error occurs while streaming.
    pub async fn run(self: Arc<Self>) -> Result<(), TradingClientError> {
        let mut reconnect_policy = ReconnectPolicy::new(self.config.reconnect.clone());

        loop {
            if self.cancel.is_cancelled() {
                tracing::info!("Trading client cancelled");
                return Ok(());
            }

            match self.connect_and_run().await {
                Ok(()) => {
                    tracing::info!("Trading connection closed gracefully");
                    return Ok(());
                }
                Err(e) => {
                    tracing::warn!(error = %e, "Trading connection error");

                    // Send disconnected event
                    let _ = self.event_tx.send(TradingEvent::Disconnected).await;

                    // Check if we should retry
                    if let Some(delay) = reconnect_policy.next_delay() {
                        let attempt = reconnect_policy.attempt_count();
                        tracing::info!(
                            attempt,
                            delay_ms = delay.as_millis(),
                            "Reconnecting to trade updates stream"
                        );

                        let _ = self
                            .event_tx
                            .send(TradingEvent::Reconnecting { attempt })
                            .await;

                        tokio::select! {
                            () = self.cancel.cancelled() => {
                                tracing::info!("Trading client cancelled during reconnect delay");
                                return Ok(());
                            }
                            () = tokio::time::sleep(delay) => {}
                        }
                    } else {
                        return Err(TradingClientError::MaxReconnectAttemptsExceeded);
                    }
                }
            }
        }
    }

    /// Connect to WebSocket and run until error or cancellation.
    async fn connect_and_run(&self) -> Result<(), TradingClientError> {
        tracing::info!(url = %self.config.url, "Connecting to trade updates stream");

        let (ws_stream, _response) = tokio_tungstenite::connect_async(&self.config.url).await?;
        let (mut write, mut read) = ws_stream.split();

        // Set up authentication handler (trade updates uses different flow)
        let mut auth_handler = AuthHandler::for_trade_updates(self.config.credentials.clone());

        // Set up heartbeat
        let heartbeat_state = Arc::new(HeartbeatState::new());
        let (heartbeat_tx, mut heartbeat_rx) = mpsc::channel::<HeartbeatEvent>(10);
        let heartbeat_cancel = CancellationToken::new();
        let heartbeat_manager = HeartbeatManager::new(
            self.config.heartbeat.clone(),
            heartbeat_state.clone(),
            heartbeat_tx,
            heartbeat_cancel.clone(),
        );

        // Spawn heartbeat manager
        let _heartbeat_handle = tokio::spawn(heartbeat_manager.run());

        // For trade updates, we need to send auth immediately after connection
        let auth_msg = auth_handler.create_auth_request();
        let json = auth_msg.to_json().map_err(|e| {
            TradingClientError::ConnectionFailed(format!("failed to serialize auth: {e}"))
        })?;

        write.send(Message::Text(json.into())).await.map_err(|e| {
            TradingClientError::ConnectionFailed(format!("failed to send auth: {e}"))
        })?;

        // Process messages
        loop {
            tokio::select! {
                () = self.cancel.cancelled() => {
                    heartbeat_cancel.cancel();
                    return Ok(());
                }
                heartbeat_event = heartbeat_rx.recv() => {
                    match heartbeat_event {
                        Some(HeartbeatEvent::SendPing) => {
                            heartbeat_state.mark_ping_sent();
                            write.send(Message::Ping(vec![].into())).await?;
                        }
                        Some(HeartbeatEvent::Timeout) => {
                            tracing::warn!("Heartbeat timeout");
                            heartbeat_cancel.cancel();
                            return Err(TradingClientError::ConnectionClosed);
                        }
                        None => {
                            tracing::debug!("Heartbeat channel closed");
                        }
                    }
                }
                msg = read.next() => {
                    match msg {
                        Some(Ok(Message::Text(text))) => {
                            heartbeat_state.record_pong();
                            self.handle_text_message(
                                &text,
                                &mut auth_handler,
                                &mut write,
                            ).await?;
                        }
                        Some(Ok(Message::Binary(data))) => {
                            heartbeat_state.record_pong();
                            // Alpaca sends Binary messages for trade updates
                            if let Ok(text) = String::from_utf8(data.to_vec()) {
                                self.handle_text_message(
                                    &text,
                                    &mut auth_handler,
                                    &mut write,
                                ).await?;
                            } else {
                                tracing::warn!(len = data.len(), "Received non-UTF8 binary message");
                            }
                        }
                        Some(Ok(Message::Pong(_))) => {
                            heartbeat_state.record_pong();
                        }
                        Some(Ok(Message::Ping(data))) => {
                            write.send(Message::Pong(data)).await?;
                        }
                        Some(Ok(Message::Close(_))) => {
                            tracing::info!("Server sent close frame");
                            heartbeat_cancel.cancel();
                            return Err(TradingClientError::ConnectionClosed);
                        }
                        Some(Ok(_)) => {
                            // Ignore other message types
                        }
                        Some(Err(e)) => {
                            heartbeat_cancel.cancel();
                            return Err(e.into());
                        }
                        None => {
                            tracing::info!("WebSocket stream ended");
                            heartbeat_cancel.cancel();
                            return Err(TradingClientError::ConnectionClosed);
                        }
                    }
                }
            }
        }
    }

    /// Handle a text message from the WebSocket.
    async fn handle_text_message<W>(
        &self,
        text: &str,
        auth_handler: &mut AuthHandler,
        write: &mut W,
    ) -> Result<(), TradingClientError>
    where
        W: SinkExt<Message> + Unpin,
        W::Error: std::fmt::Display,
    {
        let messages = self.codec.decode(text)?;

        for msg in messages {
            match msg {
                AlpacaMessage::Authorization(auth_response) => {
                    auth_handler.on_authorization(&auth_response)?;
                    tracing::info!("Trade updates authenticated");

                    // Send listen request for trade_updates
                    if let Some(listen_req) = auth_handler.create_listen_request() {
                        let json = serde_json::to_string(&listen_req).map_err(|e| {
                            TradingClientError::ConnectionFailed(format!(
                                "failed to serialize listen: {e}"
                            ))
                        })?;

                        write.send(Message::Text(json.into())).await.map_err(|e| {
                            TradingClientError::ConnectionFailed(format!(
                                "failed to send listen: {e}"
                            ))
                        })?;
                    }
                }
                AlpacaMessage::Listening(listening) => {
                    tracing::info!(streams = ?listening.data.streams, "Listening to trade updates");
                    let _ = self.event_tx.send(TradingEvent::Connected).await;
                    let _ = self.event_tx.send(TradingEvent::Listening).await;
                }
                AlpacaMessage::TradeUpdate(update) => {
                    tracing::debug!(
                        event = ?update.data.event,
                        order_id = %update.data.order.id,
                        "Trade update received"
                    );
                    let _ = self.event_tx.send(TradingEvent::TradeUpdate(update)).await;
                }
                AlpacaMessage::Error(error) => {
                    tracing::error!(code = error.code, msg = %error.msg, "Trading error");

                    if !auth_handler.is_authenticated() {
                        return Err(auth_handler.on_error(&error).into());
                    }

                    let _ = self.event_tx.send(TradingEvent::Error(error.msg)).await;
                }
                _ => {
                    tracing::trace!("Ignoring unhandled message type");
                }
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trading_config_paper() {
        let creds = Credentials::new("key", "secret").unwrap();
        let config = TradingClientConfig::paper(creds);
        assert!(config.url.contains("paper-api"));
        assert!(config.url.contains("/stream"));
    }

    #[test]
    fn trading_config_live() {
        let creds = Credentials::new("key", "secret").unwrap();
        let config = TradingClientConfig::live(creds);
        assert!(!config.url.contains("paper"));
        assert!(config.url.contains("api.alpaca.markets/stream"));
    }
}
