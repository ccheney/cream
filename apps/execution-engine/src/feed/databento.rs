//! Databento market data feed consumer.
//!
//! Provides real-time market data streaming using the official `databento` crate.
//! Integrates with existing health tracking, gap recovery, and circuit breaker infrastructure.
//!
//! # Architecture
//!
//! ```text
//! ┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
//! │  DatabentoFeed  │────>│ tokio::mpsc      │────>│ MicrostructureMan  │
//! │  (ws consumer)  │     │ channel          │     │ (order book state) │
//! └─────────────────┘     └──────────────────┘     └────────────────────┘
//! ```
//!
//! # Usage
//!
//! ```ignore
//! use execution_engine::feed::{DatabentoFeed, DatabentoMessage};
//! use tokio::sync::mpsc;
//!
//! let config = DatabentoConfig::default();
//! let (tx, rx) = mpsc::channel(1000);
//! let feed = DatabentoFeed::new(config, tx);
//!
//! // Spawn the feed consumer
//! tokio::spawn(async move {
//!     feed.start(vec!["AAPL".to_string(), "MSFT".to_string()]).await
//! });
//! ```

use databento::{
    LiveClient,
    dbn::{Mbp1Msg, PitSymbolMap, SType, Schema, TradeMsg},
    live::Subscription,
};
use rust_decimal::Decimal;
use std::sync::Arc;
use std::time::Duration;
use thiserror::Error;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

use super::{FeedHealthTracker, GapRecoveryManager};
use crate::config::DatabentoConfig;
use crate::resilience::CircuitBreaker;

// ============================================================================
// Constants
// ============================================================================

/// Default channel buffer size.
const DEFAULT_CHANNEL_BUFFER: usize = 10_000;

/// Default reconnection delay.
const DEFAULT_RECONNECT_DELAY: Duration = Duration::from_secs(5);

/// Maximum reconnection attempts before giving up.
const MAX_RECONNECT_ATTEMPTS: u32 = 10;

// ============================================================================
// Error Types
// ============================================================================

/// Errors from the Databento feed.
#[derive(Debug, Error)]
pub enum DatabentoError {
    /// Failed to build the client.
    #[error("failed to build Databento client: {0}")]
    ClientBuild(String),

    /// Failed to connect.
    #[error("failed to connect to Databento: {0}")]
    Connection(String),

    /// Failed to subscribe.
    #[error("subscription failed: {0}")]
    Subscription(String),

    /// Stream error during message processing.
    #[error("stream error: {0}")]
    Stream(String),

    /// Channel send error.
    #[error("channel send error")]
    ChannelSend,

    /// API key not configured.
    #[error("DATABENTO_KEY environment variable not set")]
    MissingApiKey,

    /// Reconnection failed after max attempts.
    #[error("reconnection failed after {0} attempts")]
    ReconnectionFailed(u32),
}

// ============================================================================
// Message Types
// ============================================================================

/// Messages emitted by the Databento feed.
#[derive(Debug, Clone)]
pub enum DatabentoMessage {
    /// A trade occurred.
    Trade {
        /// Symbol.
        symbol: String,
        /// Trade price.
        price: Decimal,
        /// Trade size.
        size: Decimal,
        /// Event timestamp (nanoseconds since epoch).
        ts_event: i64,
    },

    /// A quote (BBO) update.
    Quote {
        /// Symbol.
        symbol: String,
        /// Best bid price.
        bid: Decimal,
        /// Best ask price.
        ask: Decimal,
        /// Bid size.
        bid_size: Decimal,
        /// Ask size.
        ask_size: Decimal,
        /// Event timestamp (nanoseconds since epoch).
        ts_event: i64,
    },

    /// Feed connected.
    Connected,

    /// Feed disconnected.
    Disconnected {
        /// Reason for disconnection.
        reason: String,
    },

    /// Feed error.
    Error {
        /// Error message.
        message: String,
    },
}

// ============================================================================
// Feed Configuration
// ============================================================================

/// Configuration for the Databento feed.
#[derive(Debug, Clone)]
pub struct DatabentoFeedConfig {
    /// API key.
    pub api_key: String,
    /// Dataset (e.g., "XNAS.ITCH" for NASDAQ).
    pub dataset: String,
    /// Reconnection delay.
    pub reconnect_delay: Duration,
    /// Maximum reconnection attempts.
    pub max_reconnect_attempts: u32,
    /// Channel buffer size.
    pub channel_buffer: usize,
}

