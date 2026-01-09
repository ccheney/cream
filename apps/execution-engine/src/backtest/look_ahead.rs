//! Look-ahead bias prevention for backtest simulation.
//!
//! This module provides validation to ensure backtests only use information
//! that was available at the time of each decision, preventing the use of
//! future data that would invalidate backtest results.
//!
//! # Look-Ahead Bias
//!
//! Look-ahead bias occurs when a backtest uses information that was not
//! available at the time of the trading decision. Common examples include:
//!
//! - Using earnings data before the earnings release time
//! - Using restated financials instead of originally reported values
//! - Using revised index constituents (e.g., current S&P 500 members for 2020 trades)
//! - Using adjusted prices for splits/dividends before announcement
//!
//! # Point-in-Time Data
//!
//! All data used in backtesting should be "point-in-time" - reflecting only
//! what was known at that moment. This prevents artificial alpha from
//! information that traders could not have accessed.

use std::collections::HashMap;

use chrono::{DateTime, Duration, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::{debug, warn};

// ============================================
// Error Types
// ============================================

/// Errors related to look-ahead bias detection.
#[derive(Debug, Error, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum LookAheadError {
    /// Data timestamp is after decision timestamp (future data).
    #[error(
        "FUTURE_DATA: Data timestamp {data_timestamp} is after decision timestamp {decision_timestamp}"
    )]
    FutureData {
        /// Timestamp of the data being accessed.
        data_timestamp: String,
        /// Timestamp of the trading decision.
        decision_timestamp: String,
        /// Description of the data type.
        data_type: String,
    },

    /// Earnings data accessed before release.
    #[error(
        "EARNINGS_NOT_RELEASED: Earnings for {symbol} were not available until {release_time}, but accessed at {access_time}"
    )]
    EarningsNotReleased {
        /// Symbol with the earnings.
        symbol: String,
        /// Time earnings were released.
        release_time: String,
        /// Time earnings were accessed.
        access_time: String,
    },

    /// Fundamental data accessed before publication.
    #[error(
        "FUNDAMENTAL_NOT_AVAILABLE: {metric} for {symbol} was not available until {available_time}, but accessed at {access_time}"
    )]
    FundamentalNotAvailable {
        /// Symbol with the fundamental data.
        symbol: String,
        /// Fundamental metric name.
        metric: String,
        /// Time the data became available.
        available_time: String,
        /// Time the data was accessed.
        access_time: String,
    },

    /// Using revised data instead of originally reported.
    #[error(
        "REVISED_DATA: Using revised {metric} for {symbol} instead of originally reported value"
    )]
    RevisedData {
        /// Symbol with the revised data.
        symbol: String,
        /// Metric that was revised.
        metric: String,
    },

    /// Invalid timestamp format.
    #[error("INVALID_TIMESTAMP: Could not parse timestamp '{timestamp}': {reason}")]
    InvalidTimestamp {
        /// The invalid timestamp string.
        timestamp: String,
        /// Reason for the parse failure.
        reason: String,
    },
}

// ============================================
// Types
// ============================================

/// Result of a look-ahead bias validation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    /// Whether the validation passed.
    pub valid: bool,
    /// Any errors found.
    pub errors: Vec<LookAheadError>,
    /// Warning messages for suspicious patterns.
    pub warnings: Vec<String>,
}

impl ValidationResult {
    /// Create a passing validation result.
    #[must_use]
    pub const fn pass() -> Self {
        Self {
            valid: true,
            errors: Vec::new(),
            warnings: Vec::new(),
        }
    }

    /// Create a failing validation result.
    #[must_use]
    pub fn fail(error: LookAheadError) -> Self {
        Self {
            valid: false,
            errors: vec![error],
            warnings: Vec::new(),
        }
    }

    /// Add a warning to the result.
    #[must_use = "method returns modified result"]
    pub fn with_warning(mut self, warning: impl Into<String>) -> Self {
        self.warnings.push(warning.into());
        self
    }

    /// Check if there are any warnings.
    #[must_use]
    pub const fn has_warnings(&self) -> bool {
        !self.warnings.is_empty()
    }
}

