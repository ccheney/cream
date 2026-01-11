//! Broker and local state snapshots for reconciliation.
//!
//! Types for capturing point-in-time snapshots of broker and local
//! state for comparison during reconciliation.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Snapshot of broker order state.
#[derive(Debug, Clone)]
pub struct BrokerOrderSnapshot {
    /// Unique broker-assigned order identifier.
    pub order_id: String,
    /// Client-provided order identifier for correlation.
    pub client_order_id: Option<String>,
    /// Trading symbol (e.g., "AAPL", "SPY").
    pub symbol: String,
    /// Order status (e.g., "new", "filled", "canceled").
    pub status: String,
    /// Order side ("buy" or "sell").
    pub side: String,
    /// Total order quantity.
    pub qty: Decimal,
    /// Quantity already filled.
    pub filled_qty: Decimal,
    /// Order creation timestamp.
    pub created_at: String,
}

/// Snapshot of broker position.
#[derive(Debug, Clone)]
pub struct BrokerPositionSnapshot {
    /// Trading symbol (e.g., "AAPL", "SPY").
    pub symbol: String,
    /// Position quantity (absolute value).
    pub qty: Decimal,
    /// Position direction ("long" or "short").
    pub side: String,
    /// Average entry price per share.
    pub avg_entry_price: Decimal,
    /// Current market value of the position.
    pub market_value: Decimal,
    /// Unrealized profit/loss at current market price.
    pub unrealized_pl: Decimal,
}

/// Snapshot of broker account.
#[derive(Debug, Clone)]
pub struct BrokerAccountSnapshot {
    /// Total account equity (cash + positions).
    pub equity: Decimal,
    /// Available cash balance.
    pub cash: Decimal,
    /// Available buying power for new trades.
    pub buying_power: Decimal,
}

/// Complete broker state snapshot.
#[derive(Debug, Clone)]
pub struct BrokerStateSnapshot {
    /// All open and recent orders from the broker.
    pub orders: Vec<BrokerOrderSnapshot>,
    /// All current positions held at the broker.
    pub positions: Vec<BrokerPositionSnapshot>,
    /// Current account balance and buying power.
    pub account: BrokerAccountSnapshot,
    /// Timestamp when this snapshot was captured.
    pub fetched_at: String,
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_broker_order_snapshot_creation() {
        let snapshot = BrokerOrderSnapshot {
            order_id: "broker-123".to_string(),
            client_order_id: Some("client-123".to_string()),
            symbol: "AAPL".to_string(),
            status: "filled".to_string(),
            side: "buy".to_string(),
            qty: Decimal::new(100, 0),
            filled_qty: Decimal::new(100, 0),
            created_at: "2024-01-01T00:00:00Z".to_string(),
        };

        assert_eq!(snapshot.order_id, "broker-123");
        assert_eq!(snapshot.symbol, "AAPL");
        assert_eq!(snapshot.qty, snapshot.filled_qty);
    }

    #[test]
    fn test_broker_position_snapshot_creation() {
        let snapshot = BrokerPositionSnapshot {
            symbol: "AAPL".to_string(),
            qty: Decimal::new(100, 0),
            side: "long".to_string(),
            avg_entry_price: Decimal::new(15000, 2),
            market_value: Decimal::new(15500, 0),
            unrealized_pl: Decimal::new(500, 0),
        };

        assert_eq!(snapshot.symbol, "AAPL");
        assert_eq!(snapshot.side, "long");
        assert!(snapshot.unrealized_pl > Decimal::ZERO);
    }

    #[test]
    fn test_broker_account_snapshot_creation() {
        let snapshot = BrokerAccountSnapshot {
            equity: Decimal::new(100_000, 0),
            cash: Decimal::new(50_000, 0),
            buying_power: Decimal::new(200_000, 0),
        };

        assert_eq!(snapshot.equity, Decimal::new(100_000, 0));
        assert!(snapshot.buying_power > snapshot.equity);
    }

    #[test]
    fn test_broker_state_snapshot_creation() {
        let snapshot = BrokerStateSnapshot {
            orders: vec![],
            positions: vec![],
            account: BrokerAccountSnapshot {
                equity: Decimal::new(100_000, 0),
                cash: Decimal::new(50_000, 0),
                buying_power: Decimal::new(200_000, 0),
            },
            fetched_at: "2024-01-01T00:00:00Z".to_string(),
        };

        assert!(snapshot.orders.is_empty());
        assert!(snapshot.positions.is_empty());
    }

    #[test]
    fn test_local_position_snapshot_creation() {
        let snapshot = LocalPositionSnapshot {
            symbol: "AAPL".to_string(),
            qty: Decimal::new(100, 0),
            avg_entry_price: Decimal::new(15000, 2),
        };

        assert_eq!(snapshot.symbol, "AAPL");
        assert_eq!(snapshot.qty, Decimal::new(100, 0));
    }
}