impl From<&DatabentoConfig> for DatabentoFeedConfig {
    fn from(config: &DatabentoConfig) -> Self {
        Self {
            api_key: config.api_key.clone(),
            dataset: config.dataset.clone(),
            reconnect_delay: Duration::from_millis(config.reconnect_delay_ms),
            max_reconnect_attempts: config.max_reconnect_attempts,
            channel_buffer: DEFAULT_CHANNEL_BUFFER,
        }
    }
}

impl Default for DatabentoFeedConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            dataset: "XNAS.ITCH".to_string(),
            reconnect_delay: DEFAULT_RECONNECT_DELAY,
            max_reconnect_attempts: MAX_RECONNECT_ATTEMPTS,
            channel_buffer: DEFAULT_CHANNEL_BUFFER,
        }
    }
}

// ============================================================================
// Databento Feed
// ============================================================================

/// Databento real-time market data feed consumer.
///
/// Connects to Databento's live API and streams market data (trades, quotes)
/// to a channel for processing by the microstructure manager.
pub struct DatabentoFeed {
    /// Configuration.
    config: DatabentoFeedConfig,
    /// Message sender channel.
    tx: mpsc::Sender<DatabentoMessage>,
    /// Health tracker for monitoring feed quality.
    health_tracker: FeedHealthTracker,
    /// Gap recovery manager for detecting missed messages.
    gap_manager: GapRecoveryManager,
    /// Circuit breaker for connection resilience.
    circuit_breaker: Option<Arc<CircuitBreaker>>,
}

impl DatabentoFeed {
    /// Create a new Databento feed.
    ///
    /// # Arguments
    ///
    /// * `config` - Feed configuration
    /// * `tx` - Channel sender for outgoing messages
    #[must_use]
    pub fn new(config: DatabentoFeedConfig, tx: mpsc::Sender<DatabentoMessage>) -> Self {
        let health_tracker = FeedHealthTracker::new("databento");
        let gap_manager = GapRecoveryManager::new("databento");

        Self {
            config,
            tx,
            health_tracker,
            gap_manager,
            circuit_breaker: None,
        }
    }

    /// Create from environment configuration.
    ///
    /// # Arguments
    ///
    /// * `config` - Databento configuration from YAML
    /// * `tx` - Channel sender
    #[must_use]
    pub fn from_config(config: &DatabentoConfig, tx: mpsc::Sender<DatabentoMessage>) -> Self {
        Self::new(DatabentoFeedConfig::from(config), tx)
    }

    /// Set the circuit breaker for connection resilience.
    #[must_use]
    pub fn with_circuit_breaker(mut self, breaker: Arc<CircuitBreaker>) -> Self {
        self.circuit_breaker = Some(breaker);
        self
    }

    /// Get the health tracker for monitoring.
    #[must_use]
    pub const fn health_tracker(&self) -> &FeedHealthTracker {
        &self.health_tracker
    }

    /// Get the gap manager for recovery statistics.
    #[must_use]
    pub const fn gap_manager(&self) -> &GapRecoveryManager {
        &self.gap_manager
    }

    /// Start the feed and begin streaming data.
    ///
    /// This method runs until the feed is disconnected or an unrecoverable
    /// error occurs. It handles automatic reconnection with exponential backoff.
    ///
    /// # Arguments
    ///
    /// * `symbols` - Symbols to subscribe to
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - API key is not configured
    /// - Maximum reconnection attempts exceeded
    pub async fn start(mut self, symbols: Vec<String>) -> Result<(), DatabentoError> {
        if self.config.api_key.is_empty() {
            return Err(DatabentoError::MissingApiKey);
        }

        info!(
            dataset = %self.config.dataset,
            symbols = ?symbols,
            "Starting Databento feed"
        );

        let mut reconnect_attempts = 0;

        loop {
            match self.run_connection(&symbols).await {
                Ok(()) => {
                    info!("Databento feed ended normally");
                    break;
                }
                Err(e) => {
                    reconnect_attempts += 1;
                    error!(
                        error = %e,
                        attempt = reconnect_attempts,
                        max_attempts = self.config.max_reconnect_attempts,
                        "Databento feed error"
                    );

                    // Send disconnected message
                    let _ = self
                        .tx
                        .send(DatabentoMessage::Disconnected {
                            reason: e.to_string(),
                        })
                        .await;

                    // Record failure in circuit breaker
                    if let Some(ref breaker) = self.circuit_breaker {
                        breaker.record_failure();
                    }

                    if reconnect_attempts >= self.config.max_reconnect_attempts {
                        return Err(DatabentoError::ReconnectionFailed(reconnect_attempts));
                    }

                    // Exponential backoff
                    let delay = self.config.reconnect_delay * 2u32.pow(reconnect_attempts - 1);
                    warn!(delay_secs = delay.as_secs(), "Reconnecting after delay");
                    tokio::time::sleep(delay).await;
                }
            }
        }

        Ok(())
    }