/// Information about an earnings release.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EarningsRelease {
    /// Symbol.
    pub symbol: String,
    /// Fiscal quarter end date.
    pub fiscal_quarter_end: NaiveDate,
    /// Release timestamp (when earnings became public).
    pub release_timestamp: DateTime<Utc>,
    /// Whether released before market open (BMO) or after market close (AMC).
    pub release_timing: EarningsReleaseTiming,
}

/// Timing of an earnings release.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EarningsReleaseTiming {
    /// Before market open.
    BeforeMarketOpen,
    /// After market close.
    AfterMarketClose,
    /// During market hours.
    DuringMarket,
    /// Unknown timing.
    Unknown,
}

/// Information about fundamental data availability.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FundamentalDataAvailability {
    /// Symbol.
    pub symbol: String,
    /// Metric name (e.g., `"revenue"`, `"eps"`, `"book_value"`).
    pub metric: String,
    /// Period end date.
    pub period_end: NaiveDate,
    /// When the data became available.
    pub available_timestamp: DateTime<Utc>,
    /// Whether this is originally reported or restated.
    pub is_original: bool,
}

/// Configuration for look-ahead bias detection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LookAheadConfig {
    /// Grace period for same-day data (in hours).
    /// Data published on the same day as the decision within this window is allowed.
    pub same_day_grace_hours: i64,

    /// Warn if accessing data within this many hours of release.
    /// This catches suspicious patterns where data is accessed very close to release.
    pub suspicious_proximity_hours: i64,

    /// Whether to enforce strict point-in-time validation.
    pub strict_mode: bool,

    /// Whether to warn about restated/revised data usage.
    pub warn_on_revisions: bool,
}

impl Default for LookAheadConfig {
    fn default() -> Self {
        Self {
            same_day_grace_hours: 0,
            suspicious_proximity_hours: 1,
            strict_mode: true,
            warn_on_revisions: true,
        }
    }
}

// ============================================
// Validation Functions
// ============================================

/// Validate that a data timestamp is not after the decision timestamp.
///
/// This is the core check for look-ahead bias prevention. Any data used
/// in a trading decision must have a timestamp at or before the decision time.
///
/// # Arguments
///
/// * `data_timestamp` - ISO 8601 timestamp of when the data was recorded/released
/// * `decision_timestamp` - ISO 8601 timestamp of the trading decision
/// * `data_type` - Description of the data type for error messages
/// * `config` - Configuration for validation behavior
///
/// # Returns
///
/// `ValidationResult` indicating whether the data access is valid.
pub fn validate_data_timestamp(
    data_timestamp: &str,
    decision_timestamp: &str,
    data_type: &str,
    config: &LookAheadConfig,
) -> ValidationResult {
    let data_dt = match parse_timestamp(data_timestamp) {
        Ok(dt) => dt,
        Err(e) => return ValidationResult::fail(e),
    };

    let decision_dt = match parse_timestamp(decision_timestamp) {
        Ok(dt) => dt,
        Err(e) => return ValidationResult::fail(e),
    };

    // Check for future data
    if data_dt > decision_dt {
        debug!(
            data_timestamp = %data_timestamp,
            decision_timestamp = %decision_timestamp,
            data_type = %data_type,
            "Look-ahead bias detected: data is from the future"
        );

        return ValidationResult::fail(LookAheadError::FutureData {
            data_timestamp: data_timestamp.to_string(),
            decision_timestamp: decision_timestamp.to_string(),
            data_type: data_type.to_string(),
        });
    }

    // Check for suspicious proximity (data accessed very close to when it was released)
    let diff = decision_dt - data_dt;
    let proximity_threshold = Duration::hours(config.suspicious_proximity_hours);

    if diff < proximity_threshold && config.suspicious_proximity_hours > 0 {
        let warning = format!(
            "Data access very close to release: {} accessed {} after {} release",
            data_type,
            format_duration(diff),
            data_timestamp
        );

        warn!(
            data_timestamp = %data_timestamp,
            decision_timestamp = %decision_timestamp,
            data_type = %data_type,
            diff_minutes = diff.num_minutes(),
            "Suspicious data access pattern: very close to release time"
        );

        return ValidationResult::pass().with_warning(warning);
    }

    ValidationResult::pass()
}

