//! Timestamp value object for temporal data.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt;

/// A UTC timestamp for domain events and order tracking.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Timestamp(DateTime<Utc>);

impl Timestamp {
    /// Create a new Timestamp from a DateTime<Utc>.
    #[must_use]
    pub const fn new(dt: DateTime<Utc>) -> Self {
        Self(dt)
    }

    /// Get the current timestamp.
    #[must_use]
    pub fn now() -> Self {
        Self(Utc::now())
    }

    /// Parse from an ISO 8601 string.
    ///
    /// # Errors
    ///
    /// Returns error if the string is not a valid ISO 8601 timestamp.
    pub fn parse(s: &str) -> Result<Self, chrono::ParseError> {
        let dt = DateTime::parse_from_rfc3339(s)?;
        Ok(Self(dt.with_timezone(&Utc)))
    }

    /// Get the inner DateTime<Utc>.
    #[must_use]
    pub const fn as_datetime(&self) -> DateTime<Utc> {
        self.0
    }

    /// Format as ISO 8601 / RFC 3339 string.
    #[must_use]
    pub fn to_rfc3339(&self) -> String {
        self.0.to_rfc3339()
    }

    /// Get the Unix timestamp in seconds.
    #[must_use]
    pub fn unix_seconds(&self) -> i64 {
        self.0.timestamp()
    }

    /// Get the Unix timestamp in milliseconds.
    #[must_use]
    pub fn unix_millis(&self) -> i64 {
        self.0.timestamp_millis()
    }

    /// Calculate duration since another timestamp.
    #[must_use]
    pub fn duration_since(&self, other: Self) -> chrono::Duration {
        self.0 - other.0
    }
}

impl Default for Timestamp {
    fn default() -> Self {
        Self::now()
    }
}

impl fmt::Display for Timestamp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0.to_rfc3339())
    }
}

impl From<DateTime<Utc>> for Timestamp {
    fn from(dt: DateTime<Utc>) -> Self {
        Self(dt)
    }
}

impl From<Timestamp> for DateTime<Utc> {
    fn from(ts: Timestamp) -> Self {
        ts.0
    }
}

impl From<Timestamp> for String {
    fn from(ts: Timestamp) -> Self {
        ts.to_rfc3339()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timestamp_now() {
        let ts = Timestamp::now();
        assert!(ts.unix_seconds() > 0);
    }

    #[test]
    fn timestamp_parse() {
        let ts = Timestamp::parse("2026-01-19T12:00:00Z").unwrap();
        assert_eq!(ts.to_rfc3339(), "2026-01-19T12:00:00+00:00");
    }

    #[test]
    fn timestamp_parse_invalid() {
        assert!(Timestamp::parse("not-a-date").is_err());
    }

    #[test]
    fn timestamp_display() {
        let ts = Timestamp::parse("2026-01-19T12:00:00Z").unwrap();
        let display = format!("{ts}");
        assert!(display.contains("2026-01-19"));
    }

    #[test]
    fn timestamp_ordering() {
        let ts1 = Timestamp::parse("2026-01-19T12:00:00Z").unwrap();
        let ts2 = Timestamp::parse("2026-01-19T13:00:00Z").unwrap();

        assert!(ts1 < ts2);
        assert!(ts2 > ts1);
    }

    #[test]
    fn timestamp_unix_seconds() {
        let ts = Timestamp::parse("2026-01-19T12:00:00Z").unwrap();
        assert_eq!(ts.unix_seconds(), 1768824000);
    }

    #[test]
    fn timestamp_duration_since() {
        let ts1 = Timestamp::parse("2026-01-19T12:00:00Z").unwrap();
        let ts2 = Timestamp::parse("2026-01-19T13:00:00Z").unwrap();

        let dur = ts2.duration_since(ts1);
        assert_eq!(dur.num_hours(), 1);
    }

    #[test]
    fn timestamp_from_datetime() {
        let dt = Utc::now();
        let ts: Timestamp = dt.into();
        assert_eq!(ts.as_datetime(), dt);
    }

    #[test]
    fn datetime_from_timestamp() {
        let ts = Timestamp::now();
        let dt: DateTime<Utc> = ts.into();
        assert_eq!(dt, ts.as_datetime());
    }

    #[test]
    fn string_from_timestamp() {
        let ts = Timestamp::parse("2026-01-19T12:00:00Z").unwrap();
        let s: String = ts.into();
        assert!(s.contains("2026-01-19"));
    }

    #[test]
    fn timestamp_serde_roundtrip() {
        let ts = Timestamp::parse("2026-01-19T12:00:00Z").unwrap();
        let json = serde_json::to_string(&ts).unwrap();
        let parsed: Timestamp = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, ts);
    }
}
