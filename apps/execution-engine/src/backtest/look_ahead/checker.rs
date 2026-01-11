//! Comprehensive look-ahead bias checker for backtest validation.

use super::types::{
    DataAccessRecord, EarningsRelease, LookAheadConfig, LookAheadSummary, ValidationResult,
};
use super::validation::{check_earnings_availability, validate_data_timestamp};

/// Comprehensive look-ahead bias checker for backtest validation.
///
/// This struct maintains state about data access patterns and provides
/// methods to validate all data accesses during a backtest.
#[derive(Debug)]
pub struct LookAheadChecker {
    config: LookAheadConfig,
    access_log: Vec<DataAccessRecord>,
    warnings_issued: usize,
    violations_found: usize,
}

impl LookAheadChecker {
    /// Create a new look-ahead bias checker.
    #[must_use]
    pub const fn new(config: LookAheadConfig) -> Self {
        Self {
            config,
            access_log: Vec::new(),
            warnings_issued: 0,
            violations_found: 0,
        }
    }

    /// Create with default configuration.
    #[must_use]
    pub fn with_defaults() -> Self {
        Self::new(LookAheadConfig::default())
    }

    /// Validate a data access and record it.
    pub fn validate_access(
        &mut self,
        data_type: &str,
        symbol: Option<&str>,
        data_timestamp: &str,
        decision_timestamp: &str,
    ) -> ValidationResult {
        let result =
            validate_data_timestamp(data_timestamp, decision_timestamp, data_type, &self.config);

        let record = DataAccessRecord {
            data_type: data_type.to_string(),
            symbol: symbol.map(String::from),
            data_timestamp: data_timestamp.to_string(),
            decision_timestamp: decision_timestamp.to_string(),
            valid: result.valid,
            warnings: result.warnings.clone(),
        };

        self.access_log.push(record);
        self.update_counters(&result);

        result
    }

    /// Validate earnings access.
    pub fn validate_earnings_access(
        &mut self,
        earnings: &EarningsRelease,
        access_time: &str,
    ) -> ValidationResult {
        let result = check_earnings_availability(earnings, access_time);

        let record = DataAccessRecord {
            data_type: "earnings".to_string(),
            symbol: Some(earnings.symbol.clone()),
            data_timestamp: earnings.release_timestamp.to_rfc3339(),
            decision_timestamp: access_time.to_string(),
            valid: result.valid,
            warnings: result.warnings.clone(),
        };

        self.access_log.push(record);
        self.update_counters(&result);

        result
    }

    /// Get the access log.
    #[must_use]
    pub fn access_log(&self) -> &[DataAccessRecord] {
        &self.access_log
    }

    /// Get the number of warnings issued.
    #[must_use]
    pub const fn warnings_issued(&self) -> usize {
        self.warnings_issued
    }

    /// Get the number of violations found.
    #[must_use]
    pub const fn violations_found(&self) -> usize {
        self.violations_found
    }

    /// Check if any violations were found.
    #[must_use]
    pub const fn has_violations(&self) -> bool {
        self.violations_found > 0
    }

    /// Generate a summary report.
    #[must_use]
    pub fn summary(&self) -> LookAheadSummary {
        LookAheadSummary {
            total_accesses: self.access_log.len(),
            valid_accesses: self.access_log.iter().filter(|r| r.valid).count(),
            violations: self.violations_found,
            warnings: self.warnings_issued,
        }
    }

    /// Clear the access log.
    pub fn clear(&mut self) {
        self.access_log.clear();
        self.warnings_issued = 0;
        self.violations_found = 0;
    }

    fn update_counters(&mut self, result: &ValidationResult) {
        if !result.valid {
            self.violations_found += 1;
        }
        if result.has_warnings() {
            self.warnings_issued += result.warnings.len();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_look_ahead_checker() {
        let mut checker = LookAheadChecker::with_defaults();

        let result = checker.validate_access(
            "candle",
            Some("AAPL"),
            "2025-06-01T09:00:00Z",
            "2025-06-01T10:00:00Z",
        );
        assert!(result.valid);

        let result = checker.validate_access(
            "earnings",
            Some("AAPL"),
            "2025-06-01T12:00:00Z",
            "2025-06-01T10:00:00Z",
        );
        assert!(!result.valid);

        let summary = checker.summary();
        assert_eq!(summary.total_accesses, 2);
        assert_eq!(summary.valid_accesses, 1);
        assert_eq!(summary.violations, 1);
    }

    #[test]
    fn test_look_ahead_checker_clear() {
        let mut checker = LookAheadChecker::with_defaults();

        checker.validate_access(
            "candle",
            Some("AAPL"),
            "2025-06-01T09:00:00Z",
            "2025-06-01T10:00:00Z",
        );

        assert_eq!(checker.access_log().len(), 1);

        checker.clear();

        assert!(checker.access_log().is_empty());
        assert_eq!(checker.warnings_issued(), 0);
        assert_eq!(checker.violations_found(), 0);
    }

    #[test]
    fn test_look_ahead_checker_has_violations() {
        let mut checker = LookAheadChecker::with_defaults();

        assert!(!checker.has_violations());

        checker.validate_access(
            "candle",
            Some("AAPL"),
            "2025-06-01T12:00:00Z",
            "2025-06-01T10:00:00Z",
        );

        assert!(checker.has_violations());
    }
}
