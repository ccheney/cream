//! State persistence for crash recovery.
//!
//! Provides database integration for persisting order and portfolio state,
//! enabling recovery after system crashes.
//!
//! Uses Turso (Rust rewrite of `SQLite`) for durable state storage.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;
use tracing::{debug, info};
use turso::{Builder, Database, Error as TursoError, Row, Value};

use super::reconciliation::{LocalPositionSnapshot, ReconciliationReport};
use super::state::OrderStateManager;
use crate::models::{OrderSide, OrderState, OrderStatus, OrderType, TimeInForce};

// ============================================================================
// Errors
// ============================================================================

/// Errors from persistence operations.
#[derive(Debug, Error)]
pub enum PersistenceError {
    /// Database connection error.
    #[error("Database connection error: {0}")]
    Connection(String),

    /// Query execution error.
    #[error("Query error: {0}")]
    Query(String),

    /// Serialization error.
    #[error("Serialization error: {0}")]
    Serialization(String),

    /// Data integrity error.
    #[error("Data integrity error: {0}")]
    Integrity(String),

    /// Missing required field.
    #[error("Missing field: {0}")]
    MissingField(String),
}

impl From<TursoError> for PersistenceError {
    fn from(err: TursoError) -> Self {
        PersistenceError::Connection(err.to_string())
    }
}

impl From<serde_json::Error> for PersistenceError {
    fn from(err: serde_json::Error) -> Self {
        PersistenceError::Serialization(err.to_string())
    }
}

// ============================================================================
// State Snapshot (Serializable)
// ============================================================================

/// Serializable order snapshot for database storage.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderSnapshot {
    /// Internal order ID.
    pub order_id: String,
    /// Broker's order ID.
    pub broker_order_id: String,
    /// Instrument/symbol.
    pub instrument_id: String,
    /// Order status.
    pub status: String,
    /// Order side (buy/sell).
    pub side: String,
    /// Order type.
    pub order_type: String,
    /// Time in force.
    pub time_in_force: String,
    /// Requested quantity.
    pub requested_quantity: Decimal,
    /// Filled quantity.
    pub filled_quantity: Decimal,
    /// Average fill price.
    pub avg_fill_price: Decimal,
    /// Limit price (if limit order).
    pub limit_price: Option<Decimal>,
    /// Stop price (if stop order).
    pub stop_price: Option<Decimal>,
    /// Submission timestamp.
    pub submitted_at: String,
    /// Last update timestamp.
    pub last_update_at: String,
    /// Status message.
    pub status_message: String,
    /// Whether this is a multi-leg order.
    pub is_multi_leg: bool,
}

impl OrderSnapshot {
    /// Create snapshot from `OrderState`.
    pub fn from_order_state(order: &OrderState) -> Self {
        Self {
            order_id: order.order_id.clone(),
            broker_order_id: order.broker_order_id.clone(),
            instrument_id: order.instrument_id.clone(),
            status: format!("{:?}", order.status),
            side: format!("{:?}", order.side),
            order_type: format!("{:?}", order.order_type),
            time_in_force: format!("{:?}", order.time_in_force),
            requested_quantity: order.requested_quantity,
            filled_quantity: order.filled_quantity,
            avg_fill_price: order.avg_fill_price,
            limit_price: order.limit_price,
            stop_price: order.stop_price,
            submitted_at: order.submitted_at.clone(),
            last_update_at: order.last_update_at.clone(),
            status_message: order.status_message.clone(),
            is_multi_leg: order.is_multi_leg,
        }
    }

    /// Convert snapshot back to `OrderState`.
    pub fn to_order_state(&self) -> OrderState {
        OrderState {
            order_id: self.order_id.clone(),
            broker_order_id: self.broker_order_id.clone(),
            is_multi_leg: self.is_multi_leg,
            instrument_id: self.instrument_id.clone(),
            status: parse_order_status(&self.status),
            side: parse_order_side(&self.side),
            order_type: parse_order_type(&self.order_type),
            time_in_force: parse_time_in_force(&self.time_in_force),
            requested_quantity: self.requested_quantity,
            filled_quantity: self.filled_quantity,
            avg_fill_price: self.avg_fill_price,
            limit_price: self.limit_price,
            stop_price: self.stop_price,
            submitted_at: self.submitted_at.clone(),
            last_update_at: self.last_update_at.clone(),
            status_message: self.status_message.clone(),
            legs: vec![],
        }
    }
}

