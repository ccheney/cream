//! Broadcast Channel Adapters
//!
//! Implements message distribution using tokio broadcast channels
//! for efficient fan-out to multiple subscribers.
//!
//! # Architecture
//!
//! The `BroadcastHub` provides separate channels for each market data type:
//! - Stock quotes, trades, and bars from SIP stream
//! - Options quotes and trades from OPRA stream
//! - Order updates from Trade Updates stream
//!
//! Each channel supports multiple receivers with configurable capacity.

use std::sync::Arc;

use tokio::sync::broadcast;

use super::alpaca::messages::{
    OptionQuoteMessage, OptionTradeMessage, StockBarMessage, StockQuoteMessage, StockTradeMessage,
    TradeUpdateMessage,
};
use crate::BroadcastSettings;

// =============================================================================
// Broadcast Messages
// =============================================================================

/// Stock quote broadcast message.
#[derive(Debug, Clone)]
pub struct StockQuoteBroadcast {
    /// The quote data.
    pub quote: StockQuoteMessage,
}

/// Stock trade broadcast message.
#[derive(Debug, Clone)]
pub struct StockTradeBroadcast {
    /// The trade data.
    pub trade: StockTradeMessage,
}

/// Stock bar broadcast message.
#[derive(Debug, Clone)]
pub struct StockBarBroadcast {
    /// The bar data.
    pub bar: StockBarMessage,
}

/// Option quote broadcast message.
#[derive(Debug, Clone)]
pub struct OptionQuoteBroadcast {
    /// The quote data.
    pub quote: OptionQuoteMessage,
}

/// Option trade broadcast message.
#[derive(Debug, Clone)]
pub struct OptionTradeBroadcast {
    /// The trade data.
    pub trade: OptionTradeMessage,
}

/// Order update broadcast message.
#[derive(Debug, Clone)]
pub struct OrderUpdateBroadcast {
    /// The order update data.
    pub update: TradeUpdateMessage,
}

// =============================================================================
// Broadcast Hub
// =============================================================================

/// Configuration for broadcast channel capacities.
#[derive(Debug, Clone, Copy)]
pub struct BroadcastConfig {
    /// Capacity for stock quote channel.
    pub stock_quotes_capacity: usize,
    /// Capacity for stock trade channel.
    pub stock_trades_capacity: usize,
    /// Capacity for stock bar channel.
    pub stock_bars_capacity: usize,
    /// Capacity for option quote channel.
    pub options_quotes_capacity: usize,
    /// Capacity for option trade channel.
    pub options_trades_capacity: usize,
    /// Capacity for order update channel.
    pub order_updates_capacity: usize,
}

impl Default for BroadcastConfig {
    fn default() -> Self {
        Self {
            stock_quotes_capacity: 10_000,
            stock_trades_capacity: 10_000,
            stock_bars_capacity: 1_000,
            options_quotes_capacity: 50_000,
            options_trades_capacity: 10_000,
            order_updates_capacity: 1_000,
        }
    }
}

impl From<BroadcastSettings> for BroadcastConfig {
    fn from(settings: BroadcastSettings) -> Self {
        Self {
            stock_quotes_capacity: settings.stock_quotes_capacity,
            stock_trades_capacity: settings.stock_trades_capacity,
            stock_bars_capacity: settings.stock_bars_capacity,
            options_quotes_capacity: settings.options_quotes_capacity,
            options_trades_capacity: settings.options_trades_capacity,
            order_updates_capacity: settings.order_updates_capacity,
        }
    }
}