/// Check if earnings data is available at a given decision time.
///
/// Earnings data is only available after the official release time.
/// Using earnings before release is a common source of look-ahead bias.
///
/// # Arguments
///
/// * `earnings` - Information about the earnings release
/// * `access_time` - ISO 8601 timestamp of when the data is being accessed
///
/// # Returns
///
/// `ValidationResult` indicating whether the earnings access is valid.
pub fn check_earnings_availability(
    earnings: &EarningsRelease,
    access_time: &str,
) -> ValidationResult {
    let access_dt = match parse_timestamp(access_time) {
        Ok(dt) => dt,
        Err(e) => return ValidationResult::fail(e),
    };

    // Earnings not available until release
    if access_dt < earnings.release_timestamp {
        warn!(
            symbol = %earnings.symbol,
            release_time = %earnings.release_timestamp.to_rfc3339(),
            access_time = %access_time,
            "Attempted to access earnings before release"
        );

        return ValidationResult::fail(LookAheadError::EarningsNotReleased {
            symbol: earnings.symbol.clone(),
            release_time: earnings.release_timestamp.to_rfc3339(),
            access_time: access_time.to_string(),
        });
    }

    // Warn if accessed very soon after release
    let diff = access_dt - earnings.release_timestamp;
    if diff < Duration::hours(1) {
        let warning = format!(
            "Accessing {} earnings {} after release - verify data propagation delay is realistic",
            earnings.symbol,
            format_duration(diff)
        );
        return ValidationResult::pass().with_warning(warning);
    }

    ValidationResult::pass()
}

/// Check if fundamental data is available at a given decision time.
///
/// Fundamental data (revenue, EPS, book value, etc.) is only available
/// after it's been published/filed. This function validates point-in-time access.
///
/// # Arguments
///
/// * `data` - Information about the fundamental data availability
/// * `access_time` - ISO 8601 timestamp of when the data is being accessed
/// * `config` - Configuration for validation behavior
///
/// # Returns
///
/// `ValidationResult` indicating whether the fundamental data access is valid.
pub fn check_fundamental_availability(
    data: &FundamentalDataAvailability,
    access_time: &str,
    config: &LookAheadConfig,
) -> ValidationResult {
    let access_dt = match parse_timestamp(access_time) {
        Ok(dt) => dt,
        Err(e) => return ValidationResult::fail(e),
    };

    // Data not available until publication
    if access_dt < data.available_timestamp {
        warn!(
            symbol = %data.symbol,
            metric = %data.metric,
            available_time = %data.available_timestamp.to_rfc3339(),
            access_time = %access_time,
            "Attempted to access fundamental data before publication"
        );

        return ValidationResult::fail(LookAheadError::FundamentalNotAvailable {
            symbol: data.symbol.clone(),
            metric: data.metric.clone(),
            available_time: data.available_timestamp.to_rfc3339(),
            access_time: access_time.to_string(),
        });
    }

    // Warn about using restated data
    if !data.is_original && config.warn_on_revisions {
        let warning = format!(
            "Using restated {} for {} - consider using originally reported value",
            data.metric, data.symbol
        );

        warn!(
            symbol = %data.symbol,
            metric = %data.metric,
            "Using restated fundamental data instead of originally reported"
        );

        return ValidationResult::pass().with_warning(warning);
    }

    ValidationResult::pass()
}

/// Validate universe constituents are point-in-time accurate.
///
/// Index constituents change over time. Using current constituents for
/// historical backtests introduces survivorship bias.
///
/// # Arguments
///
/// * `index` - Index name (e.g., "SPX", "NDX")
/// * `symbols` - List of symbols being used as constituents
/// * `as_of_date` - Date for which constituents are being used
/// * `actual_constituents` - Historical constituents for validation
///
/// # Returns
///
/// `ValidationResult` with any discrepancies noted.
pub fn validate_universe_constituents(
    index: &str,
    symbols: &[String],
    as_of_date: NaiveDate,
    actual_constituents: &HashMap<String, NaiveDate>,
) -> ValidationResult {
    let mut result = ValidationResult::pass();

    for symbol in symbols {
        // Check if symbol was a constituent at as_of_date
        if let Some(added_date) = actual_constituents.get(symbol) {
            if as_of_date < *added_date {
                let warning = format!(
                    "{symbol} was not in {index} until {added_date} but used for {as_of_date}"
                );

                warn!(
                    symbol = %symbol,
                    index = %index,
                    added_date = %added_date,
                    as_of_date = %as_of_date,
                    "Using symbol before it was added to index"
                );

                result = result.with_warning(warning);
            }
        } else {
            // Symbol not found in historical constituents
            let warning =
                format!("{symbol} not found in historical {index} constituents for {as_of_date}");
            result = result.with_warning(warning);
        }
    }

    result
}

