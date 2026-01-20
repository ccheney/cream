//! Time in force for orders.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Time in force specifying order validity duration.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TimeInForce {
    /// Valid for current trading day only.
    Day,
    /// Good-til-canceled (broker-specific limit: typically 30-90 days).
    Gtc,
    /// Immediate-or-cancel (fill immediately, cancel remainder).
    Ioc,
    /// Fill-or-kill (all or nothing, immediate execution required).
    Fok,
    /// Execute at market open only.
    Opg,
    /// Execute at market close only.
    Cls,
}

impl TimeInForce {
    /// Returns true if the order can persist across trading sessions.
    #[must_use]
    pub const fn is_persistent(&self) -> bool {
        matches!(self, Self::Gtc)
    }

    /// Returns true if the order requires immediate execution.
    #[must_use]
    pub const fn is_immediate(&self) -> bool {
        matches!(self, Self::Ioc | Self::Fok)
    }

    /// Returns true if the order is session-specific (open/close).
    #[must_use]
    pub const fn is_session_specific(&self) -> bool {
        matches!(self, Self::Opg | Self::Cls)
    }
}

impl Default for TimeInForce {
    fn default() -> Self {
        Self::Day
    }
}

impl fmt::Display for TimeInForce {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Day => write!(f, "DAY"),
            Self::Gtc => write!(f, "GTC"),
            Self::Ioc => write!(f, "IOC"),
            Self::Fok => write!(f, "FOK"),
            Self::Opg => write!(f, "OPG"),
            Self::Cls => write!(f, "CLS"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn time_in_force_is_persistent() {
        assert!(!TimeInForce::Day.is_persistent());
        assert!(TimeInForce::Gtc.is_persistent());
        assert!(!TimeInForce::Ioc.is_persistent());
    }

    #[test]
    fn time_in_force_is_immediate() {
        assert!(!TimeInForce::Day.is_immediate());
        assert!(TimeInForce::Ioc.is_immediate());
        assert!(TimeInForce::Fok.is_immediate());
    }

    #[test]
    fn time_in_force_is_session_specific() {
        assert!(!TimeInForce::Day.is_session_specific());
        assert!(TimeInForce::Opg.is_session_specific());
        assert!(TimeInForce::Cls.is_session_specific());
    }

    #[test]
    fn time_in_force_default() {
        assert_eq!(TimeInForce::default(), TimeInForce::Day);
    }

    #[test]
    fn time_in_force_display() {
        assert_eq!(format!("{}", TimeInForce::Gtc), "GTC");
        assert_eq!(format!("{}", TimeInForce::Fok), "FOK");
    }

    #[test]
    fn time_in_force_serde() {
        let json = serde_json::to_string(&TimeInForce::Gtc).unwrap();
        assert_eq!(json, "\"GTC\"");

        let parsed: TimeInForce = serde_json::from_str("\"IOC\"").unwrap();
        assert_eq!(parsed, TimeInForce::Ioc);
    }

    #[test]
    fn time_in_force_display_all() {
        assert_eq!(format!("{}", TimeInForce::Day), "DAY");
        assert_eq!(format!("{}", TimeInForce::Ioc), "IOC");
        assert_eq!(format!("{}", TimeInForce::Opg), "OPG");
        assert_eq!(format!("{}", TimeInForce::Cls), "CLS");
    }

    #[test]
    fn time_in_force_gtc_not_immediate() {
        assert!(!TimeInForce::Gtc.is_immediate());
    }

    #[test]
    fn time_in_force_fok_not_session_specific() {
        assert!(!TimeInForce::Fok.is_session_specific());
    }
}
