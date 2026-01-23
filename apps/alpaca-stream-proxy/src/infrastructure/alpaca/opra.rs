//! OPRA WebSocket Client
//!
//! Connects to Alpaca's OPRA (Options Price Reporting Authority) stream for
//! real-time options market data including quotes and trades.
//!
//! # Stream URL
//!
//! - Production: `wss://stream.data.alpaca.markets/v1beta1/opra`
//! - Sandbox: `wss://stream.data.sandbox.alpaca.markets/v1beta1/indicative`
//!
//! # Protocol
//!
//! All messages (including auth and subscriptions) use `MessagePack` binary encoding.
//! This is different from SIP which uses JSON - OPRA requires msgpack format
//! (error 412 if not used).

use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;
use tokio_util::sync::CancellationToken;

use super::auth::{AuthHandler, AuthState, Credentials};
use super::codec::{CodecError, MsgPackCodec};
use super::heartbeat::{HeartbeatConfig, HeartbeatEvent, HeartbeatManager, HeartbeatState};
use super::messages::{AlpacaMessage, SubscriptionRequest};
use super::reconnect::{ReconnectConfig, ReconnectPolicy};

// =============================================================================
// Error Type
// =============================================================================

/// Errors that can occur in the OPRA client.
#[derive(Debug, thiserror::Error)]
pub enum OpraClientError {
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
// OPRA Client Events
// =============================================================================

/// Events emitted by the OPRA client.
#[derive(Debug, Clone)]
pub enum OpraEvent {
    /// Successfully connected and authenticated.
    Connected,
    /// Disconnected from server.
    Disconnected,
    /// Reconnecting to server.
    Reconnecting {
        /// Reconnection attempt number.
        attempt: u32,
    },
    /// Received an option quote.
    Quote(super::messages::OptionQuoteMessage),
    /// Received an option trade.
    Trade(super::messages::OptionTradeMessage),
    /// Subscription confirmation.
    Subscribed {
        /// Subscribed quote symbols.
        quotes: Vec<String>,
        /// Subscribed trade symbols.
        trades: Vec<String>,
    },
    /// Error occurred.
    Error(String),
}

// =============================================================================
// OPRA Client Configuration
// =============================================================================

/// Configuration for the OPRA client.
#[derive(Debug, Clone)]
pub struct OpraClientConfig {
    /// WebSocket URL.
    pub url: String,
    /// API credentials.
    pub credentials: Credentials,
    /// Reconnection configuration.
    pub reconnect: ReconnectConfig,
    /// Heartbeat configuration.
    pub heartbeat: HeartbeatConfig,
}

impl OpraClientConfig {
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
    ///
    /// Uses the `indicative` feed which provides indicative options data
    /// (available on basic plan). Note: Market data streams always use
    /// production URLs - paper vs live only affects trading API.
    #[must_use]
    pub fn paper(credentials: Credentials) -> Self {
        Self::new(
            "wss://stream.data.alpaca.markets/v1beta1/indicative".to_string(),
            credentials,
        )
    }

    /// Create configuration for live trading environment.
    ///
    /// Uses the full OPRA feed (requires Algo Trader Plus subscription).
    #[must_use]
    pub fn live(credentials: Credentials) -> Self {
        Self::new(
            "wss://stream.data.alpaca.markets/v1beta1/opra".to_string(),
            credentials,
        )
    }
}

// =============================================================================
// Option Subscription State
// =============================================================================

/// Tracks current option subscriptions.
#[derive(Debug, Default, Clone)]
pub struct OptionSubscriptionState {
    /// Symbols subscribed for quotes.
    pub quotes: Vec<String>,
    /// Symbols subscribed for trades.
    pub trades: Vec<String>,
}

impl OptionSubscriptionState {
    /// Check if there are any active subscriptions.
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.quotes.is_empty() && self.trades.is_empty()
    }

    /// Create a subscribe request to restore all subscriptions.
    #[must_use]
    pub fn to_subscribe_request(&self) -> Option<SubscriptionRequest> {
        if self.is_empty() {
            None
        } else {
            Some(
                SubscriptionRequest::subscribe()
                    .with_quotes(self.quotes.clone())
                    .with_trades(self.trades.clone()),
            )
        }
    }
}

// =============================================================================
// OPRA Client
// =============================================================================

/// OPRA WebSocket client for options market data.
///
/// Manages the connection lifecycle including:
/// - Authentication
/// - Heartbeat monitoring
/// - Automatic reconnection with exponential backoff
/// - Subscription management
///
/// Unlike the SIP client which uses JSON, OPRA uses `MessagePack` binary encoding
/// for ALL messages (auth, subscriptions, and market data).
pub struct OpraClient {
    config: OpraClientConfig,
    msgpack_codec: MsgPackCodec,
    event_tx: mpsc::Sender<OpraEvent>,
    cancel: CancellationToken,
    subscriptions: parking_lot::RwLock<OptionSubscriptionState>,
}

