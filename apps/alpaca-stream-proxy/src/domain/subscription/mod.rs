//! Subscription Management Types
//!
//! Domain types for tracking client subscriptions to market data streams.
//! Handles subscription state, filtering, and aggregation.
//!
//! # Design
//!
//! The subscription manager tracks:
//! - Which symbols each consumer is subscribed to
//! - Reference counting for upstream subscriptions
//! - Separate tracking for quotes, trades, and bars
//!
//! This allows multiple consumers to subscribe to the same symbol
//! while maintaining only one upstream subscription.

use std::collections::{HashMap, HashSet};

use parking_lot::RwLock;

// =============================================================================
// Types
// =============================================================================

/// Unique identifier for a consumer (gRPC client).
pub type ConsumerId = u64;

/// A symbol string (stock ticker or OCC option symbol).
pub type Symbol = String;

/// Subscription type for market data.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SubscriptionType {
    /// Stock/option quote data.
    Quotes,
    /// Stock/option trade data.
    Trades,
    /// Stock bar (OHLCV) data.
    Bars,
    /// Stock daily bar data.
    DailyBars,
    /// Stock updated bar data.
    UpdatedBars,
}

impl SubscriptionType {
    /// Get all subscription types.
    #[must_use]
    pub const fn all() -> &'static [Self] {
        &[
            Self::Quotes,
            Self::Trades,
            Self::Bars,
            Self::DailyBars,
            Self::UpdatedBars,
        ]
    }
}

// =============================================================================
// Subscription Changes
// =============================================================================

/// Changes to upstream subscriptions.
#[derive(Debug, Clone, Default)]
pub struct SubscriptionChanges {
    /// Symbols to subscribe to.
    pub subscribe: HashSet<Symbol>,
    /// Symbols to unsubscribe from.
    pub unsubscribe: HashSet<Symbol>,
}

impl SubscriptionChanges {
    /// Check if there are any changes.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.subscribe.is_empty() && self.unsubscribe.is_empty()
    }

    /// Create changes with only subscribes.
    #[must_use]
    pub fn subscribe_only(symbols: impl IntoIterator<Item = Symbol>) -> Self {
        Self {
            subscribe: symbols.into_iter().collect(),
            unsubscribe: HashSet::new(),
        }
    }

    /// Create changes with only unsubscribes.
    #[must_use]
    pub fn unsubscribe_only(symbols: impl IntoIterator<Item = Symbol>) -> Self {
        Self {
            subscribe: HashSet::new(),
            unsubscribe: symbols.into_iter().collect(),
        }
    }
}

// =============================================================================
// Subscription State (per subscription type)
// =============================================================================

/// Tracks subscriptions for a single subscription type.
#[derive(Debug, Default)]
struct TypeSubscriptionState {
    /// Map from consumer ID to their subscribed symbols.
    consumer_symbols: HashMap<ConsumerId, HashSet<Symbol>>,
    /// Map from symbol to reference count.
    symbol_refcount: HashMap<Symbol, usize>,
}

impl TypeSubscriptionState {
    /// Add subscriptions for a consumer.
    ///
    /// Returns symbols that need upstream subscription (refcount went 0→1).
    fn add(&mut self, consumer: ConsumerId, symbols: &[Symbol]) -> Vec<Symbol> {
        let consumer_set = self.consumer_symbols.entry(consumer).or_default();
        let mut new_upstream = Vec::new();

        for symbol in symbols {
            // Skip if consumer already subscribed
            if consumer_set.contains(symbol) {
                continue;
            }

            consumer_set.insert(symbol.clone());

            let refcount = self.symbol_refcount.entry(symbol.clone()).or_insert(0);
            *refcount += 1;

            // First subscription - needs upstream subscribe
            if *refcount == 1 {
                new_upstream.push(symbol.clone());
            }
        }

        new_upstream
    }

