//! Order state management.

use std::collections::HashMap;
use std::sync::RwLock;

use crate::models::OrderState;

/// Manages order state across the execution engine.
#[derive(Debug, Default)]
pub struct OrderStateManager {
    /// Orders indexed by order ID.
    orders: RwLock<HashMap<String, OrderState>>,
    /// Mapping from broker order ID to internal order ID.
    broker_id_map: RwLock<HashMap<String, String>>,
}

impl OrderStateManager {
    /// Create a new order state manager.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Store a new order state.
    pub fn insert(&self, order: OrderState) {
        let order_id = order.order_id.clone();
        let broker_order_id = order.broker_order_id.clone();

        if let Ok(mut orders) = self.orders.write() {
            orders.insert(order_id.clone(), order);
        }

        if !broker_order_id.is_empty() {
            if let Ok(mut map) = self.broker_id_map.write() {
                map.insert(broker_order_id, order_id);
            }
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
        assert_eq!(retrieved.unwrap().order_id, "ord-1");
    }

    #[test]
    fn test_get_by_broker_id() {
        let manager = OrderStateManager::new();
        let order = make_order("ord-1", "broker-1", OrderStatus::Accepted);

        manager.insert(order);

        let retrieved = manager.get_by_broker_id("broker-1");
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().order_id, "ord-1");
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
}
