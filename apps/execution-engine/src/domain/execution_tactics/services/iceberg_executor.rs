//! Iceberg Executor Domain Service

use rust_decimal::Decimal;

use crate::domain::execution_tactics::value_objects::{IcebergConfig, IcebergPeak};

/// Iceberg executor for hidden order execution.
///
/// Shows only a small visible portion of the total order, replenishing on fills.
#[derive(Debug, Clone)]
pub struct IcebergExecutor {
    /// Total hidden quantity.
    total_qty: Decimal,
    /// Visible "peak" size.
    display_qty: Decimal,
    /// Quantity filled so far.
    filled_qty: Decimal,
    /// Peak number.
    peak_number: usize,
    /// Configuration.
    config: IcebergConfig,
}

impl IcebergExecutor {
    /// Create a new Iceberg executor.
    #[must_use]
    pub fn new(total_qty: Decimal, config: IcebergConfig) -> Self {
        let display_qty = Decimal::from(config.display_size);

        Self {
            total_qty,
            display_qty,
            filled_qty: Decimal::ZERO,
            peak_number: 0,
            config,
        }
    }

    /// Get the first peak to display.
    #[must_use]
    pub fn first_peak(&self) -> IcebergPeak {
        let quantity = self.display_qty.min(self.total_qty);
        IcebergPeak::new(quantity, 0)
    }

    /// Called when current peak is filled - returns next peak order if any.
    #[must_use]
    pub fn on_fill(&mut self, filled: Decimal) -> Option<IcebergPeak> {
        self.filled_qty += filled;
        self.peak_number += 1;

        if self.is_complete() {
            return None;
        }

        let remaining = self.remaining_qty();
        let next_display = self.display_qty.min(remaining);

        Some(IcebergPeak::new(next_display, self.peak_number))
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

    /// Get the configuration.
    #[must_use]
    pub const fn config(&self) -> &IcebergConfig {
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

    /// Get the current peak number.
    #[must_use]
    pub const fn peak_number(&self) -> usize {
        self.peak_number
    }

    /// Get the display quantity per peak.
    #[must_use]
    pub const fn display_qty(&self) -> Decimal {
        self.display_qty
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> IcebergConfig {
        IcebergConfig::deterministic(100, 500)
    }

    #[test]
    fn iceberg_executor_new() {
        let config = test_config();
        let executor = IcebergExecutor::new(Decimal::new(500, 0), config);

        assert_eq!(executor.total_qty(), Decimal::new(500, 0));
        assert_eq!(executor.filled_qty(), Decimal::ZERO);
        assert_eq!(executor.display_qty(), Decimal::new(100, 0));
        assert_eq!(executor.peak_number(), 0);
        assert!(!executor.is_complete());
    }

    #[test]
    fn iceberg_executor_first_peak() {
        let config = test_config();
        let executor = IcebergExecutor::new(Decimal::new(500, 0), config);

        let peak = executor.first_peak();
        assert_eq!(peak.quantity, Decimal::new(100, 0));
        assert_eq!(peak.peak_number, 0);
    }

    #[test]
    fn iceberg_executor_first_peak_limited_by_total() {
        let config = test_config();
        let executor = IcebergExecutor::new(Decimal::new(50, 0), config);

        let peak = executor.first_peak();
        assert_eq!(peak.quantity, Decimal::new(50, 0));
    }

    #[test]
    fn iceberg_executor_on_fill_returns_next_peak() {
        let config = test_config();
        let mut executor = IcebergExecutor::new(Decimal::new(500, 0), config);

        let next = executor.on_fill(Decimal::new(100, 0));
        assert!(next.is_some());

        let peak = next.unwrap();
        assert_eq!(peak.quantity, Decimal::new(100, 0));
        assert_eq!(peak.peak_number, 1);
        assert_eq!(executor.filled_qty(), Decimal::new(100, 0));
    }

    #[test]
    fn iceberg_executor_on_fill_last_peak_smaller() {
        let config = test_config();
        let mut executor = IcebergExecutor::new(Decimal::new(250, 0), config);

        // First fill
        let _ = executor.on_fill(Decimal::new(100, 0));
        assert_eq!(executor.remaining_qty(), Decimal::new(150, 0));

        // Second fill
        let _ = executor.on_fill(Decimal::new(100, 0));
        assert_eq!(executor.remaining_qty(), Decimal::new(50, 0));

        // Third fill - should return peak for remaining 50
        let next = executor.on_fill(Decimal::new(100, 0));
        assert!(next.is_none()); // Actually complete now
        assert!(executor.is_complete());
    }

    #[test]
    fn iceberg_executor_executes_all_peaks() {
        let config = test_config();
        let mut executor = IcebergExecutor::new(Decimal::new(300, 0), config);

        // Peak 0 (first)
        let first = executor.first_peak();
        assert_eq!(first.peak_number, 0);

        // Peak 1
        let next = executor.on_fill(Decimal::new(100, 0));
        assert!(next.is_some());
        assert_eq!(next.unwrap().peak_number, 1);

        // Peak 2
        let next = executor.on_fill(Decimal::new(100, 0));
        assert!(next.is_some());
        assert_eq!(next.unwrap().peak_number, 2);

        // Complete
        let next = executor.on_fill(Decimal::new(100, 0));
        assert!(next.is_none());
        assert!(executor.is_complete());
    }

    #[test]
    fn iceberg_executor_remaining_qty() {
        let config = test_config();
        let mut executor = IcebergExecutor::new(Decimal::new(500, 0), config);

        assert_eq!(executor.remaining_qty(), Decimal::new(500, 0));

        executor.on_fill(Decimal::new(150, 0));
        assert_eq!(executor.remaining_qty(), Decimal::new(350, 0));
    }

    #[test]
    fn iceberg_executor_is_complete() {
        let config = test_config();
        let mut executor = IcebergExecutor::new(Decimal::new(100, 0), config);

        assert!(!executor.is_complete());

        let _ = executor.on_fill(Decimal::new(100, 0));
        assert!(executor.is_complete());
    }

    #[test]
    fn iceberg_executor_no_peak_when_complete() {
        let config = test_config();
        let mut executor = IcebergExecutor::new(Decimal::new(100, 0), config);

        let _ = executor.on_fill(Decimal::new(100, 0));
        assert!(executor.is_complete());

        let next = executor.on_fill(Decimal::new(0, 0));
        assert!(next.is_none());
    }
}
