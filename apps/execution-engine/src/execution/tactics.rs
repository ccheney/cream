//! Execution tactics for order submission.
//!
//! This module implements various execution tactics (`PASSIVE_LIMIT`, `TWAP`, `VWAP`)
//! to optimize order fills while minimizing market impact.
//!
//! See docs/plans/07-execution.md for detailed documentation on each tactic.

use chrono::{DateTime, Duration, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Available execution tactics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TacticType {
    /// Post limit order at or inside NBBO to capture maker rebates.
    PassiveLimit,
    /// Cross the spread immediately with a limit order.
    AggressiveLimit,
    /// Break large orders into smaller visible chunks (slice and hide).
    Iceberg,
    /// Distribute order evenly across a time window (time-weighted).
    Twap,
    /// Participate proportionally to market volume (volume-weighted).
    Vwap,
    /// Dynamically switch between passive and aggressive based on conditions.
    Adaptive,
}

/// Configuration for `PASSIVE_LIMIT` tactic.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PassiveLimitConfig {
    /// Basis points inside NBBO (1 BPS = 0.01% = 0.0001).
    pub offset_bps: u32,
    /// Time before crossing spread (seconds).
    pub decay_seconds: u32,
    /// Maximum time before cancel (seconds).
    pub max_wait_seconds: u32,
}

impl Default for PassiveLimitConfig {
    fn default() -> Self {
        Self {
            offset_bps: 0,
            decay_seconds: 60,
            max_wait_seconds: 300,
        }
    }
}

impl PassiveLimitConfig {
    /// Calculate the limit price for a buy order.
    ///
    /// Returns bid price + `offset_bps`.
    #[must_use]
    pub fn calculate_buy_price(&self, bid: Decimal, ask: Decimal) -> Decimal {
        let offset = Decimal::from(self.offset_bps) / Decimal::from(10000);
        let mid = (bid + ask) / Decimal::from(2);
        bid + (mid * offset)
    }

    /// Calculate the limit price for a sell order.
    ///
    /// Returns ask price - `offset_bps`.
    #[must_use]
    pub fn calculate_sell_price(&self, bid: Decimal, ask: Decimal) -> Decimal {
        let offset = Decimal::from(self.offset_bps) / Decimal::from(10000);
        let mid = (bid + ask) / Decimal::from(2);
        ask - (mid * offset)
    }

    /// Check if the order should decay (move toward mid).
    #[must_use]
    pub fn should_decay(&self, submitted_at: DateTime<Utc>) -> bool {
        Utc::now() - submitted_at >= Duration::seconds(i64::from(self.decay_seconds))
    }

    /// Check if the order should be canceled.
    #[must_use]
    pub fn should_cancel(&self, submitted_at: DateTime<Utc>) -> bool {
        Utc::now() - submitted_at >= Duration::seconds(i64::from(self.max_wait_seconds))
    }
}

/// Configuration for `AGGRESSIVE_LIMIT` tactic.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AggressiveLimitConfig {
    /// Basis points past NBBO.
    pub cross_bps: u32,
    /// Time before re-pricing (seconds).
    pub timeout_seconds: u32,
}

impl Default for AggressiveLimitConfig {
    fn default() -> Self {
        Self {
            cross_bps: 5,
            timeout_seconds: 30,
        }
    }
}

impl AggressiveLimitConfig {
    /// Calculate the limit price for a buy order (crosses the spread).
    ///
    /// Returns ask price + `cross_bps`.
    #[must_use]
    pub fn calculate_buy_price(&self, ask: Decimal) -> Decimal {
        let offset = Decimal::from(self.cross_bps) / Decimal::from(10000);
        ask + (ask * offset)
    }

    /// Calculate the limit price for a sell order (crosses the spread).
    ///
    /// Returns bid price - `cross_bps`.
    #[must_use]
    pub fn calculate_sell_price(&self, bid: Decimal) -> Decimal {
        let offset = Decimal::from(self.cross_bps) / Decimal::from(10000);
        bid - (bid * offset)
    }

    /// Check if the order should be re-priced.
    #[must_use]
    pub fn should_reprice(&self, submitted_at: DateTime<Utc>) -> bool {
        Utc::now() - submitted_at >= Duration::seconds(i64::from(self.timeout_seconds))
    }
}

