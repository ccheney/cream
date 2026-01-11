//! Reconciliation configuration.
//!
//! Configuration types for reconciliation behavior including timing,
//! tolerances, and actions on discrepancies.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Configuration for reconciliation behavior.
#[derive(Debug, Clone)]
pub struct ReconciliationConfig {
    /// Run reconciliation on startup.
    pub on_startup: bool,
    /// Run reconciliation on reconnect.
    pub on_reconnect: bool,
    /// Periodic audit interval in seconds (0 = disabled).
    pub periodic_interval_secs: u64,
    /// Protection window for recent orders (don't mark as orphaned).
    pub protection_window_secs: u64,
    /// Max order age for cleanup eligibility.
    pub max_order_age_secs: u64,
    /// Position quantity variance tolerance (0 = exact match required).
    pub position_qty_tolerance: Decimal,
    /// Position price variance percentage (0.01 = 1%).
    pub position_price_tolerance_pct: Decimal,
    /// Action on critical discrepancy.
    pub on_critical_discrepancy: CriticalDiscrepancyAction,
    /// Automatically resolve orphaned orders.
    pub auto_resolve_orphans: bool,
}

impl Default for ReconciliationConfig {
    fn default() -> Self {
        Self {
            on_startup: true,
            on_reconnect: true,
            periodic_interval_secs: 300,  // 5 minutes
            protection_window_secs: 1800, // 30 minutes
            max_order_age_secs: 86400,    // 24 hours
            position_qty_tolerance: Decimal::ZERO,
            position_price_tolerance_pct: Decimal::new(1, 2), // 1%
            on_critical_discrepancy: CriticalDiscrepancyAction::Halt,
            auto_resolve_orphans: true,
        }
    }
}

/// Action to take on critical discrepancy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CriticalDiscrepancyAction {
    /// Halt trading (recommended for LIVE).
    Halt,
    /// Log and continue (for PAPER/testing).
    LogAndContinue,
    /// Alert operator and continue.
    Alert,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_defaults() {
        let config = ReconciliationConfig::default();

        assert!(config.on_startup);
        assert!(config.on_reconnect);
        assert_eq!(config.periodic_interval_secs, 300);
        assert_eq!(config.protection_window_secs, 1800);
        assert_eq!(config.max_order_age_secs, 86400);
        assert_eq!(config.position_qty_tolerance, Decimal::ZERO);
        assert_eq!(config.position_price_tolerance_pct, Decimal::new(1, 2));
        assert_eq!(
            config.on_critical_discrepancy,
            CriticalDiscrepancyAction::Halt
        );
        assert!(config.auto_resolve_orphans);
    }

    #[test]
    fn test_critical_discrepancy_action_equality() {
        assert_eq!(
            CriticalDiscrepancyAction::Halt,
            CriticalDiscrepancyAction::Halt
        );
        assert_ne!(
            CriticalDiscrepancyAction::Halt,
            CriticalDiscrepancyAction::Alert
        );
    }
}
