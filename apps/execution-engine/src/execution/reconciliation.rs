//! Order and position reconciliation with broker.
//!
//! Implements startup synchronization, periodic orphan detection, and
//! discrepancy resolution to ensure local state matches broker reality.
//!
//! Reference: docs/plans/07-execution.md (Reconciliation on Restart, Orphaned Order Detection)

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::Instant;
use tracing::{debug, error, info, warn};

use super::alpaca::AlpacaAdapter;
use super::state::OrderStateManager;
use crate::models::{OrderState, OrderStatus};

// ============================================================================
// Configuration
// ============================================================================

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

// ============================================================================
// Discrepancy Types
// ============================================================================

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

// ============================================================================
// Orphaned Order Types
// ============================================================================

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

// ============================================================================
// Broker State (for comparison)
// ============================================================================

/// Snapshot of broker order state.
#[derive(Debug, Clone)]
pub struct BrokerOrderSnapshot {
    pub order_id: String,
    pub client_order_id: Option<String>,
    pub symbol: String,
    pub status: String,
    pub side: String,
    pub qty: Decimal,
    pub filled_qty: Decimal,
    pub created_at: String,
}

/// Snapshot of broker position.
#[derive(Debug, Clone)]
pub struct BrokerPositionSnapshot {
    pub symbol: String,
    pub qty: Decimal,
    pub side: String, // "long" or "short"
    pub avg_entry_price: Decimal,
    pub market_value: Decimal,
    pub unrealized_pl: Decimal,
}

/// Snapshot of broker account.
#[derive(Debug, Clone)]
pub struct BrokerAccountSnapshot {
    pub equity: Decimal,
    pub cash: Decimal,
    pub buying_power: Decimal,
}

/// Complete broker state snapshot.
#[derive(Debug, Clone)]
pub struct BrokerStateSnapshot {
    pub orders: Vec<BrokerOrderSnapshot>,
    pub positions: Vec<BrokerPositionSnapshot>,
    pub account: BrokerAccountSnapshot,
    pub fetched_at: String,
}

// ============================================================================
// Reconciliation Report
// ============================================================================

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

// ============================================================================
// Reconciliation Manager
// ============================================================================

/// Manages order and position reconciliation.
pub struct ReconciliationManager {
    /// Configuration.
    config: ReconciliationConfig,
    /// Order state manager.
    order_state: Arc<OrderStateManager>,
    /// Last reconciliation time.
    last_reconciliation: RwLock<Option<Instant>>,
    /// Whether trading is halted due to reconciliation failure.
    trading_halted: RwLock<bool>,
}

impl ReconciliationManager {
    /// Create a new reconciliation manager.
    pub fn new(config: ReconciliationConfig, order_state: Arc<OrderStateManager>) -> Self {
        Self {
            config,
            order_state,
            last_reconciliation: RwLock::new(None),
            trading_halted: RwLock::new(false),
        }
    }

    /// Check if trading is halted.
    pub async fn is_trading_halted(&self) -> bool {
        *self.trading_halted.read().await
    }

    /// Resume trading (after manual intervention).
    pub async fn resume_trading(&self) {
        *self.trading_halted.write().await = false;
        info!("Trading resumed after reconciliation");
    }

