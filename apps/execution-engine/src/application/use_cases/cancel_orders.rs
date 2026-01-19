//! Cancel Orders Use Case

use std::sync::Arc;

use crate::application::ports::{BrokerPort, CancelOrderRequest, EventPublisherPort};
use crate::domain::order_execution::repository::OrderRepository;
use crate::domain::order_execution::value_objects::CancelReason;
use crate::domain::shared::OrderId;

/// Result of canceling an order.
#[derive(Debug, Clone)]
pub struct CancelResult {
    /// Order ID.
    pub order_id: String,
    /// Whether cancel was successful.
    pub success: bool,
    /// Error message if failed.
    pub error: Option<String>,
}

/// Use case for canceling orders.
pub struct CancelOrdersUseCase<B, O, E>
where
    B: BrokerPort,
    O: OrderRepository,
    E: EventPublisherPort,
{
    broker: Arc<B>,
    order_repo: Arc<O>,
    event_publisher: Arc<E>,
}

impl<B, O, E> CancelOrdersUseCase<B, O, E>
where
    B: BrokerPort,
    O: OrderRepository,
    E: EventPublisherPort,
{
    /// Create a new CancelOrdersUseCase.
    pub fn new(broker: Arc<B>, order_repo: Arc<O>, event_publisher: Arc<E>) -> Self {
        Self {
            broker,
            order_repo,
            event_publisher,
        }
    }

    /// Cancel a single order by client ID.
    pub async fn cancel_by_client_id(
        &self,
        client_order_id: &str,
        reason: CancelReason,
    ) -> CancelResult {
        let order_id = OrderId::new(client_order_id);

        // 1. Load order from repository
        let mut order = match self.order_repo.find_by_id(&order_id).await {
            Ok(Some(order)) => order,
            Ok(None) => {
                return CancelResult {
                    order_id: client_order_id.to_string(),
                    success: false,
                    error: Some("Order not found".to_string()),
                };
            }
            Err(e) => {
                return CancelResult {
                    order_id: client_order_id.to_string(),
                    success: false,
                    error: Some(format!("Failed to load order: {}", e)),
                };
            }
        };

        // 2. Check if order is cancelable
        if order.status().is_terminal() {
            return CancelResult {
                order_id: client_order_id.to_string(),
                success: false,
                error: Some("Order is already in terminal state".to_string()),
            };
        }

        // 3. Cancel at broker
        let cancel_request = if let Some(broker_id) = order.broker_order_id() {
            CancelOrderRequest::by_broker_id(broker_id.clone())
        } else {
            CancelOrderRequest::by_client_id(order_id.clone())
        };

        if let Err(e) = self.broker.cancel_order(cancel_request).await {
            return CancelResult {
                order_id: client_order_id.to_string(),
                success: false,
                error: Some(format!("Broker cancel failed: {}", e)),
            };
        }

        // 4. Update domain order
        if let Err(e) = order.cancel(reason) {
            return CancelResult {
                order_id: client_order_id.to_string(),
                success: false,
                error: Some(format!("Failed to update order state: {}", e)),
            };
        }

        // 5. Save updated order
        if let Err(e) = self.order_repo.save(&order).await {
            tracing::error!("Failed to save canceled order: {}", e);
        }

        // 6. Publish events
        let events = order.drain_events();
        if let Err(e) = self.event_publisher.publish_order_events(events).await {
            tracing::error!("Failed to publish cancel events: {}", e);
        }

        CancelResult {
            order_id: client_order_id.to_string(),
            success: true,
            error: None,
        }
    }

    /// Cancel multiple orders.
    pub async fn cancel_orders(
        &self,
        order_ids: &[String],
        reason: CancelReason,
    ) -> Vec<CancelResult> {
        let mut results = Vec::new();

        for order_id in order_ids {
            let result = self.cancel_by_client_id(order_id, reason.clone()).await;
            results.push(result);
        }

        results
    }

    /// Cancel all open orders.
    pub async fn cancel_all(&self, reason: CancelReason) -> Vec<CancelResult> {
        let open_orders = match self.order_repo.find_active().await {
            Ok(orders) => orders,
            Err(e) => {
                tracing::error!("Failed to load open orders: {}", e);
                return vec![];
            }
        };

        let order_ids: Vec<String> = open_orders.iter().map(|o| o.id().to_string()).collect();

        self.cancel_orders(&order_ids, reason).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::ports::{BrokerError, NoOpEventPublisher, OrderAck};
    use crate::domain::order_execution::aggregate::{CreateOrderCommand, Order};
    use crate::domain::order_execution::errors::OrderError;
    use crate::domain::order_execution::value_objects::{
        OrderPurpose, OrderSide, OrderStatus, OrderType, TimeInForce,
    };
    use crate::domain::shared::{BrokerId, Money, Quantity, Symbol};
    use async_trait::async_trait;
    use rust_decimal::Decimal;
    use std::collections::HashMap;
    use std::sync::RwLock;

    // Mock broker
    struct MockBroker {
        should_fail: bool,
    }

    #[async_trait]
    impl BrokerPort for MockBroker {
        async fn submit_order(
            &self,
            _request: crate::application::ports::SubmitOrderRequest,
        ) -> Result<OrderAck, BrokerError> {
            Err(BrokerError::Unknown {
                message: "Not implemented".to_string(),
            })
        }

        async fn cancel_order(&self, _request: CancelOrderRequest) -> Result<(), BrokerError> {
            if self.should_fail {
                return Err(BrokerError::OrderNotFound {
                    order_id: "test".to_string(),
                });
            }
            Ok(())
        }

        async fn get_order(&self, _broker_order_id: &BrokerId) -> Result<OrderAck, BrokerError> {
            Err(BrokerError::OrderNotFound {
                order_id: "unknown".to_string(),
            })
        }

        async fn get_open_orders(&self) -> Result<Vec<OrderAck>, BrokerError> {
            Ok(vec![])
        }

        async fn get_buying_power(&self) -> Result<Decimal, BrokerError> {
            Ok(Decimal::new(100_000, 0))
        }

        async fn get_position(
            &self,
            _instrument_id: &crate::domain::shared::InstrumentId,
        ) -> Result<Option<Decimal>, BrokerError> {
            Ok(None)
        }
    }

    // Mock order repository
    struct MockOrderRepo {
        orders: RwLock<HashMap<String, Order>>,
    }

    impl MockOrderRepo {
        fn new() -> Self {
            Self {
                orders: RwLock::new(HashMap::new()),
            }
        }

        fn add_order(&self, order: Order) {
            let mut orders = self.orders.write().unwrap();
            orders.insert(order.id().to_string(), order);
        }
    }

    #[async_trait]
    impl OrderRepository for MockOrderRepo {
        async fn save(&self, order: &Order) -> Result<(), OrderError> {
            let mut orders = self.orders.write().unwrap();
            orders.insert(order.id().to_string(), order.clone());
            Ok(())
        }

        async fn find_by_id(&self, id: &OrderId) -> Result<Option<Order>, OrderError> {
            let orders = self.orders.read().unwrap();
            Ok(orders.get(id.as_str()).cloned())
        }

        async fn find_by_broker_id(
            &self,
            _broker_id: &BrokerId,
        ) -> Result<Option<Order>, OrderError> {
            Ok(None)
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

        async fn exists(&self, id: &OrderId) -> Result<bool, OrderError> {
            let orders = self.orders.read().unwrap();
            Ok(orders.contains_key(id.as_str()))
        }

        async fn delete(&self, id: &OrderId) -> Result<(), OrderError> {
            let mut orders = self.orders.write().unwrap();
            orders.remove(id.as_str());
            Ok(())
        }
    }

    fn create_open_order(_id: &str) -> Order {
        let command = CreateOrderCommand {
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            quantity: Quantity::new(Decimal::new(100, 0)),
            limit_price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
            legs: vec![],
        };
        let mut order = Order::new(command).unwrap();
        order.accept(BrokerId::new("broker-123")).unwrap();
        order
    }

    #[tokio::test]
    async fn cancel_order_success() {
        let broker = Arc::new(MockBroker { should_fail: false });
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let order = create_open_order("order-1");
        let order_id = order.id().to_string();
        order_repo.add_order(order);

        let use_case = CancelOrdersUseCase::new(broker, order_repo, event_publisher);

        let result = use_case
            .cancel_by_client_id(&order_id, CancelReason::user_requested())
            .await;

        assert!(result.success);
        assert!(result.error.is_none());
    }

    #[tokio::test]
    async fn cancel_order_not_found() {
        let broker = Arc::new(MockBroker { should_fail: false });
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = CancelOrdersUseCase::new(broker, order_repo, event_publisher);

        let result = use_case
            .cancel_by_client_id("nonexistent", CancelReason::user_requested())
            .await;

        assert!(!result.success);
        assert!(result.error.is_some());
    }

    #[tokio::test]
    async fn cancel_order_broker_failure() {
        let broker = Arc::new(MockBroker { should_fail: true });
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let order = create_open_order("order-1");
        let order_id = order.id().to_string();
        order_repo.add_order(order);

        let use_case = CancelOrdersUseCase::new(broker, order_repo, event_publisher);

        let result = use_case
            .cancel_by_client_id(&order_id, CancelReason::user_requested())
            .await;

        assert!(!result.success);
        assert!(result.error.unwrap().contains("Broker cancel failed"));
    }

    #[tokio::test]
    async fn cancel_all_orders() {
        let broker = Arc::new(MockBroker { should_fail: false });
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        order_repo.add_order(create_open_order("order-1"));
        order_repo.add_order(create_open_order("order-2"));

        let use_case = CancelOrdersUseCase::new(broker, order_repo, event_publisher);

        let results = use_case.cancel_all(CancelReason::risk_limit("test")).await;

        assert_eq!(results.len(), 2);
        assert!(results.iter().all(|r| r.success));
    }
}
