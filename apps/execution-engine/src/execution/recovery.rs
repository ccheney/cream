//! Portfolio state recovery after crashes.
//!
//! Provides startup recovery routines that:
//! 1. Load persisted state from database
//! 2. Reconcile with broker to detect discrepancies
//! 3. Resolve orphaned orders and sync positions
//! 4. Restore the `OrderStateManager` to a consistent state
//!
//! Reference: docs/plans/07-execution.md (Recovery on Restart)

use std::collections::HashMap;
use std::sync::Arc;

use rust_decimal::Decimal;
use thiserror::Error;
use tracing::{debug, info, warn};

use super::alpaca::AlpacaAdapter;
use super::persistence::{PersistenceError, StatePersistence};
use super::reconciliation::{
    BrokerStateSnapshot, LocalPositionSnapshot, ReconciliationConfig, ReconciliationError,
    ReconciliationManager, ReconciliationReport, fetch_broker_state,
};
use super::state::OrderStateManager;

// ============================================================================
// Errors
// ============================================================================

/// Errors from recovery operations.
#[derive(Debug, Error)]
pub enum RecoveryError {
    /// Persistence layer error.
    #[error("Persistence error: {0}")]
    Persistence(#[from] PersistenceError),

    /// Reconciliation error.
    #[error("Reconciliation error: {0}")]
    Reconciliation(#[from] ReconciliationError),

    /// Broker communication error.
    #[error("Broker error: {0}")]
    Broker(String),

    /// Recovery aborted due to critical issues.
    #[error("Recovery aborted: {0}")]
    Aborted(String),
}

// ============================================================================
// Recovery Configuration
// ============================================================================

/// Configuration for startup recovery.
// Multiple boolean fields reflect distinct recovery behaviors that are independently configurable
#[allow(clippy::struct_excessive_bools)]
#[derive(Debug, Clone)]
pub struct RecoveryConfig {
    /// Whether to run recovery on startup.
    pub enabled: bool,
    /// Whether to auto-resolve orphaned orders.
    pub auto_resolve_orphans: bool,
    /// Whether to sync positions from broker.
    pub sync_positions: bool,
    /// Abort if critical discrepancies found.
    pub abort_on_critical: bool,
    /// Maximum number of recovery attempts.
    pub max_attempts: u32,
    /// Position quantity tolerance for reconciliation.
    pub position_qty_tolerance: Decimal,
    /// Position price variance tolerance (percentage).
    pub position_price_tolerance_pct: Decimal,
}

impl Default for RecoveryConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_resolve_orphans: true,
            sync_positions: true,
            abort_on_critical: true,
            max_attempts: 3,
            position_qty_tolerance: Decimal::ZERO,
            position_price_tolerance_pct: Decimal::new(1, 2), // 1%
        }
    }
}

// ============================================================================
// Recovery Result
// ============================================================================

/// Result of a recovery operation.
#[derive(Debug, Clone)]
pub struct RecoveryResult {
    /// Whether recovery was successful.
    pub success: bool,
    /// Number of orders loaded from database.
    pub orders_loaded: usize,
    /// Number of positions loaded.
    pub positions_loaded: usize,
    /// Reconciliation report (if ran).
    pub reconciliation_report: Option<ReconciliationReport>,
    /// Number of orphaned orders resolved.
    pub orphans_resolved: usize,
    /// Number of positions synced from broker.
    pub positions_synced: usize,
    /// Recovery duration in milliseconds.
    pub duration_ms: u64,
    /// Warning messages.
    pub warnings: Vec<String>,
    /// Error message if failed.
    pub error_message: Option<String>,
}

impl RecoveryResult {
    const fn success() -> Self {
        Self {
            success: true,
            orders_loaded: 0,
            positions_loaded: 0,
            reconciliation_report: None,
            orphans_resolved: 0,
            positions_synced: 0,
            duration_ms: 0,
            warnings: Vec::new(),
            error_message: None,
        }
    }

    #[cfg(test)]
    const fn failure(message: String) -> Self {
        Self {
            success: false,
            orders_loaded: 0,
            positions_loaded: 0,
            reconciliation_report: None,
            orphans_resolved: 0,
            positions_synced: 0,
            duration_ms: 0,
            warnings: Vec::new(),
            error_message: Some(message),
        }
    }
}

// ============================================================================
// Portfolio Recovery Manager
// ============================================================================

/// Manages portfolio state recovery after crashes.
pub struct PortfolioRecovery {
    /// Recovery configuration.
    config: RecoveryConfig,
    /// Persistence manager.
    persistence: Arc<StatePersistence>,
    /// Reconciliation manager.
    reconciliation: ReconciliationManager,
    /// Order state manager.
    state_manager: Arc<OrderStateManager>,
}

