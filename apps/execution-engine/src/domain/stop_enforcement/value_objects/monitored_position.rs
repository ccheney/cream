//! Monitored Position Value Object

use crate::domain::shared::{InstrumentId, OrderId};

use super::StopTargetLevels;

/// Position being monitored for stop/target triggers.
#[derive(Debug, Clone)]
pub struct MonitoredPosition {
    /// Position ID (typically the entry order ID).
    position_id: OrderId,
    /// Instrument being monitored.
    instrument_id: InstrumentId,
    /// Stop/target levels.
    levels: StopTargetLevels,
    /// Whether monitoring is active.
    active: bool,
}

impl MonitoredPosition {
    /// Create a new monitored position.
    #[must_use]
    pub fn new(
        position_id: OrderId,
        instrument_id: InstrumentId,
        levels: StopTargetLevels,
    ) -> Self {
        Self {
            position_id,
            instrument_id,
            levels,
            active: true,
        }
    }

    /// Get the position ID.
    #[must_use]
    pub fn position_id(&self) -> &OrderId {
        &self.position_id
    }

    /// Get the instrument ID.
    #[must_use]
    pub fn instrument_id(&self) -> &InstrumentId {
        &self.instrument_id
    }

    /// Get the stop/target levels.
    #[must_use]
    pub fn levels(&self) -> &StopTargetLevels {
        &self.levels
    }

    /// Check if monitoring is active.
    #[must_use]
    pub const fn is_active(&self) -> bool {
        self.active
    }

    /// Activate monitoring.
    pub fn activate(&mut self) {
        self.active = true;
    }

    /// Deactivate monitoring.
    pub fn deactivate(&mut self) {
        self.active = false;
    }

    /// Update the stop/target levels.
    pub fn update_levels(&mut self, levels: StopTargetLevels) {
        self.levels = levels;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::stop_enforcement::value_objects::stop_target_levels::PositionDirection;
    use rust_decimal::Decimal;

    fn test_levels() -> StopTargetLevels {
        StopTargetLevels::new(
            Decimal::new(95, 0),
            Decimal::new(110, 0),
            Decimal::new(100, 0),
            PositionDirection::Long,
        )
    }

    #[test]
    fn monitored_position_new() {
        let position = MonitoredPosition::new(
            OrderId::new("pos-1"),
            InstrumentId::new("AAPL"),
            test_levels(),
        );

        assert_eq!(position.position_id().as_str(), "pos-1");
        assert_eq!(position.instrument_id().as_str(), "AAPL");
        assert!(position.is_active());
    }

    #[test]
    fn monitored_position_activate_deactivate() {
        let mut position = MonitoredPosition::new(
            OrderId::new("pos-1"),
            InstrumentId::new("AAPL"),
            test_levels(),
        );

        assert!(position.is_active());

        position.deactivate();
        assert!(!position.is_active());

        position.activate();
        assert!(position.is_active());
    }

    #[test]
    fn monitored_position_update_levels() {
        let mut position = MonitoredPosition::new(
            OrderId::new("pos-1"),
            InstrumentId::new("AAPL"),
            test_levels(),
        );

        let new_levels = StopTargetLevels::new(
            Decimal::new(90, 0),
            Decimal::new(120, 0),
            Decimal::new(100, 0),
            PositionDirection::Long,
        );

        position.update_levels(new_levels.clone());
        assert_eq!(position.levels().stop_loss, Decimal::new(90, 0));
        assert_eq!(position.levels().take_profit, Decimal::new(120, 0));
    }
}
