//! WebSocket Connection Manager

use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use parking_lot::RwLock;
use tokio::sync::broadcast;
use tokio::time::timeout;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tokio_util::sync::CancellationToken;

use super::codec::{is_error_message, is_success_message, parse_options_quote, parse_stock_quote};
use super::reconnect::ReconnectPolicy;
use super::types::{QuoteUpdate, TradeUpdate, WebSocketConfig, WebSocketError, WebSocketState};

/// Channel capacity for quote updates.
const QUOTE_CHANNEL_CAPACITY: usize = 1024;

/// Channel capacity for trade updates.
const TRADE_CHANNEL_CAPACITY: usize = 256;

/// Timeout for authentication.
const AUTH_TIMEOUT: Duration = Duration::from_secs(10);

/// Timeout for subscription confirmation.
const SUBSCRIBE_TIMEOUT: Duration = Duration::from_secs(5);

/// WebSocket connection manager for Alpaca market data streams.
///
/// Manages connections to:
/// - Stock quote stream (v2/sip)
/// - Options quote stream (v1beta1/opra)
/// - Trade updates stream
pub struct WebSocketManager {
    /// Configuration.
    config: WebSocketConfig,
    /// Current connection state for stock stream.
    stock_state: Arc<RwLock<WebSocketState>>,
    /// Current connection state for options stream.
    options_state: Arc<RwLock<WebSocketState>>,
    /// Subscribed stock symbols.
    stock_subscriptions: Arc<RwLock<HashSet<String>>>,
    /// Subscribed options symbols.
    options_subscriptions: Arc<RwLock<HashSet<String>>>,
    /// Quote update sender.
    quote_tx: broadcast::Sender<QuoteUpdate>,
    /// Trade update sender.
    trade_tx: broadcast::Sender<TradeUpdate>,
    /// Cancellation token for graceful shutdown.
    shutdown: CancellationToken,
}

impl WebSocketManager {
    /// Create a new `WebSocketManager`.
    #[must_use]
    pub fn new(config: WebSocketConfig, shutdown: CancellationToken) -> Self {
        let (quote_tx, _) = broadcast::channel(QUOTE_CHANNEL_CAPACITY);
        let (trade_tx, _) = broadcast::channel(TRADE_CHANNEL_CAPACITY);

        Self {
            config,
            stock_state: Arc::new(RwLock::new(WebSocketState::Disconnected)),
            options_state: Arc::new(RwLock::new(WebSocketState::Disconnected)),
            stock_subscriptions: Arc::new(RwLock::new(HashSet::new())),
            options_subscriptions: Arc::new(RwLock::new(HashSet::new())),
            quote_tx,
            trade_tx,
            shutdown,
        }
    }

    /// Connect to the stock data stream.
    ///
    /// This spawns a background task that maintains the connection.
    pub fn connect_stock_stream(&self) {
        let config = self.config.clone();
        let state = Arc::clone(&self.stock_state);
        let subscriptions = Arc::clone(&self.stock_subscriptions);
        let quote_tx = self.quote_tx.clone();
        let shutdown = self.shutdown.clone();

        tokio::spawn(async move {
            run_stock_stream(config, state, subscriptions, quote_tx, shutdown).await;
        });
    }

    /// Connect to the options data stream.
    ///
    /// This spawns a background task that maintains the connection.
    pub fn connect_options_stream(&self) {
        let config = self.config.clone();
        let state = Arc::clone(&self.options_state);
        let subscriptions = Arc::clone(&self.options_subscriptions);
        let quote_tx = self.quote_tx.clone();
        let shutdown = self.shutdown.clone();

        tokio::spawn(async move {
            run_options_stream(config, state, subscriptions, quote_tx, shutdown).await;
        });
    }

