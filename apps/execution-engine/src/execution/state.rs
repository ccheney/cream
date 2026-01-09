//! Order state management with FIX protocol partial fill support.

use std::collections::HashMap;
use std::sync::RwLock;
use std::time::Duration;

use rust_decimal::Decimal;

use crate::models::{
    ExecutionFill, OrderPurpose, OrderState, OrderStatus, PartialFillState,
    PartialFillTimeoutAction, PartialFillTimeoutConfig,
};

/// Manages order state across the execution engine.
#[derive(Debug, Default)]
pub struct OrderStateManager {
    /// Orders indexed by order ID.
    orders: RwLock<HashMap<String, OrderState>>,
    /// Mapping from broker order ID to internal order ID.
    broker_id_map: RwLock<HashMap<String, String>>,
    /// Partial fill states indexed by order ID.
    partial_fills: RwLock<HashMap<String, PartialFillState>>,
    /// Timeout configuration for partial fills.
    timeout_config: PartialFillTimeoutConfig,
}

/// Result of processing a partial fill timeout.
#[derive(Debug, Clone)]
pub struct TimeoutResult {
    /// Order ID that timed out.
    pub order_id: String,
    /// Action to take.
    pub action: PartialFillTimeoutAction,
    /// Cumulative quantity filled before timeout.
    pub filled_qty: Decimal,
    /// Remaining quantity that was not filled.
    pub remaining_qty: Decimal,
    /// Average fill price of partial fills.
    pub avg_fill_price: Decimal,
}

impl OrderStateManager {
    /// Create a new order state manager.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a new order state manager with custom timeout configuration.
    #[must_use]
    pub fn with_timeout_config(timeout_config: PartialFillTimeoutConfig) -> Self {
        Self {
            orders: RwLock::new(HashMap::new()),
            broker_id_map: RwLock::new(HashMap::new()),
            partial_fills: RwLock::new(HashMap::new()),
            timeout_config,
        }
    }

    /// Store a new order state.
    pub fn insert(&self, order: OrderState) {
        let order_id = order.order_id.clone();
        let broker_order_id = order.broker_order_id.clone();

        if let Ok(mut orders) = self.orders.write() {
            orders.insert(order_id.clone(), order);
        }

        if !broker_order_id.is_empty()
            && let Ok(mut map) = self.broker_id_map.write()
        {
            map.insert(broker_order_id, order_id);
        }
    }

    /// Get an order by internal ID.
    #[must_use]
    pub fn get(&self, order_id: &str) -> Option<OrderState> {
        self.orders
            .read()
            .ok()
            .and_then(|orders| orders.get(order_id).cloned())
    }

    /// Get an order by broker ID.
    #[must_use]
    pub fn get_by_broker_id(&self, broker_order_id: &str) -> Option<OrderState> {
        let order_id = self
            .broker_id_map
            .read()
            .ok()
            .and_then(|map| map.get(broker_order_id).cloned())?;

        self.get(&order_id)
    }

    /// Update an existing order state.
    pub fn update(&self, order: OrderState) {
        if let Ok(mut orders) = self.orders.write() {
            orders.insert(order.order_id.clone(), order);
        }
    }

    /// Get all orders for a list of IDs.
    #[must_use]
    pub fn get_many(&self, order_ids: &[String]) -> Vec<OrderState> {
        let orders = match self.orders.read() {
            Ok(guard) => guard,
            Err(_) => return vec![],
        };

        order_ids
            .iter()
            .filter_map(|id| orders.get(id).cloned())
            .collect()
    }

    /// Get all active (non-terminal) orders.
    #[must_use]
    pub fn get_active_orders(&self) -> Vec<OrderState> {
        let orders = match self.orders.read() {
            Ok(guard) => guard,
            Err(_) => return vec![],
        };

        orders
            .values()
            .filter(|o| o.status.is_active())
            .cloned()
            .collect()
    }

    /// Get total count of orders.
    #[must_use]
    pub fn count(&self) -> usize {
        self.orders.read().map(|o| o.len()).unwrap_or(0)
    }

    // ========================================================================
    // Partial Fill Management (FIX Protocol Semantics)
    // ========================================================================

