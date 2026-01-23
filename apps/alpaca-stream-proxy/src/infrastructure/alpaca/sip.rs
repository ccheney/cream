//! SIP WebSocket Client
//!
//! Connects to Alpaca's SIP (Securities Information Processor) stream for
//! real-time stock market data including quotes, trades, and bars.
//!
//! # Stream URL
//!
//! - Production: `wss://stream.data.alpaca.markets/v2/sip`
//! - Sandbox: `wss://stream.data.sandbox.alpaca.markets/v2/sip`
//!
//! # Protocol
//!
//! Messages are JSON-encoded arrays of market data objects.

use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;
use tokio_util::sync::CancellationToken;

use super::auth::{AuthHandler, AuthState, Credentials};
use super::codec::{CodecError, JsonCodec};
use super::heartbeat::{HeartbeatConfig, HeartbeatEvent, HeartbeatManager, HeartbeatState};
use super::messages::{AlpacaMessage, SubscriptionRequest};
use super::reconnect::{ReconnectConfig, ReconnectPolicy};

// =============================================================================
// Error Type
// =============================================================================

/// Errors that can occur in the SIP client.
#[derive(Debug, thiserror::Error)]
pub enum SipClientError {
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
// SIP Client Events
// =============================================================================

/// Events emitted by the SIP client.
#[derive(Debug, Clone)]
pub enum SipEvent {
    /// Successfully connected and authenticated.
    Connected,
    /// Disconnected from server.
    Disconnected,
    /// Reconnecting to server.
    Reconnecting {
        /// Reconnection attempt number.
        attempt: u32,
    },
    /// Received a stock quote.
    Quote(super::messages::StockQuoteMessage),
    /// Received a stock trade.
    Trade(super::messages::StockTradeMessage),
    /// Received a stock bar.
    Bar(super::messages::StockBarMessage),
    /// Subscription confirmation.
    Subscribed {
        /// Subscribed quote symbols.
        quotes: Vec<String>,
        /// Subscribed trade symbols.
        trades: Vec<String>,
        /// Subscribed bar symbols.
        bars: Vec<String>,
    },
    /// Error occurred.
    Error(String),
}

// =============================================================================
// SIP Client Configuration
// =============================================================================

/// Configuration for the SIP client.
#[derive(Debug, Clone)]
pub struct SipClientConfig {
    /// WebSocket URL.
    pub url: String,
    /// API credentials.
    pub credentials: Credentials,
    /// Reconnection configuration.
    pub reconnect: ReconnectConfig,
    /// Heartbeat configuration.
    pub heartbeat: HeartbeatConfig,
}

impl SipClientConfig {
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
    /// Note: Market data streams always use production URLs. Paper vs live only
    /// affects the trading API, not market data. You get the same real market
    /// data whether paper trading or live trading.
    #[must_use]
    pub fn paper(credentials: Credentials, feed: &str) -> Self {
        Self::new(
            format!("wss://stream.data.alpaca.markets/v2/{feed}"),
            credentials,
        )
    }

    /// Create configuration for live trading environment.
    #[must_use]
    pub fn live(credentials: Credentials, feed: &str) -> Self {
        Self::new(
            format!("wss://stream.data.alpaca.markets/v2/{feed}"),
            credentials,
        )
    }
}

// =============================================================================
// Subscription State
// =============================================================================

/// Tracks current subscriptions.
#[derive(Debug, Default, Clone)]
pub struct SubscriptionState {
    /// Symbols subscribed for quotes.
    pub quotes: Vec<String>,
    /// Symbols subscribed for trades.
    pub trades: Vec<String>,
    /// Symbols subscribed for bars.
    pub bars: Vec<String>,
}

impl SubscriptionState {
    /// Check if there are any active subscriptions.
    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.quotes.is_empty() && self.trades.is_empty() && self.bars.is_empty()
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
                    .with_trades(self.trades.clone())
                    .with_bars(self.bars.clone()),
            )
        }
    }
}

// =============================================================================
// SIP Client
// =============================================================================

/// SIP WebSocket client for stock market data.
///
/// Manages the connection lifecycle including:
/// - Authentication
/// - Heartbeat monitoring
/// - Automatic reconnection with exponential backoff
/// - Subscription management
pub struct SipClient {
    config: SipClientConfig,
    codec: JsonCodec,
    event_tx: mpsc::Sender<SipEvent>,
    cancel: CancellationToken,
    subscriptions: parking_lot::RwLock<SubscriptionState>,
}