    /// Remove subscriptions for a consumer.
    ///
    /// Returns symbols that need upstream unsubscription (refcount went 1→0).
    fn remove(&mut self, consumer: ConsumerId, symbols: &[Symbol]) -> Vec<Symbol> {
        let Some(consumer_set) = self.consumer_symbols.get_mut(&consumer) else {
            return vec![];
        };

        let mut remove_upstream = Vec::new();

        for symbol in symbols {
            // Skip if consumer wasn't subscribed
            if !consumer_set.remove(symbol) {
                continue;
            }

            if let Some(refcount) = self.symbol_refcount.get_mut(symbol) {
                *refcount = refcount.saturating_sub(1);

                // Last subscription removed - needs upstream unsubscribe
                if *refcount == 0 {
                    self.symbol_refcount.remove(symbol);
                    remove_upstream.push(symbol.clone());
                }
            }
        }

        // Clean up empty consumer entry
        if consumer_set.is_empty() {
            self.consumer_symbols.remove(&consumer);
        }

        remove_upstream
    }

    /// Remove all subscriptions for a consumer.
    ///
    /// Returns symbols that need upstream unsubscription.
    fn remove_consumer(&mut self, consumer: ConsumerId) -> Vec<Symbol> {
        let Some(consumer_set) = self.consumer_symbols.remove(&consumer) else {
            return vec![];
        };

        let symbols: Vec<_> = consumer_set.into_iter().collect();
        let mut remove_upstream = Vec::new();

        for symbol in &symbols {
            if let Some(refcount) = self.symbol_refcount.get_mut(symbol) {
                *refcount = refcount.saturating_sub(1);

                if *refcount == 0 {
                    self.symbol_refcount.remove(symbol);
                    remove_upstream.push(symbol.clone());
                }
            }
        }

        remove_upstream
    }

    /// Get all symbols with active subscriptions.
    fn active_symbols(&self) -> Vec<Symbol> {
        self.symbol_refcount.keys().cloned().collect()
    }

    /// Get symbols for a specific consumer.
    fn consumer_symbols(&self, consumer: ConsumerId) -> Vec<Symbol> {
        self.consumer_symbols
            .get(&consumer)
            .map(|s| s.iter().cloned().collect())
            .unwrap_or_default()
    }

    /// Get total number of unique symbols.
    fn symbol_count(&self) -> usize {
        self.symbol_refcount.len()
    }

    /// Get total number of consumers.
    fn consumer_count(&self) -> usize {
        self.consumer_symbols.len()
    }
}

// =============================================================================
// Subscription Manager
// =============================================================================

/// Manages subscriptions across all consumers and subscription types.
///
/// Thread-safe subscription manager that tracks:
/// - Per-consumer subscriptions
/// - Reference counting for shared symbols
/// - Separate state for quotes, trades, and bars
///
/// # Example
///
/// ```rust
/// use alpaca_stream_proxy::domain::subscription::{SubscriptionManager, SubscriptionType};
///
/// let manager = SubscriptionManager::new();
///
/// // Consumer 1 subscribes to AAPL quotes
/// let changes = manager.add_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);
/// assert!(changes.subscribe.contains("AAPL"));
/// assert!(changes.unsubscribe.is_empty());
///
/// // Consumer 2 also subscribes - no upstream change needed
/// let changes = manager.add_subscriptions(2, SubscriptionType::Quotes, &["AAPL".to_string()]);
/// assert!(changes.subscribe.is_empty());
///
/// // Consumer 1 unsubscribes - still subscribed via Consumer 2
/// let changes = manager.remove_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);
/// assert!(changes.unsubscribe.is_empty());
///
/// // Consumer 2 unsubscribes - now unsubscribe upstream
/// let changes = manager.remove_subscriptions(2, SubscriptionType::Quotes, &["AAPL".to_string()]);
/// assert!(changes.unsubscribe.contains("AAPL"));
/// ```
pub struct SubscriptionManager {
    quotes: RwLock<TypeSubscriptionState>,
    trades: RwLock<TypeSubscriptionState>,
    bars: RwLock<TypeSubscriptionState>,
    daily_bars: RwLock<TypeSubscriptionState>,
    updated_bars: RwLock<TypeSubscriptionState>,
}

impl Default for SubscriptionManager {
    fn default() -> Self {
        Self::new()
    }
}

