//! Order purpose for determining timeout policies.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Order purpose for timeout policy selection.
///
/// Different order types have different urgency levels:
/// - Entry orders can wait longer for better fills
/// - Stop-loss orders need immediate execution
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderPurpose {
    /// Entry order (opening a position).
    Entry,
    /// Exit order (closing a position for profit/loss).
    Exit,
    /// Stop-loss order (protective exit).
    StopLoss,
    /// Take-profit order.
    TakeProfit,
    /// Bracket leg (OCO-attached order).
    BracketLeg,
    /// Scale-in order (adding to position).
    ScaleIn,
    /// Scale-out order (partial exit).
    ScaleOut,
}

impl OrderPurpose {
    /// Returns true if this is an entry-type order.
    #[must_use]
    pub const fn is_entry(&self) -> bool {
        matches!(self, Self::Entry | Self::ScaleIn)
    }

    /// Returns true if this is an exit-type order.
    #[must_use]
    pub const fn is_exit(&self) -> bool {
        matches!(
            self,
            Self::Exit | Self::StopLoss | Self::TakeProfit | Self::ScaleOut | Self::BracketLeg
        )
    }

    /// Returns true if this is a protective order (urgent execution).
    #[must_use]
    pub const fn is_protective(&self) -> bool {
        matches!(self, Self::StopLoss)
    }

    /// Returns the relative urgency level (1-10, higher = more urgent).
    #[must_use]
    pub const fn urgency_level(&self) -> u8 {
        match self {
            Self::StopLoss => 10,  // Maximum urgency
            Self::TakeProfit => 7, // High urgency
            Self::Exit => 6,       // Medium-high urgency
            Self::BracketLeg => 5, // Medium urgency
            Self::ScaleOut => 4,   // Medium-low urgency
            Self::Entry => 2,      // Low urgency
            Self::ScaleIn => 1,    // Lowest urgency
        }
    }
}

impl Default for OrderPurpose {
    fn default() -> Self {
        Self::Entry
    }
}

impl fmt::Display for OrderPurpose {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Entry => write!(f, "ENTRY"),
            Self::Exit => write!(f, "EXIT"),
            Self::StopLoss => write!(f, "STOP_LOSS"),
            Self::TakeProfit => write!(f, "TAKE_PROFIT"),
            Self::BracketLeg => write!(f, "BRACKET_LEG"),
            Self::ScaleIn => write!(f, "SCALE_IN"),
            Self::ScaleOut => write!(f, "SCALE_OUT"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn order_purpose_is_entry() {
        assert!(OrderPurpose::Entry.is_entry());
        assert!(OrderPurpose::ScaleIn.is_entry());
        assert!(!OrderPurpose::Exit.is_entry());
        assert!(!OrderPurpose::StopLoss.is_entry());
    }

    #[test]
    fn order_purpose_is_exit() {
        assert!(!OrderPurpose::Entry.is_exit());
        assert!(OrderPurpose::Exit.is_exit());
        assert!(OrderPurpose::StopLoss.is_exit());
        assert!(OrderPurpose::TakeProfit.is_exit());
        assert!(OrderPurpose::ScaleOut.is_exit());
    }

    #[test]
    fn order_purpose_is_protective() {
        assert!(!OrderPurpose::Entry.is_protective());
        assert!(OrderPurpose::StopLoss.is_protective());
        assert!(!OrderPurpose::TakeProfit.is_protective());
    }

    #[test]
    fn order_purpose_urgency() {
        assert_eq!(OrderPurpose::StopLoss.urgency_level(), 10);
        assert!(OrderPurpose::StopLoss.urgency_level() > OrderPurpose::Entry.urgency_level());
    }

    #[test]
    fn order_purpose_default() {
        assert_eq!(OrderPurpose::default(), OrderPurpose::Entry);
    }

    #[test]
    fn order_purpose_display() {
        assert_eq!(format!("{}", OrderPurpose::StopLoss), "STOP_LOSS");
    }

    #[test]
    fn order_purpose_serde() {
        let json = serde_json::to_string(&OrderPurpose::TakeProfit).unwrap();
        assert_eq!(json, "\"TAKE_PROFIT\"");

        let parsed: OrderPurpose = serde_json::from_str("\"BRACKET_LEG\"").unwrap();
        assert_eq!(parsed, OrderPurpose::BracketLeg);
    }

    #[test]
    fn order_purpose_display_all() {
        assert_eq!(format!("{}", OrderPurpose::Entry), "ENTRY");
        assert_eq!(format!("{}", OrderPurpose::Exit), "EXIT");
        assert_eq!(format!("{}", OrderPurpose::TakeProfit), "TAKE_PROFIT");
        assert_eq!(format!("{}", OrderPurpose::BracketLeg), "BRACKET_LEG");
        assert_eq!(format!("{}", OrderPurpose::ScaleIn), "SCALE_IN");
        assert_eq!(format!("{}", OrderPurpose::ScaleOut), "SCALE_OUT");
    }

    #[test]
    fn order_purpose_urgency_all() {
        assert_eq!(OrderPurpose::StopLoss.urgency_level(), 10);
        assert_eq!(OrderPurpose::TakeProfit.urgency_level(), 7);
        assert_eq!(OrderPurpose::Exit.urgency_level(), 6);
        assert_eq!(OrderPurpose::BracketLeg.urgency_level(), 5);
        assert_eq!(OrderPurpose::ScaleOut.urgency_level(), 4);
        assert_eq!(OrderPurpose::Entry.urgency_level(), 2);
        assert_eq!(OrderPurpose::ScaleIn.urgency_level(), 1);
    }

    #[test]
    fn order_purpose_bracket_leg_is_exit() {
        assert!(OrderPurpose::BracketLeg.is_exit());
    }

    #[test]
    fn order_purpose_scale_in_not_exit() {
        assert!(!OrderPurpose::ScaleIn.is_exit());
    }
}
