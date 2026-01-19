//! VWAP Executor Domain Service

use rust_decimal::Decimal;

use crate::domain::execution_tactics::value_objects::{VwapConfig, VwapSlice};

/// VWAP executor for volume-weighted average price execution.
///
/// Participates proportionally to market volume.
#[derive(Debug, Clone)]
pub struct VwapExecutor {
    /// Total quantity to execute.
    total_qty: Decimal,
    /// Quantity filled so far.
    filled_qty: Decimal,
    /// Configuration.
    config: VwapConfig,
}

impl VwapExecutor {
    /// Create a new VWAP executor.
    #[must_use]
    pub const fn new(total_qty: Decimal, config: VwapConfig) -> Self {
        Self {
            total_qty,
            filled_qty: Decimal::ZERO,
            config,
        }
    }

    /// Calculate the next slice based on recent market volume.
    #[must_use]
    pub fn next_slice(&self, recent_volume: Decimal) -> Option<VwapSlice> {
        if self.is_complete() {
            return None;
        }

        let remaining = self.remaining_qty();
        let quantity = self
            .config
            .calculate_participation_quantity(recent_volume, remaining);

        if quantity == Decimal::ZERO {
            return None;
        }

        Some(VwapSlice::new(quantity, self.config.max_pct_volume))
    }

    /// Record a fill.
    pub fn record_fill(&mut self, filled_qty: Decimal) {
        self.filled_qty += filled_qty;
    }

    /// Get the remaining quantity to execute.
    #[must_use]
    pub fn remaining_qty(&self) -> Decimal {
        self.total_qty - self.filled_qty
    }

    /// Check if execution is complete.
    #[must_use]
    pub fn is_complete(&self) -> bool {
        self.remaining_qty() <= Decimal::ZERO
    }

    /// Check if the execution window has ended.
    #[must_use]
    pub fn is_window_ended(&self) -> bool {
        self.config.is_window_ended()
    }

    /// Get the configuration.
    #[must_use]
    pub const fn config(&self) -> &VwapConfig {
        &self.config
    }

    /// Get the total quantity.
    #[must_use]
    pub const fn total_qty(&self) -> Decimal {
        self.total_qty
    }

    /// Get the filled quantity.
    #[must_use]
    pub const fn filled_qty(&self) -> Decimal {
        self.filled_qty
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vwap_executor_new() {
        let config = VwapConfig::default();
        let executor = VwapExecutor::new(Decimal::new(1000, 0), config);

        assert_eq!(executor.total_qty(), Decimal::new(1000, 0));
        assert_eq!(executor.filled_qty(), Decimal::ZERO);
        assert!(!executor.is_complete());
    }

    #[test]
    fn vwap_executor_remaining_qty() {
        let config = VwapConfig::default();
        let executor = VwapExecutor::new(Decimal::new(1000, 0), config);

        assert_eq!(executor.remaining_qty(), Decimal::new(1000, 0));
    }

    #[test]
    fn vwap_executor_next_slice_volume_limited() {
        let config = VwapConfig::default(); // 10% participation
        let executor = VwapExecutor::new(Decimal::new(1000, 0), config);

        // With 5000 volume, max participation = 500 (10% of 5000)
        let slice = executor.next_slice(Decimal::new(5000, 0));
        assert!(slice.is_some());

        let slice = slice.unwrap();
        assert_eq!(slice.quantity, Decimal::new(500, 0));
        assert_eq!(slice.participation_rate, Decimal::new(10, 2));
    }

    #[test]
    fn vwap_executor_next_slice_remaining_limited() {
        let config = VwapConfig::default(); // 10% participation
        let executor = VwapExecutor::new(Decimal::new(100, 0), config);

        // With 10000 volume, max participation = 1000 (10% of 10000)
        // But remaining is only 100, so should return 100
        let slice = executor.next_slice(Decimal::new(10000, 0));
        assert!(slice.is_some());

        let slice = slice.unwrap();
        assert_eq!(slice.quantity, Decimal::new(100, 0));
    }

    #[test]
    fn vwap_executor_record_fill() {
        let config = VwapConfig::default();
        let mut executor = VwapExecutor::new(Decimal::new(1000, 0), config);

        executor.record_fill(Decimal::new(200, 0));
        assert_eq!(executor.filled_qty(), Decimal::new(200, 0));
        assert_eq!(executor.remaining_qty(), Decimal::new(800, 0));

        executor.record_fill(Decimal::new(300, 0));
        assert_eq!(executor.filled_qty(), Decimal::new(500, 0));
        assert_eq!(executor.remaining_qty(), Decimal::new(500, 0));
    }

    #[test]
    fn vwap_executor_is_complete() {
        let config = VwapConfig::default();
        let mut executor = VwapExecutor::new(Decimal::new(100, 0), config);

        assert!(!executor.is_complete());

        executor.record_fill(Decimal::new(100, 0));
        assert!(executor.is_complete());
    }

    #[test]
    fn vwap_executor_no_slice_when_complete() {
        let config = VwapConfig::default();
        let mut executor = VwapExecutor::new(Decimal::new(100, 0), config);

        executor.record_fill(Decimal::new(100, 0));
        assert!(executor.is_complete());

        let slice = executor.next_slice(Decimal::new(10000, 0));
        assert!(slice.is_none());
    }

    #[test]
    fn vwap_executor_no_slice_when_zero_volume() {
        let config = VwapConfig::default();
        let executor = VwapExecutor::new(Decimal::new(1000, 0), config);

        let slice = executor.next_slice(Decimal::ZERO);
        assert!(slice.is_none());
    }

    #[test]
    fn vwap_executor_window_not_ended_by_default() {
        let config = VwapConfig::default();
        let executor = VwapExecutor::new(Decimal::new(1000, 0), config);

        assert!(!executor.is_window_ended());
    }
}
