//! Spread Type Value Object

use serde::{Deserialize, Serialize};
use std::fmt;

/// Type of options spread.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpreadType {
    /// Single option (not a spread).
    Single,
    /// Vertical spread (same expiry, different strikes).
    Vertical,
    /// Calendar spread (same strike, different expiries).
    Calendar,
    /// Diagonal spread (different strikes and expiries).
    Diagonal,
    /// Butterfly (3 strikes: long wings, short body).
    Butterfly,
    /// Iron Condor (4 strikes: OTM put spread + OTM call spread).
    IronCondor,
    /// Iron Butterfly (ATM strikes converge).
    IronButterfly,
    /// Straddle (ATM call + ATM put, same strike).
    Straddle,
    /// Strangle (OTM call + OTM put, different strikes).
    Strangle,
    /// Custom/unclassified spread.
    Custom,
}

impl Default for SpreadType {
    fn default() -> Self {
        Self::Single
    }
}

impl fmt::Display for SpreadType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Single => write!(f, "Single"),
            Self::Vertical => write!(f, "Vertical"),
            Self::Calendar => write!(f, "Calendar"),
            Self::Diagonal => write!(f, "Diagonal"),
            Self::Butterfly => write!(f, "Butterfly"),
            Self::IronCondor => write!(f, "Iron Condor"),
            Self::IronButterfly => write!(f, "Iron Butterfly"),
            Self::Straddle => write!(f, "Straddle"),
            Self::Strangle => write!(f, "Strangle"),
            Self::Custom => write!(f, "Custom"),
        }
    }
}

impl SpreadType {
    /// Get the typical number of legs for this spread type.
    #[must_use]
    pub const fn typical_leg_count(&self) -> usize {
        match self {
            Self::Single => 1,
            Self::Vertical | Self::Calendar | Self::Diagonal | Self::Straddle | Self::Strangle => 2,
            Self::Butterfly => 3,
            Self::IronCondor | Self::IronButterfly => 4,
            Self::Custom => 0, // Variable
        }
    }

    /// Check if this is a defined-risk spread.
    #[must_use]
    pub const fn is_defined_risk(&self) -> bool {
        matches!(
            self,
            Self::Vertical | Self::Butterfly | Self::IronCondor | Self::IronButterfly
        )
    }

    /// Check if this spread involves multiple expiration dates.
    #[must_use]
    pub const fn is_multi_expiry(&self) -> bool {
        matches!(self, Self::Calendar | Self::Diagonal)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spread_type_default() {
        assert_eq!(SpreadType::default(), SpreadType::Single);
    }

    #[test]
    fn spread_type_display() {
        assert_eq!(SpreadType::Single.to_string(), "Single");
        assert_eq!(SpreadType::Vertical.to_string(), "Vertical");
        assert_eq!(SpreadType::IronCondor.to_string(), "Iron Condor");
    }

    #[test]
    fn spread_type_typical_leg_count() {
        assert_eq!(SpreadType::Single.typical_leg_count(), 1);
        assert_eq!(SpreadType::Vertical.typical_leg_count(), 2);
        assert_eq!(SpreadType::Butterfly.typical_leg_count(), 3);
        assert_eq!(SpreadType::IronCondor.typical_leg_count(), 4);
    }

    #[test]
    fn spread_type_is_defined_risk() {
        assert!(!SpreadType::Single.is_defined_risk());
        assert!(SpreadType::Vertical.is_defined_risk());
        assert!(SpreadType::IronCondor.is_defined_risk());
        assert!(!SpreadType::Straddle.is_defined_risk());
    }

    #[test]
    fn spread_type_is_multi_expiry() {
        assert!(!SpreadType::Vertical.is_multi_expiry());
        assert!(SpreadType::Calendar.is_multi_expiry());
        assert!(SpreadType::Diagonal.is_multi_expiry());
    }

    #[test]
    fn spread_type_serde() {
        let spread = SpreadType::IronCondor;
        let json = serde_json::to_string(&spread).unwrap();
        assert_eq!(json, "\"iron_condor\"");

        let parsed: SpreadType = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, SpreadType::IronCondor);
    }
}
