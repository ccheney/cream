//! Backtest stop/target simulation.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::types::{SameBarPriority, StopTargetLevels, StopsConfig};
use crate::models::Direction;

/// A candle (OHLCV bar) for backtest simulation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candle {
    /// Timestamp (ISO 8601).
    pub timestamp: String,
    /// Open price.
    pub open: Decimal,
    /// High price.
    pub high: Decimal,
    /// Low price.
    pub low: Decimal,
    /// Close price.
    pub close: Decimal,
    /// Volume.
    pub volume: Decimal,
}

/// Result of checking if stop or target was triggered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TriggerResult {
    /// No trigger occurred.
    None,
    /// Stop-loss was triggered.
    StopLoss {
        /// Price at which stop was triggered.
        price: Decimal,
        /// Timestamp of trigger.
        timestamp: String,
    },
    /// Take-profit was triggered.
    TakeProfit {
        /// Price at which target was triggered.
        price: Decimal,
        /// Timestamp of trigger.
        timestamp: String,
    },
}

/// Simulator for stop/target triggers in backtest mode.
#[derive(Debug, Clone)]
pub struct BacktestStopsSimulator {
    /// Configuration.
    config: StopsConfig,
}

impl Default for BacktestStopsSimulator {
    fn default() -> Self {
        Self::new()
    }
}

impl BacktestStopsSimulator {
    /// Create a new backtest simulator.
    #[must_use]
    pub fn new() -> Self {
        Self {
            config: StopsConfig::default(),
        }
    }

    /// Create with custom configuration.
    #[must_use]
    pub const fn with_config(config: StopsConfig) -> Self {
        Self { config }
    }

    /// Check if stop or target is triggered by a candle.
    ///
    /// For long positions:
    /// - Stop triggers on candle low
    /// - Target triggers on candle high
    ///
    /// For short positions:
    /// - Stop triggers on candle high
    /// - Target triggers on candle low
    #[must_use]
    pub fn check_trigger(&self, candle: &Candle, levels: &StopTargetLevels) -> TriggerResult {
        let (stop_triggered, target_triggered) = match levels.direction {
            Direction::Long => {
                let stop = candle.low <= levels.stop_loss;
                let target = candle.high >= levels.take_profit;
                (stop, target)
            }
            Direction::Short => {
                let stop = candle.high >= levels.stop_loss;
                let target = candle.low <= levels.take_profit;
                (stop, target)
            }
            Direction::Flat => return TriggerResult::None,
        };

        // Handle both triggered in same bar
        if stop_triggered && target_triggered {
            return self.resolve_same_bar_conflict(candle, levels);
        }

        if stop_triggered {
            let price = match levels.direction {
                Direction::Long | Direction::Short => levels.stop_loss,
                Direction::Flat => return TriggerResult::None,
            };
            return TriggerResult::StopLoss {
                price,
                timestamp: candle.timestamp.clone(),
            };
        }

        if target_triggered {
            let price = match levels.direction {
                Direction::Long | Direction::Short => levels.take_profit,
                Direction::Flat => return TriggerResult::None,
            };
            return TriggerResult::TakeProfit {
                price,
                timestamp: candle.timestamp.clone(),
            };
        }

        TriggerResult::None
    }

    /// Resolve conflict when both stop and target trigger in same bar.
    fn resolve_same_bar_conflict(
        &self,
        candle: &Candle,
        levels: &StopTargetLevels,
    ) -> TriggerResult {
        match self.config.same_bar_priority {
            SameBarPriority::StopFirst => TriggerResult::StopLoss {
                price: levels.stop_loss,
                timestamp: candle.timestamp.clone(),
            },
            SameBarPriority::TargetFirst => TriggerResult::TakeProfit {
                price: levels.take_profit,
                timestamp: candle.timestamp.clone(),
            },
            SameBarPriority::HighLowOrder => {
                // Determine bar direction: up bar (close > open) or down bar
                let is_up_bar = candle.close > candle.open;

                match levels.direction {
                    Direction::Long => {
                        // Long position on up bar: likely hit low first (stop), then high (target)
                        // Long position on down bar: likely hit high first (target), then low (stop)
                        if is_up_bar {
                            TriggerResult::StopLoss {
                                price: levels.stop_loss,
                                timestamp: candle.timestamp.clone(),
                            }
                        } else {
                            TriggerResult::TakeProfit {
                                price: levels.take_profit,
                                timestamp: candle.timestamp.clone(),
                            }
                        }
                    }
                    Direction::Short => {
                        // Short position on up bar: likely hit low first (target), then high (stop)
                        // Short position on down bar: likely hit high first (stop), then low (target)
                        if is_up_bar {
                            TriggerResult::TakeProfit {
                                price: levels.take_profit,
                                timestamp: candle.timestamp.clone(),
                            }
                        } else {
                            TriggerResult::StopLoss {
                                price: levels.stop_loss,
                                timestamp: candle.timestamp.clone(),
                            }
                        }
                    }
                    Direction::Flat => TriggerResult::None,
                }
            }
        }
    }

