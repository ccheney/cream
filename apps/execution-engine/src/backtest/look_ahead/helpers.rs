//! Helper functions for look-ahead bias detection.

use chrono::{DateTime, Duration, NaiveDate, Utc};

use super::types::LookAheadError;

/// Parse a timestamp string to `DateTime<Utc>`.
pub fn parse_timestamp(timestamp: &str) -> Result<DateTime<Utc>, LookAheadError> {
    DateTime::parse_from_rfc3339(timestamp)
        .map(|dt| dt.with_timezone(&Utc))
        .or_else(|_| {
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
pub fn format_duration(duration: Duration) -> String {
    let total_seconds = duration.num_seconds();

    if total_seconds < 60 {
        return format!("{total_seconds}s");
    }

    if total_seconds < 3600 {
        return format!("{}m", total_seconds / 60);
    }

    if total_seconds < 86400 {
        return format!("{}h {}m", total_seconds / 3600, (total_seconds % 3600) / 60);
    }

    format!(
        "{}d {}h",
        total_seconds / 86400,
        (total_seconds % 86400) / 3600
    )
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;

    #[test]
    fn test_format_duration_seconds() {
        assert_eq!(format_duration(Duration::seconds(30)), "30s");
    }

    #[test]
    fn test_format_duration_minutes() {
        assert_eq!(format_duration(Duration::minutes(5)), "5m");
    }

    #[test]
    fn test_format_duration_hours() {
        assert_eq!(format_duration(Duration::hours(2)), "2h 0m");
    }

    #[test]
    fn test_format_duration_days() {
        assert_eq!(format_duration(Duration::days(1)), "1d 0h");
    }

    #[test]
    fn test_parse_timestamp_rfc3339() {
        let result = parse_timestamp("2025-06-01T10:00:00Z");
        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_timestamp_date_only() {
        let result = parse_timestamp("2025-06-01");
        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_timestamp_invalid() {
        let result = parse_timestamp("not-a-date");
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            LookAheadError::InvalidTimestamp { .. }
        ));
    }
}
