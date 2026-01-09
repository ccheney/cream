//! Stop/target trigger detection for backtest simulation.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::config::{SameBarPriority, StopTargetConfig, StopTargetFillModel};
use super::fill_engine::Candle;
use super::slippage::apply_stop_target_slippage;
use crate::models::OrderSide;

/// Position direction for stop/target evaluation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum PositionDirection {
    /// Long position.
    Long,
    /// Short position.
    Short,
}

/// Result of stop/target trigger evaluation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TriggerResult {
    /// No trigger occurred.
    None,
    /// Stop was triggered.
    Stop {
        /// Fill price.
        price: Decimal,
        /// Side of the resulting order.
        side: OrderSide,
    },
    /// Target was triggered.
    Target {
        /// Fill price.
        price: Decimal,
        /// Side of the resulting order.
        side: OrderSide,
    },
    /// Both were triggered (uses priority rule).
    BothTriggered {
        /// Which trigger was selected based on priority.
        selected: TriggerType,
        /// Fill price.
        price: Decimal,
        /// Side of the resulting order.
        side: OrderSide,
    },
}

/// Type of trigger for "both triggered" scenario.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TriggerType {
    /// Stop was selected.
    Stop,
    /// Target was selected.
    Target,
}

impl TriggerResult {
    /// Check if any trigger occurred.
    #[must_use]
    pub const fn is_triggered(&self) -> bool {
        !matches!(self, Self::None)
    }

    /// Get the fill price if triggered.
    #[must_use]
    pub const fn fill_price(&self) -> Option<Decimal> {
        match self {
            Self::None => None,
            Self::Stop { price, .. }
            | Self::Target { price, .. }
            | Self::BothTriggered { price, .. } => Some(*price),
        }
    }

    /// Get the order side if triggered.
    #[must_use]
    pub const fn fill_side(&self) -> Option<OrderSide> {
        match self {
            Self::None => None,
            Self::Stop { side, .. }
            | Self::Target { side, .. }
            | Self::BothTriggered { side, .. } => Some(*side),
        }
    }
}

/// Check if a stop level is triggered.
///
/// Long positions: stop triggers when price falls to stop level (low <= stop).
/// Short positions: stop triggers when price rises to stop level (high >= stop).
#[must_use]
pub fn is_stop_triggered(
    direction: PositionDirection,
    stop_level: Decimal,
    candle: &Candle,
) -> bool {
    match direction {
        PositionDirection::Long => candle.low <= stop_level,
        PositionDirection::Short => candle.high >= stop_level,
    }
}

/// Check if a target level is triggered.
///
/// Long positions: target triggers when price rises to target level (high >= target).
/// Short positions: target triggers when price falls to target level (low <= target).
#[must_use]
pub fn is_target_triggered(
    direction: PositionDirection,
    target_level: Decimal,
    candle: &Candle,
) -> bool {
    match direction {
        PositionDirection::Long => candle.high >= target_level,
        PositionDirection::Short => candle.low <= target_level,
    }
}

/// Evaluate stop and target triggers for a position.
///
/// Handles the case where both stop and target are triggered in the same candle
/// using the configured priority rule.
#[must_use]
pub fn evaluate_triggers(
    direction: PositionDirection,
    stop_level: Option<Decimal>,
    target_level: Option<Decimal>,
    candle: &Candle,
    config: &StopTargetConfig,
) -> TriggerResult {
    let stop_triggered =
        stop_level.is_some_and(|level| is_stop_triggered(direction, level, candle));

    let target_triggered =
        target_level.is_some_and(|level| is_target_triggered(direction, level, candle));

    // Determine exit side based on position direction
    let exit_side = match direction {
        PositionDirection::Long => OrderSide::Sell,
        PositionDirection::Short => OrderSide::Buy,
    };

    // Match on the actual Option values to avoid expect()
    match (stop_triggered, target_triggered, stop_level, target_level) {
        (true, false, Some(level), _) => {
            let price = calculate_fill_price(level, exit_side, true, config);
            TriggerResult::Stop {
                price,
                side: exit_side,
            }
        }

        (false, true, _, Some(level)) => {
            let price = calculate_fill_price(level, exit_side, false, config);
            TriggerResult::Target {
                price,
                side: exit_side,
            }
        }

        (true, true, Some(stop), Some(target)) => {
            // Both triggered - use priority rule
            let (selected, level) = resolve_same_bar_conflict(
                direction,
                stop,
                target,
                candle,
                config.same_bar_priority,
            );

            let is_stop = selected == TriggerType::Stop;
            let price = calculate_fill_price(level, exit_side, is_stop, config);

            TriggerResult::BothTriggered {
                selected,
                price,
                side: exit_side,
            }
        }

        // No trigger or unreachable cases (e.g., stop_triggered but no stop_level)
        _ => TriggerResult::None,
    }
}

