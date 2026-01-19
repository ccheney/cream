//! Order Repository Trait
//!
//! Defines the persistence abstraction for orders.
//! Implemented by adapters in the infrastructure layer.

use async_trait::async_trait;

use super::aggregate::Order;
use super::errors::OrderError;
use super::value_objects::OrderStatus;
use crate::domain::shared::{BrokerId, OrderId};

/// Repository trait for Order persistence.
///
/// This is a domain interface (port) that is implemented by
/// infrastructure adapters (Postgres, in-memory, etc.).
#[async_trait]
pub trait OrderRepository: Send + Sync {
    /// Save an order (insert or update).
    ///
    /// # Errors
    ///
    /// Returns error if persistence fails.
    async fn save(&self, order: &Order) -> Result<(), OrderError>;

    /// Find an order by its internal ID.
    ///
    /// # Errors
    ///
    /// Returns error if order not found or query fails.
    async fn find_by_id(&self, id: &OrderId) -> Result<Option<Order>, OrderError>;

    /// Find an order by broker's order ID.
    ///
    /// # Errors
    ///
    /// Returns error if query fails.
    async fn find_by_broker_id(&self, broker_id: &BrokerId) -> Result<Option<Order>, OrderError>;

    /// Find all orders with a given status.
    ///
    /// # Errors
    ///
    /// Returns error if query fails.
    async fn find_by_status(&self, status: OrderStatus) -> Result<Vec<Order>, OrderError>;

    /// Find all active (non-terminal) orders.
    ///
    /// # Errors
    ///
    /// Returns error if query fails.
    async fn find_active(&self) -> Result<Vec<Order>, OrderError>;

    /// Delete an order by ID.
    ///
    /// # Errors
    ///
    /// Returns error if order not found or deletion fails.
    async fn delete(&self, id: &OrderId) -> Result<(), OrderError>;

    /// Check if an order exists.
    ///
    /// # Errors
    ///
    /// Returns error if query fails.
    async fn exists(&self, id: &OrderId) -> Result<bool, OrderError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::RwLock;

    /// In-memory implementation for testing.
    struct InMemoryOrderRepository {
        orders: RwLock<HashMap<String, Order>>,
        broker_index: RwLock<HashMap<String, String>>,
    }

    impl InMemoryOrderRepository {
        fn new() -> Self {
            Self {
                orders: RwLock::new(HashMap::new()),
                broker_index: RwLock::new(HashMap::new()),
            }
        }
    }

    #[async_trait]
    impl OrderRepository for InMemoryOrderRepository {
        async fn save(&self, order: &Order) -> Result<(), OrderError> {
            let mut orders = self.orders.write().unwrap();
            let mut index = self.broker_index.write().unwrap();

            if let Some(broker_id) = order.broker_order_id() {
                index.insert(
                    broker_id.as_str().to_string(),
                    order.id().as_str().to_string(),
                );
            }
            orders.insert(order.id().as_str().to_string(), order.clone());
            Ok(())
        }

        async fn find_by_id(&self, id: &OrderId) -> Result<Option<Order>, OrderError> {
            let orders = self.orders.read().unwrap();
            Ok(orders.get(id.as_str()).cloned())
        }

        async fn find_by_broker_id(
            &self,
            broker_id: &BrokerId,
        ) -> Result<Option<Order>, OrderError> {
            let index = self.broker_index.read().unwrap();
            let orders = self.orders.read().unwrap();

            if let Some(order_id) = index.get(broker_id.as_str()) {
                Ok(orders.get(order_id).cloned())
            } else {
                Ok(None)
            }
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
                .filter(|o| o.status().is_active())
                .cloned()
                .collect())
        }

        async fn delete(&self, id: &OrderId) -> Result<(), OrderError> {
            let mut orders = self.orders.write().unwrap();
            orders
                .remove(id.as_str())
                .ok_or_else(|| OrderError::NotFound {
                    order_id: id.as_str().to_string(),
                })?;
            Ok(())
        }

        async fn exists(&self, id: &OrderId) -> Result<bool, OrderError> {
            let orders = self.orders.read().unwrap();
            Ok(orders.contains_key(id.as_str()))
        }
    }

    use crate::domain::order_execution::aggregate::{CreateOrderCommand, Order};
    use crate::domain::order_execution::value_objects::{
        OrderPurpose, OrderSide, OrderType, TimeInForce,
    };
    use crate::domain::shared::{Money, Quantity, Symbol};

    fn make_order() -> Order {
        Order::new(CreateOrderCommand {
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            quantity: Quantity::from_i64(100),
            limit_price: Some(Money::usd(150.00)),
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
            legs: vec![],
        })
        .unwrap()
    }

    #[tokio::test]
    async fn repository_save_and_find() {
        let repo = InMemoryOrderRepository::new();
        let order = make_order();
        let id = order.id().clone();

        repo.save(&order).await.unwrap();

        let found = repo.find_by_id(&id).await.unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().id(), &id);
    }

    #[tokio::test]
    async fn repository_find_by_broker_id() {
        let repo = InMemoryOrderRepository::new();
        let mut order = make_order();
        order.accept(BrokerId::new("broker-123")).unwrap();

        repo.save(&order).await.unwrap();

        let found = repo
            .find_by_broker_id(&BrokerId::new("broker-123"))
            .await
            .unwrap();
        assert!(found.is_some());
    }

    #[tokio::test]
    async fn repository_find_active() {
        let repo = InMemoryOrderRepository::new();

        let order1 = make_order();
        repo.save(&order1).await.unwrap();

        let mut order2 = make_order();
        order2.accept(BrokerId::new("broker-2")).unwrap();
        repo.save(&order2).await.unwrap();

        let active = repo.find_active().await.unwrap();
        assert_eq!(active.len(), 2);
    }

    #[tokio::test]
    async fn repository_delete() {
        let repo = InMemoryOrderRepository::new();
        let order = make_order();
        let id = order.id().clone();

        repo.save(&order).await.unwrap();
        assert!(repo.exists(&id).await.unwrap());

        repo.delete(&id).await.unwrap();
        assert!(!repo.exists(&id).await.unwrap());
    }

    #[tokio::test]
    async fn repository_delete_not_found() {
        let repo = InMemoryOrderRepository::new();
        let result = repo.delete(&OrderId::new("nonexistent")).await;
        assert!(result.is_err());
    }
}