impl SipClient {
    /// Create a new SIP client.
    #[must_use]
    pub fn new(
        config: SipClientConfig,
        event_tx: mpsc::Sender<SipEvent>,
        cancel: CancellationToken,
    ) -> Self {
        Self {
            config,
            codec: JsonCodec::new(),
            event_tx,
            cancel,
            subscriptions: parking_lot::RwLock::new(SubscriptionState::default()),
        }
    }

    /// Run the SIP client connection loop.
    ///
    /// This method connects to the WebSocket server, authenticates,
    /// and processes messages until cancelled or an unrecoverable error occurs.
    pub async fn run(self: Arc<Self>) -> Result<(), SipClientError> {
        let mut reconnect_policy = ReconnectPolicy::new(self.config.reconnect.clone());

        loop {
            if self.cancel.is_cancelled() {
                tracing::info!("SIP client cancelled");
                return Ok(());
            }

            match self.connect_and_run().await {
                Ok(()) => {
                    tracing::info!("SIP connection closed gracefully");
                    return Ok(());
                }
                Err(e) => {
                    tracing::warn!(error = %e, "SIP connection error");

                    // Send disconnected event
                    let _ = self.event_tx.send(SipEvent::Disconnected).await;

                    // Check if we should retry
                    if let Some(delay) = reconnect_policy.next_delay() {
                        let attempt = reconnect_policy.attempt_count();
                        tracing::info!(
                            attempt,
                            delay_ms = delay.as_millis(),
                            "Reconnecting to SIP stream"
                        );

                        let _ = self.event_tx.send(SipEvent::Reconnecting { attempt }).await;

                        tokio::select! {
                            () = self.cancel.cancelled() => {
                                tracing::info!("SIP client cancelled during reconnect delay");
                                return Ok(());
                            }
                            () = tokio::time::sleep(delay) => {}
                        }
                    } else {
                        return Err(SipClientError::MaxReconnectAttemptsExceeded);
                    }
                }
            }
        }
    }

