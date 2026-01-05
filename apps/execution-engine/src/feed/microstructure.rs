//! Market microstructure state tracking.
//!
//! Tracks rolling bid/ask/spread/depth/VWAP to support intelligent execution tactics.
//! Uses circular buffers for efficient O(1) rolling calculations.
//!
//! Reference: docs/plans/09-rust-core.md (Market Data Gateway section)

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::time::{Duration, Instant};

// ============================================================================
// Constants
// ============================================================================

/// Default rolling window duration in seconds.
const DEFAULT_WINDOW_SECS: u64 = 60;

/// Maximum entries in the rolling buffer.
const MAX_BUFFER_SIZE: usize = 1000;

/// Staleness threshold in seconds.
const STALENESS_THRESHOLD_SECS: u64 = 1;

// ============================================================================
// Types
// ============================================================================

/// A quote update (bid/ask).
#[derive(Debug, Clone)]
pub struct QuoteUpdate {
    /// Timestamp of the quote.
    pub timestamp: Instant,
    /// Best bid price.
    pub bid: Decimal,
    /// Best ask price.
    pub ask: Decimal,
    /// Bid size (shares/contracts available).
    pub bid_size: Decimal,
    /// Ask size (shares/contracts available).
    pub ask_size: Decimal,
}

impl QuoteUpdate {
    /// Create a new quote update.
    #[must_use]
    pub fn new(bid: Decimal, ask: Decimal, bid_size: Decimal, ask_size: Decimal) -> Self {
        Self {
            timestamp: Instant::now(),
            bid,
            ask,
            bid_size,
            ask_size,
        }
    }

    /// Calculate the spread.
    #[must_use]
    pub fn spread(&self) -> Decimal {
        self.ask - self.bid
    }

    /// Calculate the mid price.
    #[must_use]
    pub fn mid_price(&self) -> Decimal {
        (self.bid + self.ask) / Decimal::TWO
    }
}

/// A trade update.
#[derive(Debug, Clone)]
pub struct TradeUpdate {
    /// Timestamp of the trade.
    pub timestamp: Instant,
    /// Trade price.
    pub price: Decimal,
    /// Trade size.
    pub size: Decimal,
    /// Trade side (buyer or seller initiated).
    pub side: Option<TradeSide>,
}

/// Trade aggressor side.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TradeSide {
    /// Buyer initiated (lifted offer).
    Buy,
    /// Seller initiated (hit bid).
    Sell,
}

impl TradeUpdate {
    /// Create a new trade update.
    #[must_use]
    pub fn new(price: Decimal, size: Decimal) -> Self {
        Self {
            timestamp: Instant::now(),
            price,
            size,
            side: None,
        }
    }

    /// Create with trade side.
    #[must_use]
    pub fn with_side(mut self, side: TradeSide) -> Self {
        self.side = Some(side);
        self
    }
}

/// Order book depth level.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepthLevel {
    /// Price level.
    pub price: Decimal,
    /// Size at this level.
    pub size: Decimal,
    /// Number of orders at this level.
    pub order_count: u32,
}

/// Complete microstructure state for a symbol.
#[derive(Debug, Clone, Serialize)]
pub struct MicrostructureState {
    /// Symbol being tracked.
    pub symbol: String,
    /// Best bid price.
    pub bid: Decimal,
    /// Best ask price.
    pub ask: Decimal,
    /// Bid-ask spread.
    pub spread: Decimal,
    /// Spread in basis points.
    pub spread_bps: Decimal,
    /// Total bid depth (sum of top N levels).
    pub bid_depth: Decimal,
    /// Total ask depth (sum of top N levels).
    pub ask_depth: Decimal,
    /// Last trade price.
    pub last_trade: Decimal,
    /// Rolling VWAP over window.
    pub vwap: Decimal,
    /// Rolling volume over window.
    pub volume: Decimal,
    /// Buy volume in window.
    pub buy_volume: Decimal,
    /// Sell volume in window.
    pub sell_volume: Decimal,
    /// Time since last update (not serialized).
    #[serde(skip)]
    pub last_update: Instant,
    /// Whether state is considered stale.
    pub is_stale: bool,
}