impl OpraClient {
    /// Create a new OPRA client.
    #[must_use]
    pub fn new(
        config: OpraClientConfig,
        event_tx: mpsc::Sender<OpraEvent>,
        cancel: CancellationToken,
    ) -> Self {
        Self {
            config,
            msgpack_codec: MsgPackCodec::new(),
            event_tx,
            cancel,
            subscriptions: parking_lot::RwLock::new(OptionSubscriptionState::default()),
        }
    }

    /// Run the OPRA client connection loop.
    ///
    /// This method connects to the WebSocket server, authenticates,
    /// and processes messages until cancelled or an unrecoverable error occurs.
    ///
    /// # Errors
    ///
    /// Returns an error if a connection attempt fails or the stream encounters
    /// an unrecoverable error while processing messages.
    pub async fn run(self: Arc<Self>) -> Result<(), OpraClientError> {
        let mut reconnect_policy = ReconnectPolicy::new(self.config.reconnect.clone());

        loop {
            if self.cancel.is_cancelled() {
                tracing::info!("OPRA client cancelled");
                return Ok(());
            }

            match self.connect_and_run().await {
                Ok(()) => {
                    tracing::info!("OPRA connection closed gracefully");
                    return Ok(());
                }
                Err(e) => {
                    tracing::warn!(error = %e, "OPRA connection error");

                    // Send disconnected event
                    let _ = self.event_tx.send(OpraEvent::Disconnected).await;

                    // Check if we should retry
                    if let Some(delay) = reconnect_policy.next_delay() {
                        let attempt = reconnect_policy.attempt_count();
                        tracing::info!(
                            attempt,
                            delay_ms = delay.as_millis(),
                            "Reconnecting to OPRA stream"
                        );

                        let _ = self
                            .event_tx
                            .send(OpraEvent::Reconnecting { attempt })
                            .await;

                        tokio::select! {
                            () = self.cancel.cancelled() => {
                                tracing::info!("OPRA client cancelled during reconnect delay");
                                return Ok(());
                            }
                            () = tokio::time::sleep(delay) => {}
                        }
                    } else {
                        return Err(OpraClientError::MaxReconnectAttemptsExceeded);
                    }
                }
            }
        }
    }