/// Central hub for all broadcast channels.
///
/// Provides separate channels for each market data type with configurable
/// capacities. Supports multiple receivers per channel.
///
/// # Example
///
/// ```rust
/// use alpaca_stream_proxy::infrastructure::broadcast::{BroadcastHub, BroadcastConfig};
///
/// let hub = BroadcastHub::new(BroadcastConfig::default());
///
/// // Get a receiver for stock quotes
/// let mut rx = hub.stock_quotes_rx();
///
/// // In another task, send quotes
/// // hub.send_stock_quote(quote);
/// ```
#[derive(Debug)]
#[allow(clippy::struct_field_names)]
pub struct BroadcastHub {
    stock_quotes_tx: broadcast::Sender<StockQuoteBroadcast>,
    stock_trades_tx: broadcast::Sender<StockTradeBroadcast>,
    stock_bars_tx: broadcast::Sender<StockBarBroadcast>,
    options_quotes_tx: broadcast::Sender<OptionQuoteBroadcast>,
    options_trades_tx: broadcast::Sender<OptionTradeBroadcast>,
    order_updates_tx: broadcast::Sender<OrderUpdateBroadcast>,
}

impl BroadcastHub {
    /// Create a new broadcast hub with the given configuration.
    #[must_use]
    pub fn new(config: BroadcastConfig) -> Self {
        Self {
            stock_quotes_tx: broadcast::channel(config.stock_quotes_capacity).0,
            stock_trades_tx: broadcast::channel(config.stock_trades_capacity).0,
            stock_bars_tx: broadcast::channel(config.stock_bars_capacity).0,
            options_quotes_tx: broadcast::channel(config.options_quotes_capacity).0,
            options_trades_tx: broadcast::channel(config.options_trades_capacity).0,
            order_updates_tx: broadcast::channel(config.order_updates_capacity).0,
        }
    }

    /// Create a new broadcast hub with default configuration.
    #[must_use]
    pub fn with_defaults() -> Self {
        Self::new(BroadcastConfig::default())
    }

    // =========================================================================
    // Stock Quote Channel
    // =========================================================================

    /// Send a stock quote to all subscribers.
    ///
    /// Returns the number of receivers that received the message, or `None`
    /// if there are no active receivers.
    #[must_use]
    pub fn send_stock_quote(&self, quote: StockQuoteMessage) -> Option<usize> {
        self.stock_quotes_tx
            .send(StockQuoteBroadcast { quote })
            .ok()
    }

    /// Get a new receiver for stock quotes.
    #[must_use]
    pub fn stock_quotes_rx(&self) -> broadcast::Receiver<StockQuoteBroadcast> {
        self.stock_quotes_tx.subscribe()
    }

    /// Get the number of active stock quote receivers.
    #[must_use]
    pub fn stock_quotes_receiver_count(&self) -> usize {
        self.stock_quotes_tx.receiver_count()
    }

    // =========================================================================
    // Stock Trade Channel
    // =========================================================================

    /// Send a stock trade to all subscribers.
    #[must_use]
    pub fn send_stock_trade(&self, trade: StockTradeMessage) -> Option<usize> {
        self.stock_trades_tx
            .send(StockTradeBroadcast { trade })
            .ok()
    }

    /// Get a new receiver for stock trades.
    #[must_use]
    pub fn stock_trades_rx(&self) -> broadcast::Receiver<StockTradeBroadcast> {
        self.stock_trades_tx.subscribe()
    }

    /// Get the number of active stock trade receivers.
    #[must_use]
    pub fn stock_trades_receiver_count(&self) -> usize {
        self.stock_trades_tx.receiver_count()
    }

    // =========================================================================
    // Stock Bar Channel
    // =========================================================================

    /// Send a stock bar to all subscribers.
    #[must_use]
    pub fn send_stock_bar(&self, bar: StockBarMessage) -> Option<usize> {
        self.stock_bars_tx.send(StockBarBroadcast { bar }).ok()
    }

    /// Get a new receiver for stock bars.
    #[must_use]
    pub fn stock_bars_rx(&self) -> broadcast::Receiver<StockBarBroadcast> {
        self.stock_bars_tx.subscribe()
    }

    /// Get the number of active stock bar receivers.
    #[must_use]
    pub fn stock_bars_receiver_count(&self) -> usize {
        self.stock_bars_tx.receiver_count()
    }

    // =========================================================================
    // Options Quote Channel
    // =========================================================================