impl SubscriptionManager {
    /// Create a new subscription manager.
    #[must_use]
    pub fn new() -> Self {
        Self {
            quotes: RwLock::new(TypeSubscriptionState::default()),
            trades: RwLock::new(TypeSubscriptionState::default()),
            bars: RwLock::new(TypeSubscriptionState::default()),
            daily_bars: RwLock::new(TypeSubscriptionState::default()),
            updated_bars: RwLock::new(TypeSubscriptionState::default()),
        }
    }

    /// Add subscriptions for a consumer.
    ///
    /// Returns changes that need to be applied upstream.
    pub fn add_subscriptions(
        &self,
        consumer: ConsumerId,
        sub_type: SubscriptionType,
        symbols: &[Symbol],
    ) -> SubscriptionChanges {
        let state = self.get_state(sub_type);
        let new_symbols = state.write().add(consumer, symbols);

        SubscriptionChanges::subscribe_only(new_symbols)
    }

    /// Remove subscriptions for a consumer.
    ///
    /// Returns changes that need to be applied upstream.
    pub fn remove_subscriptions(
        &self,
        consumer: ConsumerId,
        sub_type: SubscriptionType,
        symbols: &[Symbol],
    ) -> SubscriptionChanges {
        let state = self.get_state(sub_type);
        let removed_symbols = state.write().remove(consumer, symbols);

        SubscriptionChanges::unsubscribe_only(removed_symbols)
    }

    /// Handle consumer disconnection.
    ///
    /// Removes all subscriptions for the consumer and returns changes
    /// that need to be applied upstream (for each subscription type).
    pub fn consumer_disconnected(
        &self,
        consumer: ConsumerId,
    ) -> HashMap<SubscriptionType, SubscriptionChanges> {
        let mut changes = HashMap::new();

        for sub_type in SubscriptionType::all() {
            let state = self.get_state(*sub_type);
            let removed = state.write().remove_consumer(consumer);

            if !removed.is_empty() {
                changes.insert(*sub_type, SubscriptionChanges::unsubscribe_only(removed));
            }
        }

        changes
    }

    /// Get all active symbols for a subscription type.
    #[must_use]
    pub fn active_symbols(&self, sub_type: SubscriptionType) -> Vec<Symbol> {
        self.get_state(sub_type).read().active_symbols()
    }

    /// Get symbols for a specific consumer.
    #[must_use]
    pub fn consumer_symbols(
        &self,
        consumer: ConsumerId,
        sub_type: SubscriptionType,
    ) -> Vec<Symbol> {
        self.get_state(sub_type).read().consumer_symbols(consumer)
    }

    /// Get statistics for a subscription type.
    #[must_use]
    pub fn stats(&self, sub_type: SubscriptionType) -> SubscriptionStats {
        let state = self.get_state(sub_type).read();
        SubscriptionStats {
            symbol_count: state.symbol_count(),
            consumer_count: state.consumer_count(),
        }
    }

    /// Get overall statistics.
    #[must_use]
    pub fn total_stats(&self) -> TotalSubscriptionStats {
        TotalSubscriptionStats {
            quotes: self.stats(SubscriptionType::Quotes),
            trades: self.stats(SubscriptionType::Trades),
            bars: self.stats(SubscriptionType::Bars),
            daily_bars: self.stats(SubscriptionType::DailyBars),
            updated_bars: self.stats(SubscriptionType::UpdatedBars),
        }
    }

    /// Get the state for a subscription type.
    const fn get_state(&self, sub_type: SubscriptionType) -> &RwLock<TypeSubscriptionState> {
        match sub_type {
            SubscriptionType::Quotes => &self.quotes,
            SubscriptionType::Trades => &self.trades,
            SubscriptionType::Bars => &self.bars,
            SubscriptionType::DailyBars => &self.daily_bars,
            SubscriptionType::UpdatedBars => &self.updated_bars,
        }
    }
}

// =============================================================================
// Statistics
// =============================================================================

/// Statistics for a single subscription type.
#[derive(Debug, Clone, Default)]
pub struct SubscriptionStats {
    /// Number of unique symbols.
    pub symbol_count: usize,
    /// Number of consumers.
    pub consumer_count: usize,
}