    /// Connect to WebSocket and run until error or cancellation.
    async fn connect_and_run(&self) -> Result<(), OpraClientError> {
        tracing::info!(url = %self.config.url, "Connecting to OPRA stream");

        // Connect to WebSocket
        let (ws_stream, _response) = tokio_tungstenite::connect_async(&self.config.url).await?;

        let (mut write, mut read) = ws_stream.split();

        // Set up authentication handler
        let mut auth_handler = AuthHandler::new(self.config.credentials.clone());

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
                            return Err(OpraClientError::ConnectionClosed);
                        }
                        None => {
                            tracing::debug!("Heartbeat channel closed");
                        }
                    }
                }
                msg = read.next() => {
                    match msg {
                        Some(Ok(Message::Binary(data))) => {
                            heartbeat_state.record_pong();

                            self.handle_binary_message(
                                &data,
                                &mut auth_handler,
                                &mut write,
                            ).await?;
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
                            return Err(OpraClientError::ConnectionClosed);
                        }
                        Some(Ok(_)) => {
                            // Ignore other message types (e.g., Text for control messages)
                        }
                        Some(Err(e)) => {
                            heartbeat_cancel.cancel();
                            return Err(e.into());
                        }
                        None => {
                            tracing::info!("WebSocket stream ended");
                            heartbeat_cancel.cancel();
                            return Err(OpraClientError::ConnectionClosed);
                        }
                    }
                }
            }
        }
    }

    /// Handle a binary `MessagePack` message from the WebSocket.
    async fn handle_binary_message<W>(
        &self,
        data: &[u8],
        auth_handler: &mut AuthHandler,
        write: &mut W,
    ) -> Result<(), OpraClientError>
    where
        W: SinkExt<Message> + Unpin,
        W::Error: std::fmt::Display,
    {
        let messages = self.msgpack_codec.decode(data)?;

        for msg in messages {
            match msg {
                AlpacaMessage::Success(success) => {
                    let authenticated = auth_handler.on_success(&success)?;

                    if authenticated {
                        tracing::info!("OPRA stream authenticated");
                        let _ = self.event_tx.send(OpraEvent::Connected).await;

                        // Restore subscriptions if any
                        let subs = self.subscriptions.read().clone();
                        if let Some(request) = subs.to_subscribe_request() {
                            self.send_subscribe(write, &request).await?;
                        }
                    } else if auth_handler.state() == AuthState::Connected {
                        // Send authentication - use the to_msgpack method
                        let auth_msg = auth_handler.create_auth_request();
                        let msgpack = auth_msg.to_msgpack().map_err(|e| {
                            OpraClientError::ConnectionFailed(format!(
                                "failed to serialize auth: {e}"
                            ))
                        })?;

                        write
                            .send(Message::Binary(msgpack.into()))
                            .await
                            .map_err(|e| {
                                OpraClientError::ConnectionFailed(format!(
                                    "failed to send auth: {e}"
                                ))
                            })?;
                    }
                }
                AlpacaMessage::Error(error) => {
                    tracing::error!(code = error.code, msg = %error.msg, "OPRA error");

                    if !auth_handler.is_authenticated() {
                        return Err(auth_handler.on_error(&error).into());
                    }

                    let _ = self.event_tx.send(OpraEvent::Error(error.msg)).await;
                }
                AlpacaMessage::Subscription(sub) => {
                    tracing::debug!(
                        quotes = ?sub.quotes,
                        trades = ?sub.trades,
                        "Subscription confirmed"
                    );

                    let _ = self
                        .event_tx
                        .send(OpraEvent::Subscribed {
                            quotes: sub.quotes,
                            trades: sub.trades,
                        })
                        .await;
                }
                AlpacaMessage::OptionQuote(quote) => {
                    let _ = self.event_tx.send(OpraEvent::Quote(quote)).await;
                }
                AlpacaMessage::OptionTrade(trade) => {
                    let _ = self.event_tx.send(OpraEvent::Trade(trade)).await;
                }
                _ => {
                    tracing::trace!("Ignoring unhandled message type");
                }
            }
        }

        Ok(())
    }

    /// Send a subscribe request using `MessagePack` encoding.
    async fn send_subscribe<W>(
        &self,
        write: &mut W,
        request: &SubscriptionRequest,
    ) -> Result<(), OpraClientError>
    where
        W: SinkExt<Message> + Unpin,
        W::Error: std::fmt::Display,
    {
        let msgpack = self.msgpack_codec.encode_named(request).map_err(|e| {
            OpraClientError::ConnectionFailed(format!("failed to serialize subscribe: {e}"))
        })?;

        tracing::debug!(
            quotes = ?request.quotes,
            trades = ?request.trades,
            "Sending subscribe request"
        );

        write
            .send(Message::Binary(msgpack.into()))
            .await
            .map_err(|e| {
                OpraClientError::ConnectionFailed(format!("failed to send subscribe: {e}"))
            })?;

        Ok(())
    }

    /// Subscribe to option symbols.
    ///
    /// # Arguments
    ///
    /// * `quotes` - Symbols to subscribe for quotes
    /// * `trades` - Symbols to subscribe for trades
    pub fn subscribe(&self, quotes: Vec<String>, trades: Vec<String>) {
        let mut subs = self.subscriptions.write();

        for sym in quotes {
            if !subs.quotes.contains(&sym) {
                subs.quotes.push(sym);
            }
        }
        for sym in trades {
            if !subs.trades.contains(&sym) {
                subs.trades.push(sym);
            }
        }
    }

    /// Unsubscribe from option symbols.
    ///
    /// # Arguments
    ///
    /// * `quotes` - Symbols to unsubscribe from quotes
    /// * `trades` - Symbols to unsubscribe from trades
    pub fn unsubscribe(&self, quotes: &[String], trades: &[String]) {
        let mut subs = self.subscriptions.write();

        subs.quotes.retain(|s| !quotes.contains(s));
        subs.trades.retain(|s| !trades.contains(s));
    }

    /// Get current subscriptions.
    #[must_use]
    pub fn subscriptions(&self) -> OptionSubscriptionState {
        self.subscriptions.read().clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn option_subscription_state_empty() {
        let state = OptionSubscriptionState::default();
        assert!(state.is_empty());
    }

    #[test]
    fn option_subscription_state_with_quotes() {
        let state = OptionSubscriptionState {
            quotes: vec!["AAPL240315C00172500".to_string()],
            trades: vec![],
        };
        assert!(!state.is_empty());
    }

    #[test]
    fn option_subscription_state_to_request() {
        let state = OptionSubscriptionState {
            quotes: vec![
                "AAPL240315C00172500".to_string(),
                "SPY240315P00450000".to_string(),
            ],
            trades: vec!["TSLA240315C00250000".to_string()],
        };

        let request = state.to_subscribe_request().unwrap();
        assert_eq!(request.quotes.len(), 2);
        assert_eq!(request.trades.len(), 1);
        assert!(request.bars.is_empty());
    }

    #[test]
    fn option_subscription_state_empty_returns_none() {
        let state = OptionSubscriptionState::default();
        assert!(state.to_subscribe_request().is_none());
    }

    #[test]
    fn opra_config_paper() {
        let creds = Credentials::new("key", "secret").unwrap();
        let config = OpraClientConfig::paper(creds);
        // Market data always uses production URLs (same data for paper/live)
        assert!(!config.url.contains("sandbox"));
        assert!(config.url.contains("stream.data.alpaca.markets"));
        assert!(config.url.contains("/v1beta1/indicative"));
    }

    #[test]
    fn opra_config_live() {
        let creds = Credentials::new("key", "secret").unwrap();
        let config = OpraClientConfig::live(creds);
        assert!(!config.url.contains("sandbox"));
        assert!(config.url.contains("stream.data.alpaca.markets"));
        assert!(config.url.contains("/v1beta1/opra"));
    }
}