impl PortfolioRecovery {
    /// Create a new portfolio recovery manager.
    pub fn new(
        config: RecoveryConfig,
        persistence: Arc<StatePersistence>,
        state_manager: Arc<OrderStateManager>,
    ) -> Self {
        let reconciliation_config = ReconciliationConfig {
            on_startup: true,
            on_reconnect: true,
            periodic_interval_secs: 300,
            protection_window_secs: 1800,
            max_order_age_secs: 86400,
            position_qty_tolerance: config.position_qty_tolerance,
            position_price_tolerance_pct: config.position_price_tolerance_pct,
            on_critical_discrepancy: super::reconciliation::CriticalDiscrepancyAction::Halt,
            auto_resolve_orphans: config.auto_resolve_orphans,
        };

        let reconciliation =
            ReconciliationManager::new(reconciliation_config, state_manager.clone());

        Self {
            config,
            persistence,
            reconciliation,
            state_manager,
        }
    }

    /// Run full recovery routine on startup.
    ///
    /// This is the main entry point for crash recovery. It:
    /// 1. Checks recovery state from database
    /// 2. Loads persisted orders into state manager
    /// 3. Loads persisted positions
    /// 4. Fetches current broker state
    /// 5. Reconciles local vs broker state
    /// 6. Resolves any discrepancies
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Database operations fail (loading state, orders, or positions)
    /// - Broker API calls fail (fetching state, resolving orphans)
    /// - Critical discrepancies are detected and `abort_on_critical` is enabled
    #[allow(clippy::too_many_lines)] // Recovery workflow requires sequential validation steps
    pub async fn recover(&self, broker: &AlpacaAdapter) -> Result<RecoveryResult, RecoveryError> {
        let start = std::time::Instant::now();
        let mut result = RecoveryResult::success();

        if !self.config.enabled {
            info!("Recovery disabled, skipping");
            return Ok(result);
        }

        info!("Starting portfolio recovery");

        // Step 1: Check recovery state
        let recovery_state = self.persistence.get_recovery_state().await?;
        debug!(
            status = %recovery_state.status,
            last_cycle = ?recovery_state.last_cycle_id,
            "Recovery state"
        );

        if recovery_state.is_healthy() && recovery_state.last_reconciliation_at.is_some() {
            info!("Previous state was healthy, running quick reconciliation");
        } else {
            warn!("Previous state needs recovery: {}", recovery_state.status);
        }

        // Step 2: Load persisted orders into state manager
        result.orders_loaded = self
            .persistence
            .load_active_orders(&self.state_manager)
            .await?;
        info!(count = result.orders_loaded, "Loaded orders from database");

        // Step 3: Load persisted positions
        let local_positions = self.persistence.load_positions().await?;
        result.positions_loaded = local_positions.len();
        info!(
            count = result.positions_loaded,
            "Loaded positions from database"
        );

        // Step 4: Fetch current broker state
        let broker_state = fetch_broker_state(broker).await?;
        info!(
            broker_orders = broker_state.orders.len(),
            broker_positions = broker_state.positions.len(),
            "Fetched broker state"
        );

        // Step 5: Reconcile local vs broker state
        let report = if self.config.auto_resolve_orphans {
            self.reconciliation
                .reconcile_with_execution(broker_state.clone(), broker)
                .await
        } else {
            self.reconciliation.reconcile(broker_state.clone()).await
        };

        result.orphans_resolved = report.auto_resolved;
        result.reconciliation_report = Some(report.clone());

        // Check for critical issues
        if report.has_critical() {
            warn!(
                discrepancies = report.discrepancies.len(),
                "Critical discrepancies detected during recovery"
            );

            if self.config.abort_on_critical {
                self.persistence
                    .update_recovery_state(
                        None,
                        "error",
                        Some("Critical discrepancies during recovery"),
                    )
                    .await?;
                return Err(RecoveryError::Aborted(
                    "Critical discrepancies detected. Manual intervention required.".to_string(),
                ));
            }
            result
                .warnings
                .push("Critical discrepancies detected but continuing".to_string());
        }

        // Step 6: Sync positions from broker if configured
        if self.config.sync_positions {
            result.positions_synced = self
                .sync_positions_from_broker(&broker_state, &local_positions)
                .await?;
        }

        // Step 7: Compare positions and log discrepancies
        let position_discrepancies = self
            .reconciliation
            .compare_positions(&broker_state.positions, &local_positions);

        if !position_discrepancies.is_empty() {
            warn!(
                count = position_discrepancies.len(),
                "Position discrepancies found"
            );
            for disc in &position_discrepancies {
                result.warnings.push(format!(
                    "Position {}: local={}, broker={}",
                    disc.identifier, disc.local_state, disc.broker_state
                ));
            }
        }

        // Step 8: Update recovery state
        self.persistence
            .update_recovery_state(recovery_state.last_cycle_id.as_deref(), "healthy", None)
            .await?;
        self.persistence.log_reconciliation(&report).await?;

        // Truncation acceptable: recovery duration in ms fits in u64
        #[allow(clippy::cast_possible_truncation)]
        {
            result.duration_ms = start.elapsed().as_millis() as u64;
        }
        result.success = true;

        info!(
            orders = result.orders_loaded,
            positions = result.positions_loaded,
            orphans_resolved = result.orphans_resolved,
            positions_synced = result.positions_synced,
            duration_ms = result.duration_ms,
            "Portfolio recovery complete"
        );

        Ok(result)
    }