/// Configuration for ICEBERG tactic.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IcebergConfig {
    /// Visible quantity per slice.
    pub display_size: u32,
    /// Apply ±30% variance to display size.
    pub randomize_size: bool,
    /// Apply ±20% variance to interval.
    pub randomize_time: bool,
    /// Minimum time between slices (milliseconds).
    pub min_interval_ms: u32,
}

impl Default for IcebergConfig {
    fn default() -> Self {
        Self {
            display_size: 100,
            randomize_size: true,
            randomize_time: true,
            min_interval_ms: 500,
        }
    }
}

/// Configuration for TWAP tactic.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TwapConfig {
    /// Total execution window (minutes).
    pub duration_minutes: u32,
    /// Time between slices (seconds).
    pub slice_interval_seconds: u32,
    /// Order type per slice ("limit" or "market").
    pub slice_type: SliceType,
    /// Continue after window if unfilled.
    pub allow_past_end: bool,
}

impl Default for TwapConfig {
    fn default() -> Self {
        Self {
            duration_minutes: 60,
            slice_interval_seconds: 60,
            slice_type: SliceType::Limit,
            allow_past_end: false,
        }
    }
}

impl TwapConfig {
    /// Calculate the number of slices for a TWAP execution.
    #[must_use]
    pub fn calculate_slice_count(&self) -> u32 {
        let total_seconds = self.duration_minutes * 60;
        total_seconds / self.slice_interval_seconds
    }

    /// Calculate the quantity per slice.
    #[must_use]
    pub fn calculate_slice_quantity(&self, total_quantity: Decimal) -> Decimal {
        total_quantity / Decimal::from(self.calculate_slice_count())
    }

    /// Calculate the execution schedule.
    ///
    /// Returns a vector of timestamps when each slice should be submitted.
    #[must_use]
    pub fn calculate_schedule(&self, start_time: DateTime<Utc>) -> Vec<DateTime<Utc>> {
        let slice_count = self.calculate_slice_count();
        let interval = Duration::seconds(i64::from(self.slice_interval_seconds));

        (0..slice_count)
            .map(|i| start_time + interval * i32::try_from(i).unwrap_or(0))
            .collect()
    }

    /// Check if execution window has ended.
    #[must_use]
    pub fn is_window_ended(&self, start_time: DateTime<Utc>) -> bool {
        let end_time = start_time + Duration::minutes(i64::from(self.duration_minutes));
        Utc::now() >= end_time
    }
}

/// Configuration for VWAP tactic.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VwapConfig {
    /// Maximum percentage of ADV per interval (0.01 to 0.50).
    pub max_pct_volume: Decimal,
    /// Window start time (optional, defaults to now).
    pub start_time: Option<DateTime<Utc>>,
    /// Window end time (optional, defaults to market close).
    pub end_time: Option<DateTime<Utc>>,
    /// Only post, never cross (passive only).
    pub no_take_liquidity: bool,
}

impl Default for VwapConfig {
    fn default() -> Self {
        Self {
            max_pct_volume: Decimal::new(10, 2), // 0.10 (10%)
            start_time: None,
            end_time: None,
            no_take_liquidity: false,
        }
    }
}

impl VwapConfig {
    /// Calculate the maximum quantity for next interval based on recent volume.
    ///
    /// # Arguments
    /// * `recent_volume` - Volume in the recent interval
    /// * `remaining_quantity` - Quantity still to be filled
    ///
    /// # Returns
    /// The maximum quantity to submit in the next interval.
    #[must_use]
    pub fn calculate_participation_quantity(
        &self,
        recent_volume: Decimal,
        remaining_quantity: Decimal,
    ) -> Decimal {
        let max_quantity = recent_volume * self.max_pct_volume;
        max_quantity.min(remaining_quantity)
    }

    /// Check if execution window has ended.
    #[must_use]
    pub fn is_window_ended(&self) -> bool {
        if let Some(end_time) = self.end_time {
            Utc::now() >= end_time
        } else {
            false
        }
    }
}

/// Configuration for ADAPTIVE tactic.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdaptiveConfig {
    /// Priority level.
    pub urgency: Urgency,
    /// Cross spread if below threshold (BPS).
    pub spread_threshold_bps: u32,
}

impl Default for AdaptiveConfig {
    fn default() -> Self {
        Self {
            urgency: Urgency::Normal,
            spread_threshold_bps: 10,
        }
    }
}