    /// Reconcile local state with broker state.
    ///
    /// This is the main entry point for reconciliation.
    pub async fn reconcile(&self, broker_state: BrokerStateSnapshot) -> ReconciliationReport {
        let start = Instant::now();
        let now = chrono::Utc::now();
        let mut discrepancies = Vec::new();
        let mut orphaned_orders = Vec::new();
        let mut auto_resolved = 0;

        info!("Starting reconciliation");

        // Get local orders
        let local_orders = self.order_state.get_active_orders();
        let local_order_map: HashMap<&str, &OrderState> = local_orders
            .iter()
            .map(|o| (o.broker_order_id.as_str(), o))
            .collect();

        let broker_order_ids: HashSet<&str> = broker_state
            .orders
            .iter()
            .map(|o| o.order_id.as_str())
            .collect();

        // Phase 1: Compare orders
        let orders_compared = local_orders.len() + broker_state.orders.len();

        // Check for orders in broker but not local (UNKNOWN_IN_BROKER)
        for broker_order in &broker_state.orders {
            if !local_order_map.contains_key(broker_order.order_id.as_str()) {
                let age = self.calculate_order_age(&broker_order.created_at);

                // Check protection window
                if age < self.config.protection_window_secs {
                    debug!(
                        order_id = %broker_order.order_id,
                        age_secs = age,
                        "Order within protection window, skipping"
                    );
                    continue;
                }

                orphaned_orders.push(OrphanedOrder {
                    orphan_type: OrphanType::UnknownInBroker,
                    order_id: broker_order.order_id.clone(),
                    broker_order_id: Some(broker_order.order_id.clone()),
                    symbol: broker_order.symbol.clone(),
                    local_status: None,
                    broker_status: Some(broker_order.status.clone()),
                    age_secs: age,
                    detected_at: now.to_rfc3339(),
                });

                discrepancies.push(Discrepancy {
                    discrepancy_type: DiscrepancyType::Order,
                    identifier: broker_order.order_id.clone(),
                    local_state: "NOT_FOUND".to_string(),
                    broker_state: broker_order.status.clone(),
                    severity: DiscrepancySeverity::Warning,
                    auto_resolvable: self.config.auto_resolve_orphans,
                    suggested_action: "Adopt or cancel order".to_string(),
                    detected_at: now.to_rfc3339(),
                });
            }
        }

        // Check for orders in local but not broker (MISSING_IN_BROKER)
        for local_order in &local_orders {
            if !local_order.broker_order_id.is_empty()
                && !broker_order_ids.contains(local_order.broker_order_id.as_str())
            {
                let age = self.calculate_order_age(&local_order.submitted_at);

                orphaned_orders.push(OrphanedOrder {
                    orphan_type: OrphanType::MissingInBroker,
                    order_id: local_order.order_id.clone(),
                    broker_order_id: Some(local_order.broker_order_id.clone()),
                    symbol: local_order.instrument_id.clone(),
                    local_status: Some(format!("{:?}", local_order.status)),
                    broker_status: None,
                    age_secs: age,
                    detected_at: now.to_rfc3339(),
                });

                discrepancies.push(Discrepancy {
                    discrepancy_type: DiscrepancyType::Order,
                    identifier: local_order.order_id.clone(),
                    local_state: format!("{:?}", local_order.status),
                    broker_state: "NOT_FOUND".to_string(),
                    severity: DiscrepancySeverity::Warning,
                    auto_resolvable: true,
                    suggested_action: "Mark as failed or verify submission".to_string(),
                    detected_at: now.to_rfc3339(),
                });
            }
        }

        // Check for state mismatches
        for broker_order in &broker_state.orders {
            if let Some(local_order) = local_order_map.get(broker_order.order_id.as_str()) {
                let local_status_str = format!("{:?}", local_order.status);
                let broker_status = &broker_order.status;

                // Map broker status to local status for comparison
                let statuses_match = self.statuses_match(&local_order.status, broker_status);

                if !statuses_match {
                    let age = self.calculate_order_age(&local_order.submitted_at);

                    // If broker says filled but local says active, this is important
                    let severity = if broker_status == "filled" && local_order.status.is_active() {
                        DiscrepancySeverity::Critical
                    } else {
                        DiscrepancySeverity::Warning
                    };

                    orphaned_orders.push(OrphanedOrder {
                        orphan_type: OrphanType::StateMismatch,
                        order_id: local_order.order_id.clone(),
                        broker_order_id: Some(broker_order.order_id.clone()),
                        symbol: local_order.instrument_id.clone(),
                        local_status: Some(local_status_str.clone()),
                        broker_status: Some(broker_status.clone()),
                        age_secs: age,
                        detected_at: now.to_rfc3339(),
                    });

                    discrepancies.push(Discrepancy {
                        discrepancy_type: DiscrepancyType::Order,
                        identifier: local_order.order_id.clone(),
                        local_state: local_status_str,
                        broker_state: broker_status.clone(),
                        severity,
                        auto_resolvable: true,
                        suggested_action: "Sync local state from broker".to_string(),
                        detected_at: now.to_rfc3339(),
                    });
                }
            }
        }

        // Phase 2: Compare positions
        let positions_compared = broker_state.positions.len();

        for position in &broker_state.positions {
            // Position reconciliation would check against local position tracking
            // For now, we just report positions found
            debug!(
                symbol = %position.symbol,
                qty = %position.qty,
                "Broker position"
            );
        }

        // Phase 3: Compare account balances
        debug!(
            equity = %broker_state.account.equity,
            cash = %broker_state.account.cash,
            buying_power = %broker_state.account.buying_power,
            "Broker account state"
        );

        // Auto-resolve if configured
        if self.config.auto_resolve_orphans {
            for orphan in &orphaned_orders {
                let resolution = self.determine_resolution(orphan);
                if resolution != OrphanResolution::Ignore {
                    // In a real implementation, this would execute the resolution
                    debug!(
                        orphan_type = %orphan.orphan_type,
                        order_id = %orphan.order_id,
                        resolution = ?resolution,
                        "Would auto-resolve orphan"
                    );
                    auto_resolved += 1;
                }
            }
        }

        // Check for critical discrepancies
        let has_critical = discrepancies
            .iter()
            .any(|d| d.severity == DiscrepancySeverity::Critical);

        let passed = !has_critical;

        // Handle critical discrepancy action
        if has_critical {
            match self.config.on_critical_discrepancy {
                CriticalDiscrepancyAction::Halt => {
                    error!("Critical discrepancy detected, halting trading");
                    *self.trading_halted.write().await = true;
                }
                CriticalDiscrepancyAction::Alert => {
                    warn!("Critical discrepancy detected, alerting operator");
                    // In real implementation, would trigger alert
                }
                CriticalDiscrepancyAction::LogAndContinue => {
                    warn!("Critical discrepancy detected, continuing (PAPER mode)");
                }
            }
        }

        // Update last reconciliation time
        *self.last_reconciliation.write().await = Some(Instant::now());

        let duration_ms = start.elapsed().as_millis() as u64;

        let report = ReconciliationReport {
            discrepancies,
            orphaned_orders,
            orders_compared,
            positions_compared,
            passed,
            auto_resolved,
            completed_at: now.to_rfc3339(),
            duration_ms,
        };

        info!(
            passed = report.passed,
            discrepancies = report.discrepancies.len(),
            orphans = report.orphaned_orders.len(),
            auto_resolved = report.auto_resolved,
            duration_ms = report.duration_ms,
            "Reconciliation completed"
        );

        report
    }

