//! Slippage models for backtest fill simulation.

use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;

use super::config::{SlippageConfig, SlippageModel};
use crate::models::OrderSide;

/// Basis points divisor (1 bp = 0.0001).
const BPS_DIVISOR: Decimal = Decimal::from_parts(10000, 0, 0, false, 0);

/// Apply slippage to a price based on the configured model.
///
/// # Arguments
/// * `price` - Base price (typically candle open for market orders)
/// * `side` - Order side (buy or sell)
/// * `config` - Slippage configuration
/// * `is_entry` - Whether this is an entry or exit order
/// * `bid` - Bid price (required for spread-based model)
/// * `ask` - Ask price (required for spread-based model)
/// * `order_size` - Order size (required for volume impact model)
/// * `avg_volume` - Average volume (required for volume impact model)
#[allow(clippy::too_many_arguments)]
#[must_use]
pub fn apply_slippage(
    price: Decimal,
    side: OrderSide,
    config: &SlippageConfig,
    is_entry: bool,
    bid: Option<Decimal>,
    ask: Option<Decimal>,
    order_size: Option<Decimal>,
    avg_volume: Option<Decimal>,
) -> Decimal {
    match config.model {
        SlippageModel::FixedBps => {
            apply_fixed_bps_slippage(price, side, &config.fixed_bps, is_entry)
        }
        SlippageModel::SpreadBased => {
            let bid = bid.unwrap_or(price);
            let ask = ask.unwrap_or(price);
            apply_spread_based_slippage(price, side, &config.spread_based, bid, ask)
        }
        SlippageModel::VolumeImpact => {
            let order_size = order_size.unwrap_or(Decimal::ONE);
            let avg_volume = avg_volume.unwrap_or(Decimal::from(1_000_000));
            apply_volume_impact_slippage(price, side, &config.volume_impact, order_size, avg_volume)
        }
    }
}

/// Apply fixed basis points slippage.
///
/// For buys: pay more (worse fill)
/// For sells: receive less (worse fill)
fn apply_fixed_bps_slippage(
    price: Decimal,
    side: OrderSide,
    config: &super::config::FixedBpsConfig,
    is_entry: bool,
) -> Decimal {
    let bps = if is_entry {
        config.entry_bps
    } else {
        config.exit_bps
    };

    let multiplier = bps / BPS_DIVISOR;

    match side {
        OrderSide::Buy => price * (Decimal::ONE + multiplier),
        OrderSide::Sell => price * (Decimal::ONE - multiplier),
    }
}

/// Apply spread-based slippage.
///
/// For buys: fill between mid and ask
/// For sells: fill between bid and mid
fn apply_spread_based_slippage(
    _price: Decimal,
    side: OrderSide,
    config: &super::config::SpreadBasedConfig,
    bid: Decimal,
    ask: Decimal,
) -> Decimal {
    let mid = (bid + ask) / Decimal::TWO;

    match side {
        // For buys: fill at mid + fraction * (ask - mid)
        OrderSide::Buy => mid + config.spread_fraction * (ask - mid),
        // For sells: fill at mid - fraction * (mid - bid)
        OrderSide::Sell => mid - config.spread_fraction * (mid - bid),
    }
}

/// Apply volume impact slippage using the square-root law.
///
/// Market impact increases non-linearly with order size:
/// impact = `coefficient` * (`order_size` / `avg_volume`)^`exponent`
fn apply_volume_impact_slippage(
    price: Decimal,
    side: OrderSide,
    config: &super::config::VolumeImpactConfig,
    order_size: Decimal,
    avg_volume: Decimal,
) -> Decimal {
    if avg_volume <= Decimal::ZERO {
        return price;
    }

    let volume_ratio = order_size / avg_volume;

    // Calculate impact using power function
    // Since Decimal doesn't have pow, convert to f64
    let ratio_f64 = volume_ratio.to_f64().unwrap_or(0.0);
    let exponent_f64 = config.volume_exponent.to_f64().unwrap_or(0.5);
    let impact_raw = ratio_f64.powf(exponent_f64);

    let coefficient_f64 = config.impact_coefficient.to_f64().unwrap_or(0.1);
    let impact = coefficient_f64 * impact_raw;

    let impact_decimal = Decimal::try_from(impact).unwrap_or(Decimal::ZERO);

    match side {
        // For buys: price moves up
        OrderSide::Buy => price * (Decimal::ONE + impact_decimal),
        // For sells: price moves down
        OrderSide::Sell => price * (Decimal::ONE - impact_decimal),
    }
}

