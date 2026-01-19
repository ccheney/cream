//! In-memory order repository for testing.

use std::collections::HashMap;
use std::sync::RwLock;

use async_trait::async_trait;

use crate::domain::order_execution::aggregate::Order;
use crate::domain::order_execution::errors::OrderError;
use crate::domain::order_execution::repository::OrderRepository;
use crate::domain::order_execution::value_objects::OrderStatus;
use crate::domain::shared::{BrokerId, OrderId};

/// In-memory implementation of `OrderRepository`.
///
/// Suitable for testing and development. Not for production use.
#[derive(Debug, Default)]
pub struct InMemoryOrderRepository {
    orders: RwLock<HashMap<String, Order>>,
}

impl InMemoryOrderRepository {
    /// Create a new empty repository.
    #[must_use]
    pub fn new() -> Self {
        Self {
            orders: RwLock::new(HashMap::new()),
        }
    }

    /// Get the number of orders in the repository.
    #[must_use]
    pub fn len(&self) -> usize {
        self.orders.read().unwrap().len()
    }

    /// Check if the repository is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.orders.read().unwrap().is_empty()
    }

    /// Clear all orders from the repository.
    pub fn clear(&self) {
        let mut orders = self.orders.write().unwrap();
        orders.clear();
    }

    /// Add an order to the repository (for test setup).
    pub fn add(&self, order: Order) {
        let mut orders = self.orders.write().unwrap();
        orders.insert(order.id().to_string(), order);
    }
}

#[async_trait]
impl OrderRepository for InMemoryOrderRepository {
    async fn save(&self, order: &Order) -> Result<(), OrderError> {
        let mut orders = self.orders.write().unwrap();
        orders.insert(order.id().to_string(), order.clone());
        Ok(())
    }

    async fn find_by_id(&self, id: &OrderId) -> Result<Option<Order>, OrderError> {
        let orders = self.orders.read().unwrap();
        Ok(orders.get(id.as_str()).cloned())
    }

    async fn find_by_broker_id(&self, broker_id: &BrokerId) -> Result<Option<Order>, OrderError> {
        let orders = self.orders.read().unwrap();
        Ok(orders
            .values()
            .find(|o| o.broker_order_id().map(|b| b == broker_id).unwrap_or(false))
            .cloned())
    }

    async fn find_by_status(&self, status: OrderStatus) -> Result<Vec<Order>, OrderError> {
        let orders = self.orders.read().unwrap();
        Ok(orders
            .values()
            .filter(|o| o.status() == status)
            .cloned()
            .collect())
    }

    async fn find_active(&self) -> Result<Vec<Order>, OrderError> {
        let orders = self.orders.read().unwrap();
        Ok(orders
            .values()
            .filter(|o| !o.status().is_terminal())
            .cloned()
            .collect())
    }

    async fn delete(&self, id: &OrderId) -> Result<(), OrderError> {
        let mut orders = self.orders.write().unwrap();
        orders.remove(id.as_str());
        Ok(())
    }

    async fn exists(&self, id: &OrderId) -> Result<bool, OrderError> {
        let orders = self.orders.read().unwrap();
        Ok(orders.contains_key(id.as_str()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::order_execution::aggregate::CreateOrderCommand;
    use crate::domain::order_execution::value_objects::{
        CancelReason, OrderPurpose, OrderSide, OrderType, TimeInForce,
    };
    use crate::domain::shared::{Quantity, Symbol};

    fn create_test_order() -> Order {
        let command = CreateOrderCommand {
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            quantity: Quantity::from_i64(100),
            limit_price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
            legs: vec![],
        };
        Order::new(command).unwrap()
    }

    #[tokio::test]
    async fn save_and_find_by_id() {
        let repo = InMemoryOrderRepository::new();
        let order = create_test_order();
        let order_id = order.id().clone();

        repo.save(&order).await.unwrap();

        let found = repo.find_by_id(&order_id).await.unwrap();
        assert!(found.is_some());
    }

    #[tokio::test]
    async fn find_by_id_not_found() {
        let repo = InMemoryOrderRepository::new();

        let found = repo.find_by_id(&OrderId::new("nonexistent")).await.unwrap();
        assert!(found.is_none());
    }

    #[tokio::test]
    async fn find_by_broker_id() {
        let repo = InMemoryOrderRepository::new();
        let mut order = create_test_order();
        order.accept(BrokerId::new("broker-123")).unwrap();

        repo.save(&order).await.unwrap();

        let found = repo
            .find_by_broker_id(&BrokerId::new("broker-123"))
            .await
            .unwrap();
        assert!(found.is_some());
    }

    #[tokio::test]
    async fn find_active_orders() {
        let repo = InMemoryOrderRepository::new();

        // Add an open order
        let order = create_test_order();
        repo.save(&order).await.unwrap();

        // Add a canceled order
        let mut canceled = create_test_order();
        canceled.accept(BrokerId::new("broker-1")).unwrap();
        canceled.cancel(CancelReason::user_requested()).unwrap();
        repo.save(&canceled).await.unwrap();

        let open_orders = repo.find_active().await.unwrap();
        assert_eq!(open_orders.len(), 1);
    }

    #[tokio::test]
    async fn delete_order() {
        let repo = InMemoryOrderRepository::new();
        let order = create_test_order();
        let order_id = order.id().clone();
        repo.save(&order).await.unwrap();

        repo.delete(&order_id).await.unwrap();

        let found = repo.find_by_id(&order_id).await.unwrap();
        assert!(found.is_none());
    }

    #[tokio::test]
    async fn exists_check() {
        let repo = InMemoryOrderRepository::new();
        let order = create_test_order();
        let order_id = order.id().clone();

        assert!(!repo.exists(&order_id).await.unwrap());

        repo.save(&order).await.unwrap();
        assert!(repo.exists(&order_id).await.unwrap());
    }

    #[test]
    fn len_and_is_empty() {
        let repo = InMemoryOrderRepository::new();
        assert!(repo.is_empty());
        assert_eq!(repo.len(), 0);

        repo.add(create_test_order());
        assert!(!repo.is_empty());
        assert_eq!(repo.len(), 1);
    }

    #[test]
    fn clear() {
        let repo = InMemoryOrderRepository::new();
        repo.add(create_test_order());
        repo.add(create_test_order());

        repo.clear();

        assert!(repo.is_empty());
    }
}