impl Default for MicrostructureState {
    fn default() -> Self {
        Self {
            symbol: String::new(),
            bid: Decimal::ZERO,
            ask: Decimal::ZERO,
            spread: Decimal::ZERO,
            spread_bps: Decimal::ZERO,
            bid_depth: Decimal::ZERO,
            ask_depth: Decimal::ZERO,
            last_trade: Decimal::ZERO,
            vwap: Decimal::ZERO,
            volume: Decimal::ZERO,
            buy_volume: Decimal::ZERO,
            sell_volume: Decimal::ZERO,
            last_update: Instant::now(),
            is_stale: true,
        }
    }
}

// ============================================================================
// Microstructure Tracker
// ============================================================================

/// Entry in the rolling trade buffer for VWAP calculation.
#[derive(Debug, Clone)]
struct TradeEntry {
    timestamp: Instant,
    price: Decimal,
    size: Decimal,
    side: Option<TradeSide>,
}

/// Tracks rolling microstructure state with efficient O(1) updates.
#[derive(Debug)]
pub struct MicrostructureTracker {
    /// Symbol being tracked.
    symbol: String,
    /// Current best bid/ask.
    current_quote: Option<QuoteUpdate>,
    /// Rolling window of trades for VWAP.
    trade_buffer: VecDeque<TradeEntry>,
    /// Rolling window duration.
    window_duration: Duration,
    /// Current depth levels (bid side).
    bid_levels: Vec<DepthLevel>,
    /// Current depth levels (ask side).
    ask_levels: Vec<DepthLevel>,
    /// Cached VWAP numerator (sum of price * size).
    vwap_numerator: Decimal,
    /// Cached VWAP denominator (sum of size).
    vwap_denominator: Decimal,
    /// Cached buy volume.
    buy_volume: Decimal,
    /// Cached sell volume.
    sell_volume: Decimal,
    /// Staleness threshold.
    staleness_threshold: Duration,
}

impl MicrostructureTracker {
    /// Create a new tracker for a symbol.
    #[must_use]
    pub fn new(symbol: &str) -> Self {
        Self {
            symbol: symbol.to_string(),
            current_quote: None,
            trade_buffer: VecDeque::with_capacity(MAX_BUFFER_SIZE),
            window_duration: Duration::from_secs(DEFAULT_WINDOW_SECS),
            bid_levels: Vec::new(),
            ask_levels: Vec::new(),
            vwap_numerator: Decimal::ZERO,
            vwap_denominator: Decimal::ZERO,
            buy_volume: Decimal::ZERO,
            sell_volume: Decimal::ZERO,
            staleness_threshold: Duration::from_secs(STALENESS_THRESHOLD_SECS),
        }
    }

    /// Create with custom window duration.
    #[must_use]
    pub fn with_window(mut self, window: Duration) -> Self {
        self.window_duration = window;
        self
    }

    /// Create with custom staleness threshold.
    #[must_use]
    pub fn with_staleness_threshold(mut self, threshold: Duration) -> Self {
        self.staleness_threshold = threshold;
        self
    }

    /// Update with a new quote.
    pub fn update_quote(&mut self, quote: QuoteUpdate) {
        self.current_quote = Some(quote);
    }

    /// Update with a new trade.
    pub fn update_trade(&mut self, trade: TradeUpdate) {
        let now = Instant::now();

        // Expire old trades
        self.expire_old_trades(now);

        // Add new trade
        let entry = TradeEntry {
            timestamp: trade.timestamp,
            price: trade.price,
            size: trade.size,
            side: trade.side,
        };

        // Update running totals
        self.vwap_numerator += trade.price * trade.size;
        self.vwap_denominator += trade.size;

        match trade.side {
            Some(TradeSide::Buy) => self.buy_volume += trade.size,
            Some(TradeSide::Sell) => self.sell_volume += trade.size,
            None => {} // Unknown side doesn't affect buy/sell breakdown
        }

        self.trade_buffer.push_back(entry);

        // Prevent unbounded growth
        while self.trade_buffer.len() > MAX_BUFFER_SIZE {
            if let Some(expired) = self.trade_buffer.pop_front() {
                self.vwap_numerator -= expired.price * expired.size;
                self.vwap_denominator -= expired.size;
                match expired.side {
                    Some(TradeSide::Buy) => self.buy_volume -= expired.size,
                    Some(TradeSide::Sell) => self.sell_volume -= expired.size,
                    None => {}
                }
            }
        }
    }