// ============================================
// Helper Functions
// ============================================

/// Parse a timestamp string to `DateTime<Utc>`.
fn parse_timestamp(timestamp: &str) -> Result<DateTime<Utc>, LookAheadError> {
    DateTime::parse_from_rfc3339(timestamp)
        .map(|dt| dt.with_timezone(&Utc))
        .or_else(|_| {
            // Try parsing as just a date
            NaiveDate::parse_from_str(timestamp, "%Y-%m-%d").map(|d| {
                d.and_hms_opt(0, 0, 0)
                    .map_or_else(Utc::now, |dt| dt.and_utc())
            })
        })
        .map_err(|e| LookAheadError::InvalidTimestamp {
            timestamp: timestamp.to_string(),
            reason: e.to_string(),
        })
}

/// Format a duration for human-readable output.
fn format_duration(duration: Duration) -> String {
    let total_seconds = duration.num_seconds();
    if total_seconds < 60 {
        format!("{total_seconds}s")
    } else if total_seconds < 3600 {
        format!("{}m", total_seconds / 60)
    } else if total_seconds < 86400 {
        format!("{}h {}m", total_seconds / 3600, (total_seconds % 3600) / 60)
    } else {
        format!(
            "{}d {}h",
            total_seconds / 86400,
            (total_seconds % 86400) / 3600
        )
    }
}

// ============================================
// Look-Ahead Bias Checker
// ============================================

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

/// Record of a data access during backtesting.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataAccessRecord {
    /// Data type accessed.
    pub data_type: String,
    /// Symbol (if applicable).
    pub symbol: Option<String>,
    /// Data timestamp.
    pub data_timestamp: String,
    /// Decision timestamp.
    pub decision_timestamp: String,
    /// Whether access was valid.
    pub valid: bool,
    /// Any warnings.
    pub warnings: Vec<String>,
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

        // Record the access
        let record = DataAccessRecord {
            data_type: data_type.to_string(),
            symbol: symbol.map(String::from),
            data_timestamp: data_timestamp.to_string(),
            decision_timestamp: decision_timestamp.to_string(),
            valid: result.valid,
            warnings: result.warnings.clone(),
        };

        self.access_log.push(record);

        // Update counters
        if !result.valid {
            self.violations_found += 1;
        }
        if result.has_warnings() {
            self.warnings_issued += result.warnings.len();
        }

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

        if !result.valid {
            self.violations_found += 1;
        }
        if result.has_warnings() {
            self.warnings_issued += result.warnings.len();
        }

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
}

/// Summary of look-ahead bias checking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LookAheadSummary {
    /// Total data accesses validated.
    pub total_accesses: usize,
    /// Number of valid accesses.
    pub valid_accesses: usize,
    /// Number of violations found.
    pub violations: usize,
    /// Number of warnings issued.
    pub warnings: usize,
}

impl std::fmt::Display for LookAheadSummary {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "Look-ahead check: {}/{} valid, {} violations, {} warnings",
            self.valid_accesses, self.total_accesses, self.violations, self.warnings
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_data_timestamp_valid() {
        let config = LookAheadConfig::default();
        let result = validate_data_timestamp(
            "2025-06-01T09:00:00Z",
            "2025-06-01T10:00:00Z",
            "candle",
            &config,
        );
        assert!(result.valid);
        assert!(result.errors.is_empty());
    }

    #[test]
    fn test_validate_data_timestamp_future_data() {
        let config = LookAheadConfig::default();
        let result = validate_data_timestamp(
            "2025-06-01T12:00:00Z",
            "2025-06-01T10:00:00Z",
            "candle",
            &config,
        );
        assert!(!result.valid);
        assert_eq!(result.errors.len(), 1);
        assert!(matches!(
            &result.errors[0],
            LookAheadError::FutureData { .. }
        ));
    }

