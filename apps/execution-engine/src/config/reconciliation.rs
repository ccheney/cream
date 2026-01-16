//! Reconciliation configuration for periodic broker state sync.

use serde::{Deserialize, Serialize};

use super::recovery::default_auto_resolve_orphans;

/// Reconciliation configuration for periodic broker state sync.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconciliationConfig {
    /// Enable periodic reconciliation.
    #[serde(default = "default_reconciliation_enabled")]
    pub enabled: bool,
    /// Reconciliation interval in seconds.
    #[serde(default = "default_reconciliation_interval")]
    pub interval_secs: u64,
    /// Protection window for recent orders (don't mark as orphaned).
    #[serde(default = "default_protection_window")]
    pub protection_window_secs: u64,
    /// Maximum order age for cleanup eligibility.
    #[serde(default = "default_max_order_age")]
    pub max_order_age_secs: u64,
    /// Automatically resolve orphaned orders.
    #[serde(default = "default_auto_resolve_orphans")]
    pub auto_resolve_orphans: bool,
    /// Action on critical discrepancy: "halt", `log_and_continue`, or "alert".
    #[serde(default = "default_critical_action")]
    pub on_critical_discrepancy: String,
}

impl Default for ReconciliationConfig {
    fn default() -> Self {
        Self {
            enabled: default_reconciliation_enabled(),
            interval_secs: default_reconciliation_interval(),
            protection_window_secs: default_protection_window(),
            max_order_age_secs: default_max_order_age(),
            auto_resolve_orphans: default_auto_resolve_orphans(),
            on_critical_discrepancy: default_critical_action(),
        }
    }
}

impl ReconciliationConfig {
    /// Check if reconciliation is enabled based on environment.
    ///
    /// Reconciliation is enabled by default in PAPER/LIVE modes,
    /// disabled in BACKTEST mode since there's no broker to reconcile with.
    #[must_use]
    #[allow(clippy::missing_const_for_fn)] // Method call prevents const
    pub fn is_enabled_for_env(&self, env: &crate::models::Environment) -> bool {
        if !self.enabled {
            return false;
        }
        // Disable reconciliation for backtest mode
        !env.is_backtest()
    }

    /// Convert to the internal `ReconciliationConfig` type used by the reconciliation module.
    #[must_use]
    pub fn to_reconciliation_config(
        &self,
    ) -> crate::execution::reconciliation::ReconciliationConfig {
        use crate::execution::reconciliation::CriticalDiscrepancyAction;
        use rust_decimal::Decimal;

        #[allow(clippy::match_same_arms)] // Explicit halt arm for documentation clarity
        let critical_action = match self.on_critical_discrepancy.to_lowercase().as_str() {
            "halt" => CriticalDiscrepancyAction::Halt,
            "log_and_continue" => CriticalDiscrepancyAction::LogAndContinue,
            "alert" => CriticalDiscrepancyAction::Alert,
            _ => CriticalDiscrepancyAction::Halt, // Default to safest option
        };

        crate::execution::reconciliation::ReconciliationConfig {
            on_startup: true,
            on_reconnect: true,
            periodic_interval_secs: self.interval_secs,
            protection_window_secs: self.protection_window_secs,
            max_order_age_secs: self.max_order_age_secs,
            position_qty_tolerance: Decimal::ZERO,
            position_price_tolerance_pct: Decimal::new(1, 2), // 1%
            on_critical_discrepancy: critical_action,
            auto_resolve_orphans: self.auto_resolve_orphans,
        }
    }
}

const fn default_reconciliation_enabled() -> bool {
    true
}

const fn default_reconciliation_interval() -> u64 {
    300 // 5 minutes
}

const fn default_protection_window() -> u64 {
    1800 // 30 minutes
}

const fn default_max_order_age() -> u64 {
    86400 // 24 hours
}

fn default_critical_action() -> String {
    "halt".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution::reconciliation::CriticalDiscrepancyAction;
    use crate::models::Environment;

    #[test]
    fn test_reconciliation_config_defaults() {
        let config = ReconciliationConfig::default();
        assert!(config.enabled);
        assert_eq!(config.interval_secs, 300);
        assert_eq!(config.protection_window_secs, 1800);
        assert_eq!(config.max_order_age_secs, 86400);
        assert!(config.auto_resolve_orphans);
        assert_eq!(config.on_critical_discrepancy, "halt");
    }

    #[test]
    fn test_reconciliation_config_to_internal() {
        let config = ReconciliationConfig::default();
        let internal = config.to_reconciliation_config();

        assert!(internal.on_startup);
        assert!(internal.on_reconnect);
        assert_eq!(internal.periodic_interval_secs, 300);
        assert_eq!(internal.protection_window_secs, 1800);
        assert_eq!(internal.max_order_age_secs, 86400);
        assert!(internal.auto_resolve_orphans);
    }

    #[test]
    fn test_reconciliation_config_critical_action_parsing() {
        // Test halt
        let config = ReconciliationConfig {
            on_critical_discrepancy: "halt".to_string(),
            ..Default::default()
        };
        let internal = config.to_reconciliation_config();
        assert_eq!(
            internal.on_critical_discrepancy,
            CriticalDiscrepancyAction::Halt
        );

        // Test log_and_continue
        let config = ReconciliationConfig {
            on_critical_discrepancy: "log_and_continue".to_string(),
            ..Default::default()
        };
        let internal = config.to_reconciliation_config();
        assert_eq!(
            internal.on_critical_discrepancy,
            CriticalDiscrepancyAction::LogAndContinue
        );

        // Test alert
        let config = ReconciliationConfig {
            on_critical_discrepancy: "alert".to_string(),
            ..Default::default()
        };
        let internal = config.to_reconciliation_config();
        assert_eq!(
            internal.on_critical_discrepancy,
            CriticalDiscrepancyAction::Alert
        );

        // Test default on unknown
        let config = ReconciliationConfig {
            on_critical_discrepancy: "unknown".to_string(),
            ..Default::default()
        };
        let internal = config.to_reconciliation_config();
        assert_eq!(
            internal.on_critical_discrepancy,
            CriticalDiscrepancyAction::Halt
        );
    }

    #[test]
    fn test_reconciliation_config_is_enabled_for_env() {
        let config = ReconciliationConfig::default();

        // Reconciliation should be enabled for PAPER and LIVE
        assert!(config.is_enabled_for_env(&Environment::Paper));
        assert!(config.is_enabled_for_env(&Environment::Live));

        // Reconciliation should be disabled for BACKTEST
        assert!(!config.is_enabled_for_env(&Environment::Backtest));

        // Explicitly disabled config
        let disabled_config = ReconciliationConfig {
            enabled: false,
            ..Default::default()
        };
        assert!(!disabled_config.is_enabled_for_env(&Environment::Paper));
        assert!(!disabled_config.is_enabled_for_env(&Environment::Live));
    }
}
