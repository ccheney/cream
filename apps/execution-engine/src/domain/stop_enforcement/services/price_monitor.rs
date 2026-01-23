//! Price Monitor Domain Service

use rust_decimal::Decimal;
use std::collections::HashMap;

use crate::domain::shared::{InstrumentId, OrderId, Timestamp};
use crate::domain::stop_enforcement::value_objects::{
    MonitoredPosition, PositionDirection, StopTargetLevels, StopsConfig, TriggerResult,
};

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
            .insert(position.position_id().to_string(), position);
    }

    /// Remove a position from monitoring.
    pub fn remove_position(&mut self, position_id: &OrderId) -> Option<MonitoredPosition> {
        self.positions.remove(position_id.as_str())
    }

    /// Get a position by ID.
    #[must_use]
    pub fn get_position(&self, position_id: &OrderId) -> Option<&MonitoredPosition> {
        self.positions.get(position_id.as_str())
    }

    /// Check a price update against all monitored positions.
    ///
    /// Returns a list of (`position_id`, `trigger_result`) for any triggers.
    #[must_use]
    pub fn check_price(
        &self,
        instrument_id: &InstrumentId,
        price: Decimal,
    ) -> Vec<(OrderId, TriggerResult)> {
        let timestamp = Timestamp::now();
        let mut triggers = Vec::new();

        for position in self.positions.values() {
            if !position.is_active() || position.instrument_id() != instrument_id {
                continue;
            }

            let result = Self::check_price_trigger(price, position.levels(), timestamp);
            if result != TriggerResult::None {
                triggers.push((position.position_id().clone(), result));
            }
        }

        triggers
    }

    /// Check if a price triggers stop or target.
    fn check_price_trigger(
        price: Decimal,
        levels: &StopTargetLevels,
        timestamp: Timestamp,
    ) -> TriggerResult {
        match levels.direction {
            PositionDirection::Long => {
                if price <= levels.stop_loss {
                    TriggerResult::StopLoss {
                        price: levels.stop_loss,
                        timestamp,
                    }
                } else if price >= levels.take_profit {
                    TriggerResult::TakeProfit {
                        price: levels.take_profit,
                        timestamp,
                    }
                } else {
                    TriggerResult::None
                }
            }
            PositionDirection::Short => {
                if price >= levels.stop_loss {
                    TriggerResult::StopLoss {
                        price: levels.stop_loss,
                        timestamp,
                    }
                } else if price <= levels.take_profit {
                    TriggerResult::TakeProfit {
                        price: levels.take_profit,
                        timestamp,
                    }
                } else {
                    TriggerResult::None
                }
            }
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
        self.positions.values().filter(|p| p.is_active()).count()
    }

    /// Get the configuration.
    #[must_use]
    pub const fn config(&self) -> &StopsConfig {
        &self.config
    }

    /// Get all monitored positions.
    pub fn positions(&self) -> impl Iterator<Item = &MonitoredPosition> {
        self.positions.values()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_long_position(position_id: &str, instrument_id: &str) -> MonitoredPosition {
        let levels = StopTargetLevels::for_long(
            Decimal::new(100, 0),
            Decimal::new(95, 0),
            Decimal::new(110, 0),
        );
        MonitoredPosition::new(
            OrderId::new(position_id),
            InstrumentId::new(instrument_id),
            Decimal::new(100, 0),
            levels,
        )
    }

    fn make_short_position(position_id: &str, instrument_id: &str) -> MonitoredPosition {
        let levels = StopTargetLevels::for_short(
            Decimal::new(100, 0),
            Decimal::new(105, 0),
            Decimal::new(90, 0),
        );
        MonitoredPosition::new(
            OrderId::new(position_id),
            InstrumentId::new(instrument_id),
            Decimal::new(100, 0),
            levels,
        )
    }

    #[test]
    fn price_monitor_new() {
        let monitor = PriceMonitor::new();
        assert_eq!(monitor.active_count(), 0);
    }

    #[test]
    fn price_monitor_add_remove() {
        let mut monitor = PriceMonitor::new();

        let position = make_long_position("pos-1", "AAPL");
        monitor.add_position(position);
        assert_eq!(monitor.active_count(), 1);

        monitor.remove_position(&OrderId::new("pos-1"));
        assert_eq!(monitor.active_count(), 0);
    }

    #[test]
    fn price_monitor_get_position() {
        let mut monitor = PriceMonitor::new();

        let position = make_long_position("pos-1", "AAPL");
        monitor.add_position(position);

        let found = monitor.get_position(&OrderId::new("pos-1"));
        assert!(found.is_some());

        let not_found = monitor.get_position(&OrderId::new("pos-2"));
        assert!(not_found.is_none());
    }

    #[test]
    fn price_monitor_check_price_no_trigger() {
        let mut monitor = PriceMonitor::new();
        monitor.add_position(make_long_position("pos-1", "AAPL"));

        // Price in safe zone
        let triggers = monitor.check_price(&InstrumentId::new("AAPL"), Decimal::new(100, 0));
        assert!(triggers.is_empty());
    }

    #[test]
    fn price_monitor_check_price_stop_loss_long() {
        let mut monitor = PriceMonitor::new();
        monitor.add_position(make_long_position("pos-1", "AAPL"));

        // Price drops to stop
        let triggers = monitor.check_price(&InstrumentId::new("AAPL"), Decimal::new(94, 0));
        assert_eq!(triggers.len(), 1);
        assert!(triggers[0].1.is_stop_loss());
    }

    #[test]
    fn price_monitor_check_price_take_profit_long() {
        let mut monitor = PriceMonitor::new();
        monitor.add_position(make_long_position("pos-1", "AAPL"));

        // Price rises to target
        let triggers = monitor.check_price(&InstrumentId::new("AAPL"), Decimal::new(111, 0));
        assert_eq!(triggers.len(), 1);
        assert!(triggers[0].1.is_take_profit());
    }

    #[test]
    fn price_monitor_check_price_stop_loss_short() {
        let mut monitor = PriceMonitor::new();
        monitor.add_position(make_short_position("pos-1", "AAPL"));

        // Price rises to stop
        let triggers = monitor.check_price(&InstrumentId::new("AAPL"), Decimal::new(106, 0));
        assert_eq!(triggers.len(), 1);
        assert!(triggers[0].1.is_stop_loss());
    }

    #[test]
    fn price_monitor_check_price_take_profit_short() {
        let mut monitor = PriceMonitor::new();
        monitor.add_position(make_short_position("pos-1", "AAPL"));

        // Price drops to target
        let triggers = monitor.check_price(&InstrumentId::new("AAPL"), Decimal::new(89, 0));
        assert_eq!(triggers.len(), 1);
        assert!(triggers[0].1.is_take_profit());
    }

    #[test]
    fn price_monitor_check_price_wrong_instrument() {
        let mut monitor = PriceMonitor::new();
        monitor.add_position(make_long_position("pos-1", "AAPL"));

        // Price for different instrument
        let triggers = monitor.check_price(&InstrumentId::new("GOOGL"), Decimal::new(94, 0));
        assert!(triggers.is_empty());
    }

    #[test]
    fn price_monitor_check_price_inactive_position() {
        let mut monitor = PriceMonitor::new();
        let mut position = make_long_position("pos-1", "AAPL");
        position.deactivate();
        monitor.add_position(position);

        // Price drops to stop but position is inactive
        let triggers = monitor.check_price(&InstrumentId::new("AAPL"), Decimal::new(94, 0));
        assert!(triggers.is_empty());
    }

    #[test]
    fn price_monitor_multiple_positions() {
        let mut monitor = PriceMonitor::new();
        monitor.add_position(make_long_position("pos-1", "AAPL"));
        monitor.add_position(make_long_position("pos-2", "AAPL"));

        // Both should trigger
        let triggers = monitor.check_price(&InstrumentId::new("AAPL"), Decimal::new(94, 0));
        assert_eq!(triggers.len(), 2);
    }

    #[test]
    fn price_monitor_with_config() {
        let config = StopsConfig::fast_monitoring();
        let monitor = PriceMonitor::with_config(config);
        assert_eq!(monitor.monitoring_interval_ms(), 50);
    }

    #[test]
    fn price_monitor_default() {
        let monitor = PriceMonitor::default();
        assert_eq!(monitor.active_count(), 0);
        assert_eq!(monitor.monitoring_interval_ms(), 100);
    }

    #[test]
    fn price_monitor_config_getter() {
        let config = StopsConfig::fast_monitoring();
        let monitor = PriceMonitor::with_config(config);
        assert_eq!(monitor.config().monitoring_interval_ms, 50);
    }

    #[test]
    fn price_monitor_positions_iterator() {
        let mut monitor = PriceMonitor::new();
        monitor.add_position(make_long_position("pos-1", "AAPL"));
        monitor.add_position(make_long_position("pos-2", "MSFT"));

        let positions: Vec<_> = monitor.positions().collect();
        assert_eq!(positions.len(), 2);
    }

    #[test]
    fn price_monitor_short_no_trigger_in_safe_zone() {
        let mut monitor = PriceMonitor::new();
        monitor.add_position(make_short_position("pos-1", "AAPL"));

        // Price in safe zone for short position (between stop and target)
        let triggers = monitor.check_price(&InstrumentId::new("AAPL"), Decimal::new(98, 0));
        assert!(triggers.is_empty());
    }
}