    /// Subscribe to stock quotes for the given symbols.
    ///
    /// # Errors
    ///
    /// Returns error if not connected or subscription fails.
    #[allow(clippy::unused_async)]
    pub async fn subscribe_stock_quotes(&self, symbols: &[String]) -> Result<(), WebSocketError> {
        {
            let mut subs = self.stock_subscriptions.write();
            for symbol in symbols {
                subs.insert(symbol.clone());
            }
        }

        tracing::info!(
            symbols = ?symbols,
            "Added stock symbols to subscription list"
        );

        Ok(())
    }

    /// Subscribe to options quotes for the given symbols.
    ///
    /// # Errors
    ///
    /// Returns error if not connected or subscription fails.
    #[allow(clippy::unused_async)]
    pub async fn subscribe_options_quotes(&self, symbols: &[String]) -> Result<(), WebSocketError> {
        {
            let mut subs = self.options_subscriptions.write();
            for symbol in symbols {
                subs.insert(symbol.clone());
            }
        }

        tracing::info!(
            symbols = ?symbols,
            "Added options symbols to subscription list"
        );

        Ok(())
    }

    /// Unsubscribe from stock quotes.
    ///
    /// # Errors
    ///
    /// This method currently does not return errors but reserves the ability to do so.
    #[allow(clippy::unused_async)]
    pub async fn unsubscribe_stock_quotes(&self, symbols: &[String]) -> Result<(), WebSocketError> {
        {
            let mut subs = self.stock_subscriptions.write();
            for symbol in symbols {
                subs.remove(symbol);
            }
        }

        tracing::info!(
            symbols = ?symbols,
            "Removed stock symbols from subscription list"
        );

        Ok(())
    }

    /// Unsubscribe from options quotes.
    ///
    /// # Errors
    ///
    /// This method currently does not return errors but reserves the ability to do so.
    #[allow(clippy::unused_async)]
    pub async fn unsubscribe_options_quotes(
        &self,
        symbols: &[String],
    ) -> Result<(), WebSocketError> {
        {
            let mut subs = self.options_subscriptions.write();
            for symbol in symbols {
                subs.remove(symbol);
            }
        }

        tracing::info!(
            symbols = ?symbols,
            "Removed options symbols from subscription list"
        );

        Ok(())
    }

    /// Get a receiver for quote updates.
    #[must_use]
    pub fn quote_updates(&self) -> broadcast::Receiver<QuoteUpdate> {
        self.quote_tx.subscribe()
    }

    /// Get a receiver for trade updates.
    #[must_use]
    pub fn trade_updates(&self) -> broadcast::Receiver<TradeUpdate> {
        self.trade_tx.subscribe()
    }

    /// Check if the stock stream is connected.
    #[must_use]
    pub fn is_stock_connected(&self) -> bool {
        self.stock_state.read().is_ready()
    }

    /// Check if the options stream is connected.
    #[must_use]
    pub fn is_options_connected(&self) -> bool {
        self.options_state.read().is_ready()
    }

    /// Check if any stream is connected and ready.
    #[must_use]
    pub fn is_connected(&self) -> bool {
        self.is_stock_connected() || self.is_options_connected()
    }

    /// Get current stock subscriptions.
    #[must_use]
    pub fn stock_subscriptions(&self) -> Vec<String> {
        self.stock_subscriptions.read().iter().cloned().collect()
    }

    /// Get current options subscriptions.
    #[must_use]
    pub fn options_subscriptions(&self) -> Vec<String> {
        self.options_subscriptions.read().iter().cloned().collect()
    }
}