    #[test]
    fn test_validate_data_timestamp_suspicious_proximity() {
        let config = LookAheadConfig {
            suspicious_proximity_hours: 1,
            ..Default::default()
        };
        let result = validate_data_timestamp(
            "2025-06-01T09:30:00Z",
            "2025-06-01T09:45:00Z",
            "earnings",
            &config,
        );
        assert!(result.valid);
        assert!(result.has_warnings());
    }

    #[test]
    fn test_check_earnings_availability_valid() {
        let Some(fiscal_quarter_end) = NaiveDate::from_ymd_opt(2025, 3, 31) else {
            panic!("valid fiscal quarter end date");
        };
        let release_timestamp = match DateTime::parse_from_rfc3339("2025-05-01T16:30:00Z") {
            Ok(dt) => dt.with_timezone(&Utc),
            Err(e) => panic!("valid release timestamp: {e}"),
        };
        let earnings = EarningsRelease {
            symbol: "AAPL".to_string(),
            fiscal_quarter_end,
            release_timestamp,
            release_timing: EarningsReleaseTiming::AfterMarketClose,
        };

        let result = check_earnings_availability(&earnings, "2025-05-02T09:30:00Z");
        assert!(result.valid);
    }

    #[test]
    fn test_check_earnings_availability_before_release() {
        let Some(fiscal_quarter_end) = NaiveDate::from_ymd_opt(2025, 3, 31) else {
            panic!("valid fiscal quarter end date");
        };
        let release_timestamp = match DateTime::parse_from_rfc3339("2025-05-01T16:30:00Z") {
            Ok(dt) => dt.with_timezone(&Utc),
            Err(e) => panic!("valid release timestamp: {e}"),
        };
        let earnings = EarningsRelease {
            symbol: "AAPL".to_string(),
            fiscal_quarter_end,
            release_timestamp,
            release_timing: EarningsReleaseTiming::AfterMarketClose,
        };

        let result = check_earnings_availability(&earnings, "2025-05-01T10:00:00Z");
        assert!(!result.valid);
        assert!(matches!(
            &result.errors[0],
            LookAheadError::EarningsNotReleased { .. }
        ));
    }

    #[test]
    fn test_check_fundamental_availability_valid() {
        let Some(period_end) = NaiveDate::from_ymd_opt(2025, 3, 31) else {
            panic!("valid period end date");
        };
        let available_timestamp = match DateTime::parse_from_rfc3339("2025-05-01T16:30:00Z") {
            Ok(dt) => dt.with_timezone(&Utc),
            Err(e) => panic!("valid available timestamp: {e}"),
        };
        let data = FundamentalDataAvailability {
            symbol: "AAPL".to_string(),
            metric: "revenue".to_string(),
            period_end,
            available_timestamp,
            is_original: true,
        };
        let config = LookAheadConfig::default();

        let result = check_fundamental_availability(&data, "2025-05-02T09:30:00Z", &config);
        assert!(result.valid);
    }

    #[test]
    fn test_check_fundamental_availability_before_publication() {
        let Some(period_end) = NaiveDate::from_ymd_opt(2025, 3, 31) else {
            panic!("valid period end date");
        };
        let available_timestamp = match DateTime::parse_from_rfc3339("2025-05-01T16:30:00Z") {
            Ok(dt) => dt.with_timezone(&Utc),
            Err(e) => panic!("valid available timestamp: {e}"),
        };
        let data = FundamentalDataAvailability {
            symbol: "AAPL".to_string(),
            metric: "revenue".to_string(),
            period_end,
            available_timestamp,
            is_original: true,
        };
        let config = LookAheadConfig::default();

        let result = check_fundamental_availability(&data, "2025-04-15T10:00:00Z", &config);
        assert!(!result.valid);
        assert!(matches!(
            &result.errors[0],
            LookAheadError::FundamentalNotAvailable { .. }
        ));
    }