    /// Initialize partial fill tracking for an order.
    ///
    /// Call this when an order is first accepted by the broker.
    pub fn init_partial_fill(&self, order_id: String, order_qty: Decimal, purpose: OrderPurpose) {
        let state = PartialFillState::new(order_id.clone(), order_qty, purpose);
        if let Ok(mut fills) = self.partial_fills.write() {
            fills.insert(order_id, state);
        }
    }

    /// Apply an execution fill to an order.
    ///
    /// Updates the FIX protocol fields (`CumQty`, `LeavesQty`, `AvgPx`) and
    /// synchronizes with the `OrderState`.
    ///
    /// Returns the updated `PartialFillState` if successful.
    pub fn apply_fill(&self, order_id: &str, fill: ExecutionFill) -> Option<PartialFillState> {
        // Update partial fill state
        let updated_state = {
            let mut fills = self.partial_fills.write().ok()?;
            let state = fills.get_mut(order_id)?;
            state.apply_fill(fill);
            state.clone()
        };

        // Synchronize with OrderState
        if let Ok(mut orders) = self.orders.write()
            && let Some(order) = orders.get_mut(order_id)
        {
            order.filled_quantity = updated_state.cum_qty;
            order.avg_fill_price = updated_state.avg_px;
            order.last_update_at = chrono::Utc::now().to_rfc3339();

            // Update status based on fill state
            if updated_state.is_filled() {
                order.status = OrderStatus::Filled;
            } else if updated_state.is_partial() {
                order.status = OrderStatus::PartiallyFilled;
            }
        }

        Some(updated_state)
    }

    /// Get partial fill state for an order.
    #[must_use]
    pub fn get_partial_fill_state(&self, order_id: &str) -> Option<PartialFillState> {
        self.partial_fills
            .read()
            .ok()
            .and_then(|fills| fills.get(order_id).cloned())
    }

    /// Get all orders with partial fills.
    #[must_use]
    pub fn get_partially_filled_orders(&self) -> Vec<PartialFillState> {
        let fills = match self.partial_fills.read() {
            Ok(guard) => guard,
            Err(_) => return vec![],
        };

        fills.values().filter(|s| s.is_partial()).cloned().collect()
    }

    /// Check for timed-out partial fills and return actions to take.
    ///
    /// Returns a list of `TimeoutResult` for each order that has timed out.
    #[must_use]
    pub fn check_timeouts(&self) -> Vec<TimeoutResult> {
        let fills = match self.partial_fills.read() {
            Ok(guard) => guard,
            Err(_) => return vec![],
        };

        let now = chrono::Utc::now();
        let mut results = Vec::new();

        for state in fills.values() {
            // Only check active partial fills
            if !state.is_partial() {
                continue;
            }

            // Parse creation time
            let created_at = match chrono::DateTime::parse_from_rfc3339(&state.created_at) {
                Ok(dt) => dt.with_timezone(&chrono::Utc),
                Err(_) => continue,
            };

            // Check if timeout exceeded
            let timeout_secs = self.timeout_config.timeout_for_purpose(state.order_purpose);
            let elapsed = now.signed_duration_since(created_at);

            // Wrapping acceptable: u64 seconds fit in i64 for practical timeout values
            #[allow(clippy::cast_possible_wrap)]
            if elapsed > chrono::Duration::seconds(timeout_secs as i64) {
                let action = self.timeout_config.action_for_purpose(state.order_purpose);
                results.push(TimeoutResult {
                    order_id: state.order_id.clone(),
                    action,
                    filled_qty: state.cum_qty,
                    remaining_qty: state.leaves_qty,
                    avg_fill_price: state.avg_px,
                });
            }
        }

        results
    }

    /// Get the timeout duration for an order purpose.
    #[must_use]
    pub fn timeout_duration_for(&self, purpose: OrderPurpose) -> Duration {
        Duration::from_secs(self.timeout_config.timeout_for_purpose(purpose))
    }

    /// Remove partial fill state (call when order is terminal).
    pub fn remove_partial_fill(&self, order_id: &str) {
        if let Ok(mut fills) = self.partial_fills.write() {
            fills.remove(order_id);
        }
    }