/// Full state snapshot for persistence.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateSnapshot {
    /// All orders in the state manager.
    pub orders: Vec<OrderSnapshot>,
    /// Current positions (calculated from filled orders).
    pub positions: HashMap<String, LocalPositionSnapshot>,
    /// Snapshot timestamp.
    pub timestamp: String,
    /// Environment (PAPER/LIVE).
    pub environment: String,
    /// Current cycle ID (if any).
    pub cycle_id: Option<String>,
}

// ============================================================================
// State Persistence Manager
// ============================================================================

/// Manages state persistence to database.
pub struct StatePersistence {
    /// Database connection.
    db: Database,
    /// Environment (PAPER/LIVE/BACKTEST).
    environment: String,
}

impl StatePersistence {
    /// Create a new persistence manager with local database.
    pub async fn new_local(db_path: &str, environment: &str) -> Result<Self, PersistenceError> {
        let db = Builder::new_local(db_path).build().await?;

        // Run migrations if needed
        Self::run_migrations(&db).await?;

        Ok(Self {
            db,
            environment: environment.to_string(),
        })
    }

    /// Create a new persistence manager (for testing with in-memory db).
    pub async fn new_in_memory(environment: &str) -> Result<Self, PersistenceError> {
        let db = Builder::new_local(":memory:").build().await?;

        // Run migrations
        Self::run_migrations(&db).await?;

        Ok(Self {
            db,
            environment: environment.to_string(),
        })
    }

    /// Run database migrations for state persistence tables.
    async fn run_migrations(db: &Database) -> Result<(), PersistenceError> {
        let conn = db.connect()?;

        // Create order snapshots table if not exists
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS order_snapshots (
                order_id TEXT PRIMARY KEY,
                broker_order_id TEXT NOT NULL,
                instrument_id TEXT NOT NULL,
                status TEXT NOT NULL,
                side TEXT NOT NULL,
                order_type TEXT NOT NULL,
                time_in_force TEXT NOT NULL,
                requested_quantity TEXT NOT NULL,
                filled_quantity TEXT NOT NULL,
                avg_fill_price TEXT NOT NULL,
                limit_price TEXT,
                stop_price TEXT,
                submitted_at TEXT NOT NULL,
                last_update_at TEXT NOT NULL,
                status_message TEXT,
                is_multi_leg INTEGER NOT NULL DEFAULT 0,
                environment TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_order_snapshots_broker_id
             ON order_snapshots(broker_order_id);

            CREATE INDEX IF NOT EXISTS idx_order_snapshots_env_status
             ON order_snapshots(environment, status);

            CREATE TABLE IF NOT EXISTS position_snapshots (
                symbol TEXT PRIMARY KEY,
                quantity TEXT NOT NULL,
                avg_entry_price TEXT NOT NULL,
                environment TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS recovery_state (
                environment TEXT PRIMARY KEY,
                last_snapshot_at TEXT,
                last_reconciliation_at TEXT,
                last_cycle_id TEXT,
                status TEXT NOT NULL DEFAULT 'unknown',
                error_message TEXT,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );",
        )
        .await
        .map_err(|e| PersistenceError::Query(e.to_string()))?;

        info!("State persistence migrations complete");
        Ok(())
    }

    /// Save current order state to database.
    pub async fn save_order(&self, order: &OrderState) -> Result<(), PersistenceError> {
        let conn = self.db.connect()?;
        let snapshot = OrderSnapshot::from_order_state(order);

        let params: Vec<Value> = vec![
            Value::Text(snapshot.order_id.clone()),
            Value::Text(snapshot.broker_order_id.clone()),
            Value::Text(snapshot.instrument_id.clone()),
            Value::Text(snapshot.status.clone()),
            Value::Text(snapshot.side.clone()),
            Value::Text(snapshot.order_type.clone()),
            Value::Text(snapshot.time_in_force.clone()),
            Value::Text(snapshot.requested_quantity.to_string()),
            Value::Text(snapshot.filled_quantity.to_string()),
            Value::Text(snapshot.avg_fill_price.to_string()),
            snapshot
                .limit_price
                .map(|p| Value::Text(p.to_string()))
                .unwrap_or(Value::Null),
            snapshot
                .stop_price
                .map(|p| Value::Text(p.to_string()))
                .unwrap_or(Value::Null),
            Value::Text(snapshot.submitted_at.clone()),
            Value::Text(snapshot.last_update_at.clone()),
            Value::Text(snapshot.status_message.clone()),
            Value::Integer(if snapshot.is_multi_leg { 1 } else { 0 }),
            Value::Text(self.environment.clone()),
        ];

        conn.execute(
            "INSERT OR REPLACE INTO order_snapshots (
                order_id, broker_order_id, instrument_id, status, side,
                order_type, time_in_force, requested_quantity, filled_quantity,
                avg_fill_price, limit_price, stop_price, submitted_at,
                last_update_at, status_message, is_multi_leg, environment, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))",
            params,
        )
        .await
        .map_err(|e| PersistenceError::Query(e.to_string()))?;