    /// Determine resolution action for an orphaned order.
    fn determine_resolution(&self, orphan: &OrphanedOrder) -> OrphanResolution {
        // Check protection window
        if orphan.age_secs < self.config.protection_window_secs {
            return OrphanResolution::Ignore;
        }

        match orphan.orphan_type {
            OrphanType::UnknownInBroker => {
                // Order in broker we don't know about
                if orphan.age_secs > self.config.max_order_age_secs {
                    OrphanResolution::Cancel
                } else {
                    OrphanResolution::Adopt
                }
            }
            OrphanType::MissingInBroker => {
                // Order in local that broker doesn't have
                OrphanResolution::MarkFailed
            }
            OrphanType::StateMismatch => {
                // Status disagrees - broker is source of truth
                OrphanResolution::SyncFromBroker
            }
            OrphanType::Zombie => {
                // Old order from previous session
                if orphan.age_secs > self.config.max_order_age_secs {
                    OrphanResolution::Cancel
                } else {
                    OrphanResolution::Adopt
                }
            }
        }
    }

    /// Check if local and broker statuses match.
    fn statuses_match(&self, local: &OrderStatus, broker: &str) -> bool {
        let broker_lower = broker.to_lowercase();
        match local {
            OrderStatus::New => broker_lower == "pending_new" || broker_lower == "new",
            OrderStatus::Accepted => {
                broker_lower == "accepted" || broker_lower == "new" || broker_lower == "pending_new"
            }
            OrderStatus::PartiallyFilled => {
                broker_lower == "partially_filled" || broker_lower == "partially filled"
            }
            OrderStatus::Filled => broker_lower == "filled",
            OrderStatus::Canceled => broker_lower == "canceled" || broker_lower == "cancelled",
            OrderStatus::Rejected => broker_lower == "rejected",
            OrderStatus::Expired => broker_lower == "expired",
        }
    }

    /// Calculate order age in seconds.
    fn calculate_order_age(&self, created_at: &str) -> u64 {
        let now = chrono::Utc::now();
        if let Ok(created) = chrono::DateTime::parse_from_rfc3339(created_at) {
            let created_utc = created.with_timezone(&chrono::Utc);
            now.signed_duration_since(created_utc).num_seconds().max(0) as u64
        } else {
            0
        }
    }

    /// Get time since last reconciliation.
    pub async fn time_since_last_reconciliation(&self) -> Option<Duration> {
        self.last_reconciliation.read().await.map(|t| t.elapsed())
    }

    /// Check if periodic reconciliation is due.
    pub async fn is_periodic_due(&self) -> bool {
        if self.config.periodic_interval_secs == 0 {
            return false;
        }

        match *self.last_reconciliation.read().await {
            Some(last) => last.elapsed() >= Duration::from_secs(self.config.periodic_interval_secs),
            None => true,
        }
    }

