//! Orphaned order types for reconciliation.
//!
//! Types for representing and resolving orphaned orders discovered
//! during broker state reconciliation.

use serde::{Deserialize, Serialize};

/// Type of orphaned order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OrphanType {
    /// Broker has order we don't know about.
    UnknownInBroker,
    /// Local has order broker doesn't.
    MissingInBroker,
    /// Both exist but status disagrees.
    StateMismatch,
    /// Old order from previous session still active.
    Zombie,
}

impl std::fmt::Display for OrphanType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnknownInBroker => write!(f, "UNKNOWN_IN_BROKER"),
            Self::MissingInBroker => write!(f, "MISSING_IN_BROKER"),
            Self::StateMismatch => write!(f, "STATE_MISMATCH"),
            Self::Zombie => write!(f, "ZOMBIE"),
        }
    }
}

/// An orphaned order detected during reconciliation.
#[derive(Debug, Clone, Serialize)]
pub struct OrphanedOrder {
    /// Type of orphan.
    pub orphan_type: OrphanType,
    /// Order ID (local or broker).
    pub order_id: String,
    /// Broker order ID if available.
    pub broker_order_id: Option<String>,
    /// Symbol/instrument.
    pub symbol: String,
    /// Local status if available.
    pub local_status: Option<String>,
    /// Broker status if available.
    pub broker_status: Option<String>,
    /// Order age in seconds.
    pub age_secs: u64,
    /// Detection timestamp.
    pub detected_at: String,
}

/// Resolution action for orphaned order.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OrphanResolution {
    /// Cancel the order at broker.
    Cancel,
    /// Adopt the order into local state.
    Adopt,
    /// Sync local state from broker.
    SyncFromBroker,
    /// Mark as failed in local state.
    MarkFailed,
    /// Ignore (order is within protection window).
    Ignore,
}

impl std::fmt::Display for OrphanResolution {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Cancel => write!(f, "CANCEL"),
            Self::Adopt => write!(f, "ADOPT"),
            Self::SyncFromBroker => write!(f, "SYNC_FROM_BROKER"),
            Self::MarkFailed => write!(f, "MARK_FAILED"),
            Self::Ignore => write!(f, "IGNORE"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_orphan_type_display() {
        assert_eq!(
            format!("{}", OrphanType::UnknownInBroker),
            "UNKNOWN_IN_BROKER"
        );
        assert_eq!(
            format!("{}", OrphanType::MissingInBroker),
            "MISSING_IN_BROKER"
        );
        assert_eq!(format!("{}", OrphanType::StateMismatch), "STATE_MISMATCH");
        assert_eq!(format!("{}", OrphanType::Zombie), "ZOMBIE");
    }

    #[test]
    fn test_orphan_resolution_display() {
        assert_eq!(format!("{}", OrphanResolution::Cancel), "CANCEL");
        assert_eq!(format!("{}", OrphanResolution::Adopt), "ADOPT");
        assert_eq!(
            format!("{}", OrphanResolution::SyncFromBroker),
            "SYNC_FROM_BROKER"
        );
        assert_eq!(format!("{}", OrphanResolution::MarkFailed), "MARK_FAILED");
        assert_eq!(format!("{}", OrphanResolution::Ignore), "IGNORE");
    }

    #[test]
    fn test_orphaned_order_creation() {
        let orphan = OrphanedOrder {
            orphan_type: OrphanType::UnknownInBroker,
            order_id: "broker-123".to_string(),
            broker_order_id: Some("broker-123".to_string()),
            symbol: "AAPL".to_string(),
            local_status: None,
            broker_status: Some("accepted".to_string()),
            age_secs: 120,
            detected_at: "2024-01-01T00:00:00Z".to_string(),
        };

        assert_eq!(orphan.orphan_type, OrphanType::UnknownInBroker);
        assert_eq!(orphan.order_id, "broker-123");
        assert_eq!(orphan.symbol, "AAPL");
        assert!(orphan.local_status.is_none());
        assert!(orphan.broker_status.is_some());
    }
}