    /// Update order book depth.
    pub fn update_depth(&mut self, bid_levels: Vec<DepthLevel>, ask_levels: Vec<DepthLevel>) {
        self.bid_levels = bid_levels;
        self.ask_levels = ask_levels;
    }

    /// Expire trades outside the rolling window.
    fn expire_old_trades(&mut self, now: Instant) {
        let cutoff = now - self.window_duration;

        while let Some(front) = self.trade_buffer.front() {
            if front.timestamp < cutoff {
                if let Some(expired) = self.trade_buffer.pop_front() {
                    self.vwap_numerator -= expired.price * expired.size;
                    self.vwap_denominator -= expired.size;
                    match expired.side {
                        Some(TradeSide::Buy) => self.buy_volume -= expired.size,
                        Some(TradeSide::Sell) => self.sell_volume -= expired.size,
                        None => {}
                    }
                }
            } else {
                break;
            }
        }
    }

    /// Calculate the current VWAP.
    #[must_use]
    pub fn vwap(&self) -> Decimal {
        if self.vwap_denominator > Decimal::ZERO {
            self.vwap_numerator / self.vwap_denominator
        } else {
            Decimal::ZERO
        }
    }

    /// Get the rolling volume.
    #[must_use]
    pub fn volume(&self) -> Decimal {
        self.vwap_denominator
    }

    /// Get buy volume.
    #[must_use]
    pub fn buy_volume(&self) -> Decimal {
        self.buy_volume
    }

    /// Get sell volume.
    #[must_use]
    pub fn sell_volume(&self) -> Decimal {
        self.sell_volume
    }

    /// Calculate total bid depth.
    #[must_use]
    pub fn bid_depth(&self) -> Decimal {
        self.bid_levels.iter().map(|l| l.size).sum()
    }

    /// Calculate total ask depth.
    #[must_use]
    pub fn ask_depth(&self) -> Decimal {
        self.ask_levels.iter().map(|l| l.size).sum()
    }

    /// Check if state is stale.
    #[must_use]
    pub fn is_stale(&self) -> bool {
        match &self.current_quote {
            Some(quote) => quote.timestamp.elapsed() > self.staleness_threshold,
            None => true,
        }
    }

    /// Get the current spread in basis points.
    #[must_use]
    pub fn spread_bps(&self) -> Decimal {
        match &self.current_quote {
            Some(quote) => {
                let mid = quote.mid_price();
                if mid > Decimal::ZERO {
                    (quote.spread() / mid) * Decimal::new(10000, 0)
                } else {
                    Decimal::ZERO
                }
            }
            None => Decimal::ZERO,
        }
    }

    /// Get the complete microstructure state snapshot.
    #[must_use]
    pub fn snapshot(&mut self) -> MicrostructureState {
        let now = Instant::now();
        self.expire_old_trades(now);

        let (bid, ask, spread, last_update) = match &self.current_quote {
            Some(quote) => (
                quote.bid,
                quote.ask,
                quote.spread(),
                quote.timestamp,
            ),
            None => (Decimal::ZERO, Decimal::ZERO, Decimal::ZERO, now),
        };

        let last_trade = self
            .trade_buffer
            .back()
            .map(|t| t.price)
            .unwrap_or(Decimal::ZERO);

        MicrostructureState {
            symbol: self.symbol.clone(),
            bid,
            ask,
            spread,
            spread_bps: self.spread_bps(),
            bid_depth: self.bid_depth(),
            ask_depth: self.ask_depth(),
            last_trade,
            vwap: self.vwap(),
            volume: self.volume(),
            buy_volume: self.buy_volume,
            sell_volume: self.sell_volume,
            last_update,
            is_stale: self.is_stale(),
        }
    }