/// Run the stock stream connection loop with reconnection.
async fn run_stock_stream(
    config: WebSocketConfig,
    state: Arc<RwLock<WebSocketState>>,
    subscriptions: Arc<RwLock<HashSet<String>>>,
    quote_tx: broadcast::Sender<QuoteUpdate>,
    shutdown: CancellationToken,
) {
    let mut reconnect = ReconnectPolicy::new(&config);

    loop {
        if shutdown.is_cancelled() {
            tracing::info!("Stock stream shutting down");
            break;
        }

        *state.write() = WebSocketState::Connecting;

        match connect_and_run_stock(&config, &state, &subscriptions, &quote_tx, &shutdown).await {
            Ok(()) => {
                tracing::info!("Stock stream closed gracefully");
                break;
            }
            Err(e) => {
                tracing::warn!("Stock stream error: {e}");
                *state.write() = WebSocketState::Disconnected;

                if let Some(backoff) = reconnect.next_backoff() {
                    tracing::info!(
                        backoff_ms = backoff.as_millis(),
                        attempt = reconnect.current_attempt(),
                        "Reconnecting stock stream"
                    );

                    tokio::select! {
                        () = tokio::time::sleep(backoff) => {}
                        () = shutdown.cancelled() => {
                            tracing::info!("Stock stream shutdown during reconnect backoff");
                            break;
                        }
                    }
                } else {
                    tracing::error!("Stock stream reconnection attempts exhausted");
                    break;
                }
            }
        }
    }

    *state.write() = WebSocketState::Disconnected;
}

/// Connect to stock stream and process messages.
#[allow(clippy::too_many_lines)]
async fn connect_and_run_stock(
    config: &WebSocketConfig,
    state: &Arc<RwLock<WebSocketState>>,
    subscriptions: &Arc<RwLock<HashSet<String>>>,
    quote_tx: &broadcast::Sender<QuoteUpdate>,
    shutdown: &CancellationToken,
) -> Result<(), WebSocketError> {
    let url = config.stock_data_url();
    tracing::info!(url, "Connecting to stock data stream");

    let (ws_stream, _) =
        connect_async(url)
            .await
            .map_err(|e| WebSocketError::ConnectionFailed {
                message: e.to_string(),
            })?;

    *state.write() = WebSocketState::Connected;
    tracing::info!("Stock stream connected, authenticating");

    let (mut write, mut read) = ws_stream.split();

    // Wait for connection success message
    let msg = timeout(AUTH_TIMEOUT, read.next())
        .await
        .map_err(|_| WebSocketError::Timeout {
            operation: "connection confirmation".to_string(),
        })?
        .ok_or_else(|| WebSocketError::ConnectionClosed {
            reason: "stream ended before connection confirmed".to_string(),
        })?
        .map_err(|e| WebSocketError::ConnectionFailed {
            message: e.to_string(),
        })?;

    if let Message::Text(text) = msg {
        let text_str = text.to_string();
        if !is_success_message(&text_str) {
            return Err(WebSocketError::ConnectionFailed {
                message: format!("unexpected connection response: {text_str}"),
            });
        }
    }

    // Authenticate
    let auth_msg = serde_json::json!({
        "action": "auth",
        "key": config.api_key,
        "secret": config.api_secret
    });

    write
        .send(Message::Text(auth_msg.to_string().into()))
        .await
        .map_err(|e| WebSocketError::SendFailed {
            message: e.to_string(),
        })?;

    // Wait for auth response
    let auth_response = timeout(AUTH_TIMEOUT, read.next())
        .await
        .map_err(|_| WebSocketError::Timeout {
            operation: "authentication".to_string(),
        })?
        .ok_or_else(|| WebSocketError::ConnectionClosed {
            reason: "stream ended during authentication".to_string(),
        })?
        .map_err(|e| WebSocketError::ConnectionFailed {
            message: e.to_string(),
        })?;

    if let Message::Text(text) = auth_response {
        let text_str = text.to_string();
        if is_error_message(&text_str) {
            return Err(WebSocketError::AuthenticationFailed { message: text_str });
        }
        if !is_success_message(&text_str) {
            return Err(WebSocketError::AuthenticationFailed {
                message: format!("unexpected auth response: {text_str}"),
            });
        }
    }

    *state.write() = WebSocketState::Authenticated;
    tracing::info!("Stock stream authenticated");

    // Subscribe to symbols
    let symbols: Vec<String> = subscriptions.read().iter().cloned().collect();
    if !symbols.is_empty() {
        let sub_msg = serde_json::json!({
            "action": "subscribe",
            "quotes": symbols
        });

        write
            .send(Message::Text(sub_msg.to_string().into()))
            .await
            .map_err(|e| WebSocketError::SendFailed {
                message: e.to_string(),
            })?;

        // Wait for subscription confirmation
        let sub_response = timeout(SUBSCRIBE_TIMEOUT, read.next())
            .await
            .map_err(|_| WebSocketError::Timeout {
                operation: "subscription".to_string(),
            })?
            .ok_or_else(|| WebSocketError::ConnectionClosed {
                reason: "stream ended during subscription".to_string(),
            })?
            .map_err(|e| WebSocketError::ConnectionFailed {
                message: e.to_string(),
            })?;

        if let Message::Text(text) = sub_response {
            let text_str = text.to_string();
            if is_error_message(&text_str) {
                return Err(WebSocketError::SubscriptionFailed {
                    symbols,
                    message: text_str,
                });
            }
        }

        tracing::info!(count = symbols.len(), "Subscribed to stock quotes");
    }

    // Process messages
    loop {
        tokio::select! {
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        let text_str = text.to_string();
                        if let Ok(Some(quote)) = parse_stock_quote(&text_str) {
                            let _ = quote_tx.send(quote);
                        }
                    }
                    Some(Ok(Message::Ping(data))) => {
                        let _ = write.send(Message::Pong(data)).await;
                    }
                    Some(Ok(Message::Close(_))) => {
                        tracing::info!("Stock stream received close frame");
                        return Ok(());
                    }
                    Some(Err(e)) => {
                        return Err(WebSocketError::ConnectionClosed {
                            reason: e.to_string(),
                        });
                    }
                    None => {
                        return Err(WebSocketError::ConnectionClosed {
                            reason: "stream ended".to_string(),
                        });
                    }
                    _ => {}
                }
            }
            () = shutdown.cancelled() => {
                tracing::info!("Stock stream shutdown requested");
                let _ = write.send(Message::Close(None)).await;
                return Ok(());
            }
        }
    }
}