    /// Send an options quote to all subscribers.
    #[must_use]
    pub fn send_options_quote(&self, quote: OptionQuoteMessage) -> Option<usize> {
        self.options_quotes_tx
            .send(OptionQuoteBroadcast { quote })
            .ok()
    }

    /// Get a new receiver for options quotes.
    #[must_use]
    pub fn options_quotes_rx(&self) -> broadcast::Receiver<OptionQuoteBroadcast> {
        self.options_quotes_tx.subscribe()
    }

    /// Get the number of active options quote receivers.
    #[must_use]
    pub fn options_quotes_receiver_count(&self) -> usize {
        self.options_quotes_tx.receiver_count()
    }

    // =========================================================================
    // Options Trade Channel
    // =========================================================================

    /// Send an options trade to all subscribers.
    #[must_use]
    pub fn send_options_trade(&self, trade: OptionTradeMessage) -> Option<usize> {
        self.options_trades_tx
            .send(OptionTradeBroadcast { trade })
            .ok()
    }

    /// Get a new receiver for options trades.
    #[must_use]
    pub fn options_trades_rx(&self) -> broadcast::Receiver<OptionTradeBroadcast> {
        self.options_trades_tx.subscribe()
    }

    /// Get the number of active options trade receivers.
    #[must_use]
    pub fn options_trades_receiver_count(&self) -> usize {
        self.options_trades_tx.receiver_count()
    }

    // =========================================================================
    // Order Updates Channel
    // =========================================================================

    /// Send an order update to all subscribers.
    #[must_use]
    pub fn send_order_update(&self, update: TradeUpdateMessage) -> Option<usize> {
        self.order_updates_tx
            .send(OrderUpdateBroadcast { update })
            .ok()
    }

    /// Get a new receiver for order updates.
    #[must_use]
    pub fn order_updates_rx(&self) -> broadcast::Receiver<OrderUpdateBroadcast> {
        self.order_updates_tx.subscribe()
    }

    /// Get the number of active order update receivers.
    #[must_use]
    pub fn order_updates_receiver_count(&self) -> usize {
        self.order_updates_tx.receiver_count()
    }

    // =========================================================================
    // Statistics
    // =========================================================================

    /// Get statistics about all channels.
    #[must_use]
    pub fn stats(&self) -> BroadcastStats {
        BroadcastStats {
            stock_quotes_receivers: self.stock_quotes_receiver_count(),
            stock_trades_receivers: self.stock_trades_receiver_count(),
            stock_bars_receivers: self.stock_bars_receiver_count(),
            options_quotes_receivers: self.options_quotes_receiver_count(),
            options_trades_receivers: self.options_trades_receiver_count(),
            order_updates_receivers: self.order_updates_receiver_count(),
        }
    }
}

/// Shared broadcast hub reference.
pub type SharedBroadcastHub = Arc<BroadcastHub>;

/// Statistics about broadcast channels.
#[derive(Debug, Clone, Default)]
pub struct BroadcastStats {
    /// Number of stock quote receivers.
    pub stock_quotes_receivers: usize,
    /// Number of stock trade receivers.
    pub stock_trades_receivers: usize,
    /// Number of stock bar receivers.
    pub stock_bars_receivers: usize,
    /// Number of options quote receivers.
    pub options_quotes_receivers: usize,
    /// Number of options trade receivers.
    pub options_trades_receivers: usize,
    /// Number of order update receivers.
    pub order_updates_receivers: usize,
}