    /// Simulate stops through a series of candles.
    ///
    /// Returns the first trigger result encountered.
    #[must_use]
    pub fn simulate(&self, candles: &[Candle], levels: &StopTargetLevels) -> TriggerResult {
        for candle in candles {
            let result = self.check_trigger(candle, levels);
            if result != TriggerResult::None {
                return result;
            }
        }
        TriggerResult::None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_levels(direction: Direction) -> StopTargetLevels {
        match direction {
            Direction::Long => StopTargetLevels::new(
                Decimal::new(95, 0),  // stop at $95
                Decimal::new(110, 0), // target at $110
                Decimal::new(100, 0), // entry at $100
                Direction::Long,
            ),
            Direction::Short => StopTargetLevels::new(
                Decimal::new(105, 0), // stop at $105
                Decimal::new(90, 0),  // target at $90
                Decimal::new(100, 0), // entry at $100
                Direction::Short,
            ),
            Direction::Flat => StopTargetLevels::new(
                Decimal::new(95, 0),
                Decimal::new(105, 0),
                Decimal::new(100, 0),
                Direction::Flat,
            ),
        }
    }

    fn make_candle(open: i64, high: i64, low: i64, close: i64) -> Candle {
        Candle {
            timestamp: "2026-01-05T12:00:00Z".to_string(),
            open: Decimal::new(open, 0),
            high: Decimal::new(high, 0),
            low: Decimal::new(low, 0),
            close: Decimal::new(close, 0),
            volume: Decimal::new(1_000_000, 0),
        }
    }

    #[test]
    fn test_backtest_no_trigger() {
        let simulator = BacktestStopsSimulator::new();
        let levels = make_levels(Direction::Long);
        let candle = make_candle(100, 102, 98, 101);

        let result = simulator.check_trigger(&candle, &levels);
        assert_eq!(result, TriggerResult::None);
    }

    #[test]
    fn test_backtest_long_stop_trigger() {
        let simulator = BacktestStopsSimulator::new();
        let levels = make_levels(Direction::Long);
        let candle = make_candle(100, 102, 94, 96); // low hits stop at 95

        let result = simulator.check_trigger(&candle, &levels);
        assert!(matches!(result, TriggerResult::StopLoss { .. }));
    }

    #[test]
    fn test_backtest_long_target_trigger() {
        let simulator = BacktestStopsSimulator::new();
        let levels = make_levels(Direction::Long);
        let candle = make_candle(100, 112, 99, 111); // high hits target at 110

        let result = simulator.check_trigger(&candle, &levels);
        assert!(matches!(result, TriggerResult::TakeProfit { .. }));
    }

    #[test]
    fn test_backtest_short_stop_trigger() {
        let simulator = BacktestStopsSimulator::new();
        let levels = make_levels(Direction::Short);
        let candle = make_candle(100, 106, 98, 103); // high hits stop at 105

        let result = simulator.check_trigger(&candle, &levels);
        assert!(matches!(result, TriggerResult::StopLoss { .. }));
    }

    #[test]
    fn test_backtest_short_target_trigger() {
        let simulator = BacktestStopsSimulator::new();
        let levels = make_levels(Direction::Short);
        let candle = make_candle(100, 101, 88, 89); // low hits target at 90

        let result = simulator.check_trigger(&candle, &levels);
        assert!(matches!(result, TriggerResult::TakeProfit { .. }));
    }

    #[test]
    fn test_backtest_same_bar_stop_first() {
        let config = StopsConfig {
            same_bar_priority: SameBarPriority::StopFirst,
            ..Default::default()
        };
        let simulator = BacktestStopsSimulator::with_config(config);
        let levels = make_levels(Direction::Long);
        // Both stop (95) and target (110) triggered
        let candle = make_candle(100, 115, 90, 105);

        let result = simulator.check_trigger(&candle, &levels);
        assert!(matches!(result, TriggerResult::StopLoss { .. }));
    }

    #[test]
    fn test_backtest_same_bar_target_first() {
        let config = StopsConfig {
            same_bar_priority: SameBarPriority::TargetFirst,
            ..Default::default()
        };
        let simulator = BacktestStopsSimulator::with_config(config);
        let levels = make_levels(Direction::Long);
        // Both stop (95) and target (110) triggered
        let candle = make_candle(100, 115, 90, 105);

        let result = simulator.check_trigger(&candle, &levels);
        assert!(matches!(result, TriggerResult::TakeProfit { .. }));
    }

    #[test]
    fn test_backtest_simulate_series() {
        let simulator = BacktestStopsSimulator::new();
        let levels = make_levels(Direction::Long);
        let candles = vec![
            make_candle(100, 102, 98, 101), // no trigger
            make_candle(101, 103, 99, 102), // no trigger
            make_candle(102, 105, 94, 95),  // stop triggered
        ];

        let result = simulator.simulate(&candles, &levels);
        assert!(matches!(result, TriggerResult::StopLoss { .. }));
    }
}
