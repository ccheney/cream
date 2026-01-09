//! Order fill simulation engine.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::config::{BacktestConfig, PartialFillConfig};
use super::slippage::apply_slippage;
use crate::models::{OrderSide, OrderType};

/// OHLCV candle data for simulation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candle {
    /// Candle open price.
    pub open: Decimal,
    /// Candle high price.
    pub high: Decimal,
    /// Candle low price.
    pub low: Decimal,
    /// Candle close price.
    pub close: Decimal,
    /// Candle volume.
    pub volume: Decimal,
    /// Timestamp (ISO 8601).
    pub timestamp: String,
}

impl Candle {
    /// Create a new candle.
    #[must_use]
    pub const fn new(
        open: Decimal,
        high: Decimal,
        low: Decimal,
        close: Decimal,
        volume: Decimal,
    ) -> Self {
        Self {
            open,
            high,
            low,
            close,
            volume,
            timestamp: String::new(),
        }
    }

    /// Check if a price level was touched during this candle.
    #[must_use]
    pub fn price_touched(&self, price: Decimal) -> bool {
        price >= self.low && price <= self.high
    }

    /// Check if price went below a level during this candle.
    #[must_use]
    pub fn price_went_below(&self, price: Decimal) -> bool {
        self.low <= price
    }

    /// Check if price went above a level during this candle.
    #[must_use]
    pub fn price_went_above(&self, price: Decimal) -> bool {
        self.high >= price
    }
}

/// Result of order fill simulation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FillResult {
    /// Whether the order was filled.
    pub filled: bool,
    /// Fill price (if filled).
    pub price: Option<Decimal>,
    /// Filled quantity.
    pub filled_quantity: Decimal,
    /// Remaining quantity (for partial fills).
    pub remaining_quantity: Decimal,
    /// Whether this was a partial fill.
    pub is_partial: bool,
    /// Fill reason/notes.
    pub reason: String,
}

impl FillResult {
    /// Create a "no fill" result.
    #[must_use]
    pub fn no_fill(quantity: Decimal, reason: &str) -> Self {
        Self {
            filled: false,
            price: None,
            filled_quantity: Decimal::ZERO,
            remaining_quantity: quantity,
            is_partial: false,
            reason: reason.to_string(),
        }
    }

    /// Create a full fill result.
    #[must_use]
    pub fn full_fill(price: Decimal, quantity: Decimal, reason: &str) -> Self {
        Self {
            filled: true,
            price: Some(price),
            filled_quantity: quantity,
            remaining_quantity: Decimal::ZERO,
            is_partial: false,
            reason: reason.to_string(),
        }
    }

    /// Create a partial fill result.
    #[must_use]
    pub fn partial_fill(
        price: Decimal,
        filled_quantity: Decimal,
        remaining_quantity: Decimal,
        reason: &str,
    ) -> Self {
        Self {
            filled: true,
            price: Some(price),
            filled_quantity,
            remaining_quantity,
            is_partial: true,
            reason: reason.to_string(),
        }
    }
}

/// Simulate a market order fill.
///
/// Market orders fill at the candle open with slippage applied.
#[must_use]
pub fn simulate_market_order(
    side: OrderSide,
    quantity: Decimal,
    candle: &Candle,
    config: &BacktestConfig,
    is_entry: bool,
    avg_volume: Option<Decimal>,
) -> FillResult {
    // Apply slippage to candle open
    let base_price = candle.open;
    let fill_price = apply_slippage(
        base_price,
        side,
        &config.fill_model.slippage,
        is_entry,
        None,
        None,
        Some(quantity),
        avg_volume,
    );

    // Check for partial fills
    if let Some(fill) = try_partial_fill(
        fill_price,
        quantity,
        candle,
        &config.fill_model.partial_fills,
    ) {
        return fill;
    }

    FillResult::full_fill(
        fill_price,
        quantity,
        "Market order filled at open with slippage",
    )
}