/// Resolve conflict when both stop and target trigger on the same bar.
fn resolve_same_bar_conflict(
    _direction: PositionDirection,
    stop_level: Decimal,
    target_level: Decimal,
    candle: &Candle,
    priority: SameBarPriority,
) -> (TriggerType, Decimal) {
    match priority {
        SameBarPriority::StopFirst => (TriggerType::Stop, stop_level),

        SameBarPriority::TargetFirst => (TriggerType::Target, target_level),

        SameBarPriority::WorstCase => {
            // For long: stop is worse (lower price)
            // For short: stop is also worse (higher price we have to buy at)
            (TriggerType::Stop, stop_level)
        }

        SameBarPriority::Random => {
            // Deterministic "random" based on candle data
            use std::collections::hash_map::DefaultHasher;
            use std::hash::{Hash, Hasher};

            let mut hasher = DefaultHasher::new();
            candle.timestamp.hash(&mut hasher);
            stop_level.to_string().hash(&mut hasher);
            target_level.to_string().hash(&mut hasher);

            let hash = hasher.finish();
            if hash.is_multiple_of(2) {
                (TriggerType::Stop, stop_level)
            } else {
                (TriggerType::Target, target_level)
            }
        }
    }
}

/// Calculate fill price for a stop or target trigger.
fn calculate_fill_price(
    level: Decimal,
    side: OrderSide,
    is_stop: bool,
    config: &StopTargetConfig,
) -> Decimal {
    match config.fill_model {
        StopTargetFillModel::Level => level,
        StopTargetFillModel::Slipped => {
            apply_stop_target_slippage(level, side, is_stop, &config.slipped)
        }
    }
}

/// Evaluate stop trigger and return fill price if triggered.
#[must_use]
pub fn evaluate_stop(
    direction: PositionDirection,
    stop_level: Decimal,
    candle: &Candle,
    config: &StopTargetConfig,
) -> Option<Decimal> {
    let exit_side = match direction {
        PositionDirection::Long => OrderSide::Sell,
        PositionDirection::Short => OrderSide::Buy,
    };

    if is_stop_triggered(direction, stop_level, candle) {
        Some(calculate_fill_price(stop_level, exit_side, true, config))
    } else {
        None
    }
}

