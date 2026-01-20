//! Order status in the lifecycle.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Order status following FIX protocol semantics.
///
/// FIX Protocol Order Status (Tag 39):
/// - `0` = New
/// - `1` = Partially filled
/// - `2` = Filled
/// - `4` = Canceled
/// - `6` = Pending Cancel
/// - `8` = Rejected
/// - `A` = Pending New
/// - `C` = Expired
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderStatus {
    /// Order created but not yet submitted to broker.
    New,
    /// Order submitted, awaiting broker acknowledgment.
    PendingNew,
    /// Order accepted by broker.
    Accepted,
    /// Order partially filled.
    PartiallyFilled,
    /// Order completely filled.
    Filled,
    /// Cancel request submitted, awaiting confirmation.
    PendingCancel,
    /// Order canceled.
    Canceled,
    /// Order rejected by broker.
    Rejected,
    /// Order expired (e.g., Day order at market close).
    Expired,
}

impl OrderStatus {
    /// Returns true if the order is in a terminal state.
    #[must_use]
    pub const fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Filled | Self::Canceled | Self::Rejected | Self::Expired
        )
    }

    /// Returns true if the order is still active (can be filled or canceled).
    #[must_use]
    pub const fn is_active(&self) -> bool {
        matches!(
            self,
            Self::New | Self::PendingNew | Self::Accepted | Self::PartiallyFilled
        )
    }

    /// Returns true if the order can be canceled.
    #[must_use]
    pub const fn is_cancelable(&self) -> bool {
        matches!(
            self,
            Self::New | Self::PendingNew | Self::Accepted | Self::PartiallyFilled
        )
    }

    /// Returns true if the order can receive fills.
    #[must_use]
    pub const fn can_fill(&self) -> bool {
        matches!(self, Self::Accepted | Self::PartiallyFilled)
    }

    /// Returns true if this is a pending state.
    #[must_use]
    pub const fn is_pending(&self) -> bool {
        matches!(self, Self::PendingNew | Self::PendingCancel)
    }

    /// Get the FIX protocol tag 39 value.
    #[must_use]
    pub const fn fix_tag_value(&self) -> char {
        match self {
            Self::New => '0',
            Self::PartiallyFilled => '1',
            Self::Filled => '2',
            Self::Canceled => '4',
            Self::PendingCancel => '6',
            Self::Rejected => '8',
            Self::PendingNew => 'A',
            Self::Expired => 'C',
            Self::Accepted => '1', // Same as New in FIX
        }
    }
}

impl fmt::Display for OrderStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::New => write!(f, "NEW"),
            Self::PendingNew => write!(f, "PENDING_NEW"),
            Self::Accepted => write!(f, "ACCEPTED"),
            Self::PartiallyFilled => write!(f, "PARTIALLY_FILLED"),
            Self::Filled => write!(f, "FILLED"),
            Self::PendingCancel => write!(f, "PENDING_CANCEL"),
            Self::Canceled => write!(f, "CANCELED"),
            Self::Rejected => write!(f, "REJECTED"),
            Self::Expired => write!(f, "EXPIRED"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn order_status_is_terminal() {
        assert!(!OrderStatus::New.is_terminal());
        assert!(!OrderStatus::Accepted.is_terminal());
        assert!(!OrderStatus::PartiallyFilled.is_terminal());
        assert!(OrderStatus::Filled.is_terminal());
        assert!(OrderStatus::Canceled.is_terminal());
        assert!(OrderStatus::Rejected.is_terminal());
        assert!(OrderStatus::Expired.is_terminal());
    }

    #[test]
    fn order_status_is_active() {
        assert!(OrderStatus::New.is_active());
        assert!(OrderStatus::PendingNew.is_active());
        assert!(OrderStatus::Accepted.is_active());
        assert!(OrderStatus::PartiallyFilled.is_active());
        assert!(!OrderStatus::Filled.is_active());
        assert!(!OrderStatus::Canceled.is_active());
    }

    #[test]
    fn order_status_is_cancelable() {
        assert!(OrderStatus::New.is_cancelable());
        assert!(OrderStatus::Accepted.is_cancelable());
        assert!(OrderStatus::PartiallyFilled.is_cancelable());
        assert!(!OrderStatus::Filled.is_cancelable());
        assert!(!OrderStatus::Canceled.is_cancelable());
    }

    #[test]
    fn order_status_can_fill() {
        assert!(!OrderStatus::New.can_fill());
        assert!(OrderStatus::Accepted.can_fill());
        assert!(OrderStatus::PartiallyFilled.can_fill());
        assert!(!OrderStatus::Filled.can_fill());
    }

    #[test]
    fn order_status_is_pending() {
        assert!(!OrderStatus::New.is_pending());
        assert!(OrderStatus::PendingNew.is_pending());
        assert!(OrderStatus::PendingCancel.is_pending());
        assert!(!OrderStatus::Accepted.is_pending());
    }

    #[test]
    fn order_status_fix_tag_value() {
        assert_eq!(OrderStatus::New.fix_tag_value(), '0');
        assert_eq!(OrderStatus::PartiallyFilled.fix_tag_value(), '1');
        assert_eq!(OrderStatus::Filled.fix_tag_value(), '2');
        assert_eq!(OrderStatus::Canceled.fix_tag_value(), '4');
    }

    #[test]
    fn order_status_display() {
        assert_eq!(
            format!("{}", OrderStatus::PartiallyFilled),
            "PARTIALLY_FILLED"
        );
        assert_eq!(format!("{}", OrderStatus::PendingCancel), "PENDING_CANCEL");
    }

    #[test]
    fn order_status_serde() {
        let json = serde_json::to_string(&OrderStatus::PartiallyFilled).unwrap();
        assert_eq!(json, "\"PARTIALLY_FILLED\"");

        let parsed: OrderStatus = serde_json::from_str("\"FILLED\"").unwrap();
        assert_eq!(parsed, OrderStatus::Filled);
    }

    #[test]
    fn order_status_display_all() {
        assert_eq!(format!("{}", OrderStatus::New), "NEW");
        assert_eq!(format!("{}", OrderStatus::PendingNew), "PENDING_NEW");
        assert_eq!(format!("{}", OrderStatus::Accepted), "ACCEPTED");
        assert_eq!(format!("{}", OrderStatus::Filled), "FILLED");
        assert_eq!(format!("{}", OrderStatus::Canceled), "CANCELED");
        assert_eq!(format!("{}", OrderStatus::Rejected), "REJECTED");
        assert_eq!(format!("{}", OrderStatus::Expired), "EXPIRED");
    }

    #[test]
    fn order_status_fix_tag_value_all() {
        assert_eq!(OrderStatus::PendingCancel.fix_tag_value(), '6');
        assert_eq!(OrderStatus::Rejected.fix_tag_value(), '8');
        assert_eq!(OrderStatus::PendingNew.fix_tag_value(), 'A');
        assert_eq!(OrderStatus::Expired.fix_tag_value(), 'C');
        assert_eq!(OrderStatus::Accepted.fix_tag_value(), '1');
    }

    #[test]
    fn order_status_pending_cancel_not_cancelable() {
        assert!(!OrderStatus::PendingCancel.is_cancelable());
    }

    #[test]
    fn order_status_rejected_not_active() {
        assert!(!OrderStatus::Rejected.is_active());
    }

    #[test]
    fn order_status_expired_not_active() {
        assert!(!OrderStatus::Expired.is_active());
    }
}
