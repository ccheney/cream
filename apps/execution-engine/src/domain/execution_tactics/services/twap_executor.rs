//! TWAP Executor Domain Service

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;

use crate::domain::execution_tactics::value_objects::{TwapConfig, TwapSlice};

/// TWAP executor for time-weighted average price execution.
///
/// Splits a large order into equal-sized slices distributed evenly across a time window.
#[derive(Debug, Clone)]
pub struct TwapExecutor {
    /// Total quantity to execute.
    total_qty: Decimal,
    /// Number of slices.
    num_slices: usize,
    /// Slices executed so far.
    executed_slices: usize,
    /// Quantity per slice.
    qty_per_slice: Decimal,
    /// Start time of execution.
    start_time: DateTime<Utc>,
    /// Execution schedule.
    schedule: Vec<DateTime<Utc>>,
    /// Configuration.
    config: TwapConfig,
}

impl TwapExecutor {
    /// Create a new TWAP executor.
    #[must_use]
    pub fn new(total_qty: Decimal, config: TwapConfig) -> Self {
        let num_slices = config.calculate_slice_count() as usize;
        let qty_per_slice = config.calculate_slice_quantity(total_qty);
        let start_time = Utc::now();
        let schedule = config.calculate_schedule(start_time);

        Self {
            total_qty,
            num_slices,
            executed_slices: 0,
            qty_per_slice,
            start_time,
            schedule,
            config,
        }
    }

    /// Create a new TWAP executor with a specific start time.
    #[must_use]
    pub fn with_start_time(
        total_qty: Decimal,
        config: TwapConfig,
        start_time: DateTime<Utc>,
    ) -> Self {
        let num_slices = config.calculate_slice_count() as usize;
        let qty_per_slice = config.calculate_slice_quantity(total_qty);
        let schedule = config.calculate_schedule(start_time);

        Self {
            total_qty,
            num_slices,
            executed_slices: 0,
            qty_per_slice,
            start_time,
            schedule,
            config,
        }
    }

    /// Returns the next slice to execute, if any remain and it's time.
    #[must_use]
    pub fn next_slice(&mut self) -> Option<TwapSlice> {
        if self.executed_slices >= self.num_slices {
            return None;
        }

        let now = Utc::now();
        let scheduled_time = self.schedule[self.executed_slices];

        // Only return slice if it's time
        if now < scheduled_time {
            return None;
        }

        let slice = TwapSlice::new(self.qty_per_slice, self.executed_slices, scheduled_time);

        self.executed_slices += 1;
        Some(slice)
    }

    /// Check if there's a slice ready to execute now.
    #[must_use]
    pub fn has_ready_slice(&self) -> bool {
        if self.executed_slices >= self.num_slices {
            return false;
        }

        let now = Utc::now();
        let scheduled_time = self.schedule[self.executed_slices];
        now >= scheduled_time
    }

    /// Get the remaining quantity to execute.
    #[must_use]
    pub fn remaining_qty(&self) -> Decimal {
        let executed_qty = self.qty_per_slice * Decimal::from(self.executed_slices);
        self.total_qty - executed_qty
    }

    /// Check if execution is complete.
    #[must_use]
    pub const fn is_complete(&self) -> bool {
        self.executed_slices >= self.num_slices
    }

    /// Check if the execution window has ended.
    #[must_use]
    pub fn is_window_ended(&self) -> bool {
        self.config.is_window_ended(self.start_time)
    }

    /// Get the configuration.
    #[must_use]
    pub const fn config(&self) -> &TwapConfig {
        &self.config
    }

    /// Get the total quantity.
    #[must_use]
    pub const fn total_qty(&self) -> Decimal {
        self.total_qty
    }

    /// Get the number of executed slices.
    #[must_use]
    pub const fn executed_slices(&self) -> usize {
        self.executed_slices
    }

    /// Get the quantity per slice.
    #[must_use]
    pub const fn qty_per_slice(&self) -> Decimal {
        self.qty_per_slice
    }

    /// Get the start time.
    #[must_use]
    pub const fn start_time(&self) -> DateTime<Utc> {
        self.start_time
    }