/// Overall subscription statistics.
#[derive(Debug, Clone, Default)]
pub struct TotalSubscriptionStats {
    /// Quote subscription stats.
    pub quotes: SubscriptionStats,
    /// Trade subscription stats.
    pub trades: SubscriptionStats,
    /// Bar subscription stats.
    pub bars: SubscriptionStats,
    /// Daily bar subscription stats.
    pub daily_bars: SubscriptionStats,
    /// Updated bar subscription stats.
    pub updated_bars: SubscriptionStats,
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_subscription_new_symbol() {
        let manager = SubscriptionManager::new();

        let changes = manager.add_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);

        assert!(changes.subscribe.contains("AAPL"));
        assert!(changes.unsubscribe.is_empty());
    }

    #[test]
    fn add_subscription_existing_symbol() {
        let manager = SubscriptionManager::new();

        // First consumer
        manager.add_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);

        // Second consumer - no upstream change needed
        let changes = manager.add_subscriptions(2, SubscriptionType::Quotes, &["AAPL".to_string()]);

        assert!(changes.subscribe.is_empty());
        assert!(changes.unsubscribe.is_empty());
    }

    #[test]
    fn add_subscription_duplicate_consumer() {
        let manager = SubscriptionManager::new();

        manager.add_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);

        // Same consumer adds same symbol again
        let changes = manager.add_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);

        assert!(changes.subscribe.is_empty());
    }

    #[test]
    fn remove_subscription_with_remaining_consumers() {
        let manager = SubscriptionManager::new();

        manager.add_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);
        manager.add_subscriptions(2, SubscriptionType::Quotes, &["AAPL".to_string()]);

        // Consumer 1 unsubscribes - still have Consumer 2
        let changes =
            manager.remove_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);

        assert!(changes.unsubscribe.is_empty());
    }

    #[test]
    fn remove_subscription_last_consumer() {
        let manager = SubscriptionManager::new();

        manager.add_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);

        let changes =
            manager.remove_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);

        assert!(changes.unsubscribe.contains("AAPL"));
    }

    #[test]
    fn consumer_disconnected_cleans_up() {
        let manager = SubscriptionManager::new();

        manager.add_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);
        manager.add_subscriptions(
            1,
            SubscriptionType::Trades,
            &["MSFT".to_string(), "GOOG".to_string()],
        );

        let all_changes = manager.consumer_disconnected(1);

        assert!(
            all_changes
                .get(&SubscriptionType::Quotes)
                .unwrap()
                .unsubscribe
                .contains("AAPL")
        );
        assert!(
            all_changes
                .get(&SubscriptionType::Trades)
                .unwrap()
                .unsubscribe
                .contains("MSFT")
        );
        assert!(
            all_changes
                .get(&SubscriptionType::Trades)
                .unwrap()
                .unsubscribe
                .contains("GOOG")
        );
    }

    #[test]
    fn consumer_disconnected_preserves_other_consumers() {
        let manager = SubscriptionManager::new();

        manager.add_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);
        manager.add_subscriptions(2, SubscriptionType::Quotes, &["AAPL".to_string()]);

        let all_changes = manager.consumer_disconnected(1);

        // AAPL should NOT be in unsubscribe since Consumer 2 still has it
        assert!(
            all_changes
                .get(&SubscriptionType::Quotes)
                .is_none_or(|c| c.unsubscribe.is_empty())
        );
    }

    #[test]
    fn active_symbols_returns_subscribed() {
        let manager = SubscriptionManager::new();

        manager.add_subscriptions(
            1,
            SubscriptionType::Quotes,
            &["AAPL".to_string(), "MSFT".to_string()],
        );

        let active = manager.active_symbols(SubscriptionType::Quotes);

        assert_eq!(active.len(), 2);
        assert!(active.contains(&"AAPL".to_string()));
        assert!(active.contains(&"MSFT".to_string()));
    }

    #[test]
    fn stats_are_accurate() {
        let manager = SubscriptionManager::new();

        manager.add_subscriptions(
            1,
            SubscriptionType::Quotes,
            &["AAPL".to_string(), "MSFT".to_string()],
        );
        manager.add_subscriptions(2, SubscriptionType::Quotes, &["AAPL".to_string()]);

        let stats = manager.stats(SubscriptionType::Quotes);

        assert_eq!(stats.symbol_count, 2); // AAPL and MSFT
        assert_eq!(stats.consumer_count, 2); // Consumer 1 and 2
    }

    #[test]
    fn different_types_are_independent() {
        let manager = SubscriptionManager::new();

        manager.add_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);
        manager.add_subscriptions(1, SubscriptionType::Trades, &["MSFT".to_string()]);

        let quote_active = manager.active_symbols(SubscriptionType::Quotes);
        let trade_active = manager.active_symbols(SubscriptionType::Trades);

        assert_eq!(quote_active, vec!["AAPL".to_string()]);
        assert_eq!(trade_active, vec!["MSFT".to_string()]);
    }

    #[test]
    fn remove_nonexistent_subscription_no_changes() {
        let manager = SubscriptionManager::new();

        // Try to remove a subscription that was never added
        let changes =
            manager.remove_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);

        assert!(changes.is_empty());
    }

    #[test]
    fn remove_subscription_from_nonexistent_consumer() {
        let manager = SubscriptionManager::new();

        // Add subscription for consumer 1
        manager.add_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);

        // Try to remove for consumer 2 (who never subscribed)
        let changes =
            manager.remove_subscriptions(2, SubscriptionType::Quotes, &["AAPL".to_string()]);

        assert!(changes.is_empty());
        // Consumer 1's subscription should still be active
        assert_eq!(manager.active_symbols(SubscriptionType::Quotes).len(), 1);
    }

    #[test]
    fn consumer_disconnected_unknown_consumer_no_changes() {
        let manager = SubscriptionManager::new();

        // Add subscription for consumer 1
        manager.add_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);

        // Disconnect consumer 2 (who never subscribed)
        let changes = manager.consumer_disconnected(2);

        assert!(changes.is_empty());
        // Consumer 1's subscription should still be active
        assert_eq!(manager.active_symbols(SubscriptionType::Quotes).len(), 1);
    }

    #[test]
    fn subscription_changes_is_empty() {
        let empty = SubscriptionChanges::default();
        assert!(empty.is_empty());

        let subscribe_only = SubscriptionChanges::subscribe_only(vec!["AAPL".to_string()]);
        assert!(!subscribe_only.is_empty());

        let unsubscribe_only = SubscriptionChanges::unsubscribe_only(vec!["AAPL".to_string()]);
        assert!(!unsubscribe_only.is_empty());
    }

    #[test]
    fn consumer_symbols_returns_correct_symbols() {
        let manager = SubscriptionManager::new();

        manager.add_subscriptions(
            1,
            SubscriptionType::Quotes,
            &["AAPL".to_string(), "MSFT".to_string()],
        );
        manager.add_subscriptions(2, SubscriptionType::Quotes, &["GOOG".to_string()]);

        let consumer1_symbols = manager.consumer_symbols(1, SubscriptionType::Quotes);
        let consumer2_symbols = manager.consumer_symbols(2, SubscriptionType::Quotes);

        assert_eq!(consumer1_symbols.len(), 2);
        assert!(consumer1_symbols.contains(&"AAPL".to_string()));
        assert!(consumer1_symbols.contains(&"MSFT".to_string()));

        assert_eq!(consumer2_symbols.len(), 1);
        assert!(consumer2_symbols.contains(&"GOOG".to_string()));
    }

    #[test]
    fn consumer_symbols_unknown_consumer_empty() {
        let manager = SubscriptionManager::new();

        let symbols = manager.consumer_symbols(999, SubscriptionType::Quotes);
        assert!(symbols.is_empty());
    }

    #[test]
    fn total_stats_covers_all_types() {
        let manager = SubscriptionManager::new();

        manager.add_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);
        manager.add_subscriptions(1, SubscriptionType::Trades, &["MSFT".to_string()]);
        manager.add_subscriptions(1, SubscriptionType::Bars, &["GOOG".to_string()]);
        manager.add_subscriptions(2, SubscriptionType::DailyBars, &["TSLA".to_string()]);
        manager.add_subscriptions(2, SubscriptionType::UpdatedBars, &["NVDA".to_string()]);

        let total = manager.total_stats();

        assert_eq!(total.quotes.symbol_count, 1);
        assert_eq!(total.trades.symbol_count, 1);
        assert_eq!(total.bars.symbol_count, 1);
        assert_eq!(total.daily_bars.symbol_count, 1);
        assert_eq!(total.updated_bars.symbol_count, 1);
    }

    #[test]
    fn subscription_type_all_returns_all_types() {
        let all = SubscriptionType::all();
        assert_eq!(all.len(), 5);
        assert!(all.contains(&SubscriptionType::Quotes));
        assert!(all.contains(&SubscriptionType::Trades));
        assert!(all.contains(&SubscriptionType::Bars));
        assert!(all.contains(&SubscriptionType::DailyBars));
        assert!(all.contains(&SubscriptionType::UpdatedBars));
    }

    #[test]
    fn add_multiple_symbols_at_once() {
        let manager = SubscriptionManager::new();

        let changes = manager.add_subscriptions(
            1,
            SubscriptionType::Quotes,
            &["AAPL".to_string(), "MSFT".to_string(), "GOOG".to_string()],
        );

        assert_eq!(changes.subscribe.len(), 3);
        assert!(changes.subscribe.contains("AAPL"));
        assert!(changes.subscribe.contains("MSFT"));
        assert!(changes.subscribe.contains("GOOG"));
    }

    #[test]
    fn add_partially_existing_symbols() {
        let manager = SubscriptionManager::new();

        // First consumer subscribes to AAPL
        manager.add_subscriptions(1, SubscriptionType::Quotes, &["AAPL".to_string()]);

        // Second consumer subscribes to AAPL and MSFT
        let changes = manager.add_subscriptions(
            2,
            SubscriptionType::Quotes,
            &["AAPL".to_string(), "MSFT".to_string()],
        );

        // Only MSFT should need upstream subscribe (AAPL already subscribed)
        assert_eq!(changes.subscribe.len(), 1);
        assert!(changes.subscribe.contains("MSFT"));
    }

    #[test]
    fn thread_safety_concurrent_subscriptions() {
        use std::sync::Arc;
        use std::thread;

        let manager = Arc::new(SubscriptionManager::new());
        let mut handles = vec![];

        // Spawn 10 threads that each add subscriptions
        for i in 0..10 {
            let m = Arc::clone(&manager);
            handles.push(thread::spawn(move || {
                m.add_subscriptions(
                    i,
                    SubscriptionType::Quotes,
                    &[format!("SYM{i}"), "SHARED".to_string()],
                );
            }));
        }

        for handle in handles {
            handle.join().unwrap();
        }

        // All 10 consumers should have subscribed
        let stats = manager.stats(SubscriptionType::Quotes);
        assert_eq!(stats.consumer_count, 10);
        // 10 unique symbols (SYM0-SYM9) + 1 shared = 11
        assert_eq!(stats.symbol_count, 11);
    }

    #[test]
    fn thread_safety_concurrent_disconnects() {
        use std::sync::Arc;
        use std::thread;

        let manager = Arc::new(SubscriptionManager::new());

        // Set up subscriptions first
        for i in 0..10u64 {
            manager.add_subscriptions(i, SubscriptionType::Quotes, &["SHARED".to_string()]);
        }

        let mut handles = vec![];

        // Spawn threads to disconnect concurrently
        for i in 0..10u64 {
            let m = Arc::clone(&manager);
            handles.push(thread::spawn(move || {
                m.consumer_disconnected(i);
            }));
        }

        for handle in handles {
            handle.join().unwrap();
        }

        // All consumers should be disconnected
        let stats = manager.stats(SubscriptionType::Quotes);
        assert_eq!(stats.consumer_count, 0);
        assert_eq!(stats.symbol_count, 0);
    }
}