    /// Get the symbol being tracked.
    #[must_use]
    pub fn symbol(&self) -> &str {
        &self.symbol
    }

    /// Get the number of trades in the buffer.
    #[must_use]
    pub fn trade_count(&self) -> usize {
        self.trade_buffer.len()
    }

    /// Get the window duration.
    #[must_use]
    pub fn window_duration(&self) -> Duration {
        self.window_duration
    }
}

// ============================================================================
// Multi-Symbol Manager
// ============================================================================

/// Manages microstructure state for multiple symbols.
#[derive(Debug, Default)]
pub struct MicrostructureManager {
    /// Trackers by symbol.
    trackers: std::collections::HashMap<String, MicrostructureTracker>,
    /// Default window duration.
    default_window: Duration,
}

impl MicrostructureManager {
    /// Create a new manager.
    #[must_use]
    pub fn new() -> Self {
        Self {
            trackers: std::collections::HashMap::new(),
            default_window: Duration::from_secs(DEFAULT_WINDOW_SECS),
        }
    }

    /// Create with custom default window.
    #[must_use]
    pub fn with_window(mut self, window: Duration) -> Self {
        self.default_window = window;
        self
    }

    /// Get or create a tracker for a symbol.
    pub fn get_or_create(&mut self, symbol: &str) -> &mut MicrostructureTracker {
        self.trackers
            .entry(symbol.to_string())
            .or_insert_with(|| {
                MicrostructureTracker::new(symbol).with_window(self.default_window)
            })
    }

    /// Get a tracker if it exists.
    #[must_use]
    pub fn get(&self, symbol: &str) -> Option<&MicrostructureTracker> {
        self.trackers.get(symbol)
    }

    /// Get a mutable tracker if it exists.
    pub fn get_mut(&mut self, symbol: &str) -> Option<&mut MicrostructureTracker> {
        self.trackers.get_mut(symbol)
    }

    /// Update quote for a symbol.
    pub fn update_quote(&mut self, symbol: &str, quote: QuoteUpdate) {
        self.get_or_create(symbol).update_quote(quote);
    }

    /// Update trade for a symbol.
    pub fn update_trade(&mut self, symbol: &str, trade: TradeUpdate) {
        self.get_or_create(symbol).update_trade(trade);
    }

    /// Get snapshot for a symbol.
    pub fn snapshot(&mut self, symbol: &str) -> Option<MicrostructureState> {
        self.trackers.get_mut(symbol).map(|t| t.snapshot())
    }

    /// Get snapshots for all symbols.
    pub fn all_snapshots(&mut self) -> Vec<MicrostructureState> {
        self.trackers.values_mut().map(|t| t.snapshot()).collect()
    }

    /// Get count of tracked symbols.
    #[must_use]
    pub fn symbol_count(&self) -> usize {
        self.trackers.len()
    }

    /// Remove a symbol tracker.
    pub fn remove(&mut self, symbol: &str) -> Option<MicrostructureTracker> {
        self.trackers.remove(symbol)
    }

