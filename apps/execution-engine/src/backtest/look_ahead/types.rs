//! Type definitions for look-ahead bias detection.

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;

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