/// Run the options stream connection loop with reconnection.
async fn run_options_stream(
    config: WebSocketConfig,
    state: Arc<RwLock<WebSocketState>>,
    subscriptions: Arc<RwLock<HashSet<String>>>,
    quote_tx: broadcast::Sender<QuoteUpdate>,
    shutdown: CancellationToken,
) {
    let mut reconnect = ReconnectPolicy::new(&config);

    loop {
        if shutdown.is_cancelled() {
            tracing::info!("Options stream shutting down");
            break;
        }

        *state.write() = WebSocketState::Connecting;

        match connect_and_run_options(&config, &state, &subscriptions, &quote_tx, &shutdown).await {
            Ok(()) => {
                tracing::info!("Options stream closed gracefully");
                break;
            }
            Err(e) => {
                tracing::warn!("Options stream error: {e}");
                *state.write() = WebSocketState::Disconnected;

                if let Some(backoff) = reconnect.next_backoff() {
                    tracing::info!(
                        backoff_ms = backoff.as_millis(),
                        attempt = reconnect.current_attempt(),
                        "Reconnecting options stream"
                    );

                    tokio::select! {
                        () = tokio::time::sleep(backoff) => {}
                        () = shutdown.cancelled() => {
                            tracing::info!("Options stream shutdown during reconnect backoff");
                            break;
                        }
                    }
                } else {
                    tracing::error!("Options stream reconnection attempts exhausted");
                    break;
                }
            }
        }
    }

    *state.write() = WebSocketState::Disconnected;
}