    #[test]
    fn test_check_fundamental_availability_restated_warning() {
        let Some(period_end) = NaiveDate::from_ymd_opt(2025, 3, 31) else {
            panic!("valid period end date");
        };
        let available_timestamp = match DateTime::parse_from_rfc3339("2025-05-01T16:30:00Z") {
            Ok(dt) => dt.with_timezone(&Utc),
            Err(e) => panic!("valid available timestamp: {e}"),
        };
        let data = FundamentalDataAvailability {
            symbol: "AAPL".to_string(),
            metric: "revenue".to_string(),
            period_end,
            available_timestamp,
            is_original: false, // Restated
        };
        let config = LookAheadConfig {
            warn_on_revisions: true,
            ..Default::default()
        };

        let result = check_fundamental_availability(&data, "2025-05-02T09:30:00Z", &config);
        assert!(result.valid);
        assert!(result.has_warnings());
    }

    #[test]
    fn test_validate_universe_constituents() {
        let mut actual = HashMap::new();
        let Some(aapl_add_date) = NaiveDate::from_ymd_opt(2010, 1, 1) else {
            panic!("valid AAPL add date");
        };
        actual.insert("AAPL".to_string(), aapl_add_date);
        let Some(tsla_add_date) = NaiveDate::from_ymd_opt(2020, 12, 21) else {
            panic!("valid TSLA add date");
        };
        actual.insert("TSLA".to_string(), tsla_add_date);

        let symbols = vec!["AAPL".to_string(), "TSLA".to_string()];
        let Some(as_of) = NaiveDate::from_ymd_opt(2019, 1, 1) else {
            panic!("valid as_of date");
        };

        let result = validate_universe_constituents("SPX", &symbols, as_of, &actual);
        assert!(result.valid); // No errors, just warnings
        assert!(result.has_warnings()); // TSLA wasn't in SPX until 2020
    }

    #[test]
    fn test_look_ahead_checker() {
        let mut checker = LookAheadChecker::with_defaults();

        // Valid access
        let result = checker.validate_access(
            "candle",
            Some("AAPL"),
            "2025-06-01T09:00:00Z",
            "2025-06-01T10:00:00Z",
        );
        assert!(result.valid);

        // Invalid access (future data)
        let result = checker.validate_access(
            "earnings",
            Some("AAPL"),
            "2025-06-01T12:00:00Z",
            "2025-06-01T10:00:00Z",
        );
        assert!(!result.valid);

        // Check summary
        let summary = checker.summary();
        assert_eq!(summary.total_accesses, 2);
        assert_eq!(summary.valid_accesses, 1);
        assert_eq!(summary.violations, 1);
    }

    #[test]
    fn test_look_ahead_error_display() {
        let error = LookAheadError::FutureData {
            data_timestamp: "2025-06-01T12:00:00Z".to_string(),
            decision_timestamp: "2025-06-01T10:00:00Z".to_string(),
            data_type: "candle".to_string(),
        };
        let display = format!("{error}");
        assert!(display.contains("FUTURE_DATA"));
        assert!(display.contains("12:00:00"));
    }

    #[test]
    fn test_format_duration() {
        assert_eq!(format_duration(Duration::seconds(30)), "30s");
        assert_eq!(format_duration(Duration::minutes(5)), "5m");
        assert_eq!(format_duration(Duration::hours(2)), "2h 0m");
        assert_eq!(format_duration(Duration::days(1)), "1d 0h");
    }

    #[test]
    fn test_look_ahead_summary_display() {
        let summary = LookAheadSummary {
            total_accesses: 100,
            valid_accesses: 98,
            violations: 2,
            warnings: 5,
        };
        let display = format!("{summary}");
        assert!(display.contains("98/100"));
        assert!(display.contains("2 violations"));
        assert!(display.contains("5 warnings"));
    }

    #[test]
    fn test_validation_result_chaining() {
        let result = ValidationResult::pass()
            .with_warning("Warning 1")
            .with_warning("Warning 2");
        assert!(result.valid);
        assert_eq!(result.warnings.len(), 2);
    }

    #[test]
    fn test_parse_date_only_timestamp() {
        let config = LookAheadConfig::default();
        let result = validate_data_timestamp("2025-06-01", "2025-06-02", "candle", &config);
        assert!(result.valid);
    }
}
