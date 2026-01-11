//! Real-time price monitoring for stop/target enforcement.

use rust_decimal::Decimal;
use std::collections::HashMap;

use super::simulator::TriggerResult;
use super::types::{StopTargetLevels, StopsConfig};
use crate::models::Direction;

/// Position being monitored for stop/target triggers.
#[derive(Debug, Clone)]
pub struct MonitoredPosition {
    /// Position ID.
    pub position_id: String,
    /// Instrument ID.
    pub instrument_id: String,
    /// Stop/target levels.
    pub levels: StopTargetLevels,
    /// Whether monitoring is active.
    pub active: bool,
}

/// Price monitor for real-time stop/target enforcement.
///
/// Used for options positions where bracket orders aren't supported.
#[derive(Debug)]
pub struct PriceMonitor {
    /// Configuration.
    config: StopsConfig,
    /// Positions being monitored.
    positions: HashMap<String, MonitoredPosition>,
}

impl Default for PriceMonitor {
    fn default() -> Self {
        Self::new()
    }
}

impl PriceMonitor {
    /// Create a new price monitor.
    #[must_use]
    pub fn new() -> Self {
        Self {
            config: StopsConfig::default(),
            positions: HashMap::new(),
        }
    }

    /// Create with custom configuration.
    #[must_use]
    pub fn with_config(config: StopsConfig) -> Self {
        Self {
            config,
            positions: HashMap::new(),
        }
    }

    /// Add a position to monitor.
    pub fn add_position(&mut self, position: MonitoredPosition) {
        self.positions
            .insert(position.position_id.clone(), position);
    }

    /// Remove a position from monitoring.
    pub fn remove_position(&mut self, position_id: &str) -> Option<MonitoredPosition> {
        self.positions.remove(position_id)
    }

    /// Get a position by ID.
    #[must_use]
    pub fn get_position(&self, position_id: &str) -> Option<&MonitoredPosition> {
        self.positions.get(position_id)
    }

    /// Check a price update against all monitored positions.
    ///
    /// Returns a list of (`position_id`, `trigger_result`) for any triggers.
    #[must_use]
    pub fn check_price(&self, instrument_id: &str, price: Decimal) -> Vec<(String, TriggerResult)> {
        let timestamp = chrono::Utc::now().to_rfc3339();
        let mut triggers = Vec::new();

        for position in self.positions.values() {
            if !position.active || position.instrument_id != instrument_id {
                continue;
            }

            let result = Self::check_price_trigger(price, &position.levels, &timestamp);
            if result != TriggerResult::None {
                triggers.push((position.position_id.clone(), result));
            }
        }

        triggers
    }

    /// Check if a price triggers stop or target.
    fn check_price_trigger(
        price: Decimal,
        levels: &StopTargetLevels,
        timestamp: &str,
    ) -> TriggerResult {
        match levels.direction {
            Direction::Long => {
                if price <= levels.stop_loss {
                    TriggerResult::StopLoss {
                        price: levels.stop_loss,
                        timestamp: timestamp.to_string(),
                    }
                } else if price >= levels.take_profit {
                    TriggerResult::TakeProfit {
                        price: levels.take_profit,
                        timestamp: timestamp.to_string(),
                    }
                } else {
                    TriggerResult::None
                }
            }
            Direction::Short => {
                if price >= levels.stop_loss {
                    TriggerResult::StopLoss {
                        price: levels.stop_loss,
                        timestamp: timestamp.to_string(),
                    }
                } else if price <= levels.take_profit {
                    TriggerResult::TakeProfit {
                        price: levels.take_profit,
                        timestamp: timestamp.to_string(),
                    }
                } else {
                    TriggerResult::None
                }
            }
            Direction::Flat => TriggerResult::None,
        }
    }

    /// Get the monitoring interval.
    #[must_use]
    pub const fn monitoring_interval_ms(&self) -> u64 {
        self.config.monitoring_interval_ms
    }

    /// Get count of active monitored positions.
    #[must_use]
    pub fn active_count(&self) -> usize {
        self.positions.values().filter(|p| p.active).count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_long_levels() -> StopTargetLevels {
        StopTargetLevels::new(
            Decimal::new(95, 0),  // stop at $95
            Decimal::new(110, 0), // target at $110
            Decimal::new(100, 0), // entry at $100
            Direction::Long,
        )
    }

    #[test]
    fn test_price_monitor_add_remove() {
        let mut monitor = PriceMonitor::new();

        let position = MonitoredPosition {
            position_id: "pos-1".to_string(),
            instrument_id: "AAPL".to_string(),
            levels: make_long_levels(),
            active: true,
        };

        monitor.add_position(position);
        assert_eq!(monitor.active_count(), 1);

        monitor.remove_position("pos-1");
        assert_eq!(monitor.active_count(), 0);
    }

    #[test]
    fn test_price_monitor_trigger() {
        let mut monitor = PriceMonitor::new();

        let position = MonitoredPosition {
            position_id: "pos-1".to_string(),
            instrument_id: "AAPL".to_string(),
            levels: make_long_levels(),
            active: true,
        };

        monitor.add_position(position);

        // Price drops to stop
        let triggers = monitor.check_price("AAPL", Decimal::new(94, 0));
        assert_eq!(triggers.len(), 1);
        assert!(matches!(triggers[0].1, TriggerResult::StopLoss { .. }));
    }

    #[test]
    fn test_price_monitor_no_trigger() {
        let mut monitor = PriceMonitor::new();

        let position = MonitoredPosition {
            position_id: "pos-1".to_string(),
            instrument_id: "AAPL".to_string(),
            levels: make_long_levels(),
            active: true,
        };

        monitor.add_position(position);

        // Price in safe zone
        let triggers = monitor.check_price("AAPL", Decimal::new(100, 0));
        assert!(triggers.is_empty());
    }
}