/// Apply slippage to a stop or target fill.
///
/// Stops typically have more slippage than targets due to urgency
/// and potential for market impact when many stops trigger.
#[must_use]
pub fn apply_stop_target_slippage(
    level: Decimal,
    side: OrderSide,
    is_stop: bool,
    slipped_config: &super::config::SlippedStopTargetConfig,
) -> Decimal {
    let bps = if is_stop {
        slipped_config.stop_slippage_bps
    } else {
        slipped_config.target_slippage_bps
    };

    let multiplier = bps / BPS_DIVISOR;

    // For stops: slippage works against us
    // For targets: slippage is typically less severe
    // In both cases, sells slip down and buys slip up
    match side {
        OrderSide::Sell => level * (Decimal::ONE - multiplier),
        OrderSide::Buy => level * (Decimal::ONE + multiplier),
    }
}

#[cfg(test)]
mod tests {
    use super::super::config::*;
    use super::*;

    #[test]
    fn test_fixed_bps_buy_slippage() {
        let price = Decimal::new(10000, 2); // $100.00
        let config = FixedBpsConfig {
            entry_bps: Decimal::new(10, 0), // 10 bps = 0.1%
            exit_bps: Decimal::new(10, 0),
        };

        let slipped = apply_fixed_bps_slippage(price, OrderSide::Buy, &config, true);

        // 10 bps = 0.001, so $100 * 1.001 = $100.10
        assert_eq!(slipped, Decimal::new(10010, 2));
    }

    #[test]
    fn test_fixed_bps_sell_slippage() {
        let price = Decimal::new(10000, 2); // $100.00
        let config = FixedBpsConfig {
            entry_bps: Decimal::new(10, 0),
            exit_bps: Decimal::new(10, 0),
        };

        let slipped = apply_fixed_bps_slippage(price, OrderSide::Sell, &config, false);

        // 10 bps = 0.001, so $100 * 0.999 = $99.90
        assert_eq!(slipped, Decimal::new(9990, 2));
    }

    #[test]
    fn test_spread_based_buy_slippage() {
        let bid = Decimal::new(9990, 2); // $99.90
        let ask = Decimal::new(10010, 2); // $100.10
        // Mid = $100.00

        let config = SpreadBasedConfig {
            spread_fraction: Decimal::new(5, 1), // 0.5
        };

        let slipped = apply_spread_based_slippage(Decimal::ZERO, OrderSide::Buy, &config, bid, ask);

        // Buy fills at mid + 0.5 * (ask - mid) = 100 + 0.5 * 0.10 = $100.05
        assert_eq!(slipped, Decimal::new(10005, 2));
    }

    #[test]
    fn test_spread_based_sell_slippage() {
        let bid = Decimal::new(9990, 2); // $99.90
        let ask = Decimal::new(10010, 2); // $100.10
        // Mid = $100.00

        let config = SpreadBasedConfig {
            spread_fraction: Decimal::new(5, 1), // 0.5
        };

        let slipped =
            apply_spread_based_slippage(Decimal::ZERO, OrderSide::Sell, &config, bid, ask);

        // Sell fills at mid - 0.5 * (mid - bid) = 100 - 0.5 * 0.10 = $99.95
        assert_eq!(slipped, Decimal::new(9995, 2));
    }

    #[test]
    fn test_volume_impact_small_order() {
        let price = Decimal::new(10000, 2); // $100.00
        let config = VolumeImpactConfig {
            impact_coefficient: Decimal::new(1, 1), // 0.1
            volume_exponent: Decimal::new(5, 1),    // 0.5
        };

        // Order is 1% of average volume
        let order_size = Decimal::new(100, 0);
        let avg_volume = Decimal::new(10000, 0);

        let slipped =
            apply_volume_impact_slippage(price, OrderSide::Buy, &config, order_size, avg_volume);

        // Impact = 0.1 * (0.01)^0.5 = 0.1 * 0.1 = 0.01 = 1%
        // Price = 100 * 1.01 = $101.00
        assert!(slipped > price);
        assert!(slipped < Decimal::new(10200, 2)); // Less than 2% impact
    }

    #[test]
    fn test_stop_slippage() {
        let level = Decimal::new(9500, 2); // $95.00 stop
        let config = SlippedStopTargetConfig {
            stop_slippage_bps: Decimal::new(20, 0), // 20 bps
            target_slippage_bps: Decimal::new(5, 0),
        };

        // Stop on long position (sell side)
        let slipped = apply_stop_target_slippage(level, OrderSide::Sell, true, &config);

        // 20 bps = 0.2%, so $95 * 0.998 = $94.81
        assert!(slipped < level);
        assert_eq!(slipped, Decimal::new(9481, 2));
    }

    #[test]
    fn test_target_slippage() {
        let level = Decimal::new(10500, 2); // $105.00 target
        let config = SlippedStopTargetConfig {
            stop_slippage_bps: Decimal::new(20, 0),
            target_slippage_bps: Decimal::new(5, 0), // 5 bps
        };

        // Target on long position (sell side)
        let slipped = apply_stop_target_slippage(level, OrderSide::Sell, false, &config);

        // 5 bps = 0.05%, so $105 * 0.9995 = $104.9475
        assert!(slipped < level);
    }
}