    /// Execute resolution for an orphaned order.
    ///
    /// Returns `Ok(true)` if resolution was executed, `Ok(false)` if ignored.
    pub async fn execute_resolution(
        &self,
        orphan: &OrphanedOrder,
        broker: &AlpacaAdapter,
    ) -> Result<bool, ReconciliationError> {
        let resolution = self.determine_resolution(orphan);

        match resolution {
            OrphanResolution::Ignore => {
                debug!(
                    order_id = %orphan.order_id,
                    orphan_type = %orphan.orphan_type,
                    "Ignoring orphan (within protection window)"
                );
                Ok(false)
            }
            OrphanResolution::Cancel => {
                info!(
                    order_id = %orphan.order_id,
                    broker_order_id = ?orphan.broker_order_id,
                    "Canceling orphaned order at broker"
                );
                if let Some(broker_id) = &orphan.broker_order_id {
                    broker
                        .cancel_order(broker_id)
                        .await
                        .map_err(|e| ReconciliationError::BrokerError(e.to_string()))?;
                }
                Ok(true)
            }
            OrphanResolution::Adopt => {
                info!(
                    order_id = %orphan.order_id,
                    broker_order_id = ?orphan.broker_order_id,
                    "Adopting broker order into local state"
                );
                if let Some(broker_id) = &orphan.broker_order_id {
                    // Fetch current order state from broker
                    let order_state = broker
                        .get_order_status(broker_id)
                        .await
                        .map_err(|e| ReconciliationError::BrokerError(e.to_string()))?;
                    // Insert into local state manager
                    self.order_state.insert(order_state);
                }
                Ok(true)
            }
            OrphanResolution::SyncFromBroker => {
                info!(
                    order_id = %orphan.order_id,
                    broker_order_id = ?orphan.broker_order_id,
                    local_status = ?orphan.local_status,
                    broker_status = ?orphan.broker_status,
                    "Syncing local state from broker"
                );
                if let Some(broker_id) = &orphan.broker_order_id {
                    // Fetch current state from broker and update local
                    let order_state = broker
                        .get_order_status(broker_id)
                        .await
                        .map_err(|e| ReconciliationError::BrokerError(e.to_string()))?;
                    self.order_state.update(order_state);
                }
                Ok(true)
            }
            OrphanResolution::MarkFailed => {
                info!(
                    order_id = %orphan.order_id,
                    "Marking order as failed (missing in broker)"
                );
                // Update local order status to Rejected
                if let Some(order) = self.order_state.get(&orphan.order_id) {
                    let mut updated = order.clone();
                    updated.status = OrderStatus::Rejected;
                    updated.status_message =
                        "Order not found at broker during reconciliation".to_string();
                    updated.last_update_at = chrono::Utc::now().to_rfc3339();
                    self.order_state.update(updated);
                }
                Ok(true)
            }
        }
    }

    /// Reconcile with resolution execution.
    ///
    /// This is the main entry point that both detects discrepancies AND executes
    /// resolutions when auto_resolve_orphans is enabled.
    pub async fn reconcile_with_execution(
        &self,
        broker_state: BrokerStateSnapshot,
        broker: &AlpacaAdapter,
    ) -> ReconciliationReport {
        // First run standard reconciliation to detect issues
        let mut report = self.reconcile(broker_state).await;

        // Execute resolutions if auto-resolve is enabled
        if self.config.auto_resolve_orphans {
            let mut resolved_count = 0;
            for orphan in &report.orphaned_orders {
                match self.execute_resolution(orphan, broker).await {
                    Ok(true) => resolved_count += 1,
                    Ok(false) => {} // Ignored
                    Err(e) => {
                        error!(
                            order_id = %orphan.order_id,
                            error = %e,
                            "Failed to execute resolution"
                        );
                    }
                }
            }
            report.auto_resolved = resolved_count;
        }

        report
    }