/// Simulate a limit order fill.
///
/// Limit orders fill at the limit price if the candle touches that level.
/// Optionally requires price to penetrate beyond the limit for verification.
#[must_use]
pub fn simulate_limit_order(
    side: OrderSide,
    quantity: Decimal,
    limit_price: Decimal,
    candle: &Candle,
    config: &BacktestConfig,
    _is_entry: bool,
) -> FillResult {
    let tick_size = config.fill_model.limit_orders.tick_size;
    let verify_ticks = config.fill_model.limit_orders.verify_ticks;
    let verification_offset = tick_size * Decimal::from(verify_ticks);

    match side {
        OrderSide::Buy => {
            // Fill if price touches or goes below limit
            // With verification: require price to go verify_ticks beyond limit
            let trigger_level = limit_price - verification_offset;

            if candle.low <= trigger_level {
                // Check for partial fills
                if let Some(fill) = try_partial_fill(
                    limit_price,
                    quantity,
                    candle,
                    &config.fill_model.partial_fills,
                ) {
                    return fill;
                }

                FillResult::full_fill(limit_price, quantity, "Limit buy filled at limit price")
            } else {
                FillResult::no_fill(quantity, "Price did not reach limit level")
            }
        }
        OrderSide::Sell => {
            // Fill if price touches or goes above limit
            let trigger_level = limit_price + verification_offset;

            if candle.high >= trigger_level {
                if let Some(fill) = try_partial_fill(
                    limit_price,
                    quantity,
                    candle,
                    &config.fill_model.partial_fills,
                ) {
                    return fill;
                }

                FillResult::full_fill(limit_price, quantity, "Limit sell filled at limit price")
            } else {
                FillResult::no_fill(quantity, "Price did not reach limit level")
            }
        }
    }
}

/// Simulate a stop order fill.
///
/// Stop orders become market orders when the stop price is reached.
#[must_use]
pub fn simulate_stop_order(
    side: OrderSide,
    quantity: Decimal,
    stop_price: Decimal,
    candle: &Candle,
    config: &BacktestConfig,
    is_entry: bool,
    avg_volume: Option<Decimal>,
) -> FillResult {
    let triggered = match side {
        // Buy stop: triggers when price rises above stop
        OrderSide::Buy => candle.high >= stop_price,
        // Sell stop: triggers when price falls below stop
        OrderSide::Sell => candle.low <= stop_price,
    };

    if triggered {
        // Stop triggered - execute as market order with slippage
        let base_price = stop_price;
        let fill_price = apply_slippage(
            base_price,
            side,
            &config.fill_model.slippage,
            is_entry,
            None,
            None,
            Some(quantity),
            avg_volume,
        );

        if let Some(fill) = try_partial_fill(
            fill_price,
            quantity,
            candle,
            &config.fill_model.partial_fills,
        ) {
            return fill;
        }

        FillResult::full_fill(fill_price, quantity, "Stop order triggered and filled")
    } else {
        FillResult::no_fill(quantity, "Stop price not reached")
    }
}

/// Simulate a stop-limit order fill.
///
/// Stop-limit becomes a limit order when stop is reached.
#[must_use]
pub fn simulate_stop_limit_order(
    side: OrderSide,
    quantity: Decimal,
    stop_price: Decimal,
    limit_price: Decimal,
    candle: &Candle,
    config: &BacktestConfig,
    is_entry: bool,
) -> FillResult {
    let triggered = match side {
        OrderSide::Buy => candle.high >= stop_price,
        OrderSide::Sell => candle.low <= stop_price,
    };

    if triggered {
        // Stop triggered - try to fill as limit order
        simulate_limit_order(side, quantity, limit_price, candle, config, is_entry)
    } else {
        FillResult::no_fill(quantity, "Stop price not reached")
    }
}