    /// Run a single connection attempt.
    async fn run_connection(&mut self, symbols: &[String]) -> Result<(), DatabentoError> {
        // Check circuit breaker
        if let Some(ref breaker) = self.circuit_breaker {
            if !breaker.is_call_permitted() {
                return Err(DatabentoError::Connection(
                    "circuit breaker open".to_string(),
                ));
            }
        }

        // Build client - use the builder pattern correctly
        let builder = LiveClient::builder()
            .key(&self.config.api_key)
            .map_err(|e| DatabentoError::ClientBuild(e.to_string()))?
            .dataset(&self.config.dataset);

        let mut client = builder
            .build()
            .await
            .map_err(|e| DatabentoError::Connection(e.to_string()))?;

        info!("Connected to Databento");

        // Subscribe to trades
        let symbols_vec: Vec<&str> = symbols.iter().map(String::as_str).collect();

        client
            .subscribe(
                Subscription::builder()
                    .symbols(symbols_vec.clone())
                    .schema(Schema::Trades)
                    .stype_in(SType::RawSymbol)
                    .build(),
            )
            .await
            .map_err(|e| DatabentoError::Subscription(e.to_string()))?;

        // Subscribe to BBO quotes (mbp-1)
        client
            .subscribe(
                Subscription::builder()
                    .symbols(symbols_vec)
                    .schema(Schema::Mbp1)
                    .stype_in(SType::RawSymbol)
                    .build(),
            )
            .await
            .map_err(|e| DatabentoError::Subscription(e.to_string()))?;

        info!(symbols = ?symbols, "Subscribed to trades and quotes");

        // Start the stream
        client
            .start()
            .await
            .map_err(|e| DatabentoError::Stream(e.to_string()))?;

        // Send connected message
        self.tx
            .send(DatabentoMessage::Connected)
            .await
            .map_err(|_| DatabentoError::ChannelSend)?;

        // Record success in circuit breaker
        if let Some(ref breaker) = self.circuit_breaker {
            breaker.record_success();
        }

        // Process messages
        let mut symbol_map = PitSymbolMap::new();

        while let Some(record) = client
            .next_record()
            .await
            .map_err(|e| DatabentoError::Stream(e.to_string()))?
        {
            // Update symbol map
            if let Err(e) = symbol_map.on_record(record) {
                warn!(error = %e, "Failed to update symbol map");
                continue;
            }

            // Process trade messages
            if let Some(trade) = record.get::<TradeMsg>() {
                let instrument_id = trade.hd.instrument_id;
                let symbol = symbol_map
                    .get(instrument_id)
                    .map(ToString::to_string)
                    .unwrap_or_default();

                if !symbol.is_empty() {
                    #[allow(clippy::cast_possible_wrap)]
                    let ts_event = trade.hd.ts_event as i64;

                    let msg = DatabentoMessage::Trade {
                        symbol,
                        price: Self::convert_price(trade.price),
                        size: Decimal::from(trade.size),
                        ts_event,
                    };

                    // Record latency for health tracking
                    let latency = Self::calculate_latency(ts_event);
                    self.health_tracker.record_message(latency);

                    self.tx
                        .send(msg)
                        .await
                        .map_err(|_| DatabentoError::ChannelSend)?;
                }
            }

            // Process quote (MBP-1) messages
            if let Some(quote) = record.get::<Mbp1Msg>() {
                let instrument_id = quote.hd.instrument_id;
                let symbol = symbol_map
                    .get(instrument_id)
                    .map(ToString::to_string)
                    .unwrap_or_default();

                if !symbol.is_empty() {
                    #[allow(clippy::cast_possible_wrap)]
                    let ts_event = quote.hd.ts_event as i64;

                    let msg = DatabentoMessage::Quote {
                        symbol,
                        bid: Self::convert_price(quote.levels[0].bid_px),
                        ask: Self::convert_price(quote.levels[0].ask_px),
                        bid_size: Decimal::from(quote.levels[0].bid_sz),
                        ask_size: Decimal::from(quote.levels[0].ask_sz),
                        ts_event,
                    };

                    let latency = Self::calculate_latency(ts_event);
                    self.health_tracker.record_message(latency);

                    self.tx
                        .send(msg)
                        .await
                        .map_err(|_| DatabentoError::ChannelSend)?;
                }
            }

            debug!("Processed record");
        }

        Ok(())
    }

