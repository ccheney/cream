//! Recovery configuration for crash recovery on startup.

use serde::{Deserialize, Serialize};

/// Recovery configuration for crash recovery on startup.
#[allow(clippy::struct_excessive_bools)] // Config struct naturally has boolean flags
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryConfig {
    /// Enable recovery on startup.
    #[serde(default = "default_recovery_enabled")]
    pub enabled: bool,
    /// Automatically resolve orphaned orders (orders in broker but not local).
    #[serde(default = "default_auto_resolve_orphans")]
    pub auto_resolve_orphans: bool,
    /// Sync positions from broker on startup.
    #[serde(default = "default_sync_positions")]
    pub sync_positions: bool,
    /// Abort startup if critical discrepancies are detected (recommended for LIVE).
    #[serde(default = "default_abort_on_critical")]
    pub abort_on_critical: bool,
    /// Position quantity tolerance for reconciliation (e.g., 0.01 = 1 share tolerance).
    #[serde(default = "default_position_qty_tolerance")]
    pub position_qty_tolerance: f64,
    /// Position price variance tolerance as percentage (e.g., 0.01 = 1%).
    #[serde(default = "default_position_price_tolerance_pct")]
    pub position_price_tolerance_pct: f64,
}

impl Default for RecoveryConfig {
    fn default() -> Self {
        Self {
            enabled: default_recovery_enabled(),
            auto_resolve_orphans: default_auto_resolve_orphans(),
            sync_positions: default_sync_positions(),
            abort_on_critical: default_abort_on_critical(),
            position_qty_tolerance: default_position_qty_tolerance(),
            position_price_tolerance_pct: default_position_price_tolerance_pct(),
        }
    }
}

impl RecoveryConfig {
    /// Check if recovery is enabled based on environment.
    ///
    /// Recovery is enabled by default in PAPER/LIVE modes.
    #[must_use]
    pub const fn is_enabled_for_env(&self, _env: &crate::models::Environment) -> bool {
        self.enabled
    }

    /// Convert to the internal `RecoveryConfig` type used by the recovery module.
    #[must_use]
    pub fn to_recovery_config(&self) -> crate::execution::RecoveryConfig {
        use rust_decimal::Decimal;

        crate::execution::RecoveryConfig {
            enabled: self.enabled,
            auto_resolve_orphans: self.auto_resolve_orphans,
            sync_positions: self.sync_positions,
            abort_on_critical: self.abort_on_critical,
            max_attempts: 3,
            position_qty_tolerance: Decimal::try_from(self.position_qty_tolerance)
                .unwrap_or_default(),
            position_price_tolerance_pct: Decimal::try_from(self.position_price_tolerance_pct)
                .unwrap_or_else(|_| Decimal::new(1, 2)),
        }
    }
}

const fn default_recovery_enabled() -> bool {
    true
}

pub const fn default_auto_resolve_orphans() -> bool {
    true
}

const fn default_sync_positions() -> bool {
    true
}

const fn default_abort_on_critical() -> bool {
    true
}

const fn default_position_qty_tolerance() -> f64 {
    0.0
}

const fn default_position_price_tolerance_pct() -> f64 {
    0.01 // 1%
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Environment;

    #[test]
    fn test_recovery_config_defaults() {
        let config = RecoveryConfig::default();
        assert!(config.enabled);
        assert!(config.auto_resolve_orphans);
        assert!(config.sync_positions);
        assert!(config.abort_on_critical);
        assert!((config.position_qty_tolerance - 0.0).abs() < f64::EPSILON);
        assert!((config.position_price_tolerance_pct - 0.01).abs() < f64::EPSILON);
    }

    #[test]
    fn test_recovery_config_to_internal() {
        let config = RecoveryConfig::default();
        let internal = config.to_recovery_config();

        assert!(internal.enabled);
        assert!(internal.auto_resolve_orphans);
        assert!(internal.sync_positions);
        assert!(internal.abort_on_critical);
        assert_eq!(internal.max_attempts, 3);
    }

    #[test]
    fn test_recovery_config_is_enabled_for_env() {
        let config = RecoveryConfig::default();

        // Recovery should be enabled for PAPER and LIVE
        assert!(config.is_enabled_for_env(&Environment::Paper));
        assert!(config.is_enabled_for_env(&Environment::Live));

        // Explicitly disabled config
        let disabled_config = RecoveryConfig {
            enabled: false,
            ..Default::default()
        };
        assert!(!disabled_config.is_enabled_for_env(&Environment::Paper));
        assert!(!disabled_config.is_enabled_for_env(&Environment::Live));
    }
}