/// Simulate any order type.
#[allow(clippy::too_many_arguments)]
#[must_use]
pub fn simulate_order(
    order_type: OrderType,
    side: OrderSide,
    quantity: Decimal,
    limit_price: Option<Decimal>,
    stop_price: Option<Decimal>,
    candle: &Candle,
    config: &BacktestConfig,
    is_entry: bool,
    avg_volume: Option<Decimal>,
) -> FillResult {
    match order_type {
        OrderType::Market => {
            simulate_market_order(side, quantity, candle, config, is_entry, avg_volume)
        }
        OrderType::Limit => {
            let limit = limit_price.unwrap_or(candle.close);
            simulate_limit_order(side, quantity, limit, candle, config, is_entry)
        }
        OrderType::Stop => {
            let stop = stop_price.unwrap_or(candle.close);
            simulate_stop_order(side, quantity, stop, candle, config, is_entry, avg_volume)
        }
        OrderType::StopLimit => {
            let stop = stop_price.unwrap_or(candle.close);
            let limit = limit_price.unwrap_or(stop);
            simulate_stop_limit_order(side, quantity, stop, limit, candle, config, is_entry)
        }
    }
}

/// Try to apply partial fill logic.
///
/// Returns Some(FillResult) if a partial fill occurred, None if full fill should proceed.
fn try_partial_fill(
    price: Decimal,
    quantity: Decimal,
    candle: &Candle,
    config: &PartialFillConfig,
) -> Option<FillResult> {
    if !config.enabled {
        return None;
    }

    // Check liquidity-based partial fills first
    if config.liquidity_based_enabled {
        let max_fillable = candle.volume * config.max_order_fraction_of_volume;
        if quantity > max_fillable && max_fillable > Decimal::ZERO {
            let remaining = quantity - max_fillable;
            return Some(FillResult::partial_fill(
                price,
                max_fillable,
                remaining,
                "Liquidity-based partial fill",
            ));
        }
    }

    // Probabilistic partial fills
    // Use a simple deterministic check based on candle data hash
    // In production, this would use a proper RNG
    let hash_value = compute_deterministic_hash(candle);
    let probability_threshold = config.probability.to_string().parse::<f64>().unwrap_or(0.0);

    if hash_value < probability_threshold {
        // Calculate fill fraction
        let min_frac = config
            .min_fill_fraction
            .to_string()
            .parse::<f64>()
            .unwrap_or(0.3);
        let max_frac = config
            .max_fill_fraction
            .to_string()
            .parse::<f64>()
            .unwrap_or(0.9);
        let fill_frac = hash_value.mul_add(max_frac - min_frac, min_frac);

        let fill_frac_decimal = Decimal::try_from(fill_frac).unwrap_or(config.min_fill_fraction);
        let filled_qty = quantity * fill_frac_decimal;
        let remaining_qty = quantity - filled_qty;

        if filled_qty > Decimal::ZERO {
            return Some(FillResult::partial_fill(
                price,
                filled_qty,
                remaining_qty,
                "Probabilistic partial fill",
            ));
        }
    }

    None
}