        debug!(order_id = %order.order_id, "Order saved to database");
        Ok(())
    }

    /// Save all orders from state manager to database.
    pub async fn save_all_orders(
        &self,
        state_manager: &OrderStateManager,
    ) -> Result<usize, PersistenceError> {
        let orders = state_manager.get_active_orders();
        let mut count = 0;

        for order in &orders {
            self.save_order(order).await?;
            count += 1;
        }

        info!(count = count, "Saved all orders to database");
        Ok(count)
    }

    /// Load active orders from database into state manager.
    pub async fn load_active_orders(
        &self,
        state_manager: &OrderStateManager,
    ) -> Result<usize, PersistenceError> {
        let conn = self.db.connect()?;

        let params: Vec<Value> = vec![Value::Text(self.environment.clone())];

        let mut rows = conn
            .query(
                "SELECT order_id, broker_order_id, instrument_id, status, side,
                    order_type, time_in_force, requested_quantity, filled_quantity,
                    avg_fill_price, limit_price, stop_price, submitted_at,
                    last_update_at, status_message, is_multi_leg
             FROM order_snapshots
             WHERE environment = ? AND status NOT IN ('Filled', 'Canceled', 'Rejected', 'Expired')",
                params,
            )
            .await
            .map_err(|e| PersistenceError::Query(e.to_string()))?;

        let mut count = 0;
        while let Some(row) = rows
            .next()
            .await
            .map_err(|e| PersistenceError::Query(e.to_string()))?
        {
            let snapshot = self.row_to_order_snapshot(&row)?;
            let order_state = snapshot.to_order_state();
            state_manager.insert(order_state);
            count += 1;
        }

        info!(count = count, "Loaded active orders from database");
        Ok(count)
    }

    /// Convert database row to `OrderSnapshot`.
    fn row_to_order_snapshot(&self, row: &Row) -> Result<OrderSnapshot, PersistenceError> {
        Ok(OrderSnapshot {
            order_id: row
                .get::<String>(0)
                .map_err(|e| PersistenceError::MissingField(format!("order_id: {e}")))?,
            broker_order_id: row
                .get::<String>(1)
                .map_err(|e| PersistenceError::MissingField(format!("broker_order_id: {e}")))?,
            instrument_id: row
                .get::<String>(2)
                .map_err(|e| PersistenceError::MissingField(format!("instrument_id: {e}")))?,
            status: row
                .get::<String>(3)
                .map_err(|e| PersistenceError::MissingField(format!("status: {e}")))?,
            side: row
                .get::<String>(4)
                .map_err(|e| PersistenceError::MissingField(format!("side: {e}")))?,
            order_type: row
                .get::<String>(5)
                .map_err(|e| PersistenceError::MissingField(format!("order_type: {e}")))?,
            time_in_force: row
                .get::<String>(6)
                .map_err(|e| PersistenceError::MissingField(format!("time_in_force: {e}")))?,
            requested_quantity: row
                .get::<String>(7)
                .map_err(|e| PersistenceError::MissingField(format!("requested_quantity: {e}")))?
                .parse()
                .unwrap_or(Decimal::ZERO),
            filled_quantity: row
                .get::<String>(8)
                .map_err(|e| PersistenceError::MissingField(format!("filled_quantity: {e}")))?
                .parse()
                .unwrap_or(Decimal::ZERO),
            avg_fill_price: row
                .get::<String>(9)
                .map_err(|e| PersistenceError::MissingField(format!("avg_fill_price: {e}")))?
                .parse()
                .unwrap_or(Decimal::ZERO),
            limit_price: row.get::<String>(10).ok().and_then(|s| s.parse().ok()),
            stop_price: row.get::<String>(11).ok().and_then(|s| s.parse().ok()),
            submitted_at: row
                .get::<String>(12)
                .map_err(|e| PersistenceError::MissingField(format!("submitted_at: {e}")))?,
            last_update_at: row
                .get::<String>(13)
                .map_err(|e| PersistenceError::MissingField(format!("last_update_at: {e}")))?,
            status_message: row.get::<String>(14).unwrap_or_default(),
            is_multi_leg: row.get::<i64>(15).unwrap_or(0) != 0,
        })
    }

    /// Save position snapshot.
    pub async fn save_position(
        &self,
        position: &LocalPositionSnapshot,
    ) -> Result<(), PersistenceError> {
        let conn = self.db.connect()?;

        let params: Vec<Value> = vec![
            Value::Text(position.symbol.clone()),
            Value::Text(position.qty.to_string()),
            Value::Text(position.avg_entry_price.to_string()),
            Value::Text(self.environment.clone()),
        ];

        conn.execute(
            "INSERT OR REPLACE INTO position_snapshots (
                symbol, quantity, avg_entry_price, environment, updated_at
            ) VALUES (?, ?, ?, ?, datetime('now'))",
            params,
        )
        .await
        .map_err(|e| PersistenceError::Query(e.to_string()))?;

        debug!(symbol = %position.symbol, "Position saved to database");
        Ok(())
    }

    /// Load positions from database.
    pub async fn load_positions(
        &self,
    ) -> Result<HashMap<String, LocalPositionSnapshot>, PersistenceError> {
        let conn = self.db.connect()?;

        let params: Vec<Value> = vec![Value::Text(self.environment.clone())];

        let mut rows = conn
            .query(
                "SELECT symbol, quantity, avg_entry_price FROM position_snapshots WHERE environment = ?",
                params,
            )
            .await
            .map_err(|e| PersistenceError::Query(e.to_string()))?;

        let mut positions = HashMap::new();
        while let Some(row) = rows
            .next()
            .await
            .map_err(|e| PersistenceError::Query(e.to_string()))?
        {
            let symbol: String = row
                .get(0)
                .map_err(|e| PersistenceError::MissingField(format!("symbol: {e}")))?;
            let qty: Decimal = row
                .get::<String>(1)
                .map_err(|e| PersistenceError::MissingField(format!("quantity: {e}")))?
                .parse()
                .unwrap_or(Decimal::ZERO);
            let avg_entry_price: Decimal = row
                .get::<String>(2)
                .map_err(|e| PersistenceError::MissingField(format!("avg_entry_price: {e}")))?
                .parse()
                .unwrap_or(Decimal::ZERO);

            positions.insert(
                symbol.clone(),
                LocalPositionSnapshot {
                    symbol,
                    qty,
                    avg_entry_price,
                },
            );
        }

        info!(count = positions.len(), "Loaded positions from database");
        Ok(positions)
    }

    /// Update recovery state.
    pub async fn update_recovery_state(
        &self,
        cycle_id: Option<&str>,
        status: &str,
        error_message: Option<&str>,
    ) -> Result<(), PersistenceError> {
        let conn = self.db.connect()?;

        let params: Vec<Value> = vec![
            Value::Text(self.environment.clone()),
            cycle_id
                .map(|s| Value::Text(s.to_string()))
                .unwrap_or(Value::Null),
            Value::Text(status.to_string()),
            error_message
                .map(|s| Value::Text(s.to_string()))
                .unwrap_or(Value::Null),
        ];

        conn.execute(
            "INSERT OR REPLACE INTO recovery_state (
                environment, last_snapshot_at, last_cycle_id, status, error_message, updated_at
            ) VALUES (?, datetime('now'), ?, ?, ?, datetime('now'))",
            params,
        )
        .await
        .map_err(|e| PersistenceError::Query(e.to_string()))?;

        debug!(status = status, "Recovery state updated");
        Ok(())
    }

    /// Get recovery state.
    pub async fn get_recovery_state(&self) -> Result<RecoveryState, PersistenceError> {
        let conn = self.db.connect()?;

        let params: Vec<Value> = vec![Value::Text(self.environment.clone())];

        let mut rows = conn
            .query(
                "SELECT last_snapshot_at, last_reconciliation_at, last_cycle_id, status, error_message
             FROM recovery_state WHERE environment = ?",
                params,
            )
            .await
            .map_err(|e| PersistenceError::Query(e.to_string()))?;

        if let Some(row) = rows
            .next()
            .await
            .map_err(|e| PersistenceError::Query(e.to_string()))?
        {
            Ok(RecoveryState {
                last_snapshot_at: row.get(0).ok(),
                last_reconciliation_at: row.get(1).ok(),
                last_cycle_id: row.get(2).ok(),
                status: row.get(3).unwrap_or_else(|_| "unknown".to_string()),
                error_message: row.get(4).ok(),
            })
        } else {
            Ok(RecoveryState::default())
        }
    }

    /// Log reconciliation completion.
    pub async fn log_reconciliation(
        &self,
        report: &ReconciliationReport,
    ) -> Result<(), PersistenceError> {
        let conn = self.db.connect()?;

        let status = if report.passed {
            "healthy"
        } else {
            "needs_attention"
        };

        let params: Vec<Value> = vec![
            Value::Text(status.to_string()),
            Value::Text(self.environment.clone()),
        ];

        conn.execute(
            "UPDATE recovery_state SET
                last_reconciliation_at = datetime('now'),
                status = ?,
                updated_at = datetime('now')
             WHERE environment = ?",
            params,
        )
        .await
        .map_err(|e| PersistenceError::Query(e.to_string()))?;

        info!(
            passed = report.passed,
            discrepancies = report.discrepancies.len(),
            orphans = report.orphaned_orders.len(),
            "Reconciliation logged"
        );
        Ok(())
    }

    /// Sync with remote (no-op for local database).
    pub async fn sync(&self) -> Result<(), PersistenceError> {
        // Note: Turso local databases don't need sync
        // For remote sync, we'd need a different builder configuration
        Ok(())
    }
}