/// Connect to options stream and process messages.
#[allow(clippy::too_many_lines)]
async fn connect_and_run_options(
    config: &WebSocketConfig,
    state: &Arc<RwLock<WebSocketState>>,
    subscriptions: &Arc<RwLock<HashSet<String>>>,
    quote_tx: &broadcast::Sender<QuoteUpdate>,
    shutdown: &CancellationToken,
) -> Result<(), WebSocketError> {
    let url = config.options_data_url();
    tracing::info!(url, "Connecting to options data stream");

    let (ws_stream, _) =
        connect_async(url)
            .await
            .map_err(|e| WebSocketError::ConnectionFailed {
                message: e.to_string(),
            })?;

    *state.write() = WebSocketState::Connected;
    tracing::info!("Options stream connected, authenticating");

    let (mut write, mut read) = ws_stream.split();

    // Wait for connection success message
    let msg = timeout(AUTH_TIMEOUT, read.next())
        .await
        .map_err(|_| WebSocketError::Timeout {
            operation: "connection confirmation".to_string(),
        })?
        .ok_or_else(|| WebSocketError::ConnectionClosed {
            reason: "stream ended before connection confirmed".to_string(),
        })?
        .map_err(|e| WebSocketError::ConnectionFailed {
            message: e.to_string(),
        })?;

    if let Message::Text(text) = msg {
        let text_str = text.to_string();
        if !is_success_message(&text_str) {
            return Err(WebSocketError::ConnectionFailed {
                message: format!("unexpected connection response: {text_str}"),
            });
        }
    }

    // Authenticate
    let auth_msg = serde_json::json!({
        "action": "auth",
        "key": config.api_key,
        "secret": config.api_secret
    });

    write
        .send(Message::Text(auth_msg.to_string().into()))
        .await
        .map_err(|e| WebSocketError::SendFailed {
            message: e.to_string(),
        })?;

    // Wait for auth response
    let auth_response = timeout(AUTH_TIMEOUT, read.next())
        .await
        .map_err(|_| WebSocketError::Timeout {
            operation: "authentication".to_string(),
        })?
        .ok_or_else(|| WebSocketError::ConnectionClosed {
            reason: "stream ended during authentication".to_string(),
        })?
        .map_err(|e| WebSocketError::ConnectionFailed {
            message: e.to_string(),
        })?;

    if let Message::Text(text) = auth_response {
        let text_str = text.to_string();
        if is_error_message(&text_str) {
            return Err(WebSocketError::AuthenticationFailed { message: text_str });
        }
        if !is_success_message(&text_str) {
            return Err(WebSocketError::AuthenticationFailed {
                message: format!("unexpected auth response: {text_str}"),
            });
        }
    }

    *state.write() = WebSocketState::Authenticated;
    tracing::info!("Options stream authenticated");

    // Subscribe to symbols
    let symbols: Vec<String> = subscriptions.read().iter().cloned().collect();
    if !symbols.is_empty() {
        let sub_msg = serde_json::json!({
            "action": "subscribe",
            "quotes": symbols
        });

        write
            .send(Message::Text(sub_msg.to_string().into()))
            .await
            .map_err(|e| WebSocketError::SendFailed {
                message: e.to_string(),
            })?;

        // Wait for subscription confirmation
        let sub_response = timeout(SUBSCRIBE_TIMEOUT, read.next())
            .await
            .map_err(|_| WebSocketError::Timeout {
                operation: "subscription".to_string(),
            })?
            .ok_or_else(|| WebSocketError::ConnectionClosed {
                reason: "stream ended during subscription".to_string(),
            })?
            .map_err(|e| WebSocketError::ConnectionFailed {
                message: e.to_string(),
            })?;

        if let Message::Text(text) = sub_response {
            let text_str = text.to_string();
            if is_error_message(&text_str) {
                return Err(WebSocketError::SubscriptionFailed {
                    symbols,
                    message: text_str,
                });
            }
        }

        tracing::info!(count = symbols.len(), "Subscribed to options quotes");
    }

    // Process messages
    loop {
        tokio::select! {
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        let text_str = text.to_string();
                        if let Ok(Some(quote)) = parse_options_quote(&text_str) {
                            let _ = quote_tx.send(quote);
                        }
                    }
                    Some(Ok(Message::Ping(data))) => {
                        let _ = write.send(Message::Pong(data)).await;
                    }
                    Some(Ok(Message::Close(_))) => {
                        tracing::info!("Options stream received close frame");
                        return Ok(());
                    }
                    Some(Err(e)) => {
                        return Err(WebSocketError::ConnectionClosed {
                            reason: e.to_string(),
                        });
                    }
                    None => {
                        return Err(WebSocketError::ConnectionClosed {
                            reason: "stream ended".to_string(),
                        });
                    }
                    _ => {}
                }
            }
            () = shutdown.cancelled() => {
                tracing::info!("Options stream shutdown requested");
                let _ = write.send(Message::Close(None)).await;
                return Ok(());
            }
        }
    }
}