impl BroadcastStats {
    /// Get total number of receivers across all channels.
    #[must_use]
    pub const fn total_receivers(&self) -> usize {
        self.stock_quotes_receivers
            + self.stock_trades_receivers
            + self.stock_bars_receivers
            + self.options_quotes_receivers
            + self.options_trades_receivers
            + self.order_updates_receivers
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use chrono::Utc;
    use rust_decimal::Decimal;

    use super::*;

    fn make_test_stock_quote() -> StockQuoteMessage {
        StockQuoteMessage {
            msg_type: "q".to_string(),
            symbol: "AAPL".to_string(),
            bid_exchange: "V".to_string(),
            bid_price: Decimal::from_str("150.00").unwrap(),
            bid_size: 100,
            ask_exchange: "V".to_string(),
            ask_price: Decimal::from_str("150.05").unwrap(),
            ask_size: 200,
            timestamp: Utc::now(),
            conditions: vec![],
            tape: "A".to_string(),
        }
    }

    #[test]
    fn broadcast_hub_creation() {
        let hub = BroadcastHub::with_defaults();
        assert_eq!(hub.stock_quotes_receiver_count(), 0);
        assert_eq!(hub.stock_trades_receiver_count(), 0);
        assert_eq!(hub.stock_bars_receiver_count(), 0);
        assert_eq!(hub.options_quotes_receiver_count(), 0);
        assert_eq!(hub.options_trades_receiver_count(), 0);
        assert_eq!(hub.order_updates_receiver_count(), 0);
    }

    #[test]
    fn receiver_count_increases() {
        let hub = BroadcastHub::with_defaults();

        let _rx1 = hub.stock_quotes_rx();
        assert_eq!(hub.stock_quotes_receiver_count(), 1);

        let _rx2 = hub.stock_quotes_rx();
        assert_eq!(hub.stock_quotes_receiver_count(), 2);
    }

    #[test]
    fn receiver_count_decreases_on_drop() {
        let hub = BroadcastHub::with_defaults();

        {
            let _rx1 = hub.stock_quotes_rx();
            assert_eq!(hub.stock_quotes_receiver_count(), 1);
        }

        // rx1 dropped
        assert_eq!(hub.stock_quotes_receiver_count(), 0);
    }

    #[tokio::test]
    async fn send_and_receive_quote() {
        let hub = BroadcastHub::with_defaults();
        let mut rx = hub.stock_quotes_rx();

        let quote = make_test_stock_quote();
        let result = hub.send_stock_quote(quote.clone());
        assert!(result.is_some());
        assert_eq!(result.unwrap(), 1);

        let received = rx.recv().await.unwrap();
        assert_eq!(received.quote.symbol, "AAPL");
    }

    #[tokio::test]
    async fn multiple_receivers_get_same_message() {
        let hub = BroadcastHub::with_defaults();
        let mut rx1 = hub.stock_quotes_rx();
        let mut rx2 = hub.stock_quotes_rx();

        let quote = make_test_stock_quote();
        let _ = hub.send_stock_quote(quote);

        let r1 = rx1.recv().await.unwrap();
        let r2 = rx2.recv().await.unwrap();

        assert_eq!(r1.quote.symbol, r2.quote.symbol);
    }

    #[test]
    fn send_with_no_receivers_returns_none() {
        let hub = BroadcastHub::with_defaults();
        let result = hub.send_stock_quote(make_test_stock_quote());
        // With no receivers, send returns Err which we map to None
        assert!(result.is_none());
    }

    #[test]
    fn stats_reflect_all_channels() {
        let hub = BroadcastHub::with_defaults();

        let _rx1 = hub.stock_quotes_rx();
        let _rx2 = hub.stock_trades_rx();
        let _rx3 = hub.options_quotes_rx();

        let stats = hub.stats();
        assert_eq!(stats.stock_quotes_receivers, 1);
        assert_eq!(stats.stock_trades_receivers, 1);
        assert_eq!(stats.options_quotes_receivers, 1);
        assert_eq!(stats.stock_bars_receivers, 0);
        assert_eq!(stats.total_receivers(), 3);
    }

    #[test]
    fn custom_config() {
        let config = BroadcastConfig {
            stock_quotes_capacity: 100,
            stock_trades_capacity: 100,
            stock_bars_capacity: 50,
            options_quotes_capacity: 200,
            options_trades_capacity: 100,
            order_updates_capacity: 50,
        };
        let _hub = BroadcastHub::new(config);
        // Just verify it creates successfully with custom config
    }
}
