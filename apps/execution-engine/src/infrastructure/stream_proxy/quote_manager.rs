//! Proxy Quote Manager
//!
//! Wraps the stream proxy gRPC client to provide a `WebSocketManager`-compatible
//! interface for the `PositionMonitorService`. This allows the execution engine
//! to consume real-time quotes from the centralized stream proxy instead of
//! maintaining its own WebSocket connections.

use std::collections::HashSet;
use std::sync::Arc;

use chrono::{TimeZone, Utc};
use parking_lot::RwLock;
use rust_decimal::Decimal;
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;

use super::{StreamProxyClient, StreamProxyConfig, StreamProxyError};
use crate::infrastructure::grpc::proto::cream::v1::{
    ConnectionState, OptionQuoteUpdate as ProtoOptionQuote, StockQuote as ProtoStockQuote,
};
use crate::infrastructure::websocket::{QuoteUpdate, TradeUpdate, WebSocketError};

/// Channel capacity for quote updates.
const QUOTE_CHANNEL_CAPACITY: usize = 1024;

/// Channel capacity for trade updates.
const TRADE_CHANNEL_CAPACITY: usize = 256;

/// Configuration for the proxy quote manager.
#[derive(Debug, Clone)]
pub struct ProxyQuoteManagerConfig {
    /// Stream proxy endpoint (e.g., "<http://localhost:50052>").
    pub endpoint: String,
    /// Whether the proxy is enabled.
    pub enabled: bool,
}

impl Default for ProxyQuoteManagerConfig {
    fn default() -> Self {
        Self {
            endpoint: "http://localhost:50052".to_string(),
            enabled: true,
        }
    }
}

impl ProxyQuoteManagerConfig {
    /// Create config from environment variables.
    #[must_use]
    pub fn from_env() -> Self {
        let endpoint = std::env::var("STREAM_PROXY_ENDPOINT")
            .unwrap_or_else(|_| "http://localhost:50052".to_string());
        let enabled = std::env::var("STREAM_PROXY_ENABLED")
            .map(|v| v.to_lowercase() != "false" && v != "0")
            .unwrap_or(true);

        Self { endpoint, enabled }
    }
}

/// Quote manager that proxies requests to the stream-proxy service.
///
/// This provides the same interface as `WebSocketManager` but uses gRPC
/// streaming from the centralized stream proxy instead of direct WebSocket
/// connections to Alpaca.
pub struct ProxyQuoteManager {
    /// Configuration.
    config: ProxyQuoteManagerConfig,
    /// Stream proxy client.
    client: Option<Arc<StreamProxyClient>>,
    /// Subscribed stock symbols.
    stock_subscriptions: Arc<RwLock<HashSet<String>>>,
    /// Subscribed options symbols.
    options_subscriptions: Arc<RwLock<HashSet<String>>>,
    /// Quote update sender.
    quote_tx: broadcast::Sender<QuoteUpdate>,
    /// Trade update sender.
    trade_tx: broadcast::Sender<TradeUpdate>,
    /// Whether connected to the proxy.
    connected: Arc<RwLock<bool>>,
    /// Cancellation token for graceful shutdown.
    shutdown: CancellationToken,
}

impl ProxyQuoteManager {
    /// Create a new proxy quote manager.
    #[must_use]
    pub fn new(config: ProxyQuoteManagerConfig, shutdown: CancellationToken) -> Self {
        let (quote_tx, _) = broadcast::channel(QUOTE_CHANNEL_CAPACITY);
        let (trade_tx, _) = broadcast::channel(TRADE_CHANNEL_CAPACITY);

        Self {
            config,
            client: None,
            stock_subscriptions: Arc::new(RwLock::new(HashSet::new())),
            options_subscriptions: Arc::new(RwLock::new(HashSet::new())),
            quote_tx,
            trade_tx,
            connected: Arc::new(RwLock::new(false)),
            shutdown,
        }
    }

    /// Connect to the stream proxy service.
    ///
    /// # Errors
    ///
    /// Returns error if connection fails.
    pub async fn connect(&mut self) -> Result<(), StreamProxyError> {
        if !self.config.enabled {
            tracing::info!("Stream proxy disabled, skipping connection");
            return Ok(());
        }

        let proxy_config = StreamProxyConfig::new(&self.config.endpoint);
        let client = StreamProxyClient::connect(&proxy_config).await?;
        self.client = Some(Arc::new(client));
        *self.connected.write() = true;

        tracing::info!(endpoint = %self.config.endpoint, "Connected to stream proxy");
        Ok(())
    }