/// Compute a deterministic hash value [0, 1) from candle data.
///
/// This is used for reproducible partial fill decisions.
fn compute_deterministic_hash(candle: &Candle) -> f64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    candle.timestamp.hash(&mut hasher);
    candle.open.to_string().hash(&mut hasher);
    candle.volume.to_string().hash(&mut hasher);

    let hash = hasher.finish();
    // Precision loss acceptable: we need a [0, 1) range for probability
    #[allow(clippy::cast_precision_loss)]
    {
        (hash as f64) / (u64::MAX as f64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_candle(open: i64, high: i64, low: i64, close: i64, vol: i64) -> Candle {
        Candle {
            open: Decimal::new(open, 2),
            high: Decimal::new(high, 2),
            low: Decimal::new(low, 2),
            close: Decimal::new(close, 2),
            volume: Decimal::new(vol, 0),
            timestamp: "2026-01-05T10:00:00Z".to_string(),
        }
    }

    fn default_config() -> BacktestConfig {
        BacktestConfig::default()
    }

    #[test]
    fn test_market_order_buy() {
        let config = default_config();
        let candle = make_candle(10000, 10100, 9900, 10050, 100_000);

        let result = simulate_market_order(
            OrderSide::Buy,
            Decimal::new(100, 0),
            &candle,
            &config,
            true,
            None,
        );

        assert!(result.filled);
        assert!(result.price.is_some());
        // Buy should have slippage applied (price > candle.open)
        let Some(fill_price) = result.price else {
            panic!("filled order should have price");
        };
        assert!(fill_price >= candle.open);
    }

    #[test]
    fn test_market_order_sell() {
        let config = default_config();
        let candle = make_candle(10000, 10100, 9900, 10050, 100_000);

        let result = simulate_market_order(
            OrderSide::Sell,
            Decimal::new(100, 0),
            &candle,
            &config,
            false,
            None,
        );

        assert!(result.filled);
        // Sell should have slippage applied (price < candle.open)
        let Some(fill_price) = result.price else {
            panic!("filled order should have price");
        };
        assert!(fill_price <= candle.open);
    }

    #[test]
    fn test_limit_order_buy_fill() {
        let config = default_config();
        let candle = make_candle(10000, 10100, 9800, 10050, 100_000);

        // Limit buy at $99.00 should fill (low = $98.00)
        let result = simulate_limit_order(
            OrderSide::Buy,
            Decimal::new(100, 0),
            Decimal::new(9900, 2),
            &candle,
            &config,
            true,
        );

        assert!(result.filled);
        assert_eq!(result.price, Some(Decimal::new(9900, 2)));
    }

    #[test]
    fn test_limit_order_buy_no_fill() {
        let config = default_config();
        let candle = make_candle(10000, 10100, 9900, 10050, 100_000);

        // Limit buy at $98.00 should NOT fill (low = $99.00)
        let result = simulate_limit_order(
            OrderSide::Buy,
            Decimal::new(100, 0),
            Decimal::new(9800, 2),
            &candle,
            &config,
            true,
        );

        assert!(!result.filled);
    }

    #[test]
    fn test_limit_order_sell_fill() {
        let config = default_config();
        let candle = make_candle(10000, 10200, 9900, 10050, 100_000);

        // Limit sell at $101.00 should fill (high = $102.00)
        let result = simulate_limit_order(
            OrderSide::Sell,
            Decimal::new(100, 0),
            Decimal::new(10100, 2),
            &candle,
            &config,
            false,
        );

        assert!(result.filled);
        assert_eq!(result.price, Some(Decimal::new(10100, 2)));
    }

    #[test]
    fn test_limit_order_with_tick_verification() {
        let mut config = default_config();
        config.fill_model.limit_orders.verify_ticks = 2;
        config.fill_model.limit_orders.tick_size = Decimal::new(1, 2); // $0.01

        // Candle with low that goes 2 ticks below the limit price
        // Limit buy at $99.00 needs price to go to $98.98 (2 ticks below) for fill
        let candle = make_candle(10000, 10100, 9897, 10050, 100_000); // Low = $98.97 (below $98.98)

        let result = simulate_limit_order(
            OrderSide::Buy,
            Decimal::new(100, 0),
            Decimal::new(9900, 2), // Limit at $99.00
            &candle,
            &config,
            true,
        );

        assert!(result.filled);
        assert_eq!(result.price, Some(Decimal::new(9900, 2))); // Fills at limit price

        // Test that fill does NOT occur without sufficient penetration
        let candle_no_fill = make_candle(10000, 10100, 9899, 10050, 100_000); // Low = $98.99 (not below $98.98)

        let result_no_fill = simulate_limit_order(
            OrderSide::Buy,
            Decimal::new(100, 0),
            Decimal::new(9900, 2),
            &candle_no_fill,
            &config,
            true,
        );

        assert!(!result_no_fill.filled);
    }

    #[test]
    fn test_stop_order_sell_trigger() {
        let config = default_config();
        let candle = make_candle(10000, 10100, 9800, 9900, 100_000);

        // Stop sell at $99.00 should trigger (low = $98.00)
        let result = simulate_stop_order(
            OrderSide::Sell,
            Decimal::new(100, 0),
            Decimal::new(9900, 2),
            &candle,
            &config,
            false,
            None,
        );

        assert!(result.filled);
        // Price should have slippage applied
        let Some(fill_price) = result.price else {
            panic!("filled order should have price");
        };
        assert!(fill_price < Decimal::new(9900, 2));
    }

    #[test]
    fn test_stop_order_buy_trigger() {
        let config = default_config();
        let candle = make_candle(10000, 10200, 9900, 10100, 100_000);

        // Stop buy at $101.00 should trigger (high = $102.00)
        let result = simulate_stop_order(
            OrderSide::Buy,
            Decimal::new(100, 0),
            Decimal::new(10100, 2),
            &candle,
            &config,
            true,
            None,
        );

        assert!(result.filled);
        let Some(fill_price) = result.price else {
            panic!("filled order should have price");
        };
        assert!(fill_price > Decimal::new(10100, 2));
    }

    #[test]
    fn test_stop_order_no_trigger() {
        let config = default_config();
        let candle = make_candle(10000, 10100, 9900, 10050, 100_000);

        // Stop sell at $98.00 should NOT trigger (low = $99.00)
        let result = simulate_stop_order(
            OrderSide::Sell,
            Decimal::new(100, 0),
            Decimal::new(9800, 2),
            &candle,
            &config,
            false,
            None,
        );

        assert!(!result.filled);
    }

    #[test]
    fn test_stop_limit_order() {
        let config = default_config();
        let candle = make_candle(10000, 10100, 9800, 9900, 100_000);

        // Stop at $99.00, limit at $98.50
        // Stop triggers (low = $98.00), then fills at limit
        let result = simulate_stop_limit_order(
            OrderSide::Sell,
            Decimal::new(100, 0),
            Decimal::new(9900, 2),
            Decimal::new(9850, 2),
            &candle,
            &config,
            false,
        );

        assert!(result.filled);
        assert_eq!(result.price, Some(Decimal::new(9850, 2)));
    }

    #[test]
    fn test_candle_price_touched() {
        let candle = make_candle(10000, 10200, 9800, 10100, 100_000);

        assert!(candle.price_touched(Decimal::new(9900, 2)));
        assert!(candle.price_touched(Decimal::new(10100, 2)));
        assert!(!candle.price_touched(Decimal::new(9700, 2)));
        assert!(!candle.price_touched(Decimal::new(10300, 2)));
    }

    #[test]
    fn test_partial_fill_disabled() {
        let config = default_config();
        let candle = make_candle(10000, 10100, 9900, 10050, 100_000);

        let result = simulate_market_order(
            OrderSide::Buy,
            Decimal::new(100, 0),
            &candle,
            &config,
            true,
            None,
        );

        assert!(result.filled);
        assert!(!result.is_partial);
        assert_eq!(result.filled_quantity, Decimal::new(100, 0));
    }

    #[test]
    fn test_liquidity_based_partial_fill() {
        let mut config = default_config();
        config.fill_model.partial_fills.enabled = true;
        config.fill_model.partial_fills.liquidity_based_enabled = true;
        config.fill_model.partial_fills.max_order_fraction_of_volume = Decimal::new(5, 2); // 5%

        // Volume = 1000, max fill = 50
        let candle = make_candle(10000, 10100, 9900, 10050, 1000);

        // Try to buy 100 shares (exceeds 5% of 1000 volume)
        let result = simulate_market_order(
            OrderSide::Buy,
            Decimal::new(100, 0),
            &candle,
            &config,
            true,
            None,
        );

        assert!(result.filled);
        assert!(result.is_partial);
        assert_eq!(result.filled_quantity, Decimal::new(50, 0));
        assert_eq!(result.remaining_quantity, Decimal::new(50, 0));
    }
}