    /// Get count of active partial fills.
    #[must_use]
    pub fn partial_fill_count(&self) -> usize {
        self.partial_fills
            .read()
            .map(|f| f.values().filter(|s| s.is_partial()).count())
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{OrderSide, OrderStatus, OrderType, TimeInForce};
    use rust_decimal::Decimal;

    fn make_order(order_id: &str, broker_id: &str, status: OrderStatus) -> OrderState {
        OrderState {
            order_id: order_id.to_string(),
            broker_order_id: broker_id.to_string(),
            is_multi_leg: false,
            instrument_id: "AAPL".to_string(),
            status,
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            time_in_force: TimeInForce::Day,
            requested_quantity: Decimal::new(100, 0),
            filled_quantity: Decimal::ZERO,
            avg_fill_price: Decimal::ZERO,
            limit_price: Some(Decimal::new(15000, 2)),
            stop_price: None,
            submitted_at: "2026-01-04T12:00:00Z".to_string(),
            last_update_at: "2026-01-04T12:00:00Z".to_string(),
            status_message: String::new(),
            legs: vec![],
        }
    }

    #[test]
    fn test_insert_and_get() {
        let manager = OrderStateManager::new();
        let order = make_order("ord-1", "broker-1", OrderStatus::New);

        manager.insert(order.clone());

        let retrieved = manager.get("ord-1");
        assert!(retrieved.is_some());
        let Some(retrieved_order) = retrieved else {
            panic!("order should exist");
        };
        assert_eq!(retrieved_order.order_id, "ord-1");
    }

    #[test]
    fn test_get_by_broker_id() {
        let manager = OrderStateManager::new();
        let order = make_order("ord-1", "broker-1", OrderStatus::Accepted);

        manager.insert(order);

        let retrieved = manager.get_by_broker_id("broker-1");
        assert!(retrieved.is_some());
        let Some(retrieved_order) = retrieved else {
            panic!("order should exist by broker_id");
        };
        assert_eq!(retrieved_order.order_id, "ord-1");
    }

    #[test]
    fn test_get_active_orders() {
        let manager = OrderStateManager::new();

        manager.insert(make_order("ord-1", "b-1", OrderStatus::Accepted));
        manager.insert(make_order("ord-2", "b-2", OrderStatus::Filled));
        manager.insert(make_order("ord-3", "b-3", OrderStatus::PartiallyFilled));

        let active = manager.get_active_orders();
        assert_eq!(active.len(), 2); // Accepted and PartiallyFilled
    }

    // ========================================================================
    // Partial Fill Management Tests
    // ========================================================================

    fn make_fill(fill_id: &str, qty: i64, price: i64) -> ExecutionFill {
        ExecutionFill {
            fill_id: fill_id.to_string(),
            quantity: Decimal::new(qty, 0),
            price: Decimal::new(price, 2),
            timestamp: chrono::Utc::now().to_rfc3339(),
            venue: "NYSE".to_string(),
            liquidity: Some("TAKER".to_string()),
            commission: Some(Decimal::new(1, 2)),
        }
    }

    #[test]
    fn test_init_partial_fill() {
        let manager = OrderStateManager::new();
        let order = make_order("ord-1", "broker-1", OrderStatus::Accepted);
        manager.insert(order);

        manager.init_partial_fill(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        let Some(state) = manager.get_partial_fill_state("ord-1") else {
            panic!("partial fill state should exist");
        };
        assert_eq!(state.order_qty, Decimal::new(100, 0));
        assert_eq!(state.cum_qty, Decimal::ZERO);
        assert_eq!(state.leaves_qty, Decimal::new(100, 0));
    }

    #[test]
    fn test_apply_fill_updates_state() {
        let manager = OrderStateManager::new();
        let order = make_order("ord-1", "broker-1", OrderStatus::Accepted);
        manager.insert(order);
        manager.init_partial_fill(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        // Apply first fill
        let Some(state) = manager.apply_fill("ord-1", make_fill("f1", 40, 15000)) else {
            panic!("apply_fill should return state");
        };
        assert_eq!(state.cum_qty, Decimal::new(40, 0));
        assert_eq!(state.leaves_qty, Decimal::new(60, 0));
        assert!(state.verify_fix_invariant());

        // Verify OrderState is synchronized
        let Some(order) = manager.get("ord-1") else {
            panic!("order should exist");
        };
        assert_eq!(order.filled_quantity, Decimal::new(40, 0));
        assert_eq!(order.status, OrderStatus::PartiallyFilled);
    }

    #[test]
    fn test_apply_fill_complete_order() {
        let manager = OrderStateManager::new();
        let order = make_order("ord-1", "broker-1", OrderStatus::Accepted);
        manager.insert(order);
        manager.init_partial_fill(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        // Fill completely
        manager.apply_fill("ord-1", make_fill("f1", 100, 15000));

        let Some(order) = manager.get("ord-1") else {
            panic!("order should exist");
        };
        assert_eq!(order.status, OrderStatus::Filled);
        assert_eq!(order.filled_quantity, Decimal::new(100, 0));
    }

    #[test]
    fn test_apply_fill_vwap_calculation() {
        let manager = OrderStateManager::new();
        let order = make_order("ord-1", "broker-1", OrderStatus::Accepted);
        manager.insert(order);
        manager.init_partial_fill(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        // Fill 1: 40 @ $150.00
        manager.apply_fill("ord-1", make_fill("f1", 40, 15000));

        // Fill 2: 60 @ $151.00
        // VWAP = (40 * 150 + 60 * 151) / 100 = 150.60
        manager.apply_fill("ord-1", make_fill("f2", 60, 15100));

        let Some(order) = manager.get("ord-1") else {
            panic!("order should exist");
        };
        assert_eq!(order.avg_fill_price, Decimal::new(15060, 2));
    }

    #[test]
    fn test_get_partially_filled_orders() {
        let manager = OrderStateManager::new();

        // Order 1: partial fill
        manager.insert(make_order("ord-1", "b-1", OrderStatus::Accepted));
        manager.init_partial_fill(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );
        manager.apply_fill("ord-1", make_fill("f1", 50, 15000));

        // Order 2: complete fill
        manager.insert(make_order("ord-2", "b-2", OrderStatus::Accepted));
        manager.init_partial_fill("ord-2".to_string(), Decimal::new(50, 0), OrderPurpose::Exit);
        manager.apply_fill("ord-2", make_fill("f2", 50, 15000));

        // Order 3: no fill
        manager.insert(make_order("ord-3", "b-3", OrderStatus::Accepted));
        manager.init_partial_fill(
            "ord-3".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::StopLoss,
        );

        let partial = manager.get_partially_filled_orders();
        assert_eq!(partial.len(), 1);
        assert_eq!(partial[0].order_id, "ord-1");
    }

    #[test]
    fn test_partial_fill_count() {
        let manager = OrderStateManager::new();

        manager.insert(make_order("ord-1", "b-1", OrderStatus::Accepted));
        manager.init_partial_fill(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );
        manager.apply_fill("ord-1", make_fill("f1", 50, 15000));

        manager.insert(make_order("ord-2", "b-2", OrderStatus::Accepted));
        manager.init_partial_fill(
            "ord-2".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Exit,
        );
        manager.apply_fill("ord-2", make_fill("f2", 30, 15000));

        assert_eq!(manager.partial_fill_count(), 2);
    }

    #[test]
    fn test_remove_partial_fill() {
        let manager = OrderStateManager::new();
        manager.insert(make_order("ord-1", "b-1", OrderStatus::Accepted));
        manager.init_partial_fill(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        assert!(manager.get_partial_fill_state("ord-1").is_some());

        manager.remove_partial_fill("ord-1");

        assert!(manager.get_partial_fill_state("ord-1").is_none());
    }

    #[test]
    fn test_timeout_duration_for_purpose() {
        let manager = OrderStateManager::new();

        assert_eq!(
            manager.timeout_duration_for(OrderPurpose::Entry),
            Duration::from_secs(300)
        );
        assert_eq!(
            manager.timeout_duration_for(OrderPurpose::StopLoss),
            Duration::from_secs(10)
        );
        assert_eq!(
            manager.timeout_duration_for(OrderPurpose::Exit),
            Duration::from_secs(60)
        );
    }

    #[test]
    fn test_with_custom_timeout_config() {
        let config = PartialFillTimeoutConfig {
            entry_timeout_seconds: 600, // 10 minutes
            exit_timeout_seconds: 120,  // 2 minutes
            stop_loss_timeout_seconds: 5,
            take_profit_timeout_seconds: 180,
            on_entry_timeout: PartialFillTimeoutAction::CancelRemaining,
            on_exit_timeout: PartialFillTimeoutAction::AggressiveResubmit,
            on_stop_loss_timeout: PartialFillTimeoutAction::AggressiveResubmit,
        };

        let manager = OrderStateManager::with_timeout_config(config);

        assert_eq!(
            manager.timeout_duration_for(OrderPurpose::Entry),
            Duration::from_secs(600)
        );
    }
}