    /// Connect to WebSocket and run until error or cancellation.
    async fn connect_and_run(&self) -> Result<(), SipClientError> {
        tracing::info!(url = %self.config.url, "Connecting to SIP stream");

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
                            return Err(SipClientError::ConnectionClosed);
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
                        Some(Ok(Message::Pong(_))) => {
                            heartbeat_state.record_pong();
                        }
                        Some(Ok(Message::Ping(data))) => {
                            write.send(Message::Pong(data)).await?;
                        }
                        Some(Ok(Message::Close(_))) => {
                            tracing::info!("Server sent close frame");
                            heartbeat_cancel.cancel();
                            return Err(SipClientError::ConnectionClosed);
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
                            return Err(SipClientError::ConnectionClosed);
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
    ) -> Result<(), SipClientError>
    where
        W: SinkExt<Message> + Unpin,
        W::Error: std::fmt::Display,
    {
        let messages = self.codec.decode(text)?;

        for msg in messages {
            match msg {
                AlpacaMessage::Success(success) => {
                    let authenticated = auth_handler.on_success(&success)?;

                    if authenticated {
                        tracing::info!("SIP stream authenticated");
                        let _ = self.event_tx.send(SipEvent::Connected).await;

                        // Restore subscriptions if any
                        let subs = self.subscriptions.read().clone();
                        if let Some(request) = subs.to_subscribe_request() {
                            self.send_subscribe(write, &request).await?;
                        }
                    } else if auth_handler.state() == AuthState::Connected {
                        // Send authentication
                        let auth_msg = auth_handler.create_auth_request();
                        let json = auth_msg.to_json().map_err(|e| {
                            SipClientError::ConnectionFailed(format!(
                                "failed to serialize auth: {e}"
                            ))
                        })?;

                        write.send(Message::Text(json.into())).await.map_err(|e| {
                            SipClientError::ConnectionFailed(format!("failed to send auth: {e}"))
                        })?;
                    }
                }
                AlpacaMessage::Error(error) => {
                    tracing::error!(code = error.code, msg = %error.msg, "SIP error");

                    if !auth_handler.is_authenticated() {
                        return Err(auth_handler.on_error(&error).into());
                    }

                    let _ = self.event_tx.send(SipEvent::Error(error.msg)).await;
                }
                AlpacaMessage::Subscription(sub) => {
                    tracing::debug!(
                        quotes = ?sub.quotes,
                        trades = ?sub.trades,
                        bars = ?sub.bars,
                        "Subscription confirmed"
                    );

                    let _ = self
                        .event_tx
                        .send(SipEvent::Subscribed {
                            quotes: sub.quotes,
                            trades: sub.trades,
                            bars: sub.bars,
                        })
                        .await;
                }
                AlpacaMessage::StockQuote(quote) => {
                    let _ = self.event_tx.send(SipEvent::Quote(quote)).await;
                }
                AlpacaMessage::StockTrade(trade) => {
                    let _ = self.event_tx.send(SipEvent::Trade(trade)).await;
                }
                AlpacaMessage::StockBar(bar) => {
                    let _ = self.event_tx.send(SipEvent::Bar(bar)).await;
                }
                _ => {
                    tracing::trace!("Ignoring unhandled message type");
                }
            }
        }

        Ok(())
    }

    /// Send a subscribe request.
    async fn send_subscribe<W>(
        &self,
        write: &mut W,
        request: &SubscriptionRequest,
    ) -> Result<(), SipClientError>
    where
        W: SinkExt<Message> + Unpin,
        W::Error: std::fmt::Display,
    {
        let json = serde_json::to_string(request).map_err(|e| {
            SipClientError::ConnectionFailed(format!("failed to serialize subscribe: {e}"))
        })?;

        tracing::debug!(
            quotes = ?request.quotes,
            trades = ?request.trades,
            bars = ?request.bars,
            "Sending subscribe request"
        );

        write.send(Message::Text(json.into())).await.map_err(|e| {
            SipClientError::ConnectionFailed(format!("failed to send subscribe: {e}"))
        })?;

        Ok(())
    }

    /// Subscribe to symbols.
    ///
    /// # Arguments
    ///
    /// * `quotes` - Symbols to subscribe for quotes
    /// * `trades` - Symbols to subscribe for trades
    /// * `bars` - Symbols to subscribe for bars
    pub fn subscribe(&self, quotes: Vec<String>, trades: Vec<String>, bars: Vec<String>) {
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
        for sym in bars {
            if !subs.bars.contains(&sym) {
                subs.bars.push(sym);
            }
        }
    }

    /// Unsubscribe from symbols.
    ///
    /// # Arguments
    ///
    /// * `quotes` - Symbols to unsubscribe from quotes
    /// * `trades` - Symbols to unsubscribe from trades
    /// * `bars` - Symbols to unsubscribe from bars
    pub fn unsubscribe(&self, quotes: &[String], trades: &[String], bars: &[String]) {
        let mut subs = self.subscriptions.write();

        subs.quotes.retain(|s| !quotes.contains(s));
        subs.trades.retain(|s| !trades.contains(s));
        subs.bars.retain(|s| !bars.contains(s));
    }

    /// Get current subscriptions.
    #[must_use]
    pub fn subscriptions(&self) -> SubscriptionState {
        self.subscriptions.read().clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn subscription_state_empty() {
        let state = SubscriptionState::default();
        assert!(state.is_empty());
    }

    #[test]
    fn subscription_state_with_quotes() {
        let state = SubscriptionState {
            quotes: vec!["AAPL".to_string()],
            trades: vec![],
            bars: vec![],
        };
        assert!(!state.is_empty());
    }

    #[test]
    fn subscription_state_to_request() {
        let state = SubscriptionState {
            quotes: vec!["AAPL".to_string(), "MSFT".to_string()],
            trades: vec!["TSLA".to_string()],
            bars: vec![],
        };

        let request = state.to_subscribe_request().unwrap();
        assert_eq!(request.quotes, vec!["AAPL", "MSFT"]);
        assert_eq!(request.trades, vec!["TSLA"]);
        assert!(request.bars.is_empty());
    }

    #[test]
    fn subscription_state_empty_returns_none() {
        let state = SubscriptionState::default();
        assert!(state.to_subscribe_request().is_none());
    }

    #[test]
    fn sip_config_paper() {
        let creds = Credentials::new("key", "secret").unwrap();
        let config = SipClientConfig::paper(creds, "sip");
        // Market data always uses production URLs (same data for paper/live)
        assert!(!config.url.contains("sandbox"));
        assert!(config.url.contains("stream.data.alpaca.markets"));
        assert!(config.url.contains("/v2/sip"));
    }

    #[test]
    fn sip_config_live() {
        let creds = Credentials::new("key", "secret").unwrap();
        let config = SipClientConfig::live(creds, "sip");
        assert!(!config.url.contains("sandbox"));
        assert!(config.url.contains("stream.data.alpaca.markets"));
        assert!(config.url.contains("/v2/sip"));
    }
}