    /// Convert Databento fixed-point price to Decimal.
    fn convert_price(price: i64) -> Decimal {
        Decimal::new(price, 9)
    }

    /// Calculate latency from event timestamp.
    fn calculate_latency(ts_event_nanos: i64) -> Duration {
        let now_nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as i64)
            .unwrap_or(0);

        let latency_nanos = now_nanos.saturating_sub(ts_event_nanos);

        // Clamp to reasonable range (0 to 10 seconds)
        #[allow(clippy::cast_sign_loss)]
        Duration::from_nanos(latency_nanos.clamp(0, 10_000_000_000) as u64)
    }
}

// ============================================================================
// Channel Creation Helper
// ============================================================================

/// Create a channel pair for Databento feed messages.
///
/// # Arguments
///
/// * `buffer_size` - Size of the channel buffer (default: 10,000)
///
/// # Returns
///
/// A tuple of (sender, receiver) for the message channel.
#[must_use]
pub fn create_feed_channel(
    buffer_size: Option<usize>,
) -> (
    mpsc::Sender<DatabentoMessage>,
    mpsc::Receiver<DatabentoMessage>,
) {
    mpsc::channel(buffer_size.unwrap_or(DEFAULT_CHANNEL_BUFFER))
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_convert_price() {
        // 150.50 dollars = 150_500_000_000 in Databento fixed-point
        let price = DatabentoFeed::convert_price(150_500_000_000);
        assert_eq!(price.to_string(), "150.500000000");
    }

    #[test]
    fn test_config_from_databento_config() {
        let config = DatabentoConfig {
            api_key: "test-key".to_string(),
            dataset: "XNAS.ITCH".to_string(),
            reconnect_delay_ms: 2000,
            max_reconnect_attempts: 3,
            symbols: vec!["AAPL".to_string(), "MSFT".to_string()],
        };

        let feed_config = DatabentoFeedConfig::from(&config);
        assert_eq!(feed_config.api_key, "test-key");
        assert_eq!(feed_config.dataset, "XNAS.ITCH");
        assert_eq!(feed_config.reconnect_delay, Duration::from_millis(2000));
        assert_eq!(feed_config.max_reconnect_attempts, 3);
    }

    #[test]
    fn test_default_config() {
        let config = DatabentoFeedConfig::default();
        assert!(config.api_key.is_empty());
        assert_eq!(config.dataset, "XNAS.ITCH");
        assert_eq!(config.reconnect_delay, DEFAULT_RECONNECT_DELAY);
        assert_eq!(config.max_reconnect_attempts, MAX_RECONNECT_ATTEMPTS);
    }

    #[tokio::test]
    async fn test_feed_requires_api_key() {
        let config = DatabentoFeedConfig::default();
        let (tx, _rx) = mpsc::channel(100);
        let feed = DatabentoFeed::new(config, tx);

        let result = feed.start(vec!["AAPL".to_string()]).await;
        assert!(matches!(result, Err(DatabentoError::MissingApiKey)));
    }

    #[test]
    fn test_create_feed_channel() {
        let (tx, _rx) = create_feed_channel(Some(100));
        assert!(!tx.is_closed());
    }

    #[test]
    fn test_latency_calculation() {
        let now_nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos() as i64;

        // Event 1ms ago
        let event_ts = now_nanos - 1_000_000;
        let latency = DatabentoFeed::calculate_latency(event_ts);

        // Should be approximately 1ms (allow for test execution time)
        assert!(latency.as_micros() >= 900);
        assert!(latency.as_micros() < 100_000); // Less than 100ms
    }
}