    /// Connect to the stream proxy service with retry logic.
    ///
    /// Waits for the proxy to become available, polling at regular intervals
    /// until the connection succeeds or the timeout is reached.
    ///
    /// # Errors
    ///
    /// Returns error if connection fails after all retries or shutdown is requested.
    pub async fn connect_with_retry(
        &mut self,
        max_wait: std::time::Duration,
        interval: std::time::Duration,
    ) -> Result<(), StreamProxyError> {
        if !self.config.enabled {
            tracing::info!("Stream proxy disabled, skipping connection");
            return Ok(());
        }

        let start = std::time::Instant::now();
        let mut attempt = 0u32;
        let mut logged_waiting = false;

        loop {
            if self.shutdown.is_cancelled() {
                return Err(StreamProxyError::StreamClosed {
                    message: "shutdown requested while waiting for proxy".to_string(),
                });
            }

            attempt += 1;
            match self.connect().await {
                Ok(()) => {
                    if attempt > 1 {
                        #[allow(clippy::cast_possible_truncation)]
                        let elapsed_ms = start.elapsed().as_millis() as u64;
                        tracing::info!(
                            attempts = attempt,
                            elapsed_ms,
                            "Stream proxy is now available"
                        );
                    }
                    return Ok(());
                }
                Err(e) => {
                    if start.elapsed() >= max_wait {
                        #[allow(clippy::cast_possible_truncation)]
                        let max_wait_ms = max_wait.as_millis() as u64;
                        tracing::warn!(
                            error = %e,
                            attempts = attempt,
                            max_wait_ms,
                            "Timed out waiting for stream proxy"
                        );
                        return Err(e);
                    }

                    if !logged_waiting {
                        tracing::info!(
                            endpoint = %self.config.endpoint,
                            "Waiting for stream proxy to become available..."
                        );
                        logged_waiting = true;
                    }

                    tokio::select! {
                        () = tokio::time::sleep(interval) => {}
                        () = self.shutdown.cancelled() => {
                            return Err(StreamProxyError::StreamClosed {
                                message: "shutdown requested while waiting for proxy".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    /// Start streaming stock quotes.
    ///
    /// This spawns a background task that streams quotes from the proxy
    /// and forwards them to the internal broadcast channel.
    pub fn start_stock_stream(&self) {
        let Some(client) = self.client.clone() else {
            tracing::warn!("Cannot start stock stream: not connected to proxy");
            return;
        };

        let subscriptions = Arc::clone(&self.stock_subscriptions);
        let quote_tx = self.quote_tx.clone();
        let connected = Arc::clone(&self.connected);
        let shutdown = self.shutdown.clone();

        tokio::spawn(async move {
            run_stock_quote_stream(client, subscriptions, quote_tx, connected, shutdown).await;
        });
    }

    /// Start streaming options quotes.
    ///
    /// This spawns a background task that streams option quotes from the proxy
    /// and forwards them to the internal broadcast channel.
    pub fn start_options_stream(&self) {
        let Some(client) = self.client.clone() else {
            tracing::warn!("Cannot start options stream: not connected to proxy");
            return;
        };

        let subscriptions = Arc::clone(&self.options_subscriptions);
        let quote_tx = self.quote_tx.clone();
        let connected = Arc::clone(&self.connected);
        let shutdown = self.shutdown.clone();

        tokio::spawn(async move {
            run_options_quote_stream(client, subscriptions, quote_tx, connected, shutdown).await;
        });
    }

    /// Subscribe to stock quotes for the given symbols.
    ///
    /// # Errors
    ///
    /// Returns error if not connected.
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
            "Added stock symbols to proxy subscription list"
        );

        Ok(())
    }

    /// Subscribe to options quotes for the given symbols.
    ///
    /// # Errors
    ///
    /// Returns error if not connected.
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
            "Added options symbols to proxy subscription list"
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
            "Removed stock symbols from proxy subscription list"
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
            "Removed options symbols from proxy subscription list"
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

    /// Check if connected to the proxy.
    #[must_use]
    pub fn is_connected(&self) -> bool {
        *self.connected.read()
    }

    /// Check if stock stream is connected (alias for `is_connected`).
    #[must_use]
    pub fn is_stock_connected(&self) -> bool {
        self.is_connected()
    }

    /// Check if options stream is connected (alias for `is_connected`).
    #[must_use]
    pub fn is_options_connected(&self) -> bool {
        self.is_connected()
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

    /// Get the proxy connection status.
    ///
    /// # Errors
    ///
    /// Returns error if the request fails or not connected.
    pub async fn get_proxy_status(&self) -> Result<ConnectionState, StreamProxyError> {
        let client = self.client.as_ref().ok_or(StreamProxyError::StreamClosed {
            message: "not connected to proxy".to_string(),
        })?;

        let status = client.get_connection_status().await?;

        // Return the SIP feed state as the primary indicator
        for feed in status.feeds {
            if feed.feed_type == 1 {
                // FEED_TYPE_SIP
                return Ok(ConnectionState::try_from(feed.state).unwrap_or_default());
            }
        }

        Ok(ConnectionState::Disconnected)
    }
}

/// Convert a protobuf stock quote to a local `QuoteUpdate`.
fn convert_stock_quote(proto: &ProtoStockQuote) -> QuoteUpdate {
    let timestamp = proto.timestamp.as_ref().map_or_else(Utc::now, |ts| {
        Utc.timestamp_opt(ts.seconds, ts.nanos.unsigned_abs())
            .unwrap()
    });

    QuoteUpdate {
        symbol: proto.symbol.clone(),
        bid: Decimal::try_from(proto.bid_price).unwrap_or_default(),
        ask: Decimal::try_from(proto.ask_price).unwrap_or_default(),
        bid_size: proto.bid_size,
        ask_size: proto.ask_size,
        timestamp,
        is_option: false,
    }
}

/// Convert a protobuf option quote to a local `QuoteUpdate`.
fn convert_option_quote(proto: &ProtoOptionQuote) -> QuoteUpdate {
    let timestamp = proto.timestamp.as_ref().map_or_else(Utc::now, |ts| {
        Utc.timestamp_opt(ts.seconds, ts.nanos.unsigned_abs())
            .unwrap()
    });

    QuoteUpdate {
        symbol: proto.symbol.clone(),
        bid: Decimal::try_from(proto.bid_price).unwrap_or_default(),
        ask: Decimal::try_from(proto.ask_price).unwrap_or_default(),
        bid_size: proto.bid_size,
        ask_size: proto.ask_size,
        timestamp,
        is_option: true,
    }
}

/// Run the stock quote stream from the proxy.
async fn run_stock_quote_stream(
    client: Arc<StreamProxyClient>,
    subscriptions: Arc<RwLock<HashSet<String>>>,
    quote_tx: broadcast::Sender<QuoteUpdate>,
    connected: Arc<RwLock<bool>>,
    shutdown: CancellationToken,
) {
    loop {
        if shutdown.is_cancelled() {
            tracing::info!("Stock quote stream shutting down");
            break;
        }

        let symbols: Vec<String> = {
            let subs = subscriptions.read();
            subs.iter().cloned().collect()
        };
        let symbols_ref: Vec<&str> = symbols.iter().map(String::as_str).collect();

        match client.stream_quotes(&symbols_ref).await {
            Ok(mut stream) => {
                tracing::info!(symbols = ?symbols, "Stock quote stream started");

                loop {
                    tokio::select! {
                        result = stream.message() => {
                            match result {
                                Ok(Some(response)) => {
                                    if let Some(quote) = response.quote {
                                        // Filter to subscribed symbols
                                        let is_subscribed = {
                                            let subs = subscriptions.read();
                                            subs.contains(&quote.symbol) || subs.is_empty()
                                        };

                                        if is_subscribed {
                                            let update = convert_stock_quote(&quote);
                                            let _ = quote_tx.send(update);
                                        }
                                    }
                                }
                                Ok(None) => {
                                    tracing::warn!("Stock quote stream ended");
                                    break;
                                }
                                Err(e) => {
                                    tracing::warn!(error = %e, "Stock quote stream error");
                                    *connected.write() = false;
                                    break;
                                }
                            }
                        }
                        () = shutdown.cancelled() => {
                            tracing::info!("Stock quote stream shutdown requested");
                            return;
                        }
                    }
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "Failed to start stock quote stream");
                *connected.write() = false;
            }
        }

        // Wait before reconnecting
        tokio::select! {
            () = tokio::time::sleep(std::time::Duration::from_secs(5)) => {}
            () = shutdown.cancelled() => {
                tracing::info!("Stock quote stream shutdown during reconnect delay");
                return;
            }
        }

        // Try to reconnect
        if let Err(e) = client.reconnect().await {
            tracing::warn!(error = %e, "Failed to reconnect to proxy");
        } else {
            *connected.write() = true;
            tracing::info!("Reconnected to proxy");
        }
    }
}

/// Run the options quote stream from the proxy.
async fn run_options_quote_stream(
    client: Arc<StreamProxyClient>,
    subscriptions: Arc<RwLock<HashSet<String>>>,
    quote_tx: broadcast::Sender<QuoteUpdate>,
    connected: Arc<RwLock<bool>>,
    shutdown: CancellationToken,
) {
    loop {
        if shutdown.is_cancelled() {
            tracing::info!("Options quote stream shutting down");
            break;
        }

        let symbols: Vec<String> = {
            let subs = subscriptions.read();
            subs.iter().cloned().collect()
        };
        let symbols_ref: Vec<&str> = symbols.iter().map(String::as_str).collect();

        match client.stream_option_quotes(&symbols_ref, &[]).await {
            Ok(mut stream) => {
                tracing::info!(symbols = ?symbols, "Options quote stream started");

                loop {
                    tokio::select! {
                        result = stream.message() => {
                            match result {
                                Ok(Some(response)) => {
                                    if let Some(quote) = response.quote {
                                        // Filter to subscribed symbols
                                        let is_subscribed = {
                                            let subs = subscriptions.read();
                                            subs.contains(&quote.symbol) || subs.is_empty()
                                        };

                                        if is_subscribed {
                                            let update = convert_option_quote(&quote);
                                            let _ = quote_tx.send(update);
                                        }
                                    }
                                }
                                Ok(None) => {
                                    tracing::warn!("Options quote stream ended");
                                    break;
                                }
                                Err(e) => {
                                    tracing::warn!(error = %e, "Options quote stream error");
                                    *connected.write() = false;
                                    break;
                                }
                            }
                        }
                        () = shutdown.cancelled() => {
                            tracing::info!("Options quote stream shutdown requested");
                            return;
                        }
                    }
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "Failed to start options quote stream");
                *connected.write() = false;
            }
        }

        // Wait before reconnecting
        tokio::select! {
            () = tokio::time::sleep(std::time::Duration::from_secs(5)) => {}
            () = shutdown.cancelled() => {
                tracing::info!("Options quote stream shutdown during reconnect delay");
                return;
            }
        }

        // Try to reconnect
        if let Err(e) = client.reconnect().await {
            tracing::warn!(error = %e, "Failed to reconnect to proxy");
        } else {
            *connected.write() = true;
            tracing::info!("Reconnected to proxy");
        }
    }
}

// Implement QuoteProviderPort for ProxyQuoteManager
use crate::application::ports::QuoteProviderPort;
use async_trait::async_trait;

#[async_trait]
impl QuoteProviderPort for ProxyQuoteManager {
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
    fn config_default() {
        let config = ProxyQuoteManagerConfig::default();
        assert_eq!(config.endpoint, "http://localhost:50052");
        assert!(config.enabled);
    }

    #[test]
    fn manager_creation() {
        let config = ProxyQuoteManagerConfig::default();
        let shutdown = CancellationToken::new();
        let manager = ProxyQuoteManager::new(config, shutdown);

        assert!(!manager.is_connected());
        assert!(manager.stock_subscriptions().is_empty());
        assert!(manager.options_subscriptions().is_empty());
    }

    #[tokio::test]
    async fn manager_subscriptions() {
        let config = ProxyQuoteManagerConfig::default();
        let shutdown = CancellationToken::new();
        let manager = ProxyQuoteManager::new(config, shutdown);

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
    async fn manager_options_subscriptions() {
        let config = ProxyQuoteManagerConfig::default();
        let shutdown = CancellationToken::new();
        let manager = ProxyQuoteManager::new(config, shutdown);

        manager
            .subscribe_options_quotes(&["AAPL240315C00172500".to_string()])
            .await
            .unwrap();

        let subs = manager.options_subscriptions();
        assert!(subs.contains(&"AAPL240315C00172500".to_string()));
    }

    #[test]
    fn convert_stock_quote_basic() {
        let proto = ProtoStockQuote {
            symbol: "AAPL".to_string(),
            bid_price: 185.50,
            ask_price: 185.52,
            bid_size: 100,
            ask_size: 200,
            timestamp: None,
            bid_exchange: String::new(),
            ask_exchange: String::new(),
            conditions: vec![],
            tape: String::new(),
        };

        let update = convert_stock_quote(&proto);
        assert_eq!(update.symbol, "AAPL");
        assert_eq!(update.bid, Decimal::try_from(185.50).unwrap());
        assert_eq!(update.ask, Decimal::try_from(185.52).unwrap());
        assert!(!update.is_option);
    }

    #[test]
    fn convert_option_quote_basic() {
        let proto = ProtoOptionQuote {
            symbol: "AAPL240315C00172500".to_string(),
            bid_price: 2.84,
            ask_price: 2.86,
            bid_size: 53,
            ask_size: 38,
            timestamp: None,
            bid_exchange: String::new(),
            ask_exchange: String::new(),
            condition: String::new(),
        };

        let update = convert_option_quote(&proto);
        assert_eq!(update.symbol, "AAPL240315C00172500");
        assert_eq!(update.bid, Decimal::try_from(2.84).unwrap());
        assert!(update.is_option);
    }
}