/// Urgency level for adaptive tactics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Urgency {
    /// Start passive, only cross after extended time.
    Patient,
    /// Passive initially, cross if spread narrows or time elapses.
    Normal,
    /// Aggressive from start, re-price frequently.
    Urgent,
}

/// Slice type for TWAP execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SliceType {
    /// Use limit orders for each slice.
    Limit,
    /// Use market orders for each slice.
    Market,
}

/// Unified tactic configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TacticConfig {
    /// Tactic type.
    pub tactic: TacticType,
    /// `PASSIVE_LIMIT` configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub passive_limit: Option<PassiveLimitConfig>,
    /// `AGGRESSIVE_LIMIT` configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aggressive_limit: Option<AggressiveLimitConfig>,
    /// ICEBERG configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iceberg: Option<IcebergConfig>,
    /// TWAP configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub twap: Option<TwapConfig>,
    /// VWAP configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vwap: Option<VwapConfig>,
    /// ADAPTIVE configuration.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub adaptive: Option<AdaptiveConfig>,
}

impl TacticConfig {
    /// Create a `PASSIVE_LIMIT` tactic configuration.
    #[must_use]
    pub fn passive_limit(config: PassiveLimitConfig) -> Self {
        Self {
            tactic: TacticType::PassiveLimit,
            passive_limit: Some(config),
            aggressive_limit: None,
            iceberg: None,
            twap: None,
            vwap: None,
            adaptive: None,
        }
    }

    /// Create an `AGGRESSIVE_LIMIT` tactic configuration.
    #[must_use]
    pub fn aggressive_limit(config: AggressiveLimitConfig) -> Self {
        Self {
            tactic: TacticType::AggressiveLimit,
            passive_limit: None,
            aggressive_limit: Some(config),
            iceberg: None,
            twap: None,
            vwap: None,
            adaptive: None,
        }
    }

    /// Create an ICEBERG tactic configuration.
    #[must_use]
    pub fn iceberg(config: IcebergConfig) -> Self {
        Self {
            tactic: TacticType::Iceberg,
            passive_limit: None,
            aggressive_limit: None,
            iceberg: Some(config),
            twap: None,
            vwap: None,
            adaptive: None,
        }
    }

    /// Create a TWAP tactic configuration.
    #[must_use]
    pub fn twap(config: TwapConfig) -> Self {
        Self {
            tactic: TacticType::Twap,
            passive_limit: None,
            aggressive_limit: None,
            iceberg: None,
            twap: Some(config),
            vwap: None,
            adaptive: None,
        }
    }

    /// Create a VWAP tactic configuration.
    #[must_use]
    pub fn vwap(config: VwapConfig) -> Self {
        Self {
            tactic: TacticType::Vwap,
            passive_limit: None,
            aggressive_limit: None,
            iceberg: None,
            twap: None,
            vwap: Some(config),
            adaptive: None,
        }
    }

    /// Create an ADAPTIVE tactic configuration.
    #[must_use]
    pub fn adaptive(config: AdaptiveConfig) -> Self {
        Self {
            tactic: TacticType::Adaptive,
            passive_limit: None,
            aggressive_limit: None,
            iceberg: None,
            twap: None,
            vwap: None,
            adaptive: Some(config),
        }
    }
}

/// Context for tactic selection.
#[derive(Debug, Clone)]
pub struct TacticSelectionContext {
    /// Order size as percentage of average daily volume.
    pub size_pct_adv: Decimal,
    /// Urgency level (low, normal, high).
    pub urgency: TacticUrgency,
    /// Current market state.
    pub market_state: MarketState,
    /// Is this an entry or exit order?
    pub order_purpose: OrderPurpose,
}

/// Urgency level for tactic selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TacticUrgency {
    /// Low urgency, optimize for best price.
    Low,
    /// Normal urgency, balance price and execution.
    Normal,
    /// High urgency, prioritize execution over price.
    High,
}

/// Market state for tactic selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MarketState {
    /// Normal market conditions.
    Normal,
    /// Volatile market (high price swings).
    Volatile,
    /// Wide spread (illiquid).
    WideSpread,
}

/// Order purpose for tactic selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrderPurpose {
    /// Entry order (opening new position).
    Entry,
    /// Exit order (closing position).
    Exit,
    /// Stop-loss order (risk management).
    StopLoss,
}

/// Tactic selector for choosing the best execution tactic.
#[derive(Debug, Clone)]
pub struct TacticSelector {
    /// Default tactic for entries.
    default_entry: TacticType,
    /// Default tactic for exits.
    default_exit: TacticType,
    /// Default tactic for stop-losses.
    default_stop_loss: TacticType,
}

