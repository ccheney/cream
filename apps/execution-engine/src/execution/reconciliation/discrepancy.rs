//! Discrepancy types for reconciliation.
//!
//! Types for representing and categorizing discrepancies between
//! local state and broker state.

use serde::{Deserialize, Serialize};

/// Type of resource with discrepancy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DiscrepancyType {
    /// Order state mismatch.
    Order,
    /// Position mismatch.
    Position,
    /// Balance/equity mismatch.
    Balance,
}

/// Severity of discrepancy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, PartialOrd, Ord)]
pub enum DiscrepancySeverity {
    /// Informational only.
    Info,
    /// Warning, may need attention.
    Warning,
    /// Critical, requires immediate action.
    Critical,
}

/// A detected discrepancy between local and broker state.
#[derive(Debug, Clone, Serialize)]
pub struct Discrepancy {
    /// Type of discrepancy.
    pub discrepancy_type: DiscrepancyType,
    /// Identifier (order ID, symbol, etc.).
    pub identifier: String,
    /// Local state description.
    pub local_state: String,
    /// Broker state description.
    pub broker_state: String,
    /// Severity level.
    pub severity: DiscrepancySeverity,
    /// Whether this can be auto-resolved.
    pub auto_resolvable: bool,
    /// Suggested resolution action.
    pub suggested_action: String,
    /// Detection timestamp.
    pub detected_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_discrepancy_type_equality() {
        assert_eq!(DiscrepancyType::Order, DiscrepancyType::Order);
        assert_ne!(DiscrepancyType::Order, DiscrepancyType::Position);
    }

    #[test]
    fn test_discrepancy_severity_ordering() {
        assert!(DiscrepancySeverity::Info < DiscrepancySeverity::Warning);
        assert!(DiscrepancySeverity::Warning < DiscrepancySeverity::Critical);
        assert!(DiscrepancySeverity::Info < DiscrepancySeverity::Critical);
    }

    #[test]
    fn test_discrepancy_creation() {
        let discrepancy = Discrepancy {
            discrepancy_type: DiscrepancyType::Order,
            identifier: "order-123".to_string(),
            local_state: "Accepted".to_string(),
            broker_state: "Filled".to_string(),
            severity: DiscrepancySeverity::Critical,
            auto_resolvable: true,
            suggested_action: "Sync from broker".to_string(),
            detected_at: "2024-01-01T00:00:00Z".to_string(),
        };

        assert_eq!(discrepancy.discrepancy_type, DiscrepancyType::Order);
        assert_eq!(discrepancy.identifier, "order-123");
        assert!(discrepancy.auto_resolvable);
    }
}