    /// Get all stale symbols.
    #[must_use]
    pub fn stale_symbols(&self) -> Vec<&str> {
        self.trackers
            .iter()
            .filter(|(_, t)| t.is_stale())
            .map(|(s, _)| s.as_str())
            .collect()
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn make_quote(bid: i64, ask: i64) -> QuoteUpdate {
        QuoteUpdate::new(
            Decimal::new(bid, 2),
            Decimal::new(ask, 2),
            Decimal::new(1000, 0),
            Decimal::new(1000, 0),
        )
    }

    fn make_trade(price: i64, size: i64) -> TradeUpdate {
        TradeUpdate::new(Decimal::new(price, 2), Decimal::new(size, 0))
    }

    // ========================================================================
    // Quote Update Tests
    // ========================================================================

    #[test]
    fn test_quote_update_spread() {
        let quote = make_quote(10000, 10010); // $100.00 / $100.10
        assert_eq!(quote.spread(), Decimal::new(10, 2)); // $0.10
    }

    #[test]
    fn test_quote_update_mid_price() {
        let quote = make_quote(10000, 10010);
        assert_eq!(quote.mid_price(), Decimal::new(10005, 2)); // $100.05
    }

    #[test]
    fn test_tracker_quote_update() {
        let mut tracker = MicrostructureTracker::new("AAPL");
        let quote = make_quote(15000, 15010);

        tracker.update_quote(quote);

        let snapshot = tracker.snapshot();
        assert_eq!(snapshot.bid, Decimal::new(15000, 2));
        assert_eq!(snapshot.ask, Decimal::new(15010, 2));
        assert_eq!(snapshot.spread, Decimal::new(10, 2));
    }

    // ========================================================================
    // Trade Update & VWAP Tests
    // ========================================================================

    #[test]
    fn test_single_trade_vwap() {
        let mut tracker = MicrostructureTracker::new("AAPL");

        tracker.update_trade(make_trade(15000, 100)); // 100 shares @ $150.00

        assert_eq!(tracker.vwap(), Decimal::new(15000, 2));
        assert_eq!(tracker.volume(), Decimal::new(100, 0));
    }

    #[test]
    fn test_multiple_trades_vwap() {
        let mut tracker = MicrostructureTracker::new("AAPL");

        // 100 shares @ $150.00 = $15,000
        tracker.update_trade(make_trade(15000, 100));
        // 200 shares @ $151.00 = $30,200
        tracker.update_trade(make_trade(15100, 200));

        // VWAP = (15000 + 30200) / 300 = 45200 / 300 = 150.666...
        // = (100 * 150 + 200 * 151) / 300 = (15000 + 30200) / 300 = 150.666...
        let expected_vwap = (Decimal::new(15000, 2) * Decimal::new(100, 0)
            + Decimal::new(15100, 2) * Decimal::new(200, 0))
            / Decimal::new(300, 0);

        assert_eq!(tracker.vwap(), expected_vwap);
        assert_eq!(tracker.volume(), Decimal::new(300, 0));
    }

    #[test]
    fn test_vwap_three_trades() {
        let mut tracker = MicrostructureTracker::new("AAPL");

        tracker.update_trade(make_trade(10000, 50));  // $100 x 50
        tracker.update_trade(make_trade(10200, 30));  // $102 x 30
        tracker.update_trade(make_trade(10100, 20));  // $101 x 20

        // VWAP = (100*50 + 102*30 + 101*20) / 100
        //      = (5000 + 3060 + 2020) / 100 = 10080 / 100 = 100.80
        let expected = Decimal::new(10080, 2);
        assert_eq!(tracker.vwap(), expected);
    }

    #[test]
    fn test_trade_with_side() {
        let mut tracker = MicrostructureTracker::new("AAPL");

        tracker.update_trade(make_trade(15000, 100).with_side(TradeSide::Buy));
        tracker.update_trade(make_trade(15010, 50).with_side(TradeSide::Sell));
        tracker.update_trade(make_trade(15020, 75).with_side(TradeSide::Buy));

        assert_eq!(tracker.buy_volume(), Decimal::new(175, 0));
        assert_eq!(tracker.sell_volume(), Decimal::new(50, 0));
    }

    #[test]
    fn test_last_trade_in_snapshot() {
        let mut tracker = MicrostructureTracker::new("AAPL");

        tracker.update_trade(make_trade(15000, 100));
        tracker.update_trade(make_trade(15010, 50));
        tracker.update_trade(make_trade(15020, 25));

        let snapshot = tracker.snapshot();
        assert_eq!(snapshot.last_trade, Decimal::new(15020, 2));
    }

    // ========================================================================
    // Spread BPS Tests
    // ========================================================================

    #[test]
    fn test_spread_bps() {
        let mut tracker = MicrostructureTracker::new("AAPL");

        // $100.00 / $100.10 -> spread = $0.10, mid = $100.05
        // spread_bps = (0.10 / 100.05) * 10000 ≈ 9.995 bps
        tracker.update_quote(make_quote(10000, 10010));

        let spread_bps = tracker.spread_bps();
        // Should be approximately 10 bps
        assert!(spread_bps > Decimal::new(9, 0));
        assert!(spread_bps < Decimal::new(11, 0));
    }

    // ========================================================================
    // Depth Tests
    // ========================================================================

    #[test]
    fn test_depth_calculation() {
        let mut tracker = MicrostructureTracker::new("AAPL");

        let bid_levels = vec![
            DepthLevel { price: Decimal::new(15000, 2), size: Decimal::new(500, 0), order_count: 3 },
            DepthLevel { price: Decimal::new(14990, 2), size: Decimal::new(800, 0), order_count: 5 },
        ];

        let ask_levels = vec![
            DepthLevel { price: Decimal::new(15010, 2), size: Decimal::new(400, 0), order_count: 2 },
            DepthLevel { price: Decimal::new(15020, 2), size: Decimal::new(600, 0), order_count: 4 },
        ];

        tracker.update_depth(bid_levels, ask_levels);

        assert_eq!(tracker.bid_depth(), Decimal::new(1300, 0));
        assert_eq!(tracker.ask_depth(), Decimal::new(1000, 0));
    }

    // ========================================================================
    // Staleness Tests
    // ========================================================================

    #[test]
    fn test_staleness_no_quote() {
        let tracker = MicrostructureTracker::new("AAPL");
        assert!(tracker.is_stale());
    }

    #[test]
    fn test_staleness_fresh_quote() {
        let mut tracker = MicrostructureTracker::new("AAPL");
        tracker.update_quote(make_quote(15000, 15010));

        // Just updated, should not be stale
        assert!(!tracker.is_stale());
    }

    // ========================================================================
    // Manager Tests
    // ========================================================================

    #[test]
    fn test_manager_multi_symbol() {
        let mut manager = MicrostructureManager::new();

        manager.update_quote("AAPL", make_quote(15000, 15010));
        manager.update_quote("MSFT", make_quote(40000, 40020));

        manager.update_trade("AAPL", make_trade(15005, 100));
        manager.update_trade("MSFT", make_trade(40010, 50));

        assert_eq!(manager.symbol_count(), 2);

        let aapl = manager.snapshot("AAPL").unwrap();
        assert_eq!(aapl.bid, Decimal::new(15000, 2));
        assert_eq!(aapl.volume, Decimal::new(100, 0));

        let msft = manager.snapshot("MSFT").unwrap();
        assert_eq!(msft.bid, Decimal::new(40000, 2));
        assert_eq!(msft.volume, Decimal::new(50, 0));
    }

    #[test]
    fn test_manager_remove_symbol() {
        let mut manager = MicrostructureManager::new();

        manager.update_quote("AAPL", make_quote(15000, 15010));
        manager.update_quote("MSFT", make_quote(40000, 40020));

        assert_eq!(manager.symbol_count(), 2);

        manager.remove("AAPL");

        assert_eq!(manager.symbol_count(), 1);
        assert!(manager.get("AAPL").is_none());
        assert!(manager.get("MSFT").is_some());
    }

    #[test]
    fn test_manager_all_snapshots() {
        let mut manager = MicrostructureManager::new();

        manager.update_quote("AAPL", make_quote(15000, 15010));
        manager.update_quote("MSFT", make_quote(40000, 40020));
        manager.update_quote("GOOGL", make_quote(17500, 17510));

        let snapshots = manager.all_snapshots();
        assert_eq!(snapshots.len(), 3);
    }

    // ========================================================================
    // Edge Case Tests
    // ========================================================================

    #[test]
    fn test_empty_vwap() {
        let tracker = MicrostructureTracker::new("AAPL");
        assert_eq!(tracker.vwap(), Decimal::ZERO);
        assert_eq!(tracker.volume(), Decimal::ZERO);
    }

    #[test]
    fn test_trade_count() {
        let mut tracker = MicrostructureTracker::new("AAPL");

        assert_eq!(tracker.trade_count(), 0);

        tracker.update_trade(make_trade(15000, 100));
        tracker.update_trade(make_trade(15010, 50));

        assert_eq!(tracker.trade_count(), 2);
    }

    #[test]
    fn test_snapshot_symbol() {
        let mut tracker = MicrostructureTracker::new("AAPL");
        let snapshot = tracker.snapshot();
        assert_eq!(snapshot.symbol, "AAPL");
    }
}