impl Default for TacticSelector {
    fn default() -> Self {
        Self {
            default_entry: TacticType::PassiveLimit,
            default_exit: TacticType::AggressiveLimit,
            default_stop_loss: TacticType::AggressiveLimit,
        }
    }
}

impl TacticSelector {
    /// Create a new tactic selector with custom defaults.
    #[must_use]
    pub const fn new(
        default_entry: TacticType,
        default_exit: TacticType,
        default_stop_loss: TacticType,
    ) -> Self {
        Self {
            default_entry,
            default_exit,
            default_stop_loss,
        }
    }

    /// Select the best tactic for the given context.
    ///
    /// Uses the tactic selection matrix from docs/plans/07-execution.md.
    #[must_use]
    pub fn select(&self, context: &TacticSelectionContext) -> TacticType {
        // Stop-loss orders always use aggressive limit
        if context.order_purpose == OrderPurpose::StopLoss {
            return self.default_stop_loss;
        }

        // Volatile markets always use aggressive limit
        if context.market_state == MarketState::Volatile {
            return TacticType::AggressiveLimit;
        }

        // Size-based selection (ADV = Average Daily Volume)
        let size_threshold_small = Decimal::new(1, 2); // 0.01 (1% ADV)
        let size_threshold_medium = Decimal::new(5, 2); // 0.05 (5% ADV)

        match (context.size_pct_adv, context.urgency, context.market_state) {
            // Small orders (<1% ADV)
            (size, TacticUrgency::Low, MarketState::Normal) if size < size_threshold_small => {
                TacticType::PassiveLimit
            }
            (size, TacticUrgency::High, MarketState::Normal) if size < size_threshold_small => {
                TacticType::AggressiveLimit
            }
            (size, _, MarketState::WideSpread) if size < size_threshold_small => {
                TacticType::PassiveLimit
            }

            // Medium orders (1-5% ADV)
            (size, TacticUrgency::Low, MarketState::Normal)
                if size >= size_threshold_small && size < size_threshold_medium =>
            {
                TacticType::Twap
            }
            (size, TacticUrgency::High, MarketState::Normal)
                if size >= size_threshold_small && size < size_threshold_medium =>
            {
                TacticType::Adaptive
            }

            // Large orders (>5% ADV)
            (size, TacticUrgency::Low, MarketState::Normal) if size >= size_threshold_medium => {
                TacticType::Vwap
            }
            (size, _, _) if size >= size_threshold_medium => TacticType::Iceberg,

            // Default based on order purpose
            _ => match context.order_purpose {
                OrderPurpose::Entry => self.default_entry,
                OrderPurpose::Exit => self.default_exit,
                OrderPurpose::StopLoss => self.default_stop_loss,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_passive_limit_buy_price() {
        let config = PassiveLimitConfig::default();
        let bid = Decimal::new(100, 0);
        let ask = Decimal::new(101, 0);

        let price = config.calculate_buy_price(bid, ask);
        assert_eq!(price, bid); // 0 offset should return bid
    }

    #[test]
    fn test_passive_limit_sell_price() {
        let config = PassiveLimitConfig::default();
        let bid = Decimal::new(100, 0);
        let ask = Decimal::new(101, 0);

        let price = config.calculate_sell_price(bid, ask);
        assert_eq!(price, ask); // 0 offset should return ask
    }

    #[test]
    fn test_aggressive_limit_buy_price() {
        let config = AggressiveLimitConfig::default();
        let ask = Decimal::new(101, 0);

        let price = config.calculate_buy_price(ask);
        assert!(price > ask); // Should cross the spread
    }

    #[test]
    fn test_aggressive_limit_sell_price() {
        let config = AggressiveLimitConfig::default();
        let bid = Decimal::new(100, 0);

        let price = config.calculate_sell_price(bid);
        assert!(price < bid); // Should cross the spread
    }

    #[test]
    fn test_twap_slice_count() {
        let config = TwapConfig {
            duration_minutes: 60,
            slice_interval_seconds: 60,
            slice_type: SliceType::Limit,
            allow_past_end: false,
        };

        assert_eq!(config.calculate_slice_count(), 60); // 60 slices over 60 minutes
    }

    #[test]
    fn test_twap_slice_quantity() {
        let config = TwapConfig {
            duration_minutes: 60,
            slice_interval_seconds: 60,
            slice_type: SliceType::Limit,
            allow_past_end: false,
        };

        let total_quantity = Decimal::new(1000, 0);
        let slice_quantity = config.calculate_slice_quantity(total_quantity);

        assert_eq!(slice_quantity, Decimal::new(1000, 0) / Decimal::from(60));
    }

    #[test]
    fn test_twap_schedule() {
        let config = TwapConfig {
            duration_minutes: 1,        // 1 minute for faster test
            slice_interval_seconds: 20, // 3 slices
            slice_type: SliceType::Limit,
            allow_past_end: false,
        };

        let start_time = Utc::now();
        let schedule = config.calculate_schedule(start_time);

        assert_eq!(schedule.len(), 3);
        assert_eq!(schedule[0], start_time);
        assert_eq!(schedule[1], start_time + Duration::seconds(20));
        assert_eq!(schedule[2], start_time + Duration::seconds(40));
    }

    #[test]
    fn test_vwap_participation_quantity() {
        let config = VwapConfig::default();
        let recent_volume = Decimal::new(10000, 0);
        let remaining_quantity = Decimal::new(500, 0);

        let quantity = config.calculate_participation_quantity(recent_volume, remaining_quantity);

        // Should be min(10000 * 0.10, 500) = 500
        assert_eq!(quantity, Decimal::new(500, 0));
    }

    #[test]
    fn test_tactic_selector_stop_loss() {
        let selector = TacticSelector::default();
        let context = TacticSelectionContext {
            size_pct_adv: Decimal::new(1, 2), // 0.01 (1%)
            urgency: TacticUrgency::Low,
            market_state: MarketState::Normal,
            order_purpose: OrderPurpose::StopLoss,
        };

        let tactic = selector.select(&context);
        assert_eq!(tactic, TacticType::AggressiveLimit);
    }

    #[test]
    fn test_tactic_selector_small_order_low_urgency() {
        let selector = TacticSelector::default();
        let context = TacticSelectionContext {
            size_pct_adv: Decimal::new(5, 3), // 0.005 (0.5%)
            urgency: TacticUrgency::Low,
            market_state: MarketState::Normal,
            order_purpose: OrderPurpose::Entry,
        };

        let tactic = selector.select(&context);
        assert_eq!(tactic, TacticType::PassiveLimit);
    }

    #[test]
    fn test_tactic_selector_medium_order_low_urgency() {
        let selector = TacticSelector::default();
        let context = TacticSelectionContext {
            size_pct_adv: Decimal::new(3, 2), // 0.03 (3%)
            urgency: TacticUrgency::Low,
            market_state: MarketState::Normal,
            order_purpose: OrderPurpose::Entry,
        };

        let tactic = selector.select(&context);
        assert_eq!(tactic, TacticType::Twap);
    }

    #[test]
    fn test_tactic_selector_large_order() {
        let selector = TacticSelector::default();
        let context = TacticSelectionContext {
            size_pct_adv: Decimal::new(10, 2), // 0.10 (10%)
            urgency: TacticUrgency::Low,
            market_state: MarketState::Normal,
            order_purpose: OrderPurpose::Entry,
        };

        let tactic = selector.select(&context);
        assert_eq!(tactic, TacticType::Vwap);
    }

    #[test]
    fn test_tactic_selector_volatile_market() {
        let selector = TacticSelector::default();
        let context = TacticSelectionContext {
            size_pct_adv: Decimal::new(1, 2), // 0.01 (1%)
            urgency: TacticUrgency::Low,
            market_state: MarketState::Volatile,
            order_purpose: OrderPurpose::Entry,
        };

        let tactic = selector.select(&context);
        assert_eq!(tactic, TacticType::AggressiveLimit);
    }

    #[test]
    fn test_tactic_config_constructors() {
        let passive = TacticConfig::passive_limit(PassiveLimitConfig::default());
        assert_eq!(passive.tactic, TacticType::PassiveLimit);
        assert!(passive.passive_limit.is_some());

        let twap = TacticConfig::twap(TwapConfig::default());
        assert_eq!(twap.tactic, TacticType::Twap);
        assert!(twap.twap.is_some());

        let vwap = TacticConfig::vwap(VwapConfig::default());
        assert_eq!(vwap.tactic, TacticType::Vwap);
        assert!(vwap.vwap.is_some());
    }
}
