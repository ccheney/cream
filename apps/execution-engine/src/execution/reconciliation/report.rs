//! Reconciliation report types.
//!
//! Types for reporting results of reconciliation runs.

use serde::Serialize;

use super::discrepancy::{Discrepancy, DiscrepancySeverity};
use super::orphan::OrphanedOrder;

/// Result of a reconciliation run.
#[derive(Debug, Clone, Serialize)]
pub struct ReconciliationReport {
    /// All discrepancies found.
    pub discrepancies: Vec<Discrepancy>,
    /// Orphaned orders detected.
    pub orphaned_orders: Vec<OrphanedOrder>,
    /// Number of orders compared.
    pub orders_compared: usize,
    /// Number of positions compared.
    pub positions_compared: usize,
    /// Whether reconciliation passed (no critical issues).
    pub passed: bool,
    /// Number of auto-resolved issues.
    pub auto_resolved: usize,
    /// Reconciliation timestamp.
    pub completed_at: String,
    /// Duration in milliseconds.
    pub duration_ms: u64,
}

impl ReconciliationReport {
    /// Check if there are any critical discrepancies.
    #[must_use]
    pub fn has_critical(&self) -> bool {
        self.discrepancies
            .iter()
            .any(|d| d.severity == DiscrepancySeverity::Critical)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution::reconciliation::discrepancy::DiscrepancyType;

    fn make_discrepancy(severity: DiscrepancySeverity) -> Discrepancy {
        Discrepancy {
            discrepancy_type: DiscrepancyType::Order,
            identifier: "test".to_string(),
            local_state: "local".to_string(),
            broker_state: "broker".to_string(),
            severity,
            auto_resolvable: true,
            suggested_action: "action".to_string(),
            detected_at: "2024-01-01T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn test_report_has_critical_true() {
        let report = ReconciliationReport {
            discrepancies: vec![make_discrepancy(DiscrepancySeverity::Critical)],
            orphaned_orders: vec![],
            orders_compared: 1,
            positions_compared: 0,
            passed: false,
            auto_resolved: 0,
            completed_at: "2024-01-01T00:00:00Z".to_string(),
            duration_ms: 100,
        };

        assert!(report.has_critical());
    }

    #[test]
    fn test_report_has_critical_false() {
        let report = ReconciliationReport {
            discrepancies: vec![
                make_discrepancy(DiscrepancySeverity::Info),
                make_discrepancy(DiscrepancySeverity::Warning),
            ],
            orphaned_orders: vec![],
            orders_compared: 2,
            positions_compared: 0,
            passed: true,
            auto_resolved: 0,
            completed_at: "2024-01-01T00:00:00Z".to_string(),
            duration_ms: 100,
        };

        assert!(!report.has_critical());
    }

    #[test]
    fn test_report_empty_discrepancies() {
        let report = ReconciliationReport {
            discrepancies: vec![],
            orphaned_orders: vec![],
            orders_compared: 0,
            positions_compared: 0,
            passed: true,
            auto_resolved: 0,
            completed_at: "2024-01-01T00:00:00Z".to_string(),
            duration_ms: 50,
        };

        assert!(!report.has_critical());
        assert!(report.passed);
    }
}
