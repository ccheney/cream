//! Tactic Type Value Object

use serde::{Deserialize, Serialize};
use std::fmt;

/// Available execution tactics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TacticType {
    /// Post limit order at or inside NBBO to capture maker rebates.
    PassiveLimit,
    /// Cross the spread immediately with a limit order.
    AggressiveLimit,
    /// Break large orders into smaller visible chunks (slice and hide).
    Iceberg,
    /// Distribute order evenly across a time window (time-weighted).
    Twap,
    /// Participate proportionally to market volume (volume-weighted).
    Vwap,
    /// Dynamically switch between passive and aggressive based on conditions.
    Adaptive,
}

impl fmt::Display for TacticType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::PassiveLimit => write!(f, "PASSIVE_LIMIT"),
            Self::AggressiveLimit => write!(f, "AGGRESSIVE_LIMIT"),
            Self::Iceberg => write!(f, "ICEBERG"),
            Self::Twap => write!(f, "TWAP"),
            Self::Vwap => write!(f, "VWAP"),
            Self::Adaptive => write!(f, "ADAPTIVE"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tactic_type_display() {
        assert_eq!(TacticType::PassiveLimit.to_string(), "PASSIVE_LIMIT");
        assert_eq!(TacticType::AggressiveLimit.to_string(), "AGGRESSIVE_LIMIT");
        assert_eq!(TacticType::Iceberg.to_string(), "ICEBERG");
        assert_eq!(TacticType::Twap.to_string(), "TWAP");
        assert_eq!(TacticType::Vwap.to_string(), "VWAP");
        assert_eq!(TacticType::Adaptive.to_string(), "ADAPTIVE");
    }

    #[test]
    fn tactic_type_serde() {
        let tactic = TacticType::PassiveLimit;
        let json = serde_json::to_string(&tactic).unwrap();
        assert_eq!(json, "\"PASSIVE_LIMIT\"");

        let parsed: TacticType = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, TacticType::PassiveLimit);
    }

    #[test]
    fn tactic_type_equality() {
        assert_eq!(TacticType::Twap, TacticType::Twap);
        assert_ne!(TacticType::Twap, TacticType::Vwap);
    }

    #[test]
    fn tactic_type_clone() {
        let tactic = TacticType::Adaptive;
        let cloned = tactic;
        assert_eq!(tactic, cloned);
    }
}