// ============================================================================
// Recovery State
// ============================================================================

/// Recovery state from database.
#[derive(Debug, Clone)]
pub struct RecoveryState {
    /// Last state snapshot time.
    pub last_snapshot_at: Option<String>,
    /// Last reconciliation time.
    pub last_reconciliation_at: Option<String>,
    /// Last cycle ID processed.
    pub last_cycle_id: Option<String>,
    /// Current recovery status.
    pub status: String,
    /// Error message if any.
    pub error_message: Option<String>,
}

impl Default for RecoveryState {
    fn default() -> Self {
        Self {
            last_snapshot_at: None,
            last_reconciliation_at: None,
            last_cycle_id: None,
            status: "unknown".to_string(),
            error_message: None,
        }
    }
}

impl RecoveryState {
    /// Check if recovery is needed.
    pub fn needs_recovery(&self) -> bool {
        self.status == "error" || self.status == "interrupted" || self.status == "unknown"
    }

    /// Check if state is healthy.
    pub fn is_healthy(&self) -> bool {
        self.status == "healthy"
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

fn parse_order_status(s: &str) -> OrderStatus {
    match s {
        "New" => OrderStatus::New,
        "Accepted" => OrderStatus::Accepted,
        "PartiallyFilled" => OrderStatus::PartiallyFilled,
        "Filled" => OrderStatus::Filled,
        "Canceled" => OrderStatus::Canceled,
        "Rejected" => OrderStatus::Rejected,
        "Expired" => OrderStatus::Expired,
        _ => OrderStatus::New,
    }
}

fn parse_order_side(s: &str) -> OrderSide {
    match s {
        "Buy" => OrderSide::Buy,
        "Sell" => OrderSide::Sell,
        _ => OrderSide::Buy,
    }
}

fn parse_order_type(s: &str) -> OrderType {
    match s {
        "Market" => OrderType::Market,
        "Limit" => OrderType::Limit,
        "Stop" => OrderType::Stop,
        "StopLimit" => OrderType::StopLimit,
        _ => OrderType::Market,
    }
}

fn parse_time_in_force(s: &str) -> TimeInForce {
    match s {
        "Day" => TimeInForce::Day,
        "Gtc" => TimeInForce::Gtc,
        "Ioc" => TimeInForce::Ioc,
        "Fok" => TimeInForce::Fok,
        "Opg" => TimeInForce::Opg,
        "Cls" => TimeInForce::Cls,
        _ => TimeInForce::Day,
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_order_snapshot_roundtrip() {
        let order = OrderState {
            order_id: "test-123".to_string(),
            broker_order_id: "broker-456".to_string(),
            is_multi_leg: false,
            instrument_id: "AAPL".to_string(),
            status: OrderStatus::Accepted,
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            time_in_force: TimeInForce::Day,
            requested_quantity: Decimal::new(100, 0),
            filled_quantity: Decimal::new(50, 0),
            avg_fill_price: Decimal::new(15050, 2),
            limit_price: Some(Decimal::new(15100, 2)),
            stop_price: None,
            submitted_at: "2026-01-05T10:00:00Z".to_string(),
            last_update_at: "2026-01-05T10:05:00Z".to_string(),
            status_message: "Partial fill".to_string(),
            legs: vec![],
        };

        let snapshot = OrderSnapshot::from_order_state(&order);
        let restored = snapshot.to_order_state();

        assert_eq!(restored.order_id, order.order_id);
        assert_eq!(restored.broker_order_id, order.broker_order_id);
        assert_eq!(restored.instrument_id, order.instrument_id);
        assert_eq!(restored.status, order.status);
        assert_eq!(restored.side, order.side);
        assert_eq!(restored.order_type, order.order_type);
        assert_eq!(restored.requested_quantity, order.requested_quantity);
        assert_eq!(restored.filled_quantity, order.filled_quantity);
        assert_eq!(restored.limit_price, order.limit_price);
    }

    #[test]
    fn test_parse_order_status() {
        assert_eq!(parse_order_status("New"), OrderStatus::New);
        assert_eq!(parse_order_status("Filled"), OrderStatus::Filled);
        assert_eq!(parse_order_status("Canceled"), OrderStatus::Canceled);
        assert_eq!(parse_order_status("Unknown"), OrderStatus::New);
    }

    #[test]
    fn test_recovery_state_needs_recovery() {
        let mut state = RecoveryState::default();
        assert!(state.needs_recovery()); // unknown needs recovery

        state.status = "healthy".to_string();
        assert!(!state.needs_recovery());

        state.status = "error".to_string();
        assert!(state.needs_recovery());

        state.status = "interrupted".to_string();
        assert!(state.needs_recovery());
    }
}