    /// Sync positions from broker to database.
    async fn sync_positions_from_broker(
        &self,
        broker_state: &BrokerStateSnapshot,
        local_positions: &HashMap<String, LocalPositionSnapshot>,
    ) -> Result<usize, RecoveryError> {
        let mut synced = 0;

        for broker_pos in &broker_state.positions {
            let needs_sync = local_positions.get(&broker_pos.symbol).is_none_or(|local| {
                // Check if different
                local.qty != broker_pos.qty
                    || (local.avg_entry_price - broker_pos.avg_entry_price).abs()
                        > self.config.position_price_tolerance_pct * broker_pos.avg_entry_price
            });

            if needs_sync {
                let position = LocalPositionSnapshot {
                    symbol: broker_pos.symbol.clone(),
                    qty: broker_pos.qty,
                    avg_entry_price: broker_pos.avg_entry_price,
                };

                self.persistence.save_position(&position).await?;
                synced += 1;

                debug!(
                    symbol = %broker_pos.symbol,
                    qty = %broker_pos.qty,
                    "Position synced from broker"
                );
            }
        }

        // Remove local positions that don't exist at broker
        for symbol in local_positions.keys() {
            let in_broker = broker_state.positions.iter().any(|p| &p.symbol == symbol);
            if !in_broker {
                // Position was closed at broker - save with zero quantity
                let position = LocalPositionSnapshot {
                    symbol: symbol.clone(),
                    qty: Decimal::ZERO,
                    avg_entry_price: Decimal::ZERO,
                };
                self.persistence.save_position(&position).await?;
                synced += 1;

                debug!(symbol = %symbol, "Position cleared (closed at broker)");
            }
        }

        Ok(synced)
    }

    /// Quick health check without full recovery.
    ///
    /// # Errors
    ///
    /// Returns an error if the database query for recovery state fails.
    pub async fn health_check(&self, broker: &AlpacaAdapter) -> Result<bool, RecoveryError> {
        let recovery_state = self.persistence.get_recovery_state().await?;

        if !recovery_state.is_healthy() {
            return Ok(false);
        }

        // Quick broker connectivity check
        match broker.get_account().await {
            Ok(_) => Ok(true),
            Err(e) => {
                warn!(error = %e, "Broker health check failed");
                Ok(false)
            }
        }
    }

    /// Save current state snapshot (for graceful shutdown).
    ///
    /// # Errors
    ///
    /// Returns an error if saving orders to the database or updating
    /// recovery state fails.
    pub async fn save_snapshot(&self) -> Result<(), RecoveryError> {
        info!("Saving state snapshot for graceful shutdown");

        let saved = self
            .persistence
            .save_all_orders(&self.state_manager)
            .await?;
        info!(orders = saved, "Orders saved to database");

        self.persistence
            .update_recovery_state(None, "shutdown", None)
            .await?;

        info!("State snapshot saved successfully");
        Ok(())
    }

    /// Mark recovery state as interrupted (for crash simulation/testing).
    ///
    /// # Errors
    ///
    /// Returns an error if updating the recovery state in the database fails.
    pub async fn mark_interrupted(&self, cycle_id: Option<&str>) -> Result<(), RecoveryError> {
        self.persistence
            .update_recovery_state(cycle_id, "interrupted", None)
            .await?;
        Ok(())
    }

    /// Get the reconciliation manager for direct access.
    pub const fn reconciliation_manager(&self) -> &ReconciliationManager {
        &self.reconciliation
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_recovery_config_default() {
        let config = RecoveryConfig::default();
        assert!(config.enabled);
        assert!(config.auto_resolve_orphans);
        assert!(config.sync_positions);
        assert!(config.abort_on_critical);
        assert_eq!(config.max_attempts, 3);
    }

    #[test]
    fn test_recovery_result_success() {
        let result = RecoveryResult::success();
        assert!(result.success);
        assert!(result.error_message.is_none());
    }

    #[test]
    fn test_recovery_result_failure() {
        let result = RecoveryResult::failure("Test error".to_string());
        assert!(!result.success);
        assert_eq!(result.error_message, Some("Test error".to_string()));
    }
}