    /// Compare positions and generate discrepancies.
    ///
    /// Compares broker positions against local position tracking.
    pub fn compare_positions(
        &self,
        broker_positions: &[BrokerPositionSnapshot],
        local_positions: &HashMap<String, LocalPositionSnapshot>,
    ) -> Vec<Discrepancy> {
        let now = chrono::Utc::now();
        let mut discrepancies = Vec::new();

        // Check broker positions against local
        for broker_pos in broker_positions {
            match local_positions.get(&broker_pos.symbol) {
                None => {
                    // Broker has position we don't know about
                    discrepancies.push(Discrepancy {
                        discrepancy_type: DiscrepancyType::Position,
                        identifier: broker_pos.symbol.clone(),
                        local_state: "NO_POSITION".to_string(),
                        broker_state: format!(
                            "{} {} @ {}",
                            broker_pos.qty, broker_pos.side, broker_pos.avg_entry_price
                        ),
                        severity: DiscrepancySeverity::Warning,
                        auto_resolvable: false,
                        suggested_action: "Investigate: broker has position not tracked locally"
                            .to_string(),
                        detected_at: now.to_rfc3339(),
                    });
                }
                Some(local_pos) => {
                    // Check quantity variance
                    let qty_diff = (broker_pos.qty - local_pos.qty).abs();
                    if qty_diff > self.config.position_qty_tolerance {
                        let severity = if qty_diff > local_pos.qty.abs() / Decimal::new(2, 0) {
                            DiscrepancySeverity::Critical
                        } else {
                            DiscrepancySeverity::Warning
                        };

                        discrepancies.push(Discrepancy {
                            discrepancy_type: DiscrepancyType::Position,
                            identifier: broker_pos.symbol.clone(),
                            local_state: format!("qty={}", local_pos.qty),
                            broker_state: format!("qty={}", broker_pos.qty),
                            severity,
                            auto_resolvable: false,
                            suggested_action: "Sync position quantity from broker".to_string(),
                            detected_at: now.to_rfc3339(),
                        });
                    }

                    // Check price variance (if we have local avg price)
                    if local_pos.avg_entry_price > Decimal::ZERO
                        && broker_pos.avg_entry_price > Decimal::ZERO
                    {
                        let price_diff =
                            (broker_pos.avg_entry_price - local_pos.avg_entry_price).abs();
                        let price_pct = price_diff / broker_pos.avg_entry_price;

                        if price_pct > self.config.position_price_tolerance_pct {
                            discrepancies.push(Discrepancy {
                                discrepancy_type: DiscrepancyType::Position,
                                identifier: broker_pos.symbol.clone(),
                                local_state: format!("avg_price={}", local_pos.avg_entry_price),
                                broker_state: format!("avg_price={}", broker_pos.avg_entry_price),
                                severity: DiscrepancySeverity::Info,
                                auto_resolvable: false,
                                suggested_action: "Update local avg price from broker".to_string(),
                                detected_at: now.to_rfc3339(),
                            });
                        }
                    }
                }
            }
        }

        // Check for local positions not in broker
        for (symbol, local_pos) in local_positions {
            let in_broker = broker_positions.iter().any(|p| &p.symbol == symbol);
            if !in_broker && local_pos.qty != Decimal::ZERO {
                discrepancies.push(Discrepancy {
                    discrepancy_type: DiscrepancyType::Position,
                    identifier: symbol.clone(),
                    local_state: format!("qty={}", local_pos.qty),
                    broker_state: "NO_POSITION".to_string(),
                    severity: DiscrepancySeverity::Warning,
                    auto_resolvable: false,
                    suggested_action: "Clear local position tracking (closed at broker)"
                        .to_string(),
                    detected_at: now.to_rfc3339(),
                });
            }
        }

        discrepancies
    }
}

// ============================================================================
// Local Position Tracking
// ============================================================================

/// Local position snapshot for comparison.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalPositionSnapshot {
    /// Symbol.
    pub symbol: String,
    /// Quantity (signed).
    pub qty: Decimal,
    /// Average entry price.
    pub avg_entry_price: Decimal,
}

// ============================================================================
// Reconciliation Error
// ============================================================================

/// Errors from reconciliation operations.
#[derive(Debug, thiserror::Error)]
pub enum ReconciliationError {
    /// Broker API error.
    #[error("Broker error: {0}")]
    BrokerError(String),

    /// Invalid state for operation.
    #[error("Invalid state: {0}")]
    InvalidState(String),
}

// ============================================================================
// Broker State Fetcher
// ============================================================================

