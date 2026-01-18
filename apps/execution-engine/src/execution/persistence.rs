//! State persistence for crash recovery.
//!
//! Provides database integration for persisting order and portfolio state,
//! enabling recovery after system crashes.
//!
//! Uses `PostgreSQL` via `SQLx` for durable state storage, shared with TypeScript apps.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::{PgPool, Row};
use std::collections::HashMap;
use thiserror::Error;
use tracing::{debug, info};

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

impl From<sqlx::Error> for PersistenceError {
    fn from(err: sqlx::Error) -> Self {
        Self::Connection(err.to_string())
    }
}

impl From<serde_json::Error> for PersistenceError {
    fn from(err: serde_json::Error) -> Self {
        Self::Serialization(err.to_string())
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
    #[must_use]
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
    #[must_use]
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

/// Manages state persistence to `PostgreSQL` database.
pub struct StatePersistence {
    /// Database connection pool.
    pool: PgPool,
    /// Environment (PAPER/LIVE).
    environment: String,
}

impl StatePersistence {
    /// Create a new persistence manager with `PostgreSQL` connection.
    ///
    /// # Errors
    ///
    /// Returns an error if the database cannot be connected.
    pub async fn new(database_url: &str, environment: &str) -> Result<Self, PersistenceError> {
        Self::with_max_connections(database_url, environment, 5).await
    }

    /// Create a new persistence manager with custom max connections.
    ///
    /// # Errors
    ///
    /// Returns an error if the database cannot be connected.
    pub async fn with_max_connections(
        database_url: &str,
        environment: &str,
        max_connections: u32,
    ) -> Result<Self, PersistenceError> {
        let pool = PgPoolOptions::new()
            .max_connections(max_connections)
            .connect(database_url)
            .await?;

        info!(
            max_connections = max_connections,
            "PostgreSQL connection pool initialized"
        );

        Ok(Self {
            pool,
            environment: environment.to_string(),
        })
    }

    /// Create a persistence manager with an existing pool (for testing).
    #[must_use]
    pub fn with_pool(pool: PgPool, environment: &str) -> Self {
        Self {
            pool,
            environment: environment.to_string(),
        }
    }

    /// Get the underlying connection pool.
    #[must_use]
    pub const fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Save current order state to database.
    ///
    /// # Errors
    ///
    /// Returns an error if the database connection fails or the insert query fails.
    pub async fn save_order(&self, order: &OrderState) -> Result<(), PersistenceError> {
        let snapshot = OrderSnapshot::from_order_state(order);

        sqlx::query(
            r"
            INSERT INTO execution_order_snapshots (
                order_id, broker_order_id, instrument_id, status, side,
                order_type, time_in_force, requested_quantity, filled_quantity,
                avg_fill_price, limit_price, stop_price, submitted_at,
                last_update_at, status_message, is_multi_leg, environment, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::environment, NOW())
            ON CONFLICT (order_id) DO UPDATE SET
                broker_order_id = EXCLUDED.broker_order_id,
                instrument_id = EXCLUDED.instrument_id,
                status = EXCLUDED.status,
                side = EXCLUDED.side,
                order_type = EXCLUDED.order_type,
                time_in_force = EXCLUDED.time_in_force,
                requested_quantity = EXCLUDED.requested_quantity,
                filled_quantity = EXCLUDED.filled_quantity,
                avg_fill_price = EXCLUDED.avg_fill_price,
                limit_price = EXCLUDED.limit_price,
                stop_price = EXCLUDED.stop_price,
                submitted_at = EXCLUDED.submitted_at,
                last_update_at = EXCLUDED.last_update_at,
                status_message = EXCLUDED.status_message,
                is_multi_leg = EXCLUDED.is_multi_leg,
                environment = EXCLUDED.environment,
                updated_at = NOW()
            ",
        )
        .bind(&snapshot.order_id)
        .bind(&snapshot.broker_order_id)
        .bind(&snapshot.instrument_id)
        .bind(&snapshot.status)
        .bind(&snapshot.side)
        .bind(&snapshot.order_type)
        .bind(&snapshot.time_in_force)
        .bind(snapshot.requested_quantity)
        .bind(snapshot.filled_quantity)
        .bind(snapshot.avg_fill_price)
        .bind(snapshot.limit_price)
        .bind(snapshot.stop_price)
        .bind(&snapshot.submitted_at)
        .bind(&snapshot.last_update_at)
        .bind(&snapshot.status_message)
        .bind(snapshot.is_multi_leg)
        .bind(&self.environment)
        .execute(&self.pool)
        .await
        .map_err(|e| PersistenceError::Query(e.to_string()))?;

        debug!(order_id = %order.order_id, "Order saved to database");
        Ok(())
    }

    /// Save all orders from state manager to database.
    ///
    /// # Errors
    ///
    /// Returns an error if any order fails to save to the database.
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
    ///
    /// # Errors
    ///
    /// Returns an error if the database query fails or row parsing fails.
    pub async fn load_active_orders(
        &self,
        state_manager: &OrderStateManager,
    ) -> Result<usize, PersistenceError> {
        let rows = sqlx::query(
            r"
            SELECT order_id, broker_order_id, instrument_id, status, side,
                   order_type, time_in_force, requested_quantity, filled_quantity,
                   avg_fill_price, limit_price, stop_price, submitted_at,
                   last_update_at, status_message, is_multi_leg
            FROM execution_order_snapshots
            WHERE environment = $1::environment AND status NOT IN ('Filled', 'Canceled', 'Rejected', 'Expired')
            ",
        )
        .bind(&self.environment)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| PersistenceError::Query(e.to_string()))?;

        let mut count = 0;
        for row in rows {
            let snapshot = Self::row_to_order_snapshot(&row)?;
            let order_state = snapshot.to_order_state();
            state_manager.insert(order_state);
            count += 1;
        }

        info!(count = count, "Loaded active orders from database");
        Ok(count)
    }

    /// Convert database row to `OrderSnapshot`.
    fn row_to_order_snapshot(
        row: &sqlx::postgres::PgRow,
    ) -> Result<OrderSnapshot, PersistenceError> {
        Ok(OrderSnapshot {
            order_id: row
                .try_get::<String, _>("order_id")
                .map_err(|e| PersistenceError::MissingField(format!("order_id: {e}")))?,
            broker_order_id: row
                .try_get::<String, _>("broker_order_id")
                .map_err(|e| PersistenceError::MissingField(format!("broker_order_id: {e}")))?,
            instrument_id: row
                .try_get::<String, _>("instrument_id")
                .map_err(|e| PersistenceError::MissingField(format!("instrument_id: {e}")))?,
            status: row
                .try_get::<String, _>("status")
                .map_err(|e| PersistenceError::MissingField(format!("status: {e}")))?,
            side: row
                .try_get::<String, _>("side")
                .map_err(|e| PersistenceError::MissingField(format!("side: {e}")))?,
            order_type: row
                .try_get::<String, _>("order_type")
                .map_err(|e| PersistenceError::MissingField(format!("order_type: {e}")))?,
            time_in_force: row
                .try_get::<String, _>("time_in_force")
                .map_err(|e| PersistenceError::MissingField(format!("time_in_force: {e}")))?,
            requested_quantity: row
                .try_get::<Decimal, _>("requested_quantity")
                .unwrap_or(Decimal::ZERO),
            filled_quantity: row
                .try_get::<Decimal, _>("filled_quantity")
                .unwrap_or(Decimal::ZERO),
            avg_fill_price: row
                .try_get::<Decimal, _>("avg_fill_price")
                .unwrap_or(Decimal::ZERO),
            limit_price: row.try_get::<Decimal, _>("limit_price").ok(),
            stop_price: row.try_get::<Decimal, _>("stop_price").ok(),
            submitted_at: row
                .try_get::<String, _>("submitted_at")
                .map_err(|e| PersistenceError::MissingField(format!("submitted_at: {e}")))?,
            last_update_at: row
                .try_get::<String, _>("last_update_at")
                .map_err(|e| PersistenceError::MissingField(format!("last_update_at: {e}")))?,
            status_message: row
                .try_get::<String, _>("status_message")
                .unwrap_or_default(),
            is_multi_leg: row.try_get::<bool, _>("is_multi_leg").unwrap_or(false),
        })
    }

    /// Save position snapshot.
    ///
    /// # Errors
    ///
    /// Returns an error if the database connection or insert query fails.
    pub async fn save_position(
        &self,
        position: &LocalPositionSnapshot,
    ) -> Result<(), PersistenceError> {
        sqlx::query(
            r"
            INSERT INTO execution_position_snapshots (
                symbol, quantity, avg_entry_price, environment, updated_at
            ) VALUES ($1, $2, $3, $4::environment, NOW())
            ON CONFLICT (symbol) DO UPDATE SET
                quantity = EXCLUDED.quantity,
                avg_entry_price = EXCLUDED.avg_entry_price,
                environment = EXCLUDED.environment,
                updated_at = NOW()
            ",
        )
        .bind(&position.symbol)
        .bind(position.qty)
        .bind(position.avg_entry_price)
        .bind(&self.environment)
        .execute(&self.pool)
        .await
        .map_err(|e| PersistenceError::Query(e.to_string()))?;

        debug!(symbol = %position.symbol, "Position saved to database");
        Ok(())
    }

    /// Load positions from database.
    ///
    /// # Errors
    ///
    /// Returns an error if the database query fails or row parsing fails.
    pub async fn load_positions(
        &self,
    ) -> Result<HashMap<String, LocalPositionSnapshot>, PersistenceError> {
        let rows = sqlx::query(
            "SELECT symbol, quantity, avg_entry_price FROM execution_position_snapshots WHERE environment = $1::environment",
        )
        .bind(&self.environment)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| PersistenceError::Query(e.to_string()))?;

        let mut positions = HashMap::new();
        for row in rows {
            let symbol: String = row
                .try_get("symbol")
                .map_err(|e| PersistenceError::MissingField(format!("symbol: {e}")))?;
            let qty: Decimal = row
                .try_get::<Decimal, _>("quantity")
                .unwrap_or(Decimal::ZERO);
            let avg_entry_price: Decimal = row
                .try_get::<Decimal, _>("avg_entry_price")
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
    ///
    /// # Errors
    ///
    /// Returns an error if the database connection or update query fails.
    pub async fn update_recovery_state(
        &self,
        cycle_id: Option<&str>,
        status: &str,
        error_message: Option<&str>,
    ) -> Result<(), PersistenceError> {
        sqlx::query(
            r"
            INSERT INTO execution_recovery_state (
                environment, last_snapshot_at, last_cycle_id, status, error_message, updated_at
            ) VALUES ($1::environment, NOW(), $2, $3::execution_recovery_status, $4, NOW())
            ON CONFLICT (environment) DO UPDATE SET
                last_snapshot_at = NOW(),
                last_cycle_id = EXCLUDED.last_cycle_id,
                status = EXCLUDED.status,
                error_message = EXCLUDED.error_message,
                updated_at = NOW()
            ",
        )
        .bind(&self.environment)
        .bind(cycle_id)
        .bind(status)
        .bind(error_message)
        .execute(&self.pool)
        .await
        .map_err(|e| PersistenceError::Query(e.to_string()))?;

        debug!(status = status, "Recovery state updated");
        Ok(())
    }

    /// Get recovery state.
    ///
    /// # Errors
    ///
    /// Returns an error if the database query fails.
    pub async fn get_recovery_state(&self) -> Result<RecoveryState, PersistenceError> {
        let row = sqlx::query(
            r"
            SELECT last_snapshot_at, last_reconciliation_at, last_cycle_id, status, error_message
            FROM execution_recovery_state WHERE environment = $1::environment
            ",
        )
        .bind(&self.environment)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| PersistenceError::Query(e.to_string()))?;

        row.map_or_else(
            || Ok(RecoveryState::default()),
            |r| {
                Ok(RecoveryState {
                    last_snapshot_at: r
                        .try_get::<chrono::DateTime<chrono::Utc>, _>("last_snapshot_at")
                        .ok()
                        .map(|dt| dt.to_rfc3339()),
                    last_reconciliation_at: r
                        .try_get::<chrono::DateTime<chrono::Utc>, _>("last_reconciliation_at")
                        .ok()
                        .map(|dt| dt.to_rfc3339()),
                    last_cycle_id: r.try_get("last_cycle_id").ok(),
                    status: r
                        .try_get("status")
                        .unwrap_or_else(|_| "unknown".to_string()),
                    error_message: r.try_get("error_message").ok(),
                })
            },
        )
    }

    /// Log reconciliation completion.
    ///
    /// # Errors
    ///
    /// Returns an error if the database update query fails.
    pub async fn log_reconciliation(
        &self,
        report: &ReconciliationReport,
    ) -> Result<(), PersistenceError> {
        let status = if report.passed {
            "healthy"
        } else {
            "needs_attention"
        };

        sqlx::query(
            r"
            UPDATE execution_recovery_state SET
                last_reconciliation_at = NOW(),
                status = $1::execution_recovery_status,
                updated_at = NOW()
            WHERE environment = $2::environment
            ",
        )
        .bind(status)
        .bind(&self.environment)
        .execute(&self.pool)
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
    #[must_use]
    pub fn needs_recovery(&self) -> bool {
        self.status == "error" || self.status == "interrupted" || self.status == "unknown"
    }

    /// Check if state is healthy.
    #[must_use]
    pub fn is_healthy(&self) -> bool {
        self.status == "healthy"
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

fn parse_order_status(s: &str) -> OrderStatus {
    match s {
        "Accepted" => OrderStatus::Accepted,
        "PartiallyFilled" => OrderStatus::PartiallyFilled,
        "Filled" => OrderStatus::Filled,
        "Canceled" => OrderStatus::Canceled,
        "Rejected" => OrderStatus::Rejected,
        "Expired" => OrderStatus::Expired,
        // "New" and unknown statuses default to New
        _ => OrderStatus::New,
    }
}

fn parse_order_side(s: &str) -> OrderSide {
    match s {
        "Sell" => OrderSide::Sell,
        // "Buy" and unknown sides default to Buy
        _ => OrderSide::Buy,
    }
}

fn parse_order_type(s: &str) -> OrderType {
    match s {
        "Limit" => OrderType::Limit,
        "Stop" => OrderType::Stop,
        "StopLimit" => OrderType::StopLimit,
        // "Market" and unknown types default to Market
        _ => OrderType::Market,
    }
}

fn parse_time_in_force(s: &str) -> TimeInForce {
    match s {
        "Gtc" => TimeInForce::Gtc,
        "Ioc" => TimeInForce::Ioc,
        "Fok" => TimeInForce::Fok,
        "Opg" => TimeInForce::Opg,
        "Cls" => TimeInForce::Cls,
        // "Day" and unknown values default to Day
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