    /// Get the execution schedule.
    #[must_use]
    pub fn schedule(&self) -> &[DateTime<Utc>] {
        &self.schedule
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::execution_tactics::value_objects::SliceType;
    use chrono::TimeDelta;

    fn test_config() -> TwapConfig {
        TwapConfig::new(1, 20, SliceType::Limit, false)
    }

    #[test]
    fn twap_executor_new() {
        let config = test_config();
        let executor = TwapExecutor::new(Decimal::new(300, 0), config);

        assert_eq!(executor.total_qty(), Decimal::new(300, 0));
        assert_eq!(executor.executed_slices(), 0);
        assert!(!executor.is_complete());
    }

    #[test]
    fn twap_executor_slice_count() {
        let config = test_config();
        let executor = TwapExecutor::new(Decimal::new(300, 0), config);

        // 1 minute / 20 seconds = 3 slices
        assert_eq!(executor.schedule().len(), 3);
    }

    #[test]
    fn twap_executor_qty_per_slice() {
        let config = test_config();
        let executor = TwapExecutor::new(Decimal::new(300, 0), config);

        // 300 / 3 slices = 100 per slice
        assert_eq!(executor.qty_per_slice(), Decimal::new(100, 0));
    }

    #[test]
    fn twap_executor_remaining_qty() {
        let config = test_config();
        let executor = TwapExecutor::new(Decimal::new(300, 0), config);

        assert_eq!(executor.remaining_qty(), Decimal::new(300, 0));
    }

    #[test]
    fn twap_executor_next_slice_ready() {
        let config = test_config();
        let start_time = Utc::now() - TimeDelta::seconds(5);
        let mut executor = TwapExecutor::with_start_time(Decimal::new(300, 0), config, start_time);

        // First slice should be ready (scheduled at start_time which is in the past)
        assert!(executor.has_ready_slice());

        let slice = executor.next_slice();
        assert!(slice.is_some());

        let slice = slice.unwrap();
        assert_eq!(slice.quantity, Decimal::new(100, 0));
        assert_eq!(slice.slice_number, 0);
    }

    #[test]
    fn twap_executor_next_slice_not_ready() {
        let config = test_config();
        let start_time = Utc::now() + TimeDelta::seconds(60);
        let mut executor = TwapExecutor::with_start_time(Decimal::new(300, 0), config, start_time);

        // First slice is in the future
        assert!(!executor.has_ready_slice());
        assert!(executor.next_slice().is_none());
    }

    #[test]
    fn twap_executor_executes_all_slices() {
        let config = test_config();
        let start_time = Utc::now() - TimeDelta::minutes(2);
        let mut executor = TwapExecutor::with_start_time(Decimal::new(300, 0), config, start_time);

        // Execute all 3 slices
        let slice1 = executor.next_slice();
        assert!(slice1.is_some());
        assert_eq!(slice1.unwrap().slice_number, 0);

        let slice2 = executor.next_slice();
        assert!(slice2.is_some());
        assert_eq!(slice2.unwrap().slice_number, 1);

        let slice3 = executor.next_slice();
        assert!(slice3.is_some());
        assert_eq!(slice3.unwrap().slice_number, 2);

        // No more slices
        assert!(executor.next_slice().is_none());
        assert!(executor.is_complete());
    }

    #[test]
    fn twap_executor_remaining_qty_updates() {
        let config = test_config();
        let start_time = Utc::now() - TimeDelta::minutes(2);
        let mut executor = TwapExecutor::with_start_time(Decimal::new(300, 0), config, start_time);

        assert_eq!(executor.remaining_qty(), Decimal::new(300, 0));

        executor.next_slice();
        assert_eq!(executor.remaining_qty(), Decimal::new(200, 0));

        executor.next_slice();
        assert_eq!(executor.remaining_qty(), Decimal::new(100, 0));

        executor.next_slice();
        assert_eq!(executor.remaining_qty(), Decimal::ZERO);
    }

    #[test]
    fn twap_executor_window_not_ended_when_fresh() {
        let config = test_config();
        let executor = TwapExecutor::new(Decimal::new(300, 0), config);

        assert!(!executor.is_window_ended());
    }

    #[test]
    fn twap_executor_window_ended_after_duration() {
        let config = test_config();
        let start_time = Utc::now() - TimeDelta::minutes(2);
        let executor = TwapExecutor::with_start_time(Decimal::new(300, 0), config, start_time);

        assert!(executor.is_window_ended());
    }
}