/// Evaluate target trigger and return fill price if triggered.
#[must_use]
pub fn evaluate_target(
    direction: PositionDirection,
    target_level: Decimal,
    candle: &Candle,
    config: &StopTargetConfig,
) -> Option<Decimal> {
    let exit_side = match direction {
        PositionDirection::Long => OrderSide::Sell,
        PositionDirection::Short => OrderSide::Buy,
    };

    if is_target_triggered(direction, target_level, candle) {
        Some(calculate_fill_price(target_level, exit_side, false, config))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::super::config::*;
    use super::*;

    fn make_candle(open: i64, high: i64, low: i64, close: i64) -> Candle {
        Candle {
            open: Decimal::new(open, 2),
            high: Decimal::new(high, 2),
            low: Decimal::new(low, 2),
            close: Decimal::new(close, 2),
            volume: Decimal::new(100_000, 0),
            timestamp: "2026-01-05T10:00:00Z".to_string(),
        }
    }

    fn default_config() -> StopTargetConfig {
        StopTargetConfig::default()
    }

    #[test]
    fn test_long_stop_triggered() {
        // Long position, stop at $95, candle low = $94
        let candle = make_candle(10000, 10100, 9400, 9500);

        assert!(is_stop_triggered(
            PositionDirection::Long,
            Decimal::new(9500, 2),
            &candle
        ));
    }

    #[test]
    fn test_long_stop_not_triggered() {
        // Long position, stop at $93, candle low = $94
        let candle = make_candle(10000, 10100, 9400, 9500);

        assert!(!is_stop_triggered(
            PositionDirection::Long,
            Decimal::new(9300, 2),
            &candle
        ));
    }

    #[test]
    fn test_short_stop_triggered() {
        // Short position, stop at $105, candle high = $106
        let candle = make_candle(10000, 10600, 9900, 10500);

        assert!(is_stop_triggered(
            PositionDirection::Short,
            Decimal::new(10500, 2),
            &candle
        ));
    }

    #[test]
    fn test_long_target_triggered() {
        // Long position, target at $105, candle high = $106
        let candle = make_candle(10000, 10600, 9900, 10500);

        assert!(is_target_triggered(
            PositionDirection::Long,
            Decimal::new(10500, 2),
            &candle
        ));
    }

    #[test]
    fn test_short_target_triggered() {
        // Short position, target at $95, candle low = $94
        let candle = make_candle(10000, 10100, 9400, 9500);

        assert!(is_target_triggered(
            PositionDirection::Short,
            Decimal::new(9500, 2),
            &candle
        ));
    }

    #[test]
    fn test_evaluate_triggers_none() {
        let candle = make_candle(10000, 10100, 9900, 10050);
        let config = default_config();

        let result = evaluate_triggers(
            PositionDirection::Long,
            Some(Decimal::new(9800, 2)),  // Stop at $98
            Some(Decimal::new(10200, 2)), // Target at $102
            &candle,
            &config,
        );

        assert!(!result.is_triggered());
    }

    #[test]
    fn test_evaluate_triggers_stop_only() {
        let candle = make_candle(10000, 10100, 9700, 9800);
        let config = default_config();

        let result = evaluate_triggers(
            PositionDirection::Long,
            Some(Decimal::new(9800, 2)), // Stop at $98 (triggers - low = $97)
            Some(Decimal::new(10200, 2)), // Target at $102 (not triggered)
            &candle,
            &config,
        );

        assert!(matches!(result, TriggerResult::Stop { .. }));
        assert_eq!(result.fill_price(), Some(Decimal::new(9800, 2)));
    }

    #[test]
    fn test_evaluate_triggers_target_only() {
        let candle = make_candle(10000, 10300, 9900, 10200);
        let config = default_config();

        let result = evaluate_triggers(
            PositionDirection::Long,
            Some(Decimal::new(9800, 2)), // Stop at $98 (not triggered - low = $99)
            Some(Decimal::new(10200, 2)), // Target at $102 (triggers - high = $103)
            &candle,
            &config,
        );

        assert!(matches!(result, TriggerResult::Target { .. }));
        assert_eq!(result.fill_price(), Some(Decimal::new(10200, 2)));
    }

    #[test]
    fn test_evaluate_triggers_both_stop_first() {
        // Candle that crosses both stop and target
        let candle = make_candle(10000, 10300, 9700, 10100);
        let config = StopTargetConfig {
            same_bar_priority: SameBarPriority::StopFirst,
            ..default_config()
        };

        let result = evaluate_triggers(
            PositionDirection::Long,
            Some(Decimal::new(9800, 2)),  // Stop at $98 (triggers)
            Some(Decimal::new(10200, 2)), // Target at $102 (triggers)
            &candle,
            &config,
        );

        match result {
            TriggerResult::BothTriggered {
                selected, price, ..
            } => {
                assert_eq!(selected, TriggerType::Stop);
                assert_eq!(price, Decimal::new(9800, 2));
            }
            _ => panic!("Expected BothTriggered"),
        }
    }

    #[test]
    fn test_evaluate_triggers_both_target_first() {
        let candle = make_candle(10000, 10300, 9700, 10100);
        let config = StopTargetConfig {
            same_bar_priority: SameBarPriority::TargetFirst,
            ..default_config()
        };

        let result = evaluate_triggers(
            PositionDirection::Long,
            Some(Decimal::new(9800, 2)),
            Some(Decimal::new(10200, 2)),
            &candle,
            &config,
        );

        match result {
            TriggerResult::BothTriggered {
                selected, price, ..
            } => {
                assert_eq!(selected, TriggerType::Target);
                assert_eq!(price, Decimal::new(10200, 2));
            }
            _ => panic!("Expected BothTriggered"),
        }
    }

    #[test]
    fn test_slipped_fill_price() {
        let config = StopTargetConfig {
            fill_model: StopTargetFillModel::Slipped,
            slipped: SlippedStopTargetConfig {
                stop_slippage_bps: Decimal::new(20, 0), // 20 bps
                target_slippage_bps: Decimal::new(5, 0),
            },
            ..default_config()
        };

        let candle = make_candle(10000, 10100, 9700, 9800);

        let result = evaluate_triggers(
            PositionDirection::Long,
            Some(Decimal::new(9800, 2)),
            None,
            &candle,
            &config,
        );

        // Stop price should be slipped down (worse for the seller)
        let Some(fill_price) = result.fill_price() else {
            panic!("stop trigger should have fill price");
        };
        assert!(fill_price < Decimal::new(9800, 2));
    }

    #[test]
    fn test_short_position_triggers() {
        let candle = make_candle(10000, 10100, 9700, 9800);
        let config = default_config();

        // Short position: stop at $101 (triggers when high >= 101)
        // Target at $98 (triggers when low <= 98)
        let result = evaluate_triggers(
            PositionDirection::Short,
            Some(Decimal::new(10100, 2)),
            Some(Decimal::new(9800, 2)),
            &candle,
            &config,
        );

        // Both should trigger
        assert!(matches!(result, TriggerResult::BothTriggered { .. }));
    }

    #[test]
    fn test_trigger_result_methods() {
        let result = TriggerResult::Stop {
            price: Decimal::new(9500, 2),
            side: OrderSide::Sell,
        };

        assert!(result.is_triggered());
        assert_eq!(result.fill_price(), Some(Decimal::new(9500, 2)));
        assert_eq!(result.fill_side(), Some(OrderSide::Sell));

        let none_result = TriggerResult::None;
        assert!(!none_result.is_triggered());
        assert!(none_result.fill_price().is_none());
    }
}