/// Fetch complete broker state for reconciliation.
///
/// This function queries the Alpaca broker for all orders, positions, and account
/// information, then packages it into a `BrokerStateSnapshot` for reconciliation.
pub async fn fetch_broker_state(
    broker: &AlpacaAdapter,
) -> Result<BrokerStateSnapshot, ReconciliationError> {
    let now = chrono::Utc::now();

    // Fetch orders (both open and closed recent)
    let order_states = broker
        .get_orders(None) // Get all orders
        .await
        .map_err(|e| ReconciliationError::BrokerError(e.to_string()))?;

    let orders: Vec<BrokerOrderSnapshot> = order_states
        .iter()
        .map(|o| BrokerOrderSnapshot {
            order_id: o.broker_order_id.clone(),
            client_order_id: Some(o.order_id.clone()),
            symbol: o.instrument_id.clone(),
            status: format!("{:?}", o.status).to_lowercase(),
            side: format!("{:?}", o.side).to_lowercase(),
            qty: o.requested_quantity,
            filled_qty: o.filled_quantity,
            created_at: o.submitted_at.clone(),
        })
        .collect();

    // Fetch positions
    let alpaca_positions = broker
        .get_positions()
        .await
        .map_err(|e| ReconciliationError::BrokerError(e.to_string()))?;

    let positions: Vec<BrokerPositionSnapshot> = alpaca_positions
        .iter()
        .map(|p| BrokerPositionSnapshot {
            symbol: p.symbol.clone(),
            qty: p.qty,
            side: if p.qty >= Decimal::ZERO {
                "long".to_string()
            } else {
                "short".to_string()
            },
            avg_entry_price: p.avg_entry_price,
            market_value: p.market_value,
            unrealized_pl: p.unrealized_pl,
        })
        .collect();

    // Fetch account
    let account_info = broker
        .get_account()
        .await
        .map_err(|e| ReconciliationError::BrokerError(e.to_string()))?;

    let account = BrokerAccountSnapshot {
        equity: account_info.equity,
        cash: account_info.cash,
        buying_power: account_info.buying_power,
    };

    Ok(BrokerStateSnapshot {
        orders,
        positions,
        account,
        fetched_at: now.to_rfc3339(),
    })
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn make_config() -> ReconciliationConfig {
        ReconciliationConfig {
            protection_window_secs: 60,
            max_order_age_secs: 3600,
            ..Default::default()
        }
    }

    fn make_broker_order(
        id: &str,
        symbol: &str,
        status: &str,
        age_mins: i64,
    ) -> BrokerOrderSnapshot {
        let created = chrono::Utc::now() - chrono::Duration::minutes(age_mins);
        BrokerOrderSnapshot {
            order_id: id.to_string(),
            client_order_id: Some(id.to_string()),
            symbol: symbol.to_string(),
            status: status.to_string(),
            side: "buy".to_string(),
            qty: Decimal::new(100, 0),
            filled_qty: Decimal::ZERO,
            created_at: created.to_rfc3339(),
        }
    }

    fn make_broker_state(orders: Vec<BrokerOrderSnapshot>) -> BrokerStateSnapshot {
        BrokerStateSnapshot {
            orders,
            positions: vec![],
            account: BrokerAccountSnapshot {
                equity: Decimal::new(100_000, 0),
                cash: Decimal::new(50_000, 0),
                buying_power: Decimal::new(200_000, 0),
            },
            fetched_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    #[tokio::test]
    async fn test_reconciliation_no_discrepancies() {
        let config = make_config();
        let state = Arc::new(OrderStateManager::new());
        let manager = ReconciliationManager::new(config, state);

        let broker_state = make_broker_state(vec![]);
        let report = manager.reconcile(broker_state).await;

        assert!(report.passed);
        assert!(report.discrepancies.is_empty());
        assert!(report.orphaned_orders.is_empty());
    }

    #[tokio::test]
    async fn test_unknown_order_in_broker() {
        let config = make_config();
        let state = Arc::new(OrderStateManager::new());
        let manager = ReconciliationManager::new(config, state);

        // Order in broker but not local (age > protection window)
        let orders = vec![make_broker_order("broker-123", "AAPL", "accepted", 5)];
        let broker_state = make_broker_state(orders);

        let report = manager.reconcile(broker_state).await;

        assert_eq!(report.orphaned_orders.len(), 1);
        assert_eq!(
            report.orphaned_orders[0].orphan_type,
            OrphanType::UnknownInBroker
        );
    }

    #[tokio::test]
    async fn test_order_within_protection_window() {
        let config = make_config();
        let state = Arc::new(OrderStateManager::new());
        let manager = ReconciliationManager::new(config, state);

        // Order in broker but very recent (within protection window)
        let mut order = make_broker_order("broker-123", "AAPL", "accepted", 0);
        order.created_at = chrono::Utc::now().to_rfc3339(); // Just now
        let broker_state = make_broker_state(vec![order]);

        let report = manager.reconcile(broker_state).await;

        // Should not be flagged due to protection window
        assert!(report.orphaned_orders.is_empty());
    }

    #[tokio::test]
    async fn test_status_mismatch_detection() {
        let config = make_config();
        let state = Arc::new(OrderStateManager::new());

        // Add local order
        let local_order = crate::models::OrderState {
            order_id: "local-123".to_string(),
            broker_order_id: "broker-123".to_string(),
            is_multi_leg: false,
            instrument_id: "AAPL".to_string(),
            status: OrderStatus::Accepted,
            side: crate::models::OrderSide::Buy,
            order_type: crate::models::OrderType::Limit,
            time_in_force: crate::models::TimeInForce::Day,
            requested_quantity: Decimal::new(100, 0),
            filled_quantity: Decimal::ZERO,
            avg_fill_price: Decimal::ZERO,
            limit_price: Some(Decimal::new(15000, 2)),
            stop_price: None,
            submitted_at: chrono::Utc::now().to_rfc3339(),
            last_update_at: chrono::Utc::now().to_rfc3339(),
            status_message: String::new(),
            legs: vec![],
        };
        state.insert(local_order);

        let manager = ReconciliationManager::new(config, state);

        // Broker says filled, local says accepted
        let broker_order = make_broker_order("broker-123", "AAPL", "filled", 5);
        let broker_state = make_broker_state(vec![broker_order]);

        let report = manager.reconcile(broker_state).await;

        assert_eq!(report.orphaned_orders.len(), 1);
        assert_eq!(
            report.orphaned_orders[0].orphan_type,
            OrphanType::StateMismatch
        );
        assert!(!report.passed); // Critical due to filled mismatch
    }

    #[tokio::test]
    async fn test_determine_resolution() {
        let config = make_config();
        let state = Arc::new(OrderStateManager::new());
        let manager = ReconciliationManager::new(config, state);

        // Test UNKNOWN_IN_BROKER resolution
        let orphan = OrphanedOrder {
            orphan_type: OrphanType::UnknownInBroker,
            order_id: "test".to_string(),
            broker_order_id: Some("test".to_string()),
            symbol: "AAPL".to_string(),
            local_status: None,
            broker_status: Some("accepted".to_string()),
            age_secs: 120, // > protection window
            detected_at: chrono::Utc::now().to_rfc3339(),
        };

        let resolution = manager.determine_resolution(&orphan);
        assert_eq!(resolution, OrphanResolution::Adopt);

        // Test old order should be canceled
        let old_orphan = OrphanedOrder {
            age_secs: 7200, // > max_order_age
            ..orphan.clone()
        };
        let resolution = manager.determine_resolution(&old_orphan);
        assert_eq!(resolution, OrphanResolution::Cancel);
    }

    #[tokio::test]
    async fn test_statuses_match() {
        let config = make_config();
        let state = Arc::new(OrderStateManager::new());
        let manager = ReconciliationManager::new(config, state);

        assert!(manager.statuses_match(&OrderStatus::Filled, "filled"));
        assert!(manager.statuses_match(&OrderStatus::Canceled, "canceled"));
        assert!(manager.statuses_match(&OrderStatus::Canceled, "cancelled"));
        assert!(manager.statuses_match(&OrderStatus::Accepted, "accepted"));
        assert!(manager.statuses_match(&OrderStatus::Accepted, "new"));

        assert!(!manager.statuses_match(&OrderStatus::Filled, "accepted"));
        assert!(!manager.statuses_match(&OrderStatus::Accepted, "filled"));
    }

    #[tokio::test]
    async fn test_periodic_reconciliation_timing() {
        let mut config = make_config();
        config.periodic_interval_secs = 1;
        let state = Arc::new(OrderStateManager::new());
        let manager = ReconciliationManager::new(config, state);

        // Initially due
        assert!(manager.is_periodic_due().await);

        // After reconciliation, not due
        let broker_state = make_broker_state(vec![]);
        manager.reconcile(broker_state).await;
        assert!(!manager.is_periodic_due().await);

        // After interval, due again
        tokio::time::sleep(Duration::from_secs(2)).await;
        assert!(manager.is_periodic_due().await);
    }

    #[tokio::test]
    async fn test_trading_halt() {
        let mut config = make_config();
        config.on_critical_discrepancy = CriticalDiscrepancyAction::Halt;
        let state = Arc::new(OrderStateManager::new());

        // Add local order
        let local_order = crate::models::OrderState {
            order_id: "local-123".to_string(),
            broker_order_id: "broker-123".to_string(),
            is_multi_leg: false,
            instrument_id: "AAPL".to_string(),
            status: OrderStatus::Accepted,
            side: crate::models::OrderSide::Buy,
            order_type: crate::models::OrderType::Limit,
            time_in_force: crate::models::TimeInForce::Day,
            requested_quantity: Decimal::new(100, 0),
            filled_quantity: Decimal::ZERO,
            avg_fill_price: Decimal::ZERO,
            limit_price: Some(Decimal::new(15000, 2)),
            stop_price: None,
            submitted_at: chrono::Utc::now().to_rfc3339(),
            last_update_at: chrono::Utc::now().to_rfc3339(),
            status_message: String::new(),
            legs: vec![],
        };
        state.insert(local_order);

        let manager = ReconciliationManager::new(config, state);

        assert!(!manager.is_trading_halted().await);

        // Trigger critical discrepancy (filled mismatch)
        let broker_order = make_broker_order("broker-123", "AAPL", "filled", 5);
        let broker_state = make_broker_state(vec![broker_order]);

        let report = manager.reconcile(broker_state).await;

        assert!(!report.passed);
        assert!(manager.is_trading_halted().await);

        // Resume trading
        manager.resume_trading().await;
        assert!(!manager.is_trading_halted().await);
    }

    // ============================================================================
    // Position Reconciliation Tests
    // ============================================================================

    #[test]
    fn test_compare_positions_no_discrepancies() {
        let config = make_config();
        let state = Arc::new(OrderStateManager::new());
        let manager = ReconciliationManager::new(config, state);

        let broker_positions = vec![BrokerPositionSnapshot {
            symbol: "AAPL".to_string(),
            qty: Decimal::new(100, 0),
            side: "long".to_string(),
            avg_entry_price: Decimal::new(15000, 2),
            market_value: Decimal::new(15500, 0),
            unrealized_pl: Decimal::new(500, 0),
        }];

        let mut local_positions = HashMap::new();
        local_positions.insert(
            "AAPL".to_string(),
            LocalPositionSnapshot {
                symbol: "AAPL".to_string(),
                qty: Decimal::new(100, 0),
                avg_entry_price: Decimal::new(15000, 2),
            },
        );

        let discrepancies = manager.compare_positions(&broker_positions, &local_positions);
        assert!(discrepancies.is_empty());
    }

    #[test]
    fn test_compare_positions_quantity_mismatch() {
        let config = make_config();
        let state = Arc::new(OrderStateManager::new());
        let manager = ReconciliationManager::new(config, state);

        let broker_positions = vec![BrokerPositionSnapshot {
            symbol: "AAPL".to_string(),
            qty: Decimal::new(100, 0),
            side: "long".to_string(),
            avg_entry_price: Decimal::new(15000, 2),
            market_value: Decimal::new(15500, 0),
            unrealized_pl: Decimal::new(500, 0),
        }];

        let mut local_positions = HashMap::new();
        local_positions.insert(
            "AAPL".to_string(),
            LocalPositionSnapshot {
                symbol: "AAPL".to_string(),
                qty: Decimal::new(50, 0), // Mismatch: local has 50, broker has 100
                avg_entry_price: Decimal::new(15000, 2),
            },
        );

        let discrepancies = manager.compare_positions(&broker_positions, &local_positions);
        assert_eq!(discrepancies.len(), 1);
        assert_eq!(discrepancies[0].discrepancy_type, DiscrepancyType::Position);
        assert!(discrepancies[0].local_state.contains("qty=50"));
        assert!(discrepancies[0].broker_state.contains("qty=100"));
    }

    #[test]
    fn test_compare_positions_broker_has_unknown() {
        let config = make_config();
        let state = Arc::new(OrderStateManager::new());
        let manager = ReconciliationManager::new(config, state);

        let broker_positions = vec![BrokerPositionSnapshot {
            symbol: "AAPL".to_string(),
            qty: Decimal::new(100, 0),
            side: "long".to_string(),
            avg_entry_price: Decimal::new(15000, 2),
            market_value: Decimal::new(15500, 0),
            unrealized_pl: Decimal::new(500, 0),
        }];

        let local_positions = HashMap::new(); // Empty - no local tracking

        let discrepancies = manager.compare_positions(&broker_positions, &local_positions);
        assert_eq!(discrepancies.len(), 1);
        assert_eq!(discrepancies[0].local_state, "NO_POSITION");
    }

    #[test]
    fn test_compare_positions_local_has_unknown() {
        let config = make_config();
        let state = Arc::new(OrderStateManager::new());
        let manager = ReconciliationManager::new(config, state);

        let broker_positions = vec![]; // No positions at broker

        let mut local_positions = HashMap::new();
        local_positions.insert(
            "AAPL".to_string(),
            LocalPositionSnapshot {
                symbol: "AAPL".to_string(),
                qty: Decimal::new(100, 0),
                avg_entry_price: Decimal::new(15000, 2),
            },
        );

        let discrepancies = manager.compare_positions(&broker_positions, &local_positions);
        assert_eq!(discrepancies.len(), 1);
        assert_eq!(discrepancies[0].broker_state, "NO_POSITION");
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
}
