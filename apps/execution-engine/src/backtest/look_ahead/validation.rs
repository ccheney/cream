//! Core validation functions for look-ahead bias detection.

use std::collections::HashMap;

use chrono::{Duration, NaiveDate};
use tracing::{debug, warn};

use super::helpers::{format_duration, parse_timestamp};
use super::types::{
    EarningsRelease, FundamentalDataAvailability, LookAheadConfig, LookAheadError, ValidationResult,
};

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
#[allow(clippy::implicit_hasher)]
pub fn validate_universe_constituents(
    index: &str,
    symbols: &[String],
    as_of_date: NaiveDate,
    actual_constituents: &HashMap<String, NaiveDate>,
) -> ValidationResult {
    let mut result = ValidationResult::pass();

    for symbol in symbols {
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
            let warning =
                format!("{symbol} not found in historical {index} constituents for {as_of_date}");
            result = result.with_warning(warning);
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backtest::look_ahead::types::EarningsReleaseTiming;
    use chrono::Utc;

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
        let release_timestamp = match chrono::DateTime::parse_from_rfc3339("2025-05-01T16:30:00Z") {
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
        let release_timestamp = match chrono::DateTime::parse_from_rfc3339("2025-05-01T16:30:00Z") {
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
        let available_timestamp = match chrono::DateTime::parse_from_rfc3339("2025-05-01T16:30:00Z")
        {
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
        let available_timestamp = match chrono::DateTime::parse_from_rfc3339("2025-05-01T16:30:00Z")
        {
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
        let available_timestamp = match chrono::DateTime::parse_from_rfc3339("2025-05-01T16:30:00Z")
        {
            Ok(dt) => dt.with_timezone(&Utc),
            Err(e) => panic!("valid available timestamp: {e}"),
        };
        let data = FundamentalDataAvailability {
            symbol: "AAPL".to_string(),
            metric: "revenue".to_string(),
            period_end,
            available_timestamp,
            is_original: false,
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
        assert!(result.valid);
        assert!(result.has_warnings());
    }

    #[test]
    fn test_parse_date_only_timestamp() {
        let config = LookAheadConfig::default();
        let result = validate_data_timestamp("2025-06-01", "2025-06-02", "candle", &config);
        assert!(result.valid);
    }
}