// Implement QuoteProviderPort for WebSocketManager
use crate::application::ports::QuoteProviderPort;
use async_trait::async_trait;

#[async_trait]
impl QuoteProviderPort for WebSocketManager {
    fn quote_updates(&self) -> broadcast::Receiver<QuoteUpdate> {
        self.quote_updates()
    }

    async fn subscribe_stock_quotes(&self, symbols: &[String]) -> Result<(), WebSocketError> {
        self.subscribe_stock_quotes(symbols).await
    }

    async fn subscribe_options_quotes(&self, symbols: &[String]) -> Result<(), WebSocketError> {
        self.subscribe_options_quotes(symbols).await
    }

    async fn unsubscribe_stock_quotes(&self, symbols: &[String]) -> Result<(), WebSocketError> {
        self.unsubscribe_stock_quotes(symbols).await
    }

    async fn unsubscribe_options_quotes(&self, symbols: &[String]) -> Result<(), WebSocketError> {
        self.unsubscribe_options_quotes(symbols).await
    }

    fn is_connected(&self) -> bool {
        self.is_connected()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn websocket_manager_creation() {
        let config = WebSocketConfig::new(
            "test_key".to_string(),
            "test_secret".to_string(),
            crate::infrastructure::broker::alpaca::AlpacaEnvironment::Paper,
        );
        let shutdown = CancellationToken::new();

        let manager = WebSocketManager::new(config, shutdown);

        assert!(!manager.is_connected());
        assert!(manager.stock_subscriptions().is_empty());
        assert!(manager.options_subscriptions().is_empty());
    }

    #[tokio::test]
    async fn websocket_manager_subscriptions() {
        let config = WebSocketConfig::new(
            "test_key".to_string(),
            "test_secret".to_string(),
            crate::infrastructure::broker::alpaca::AlpacaEnvironment::Paper,
        );
        let shutdown = CancellationToken::new();

        let manager = WebSocketManager::new(config, shutdown);

        manager
            .subscribe_stock_quotes(&["AAPL".to_string(), "MSFT".to_string()])
            .await
            .unwrap();

        let subs = manager.stock_subscriptions();
        assert!(subs.contains(&"AAPL".to_string()));
        assert!(subs.contains(&"MSFT".to_string()));

        manager
            .unsubscribe_stock_quotes(&["AAPL".to_string()])
            .await
            .unwrap();

        let subs = manager.stock_subscriptions();
        assert!(!subs.contains(&"AAPL".to_string()));
        assert!(subs.contains(&"MSFT".to_string()));
    }

    #[tokio::test]
    async fn websocket_manager_options_subscriptions() {
        let config = WebSocketConfig::new(
            "test_key".to_string(),
            "test_secret".to_string(),
            crate::infrastructure::broker::alpaca::AlpacaEnvironment::Paper,
        );
        let shutdown = CancellationToken::new();

        let manager = WebSocketManager::new(config, shutdown);

        manager
            .subscribe_options_quotes(&["AAPL240315C00172500".to_string()])
            .await
            .unwrap();

        let subs = manager.options_subscriptions();
        assert!(subs.contains(&"AAPL240315C00172500".to_string()));
    }
}
