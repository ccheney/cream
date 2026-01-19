//! Submit Orders Use Case

use std::sync::Arc;

use crate::application::dto::{
    CreateOrderDto, OrderDto, OrderResponseDto, SubmitOrdersRequestDto, SubmitOrdersResponseDto,
};
use crate::application::ports::{
    BrokerPort, EventPublisherPort, RiskRepositoryPort, SubmitOrderRequest,
};
use crate::domain::order_execution::aggregate::{CreateOrderCommand, Order};
use crate::domain::order_execution::errors::OrderError;
use crate::domain::order_execution::repository::OrderRepository;
use crate::domain::risk_management::services::RiskValidationService;
use crate::domain::shared::{Money, OrderId, Quantity, Symbol};

/// Use case for submitting orders to the broker.
pub struct SubmitOrdersUseCase<B, R, O, E>
where
    B: BrokerPort,
    R: RiskRepositoryPort,
    O: OrderRepository,
    E: EventPublisherPort,
{
    broker: Arc<B>,
    risk_repo: Arc<R>,
    order_repo: Arc<O>,
    event_publisher: Arc<E>,
}

impl<B, R, O, E> SubmitOrdersUseCase<B, R, O, E>
where
    B: BrokerPort,
    R: RiskRepositoryPort,
    O: OrderRepository,
    E: EventPublisherPort,
{
    /// Create a new SubmitOrdersUseCase.
    pub fn new(
        broker: Arc<B>,
        risk_repo: Arc<R>,
        order_repo: Arc<O>,
        event_publisher: Arc<E>,
    ) -> Self {
        Self {
            broker,
            risk_repo,
            order_repo,
            event_publisher,
        }
    }

    /// Execute the use case.
    pub async fn execute(&self, request: SubmitOrdersRequestDto) -> SubmitOrdersResponseDto {
        // 1. Create domain orders
        let orders_result: Result<Vec<Order>, OrderError> = request
            .orders
            .iter()
            .map(|dto| self.create_order(dto))
            .collect();

        let mut orders = match orders_result {
            Ok(orders) => orders,
            Err(e) => {
                return SubmitOrdersResponseDto::risk_rejected(vec![e.to_string()]);
            }
        };

        // 2. Validate risk if requested
        if request.validate_risk {
            if let Err(violations) = self.validate_risk(&orders).await {
                return SubmitOrdersResponseDto::risk_rejected(violations);
            }
        }

        // 3. Submit orders to broker
        let mut submitted = Vec::new();
        let mut rejected = Vec::new();

        for order in &mut orders {
            match self.submit_to_broker(order).await {
                Ok(()) => {
                    // Save to repository
                    if let Err(e) = self.order_repo.save(order).await {
                        tracing::error!("Failed to save order: {}", e);
                    }

                    // Publish events
                    let events = order.drain_events();
                    if let Err(e) = self.event_publisher.publish_order_events(events).await {
                        tracing::error!("Failed to publish events: {}", e);
                    }

                    submitted.push(OrderResponseDto {
                        order: OrderDto::from_order(order),
                        error: None,
                    });
                }
                Err(e) => {
                    rejected.push(OrderResponseDto {
                        order: OrderDto::from_order(order),
                        error: Some(e),
                    });
                }
            }
        }

        SubmitOrdersResponseDto::partial(submitted, rejected)
    }

    /// Create a domain Order from DTO.
    fn create_order(&self, dto: &CreateOrderDto) -> Result<Order, OrderError> {
        let command = CreateOrderCommand {
            symbol: Symbol::new(&dto.symbol),
            side: dto.side,
            order_type: dto.order_type,
            quantity: Quantity::new(dto.quantity),
            limit_price: dto.limit_price.map(Money::new),
            stop_price: None,
            time_in_force: dto.time_in_force,
            purpose: dto.purpose,
            legs: vec![],
        };

        Order::new(command)
    }

    /// Validate orders against risk limits.
    async fn validate_risk(&self, orders: &[Order]) -> Result<(), Vec<String>> {
        // Get active risk policy
        let policy = match self.risk_repo.find_active_policy().await {
            Ok(Some(policy)) => policy,
            Ok(None) => {
                tracing::warn!("No active risk policy found, skipping validation");
                return Ok(());
            }
            Err(e) => return Err(vec![format!("Failed to load risk policy: {}", e)]),
        };

        // Get risk context
        let context = match self.risk_repo.build_risk_context().await {
            Ok(ctx) => ctx,
            Err(e) => return Err(vec![format!("Failed to build risk context: {}", e)]),
        };

        // Validate
        let service = RiskValidationService::new(policy);
        let result = service.validate(orders, &context);

        if result.passed {
            Ok(())
        } else {
            Err(result.violations.into_iter().map(|v| v.message).collect())
        }
    }

    /// Submit order to broker.
    async fn submit_to_broker(&self, order: &mut Order) -> Result<(), String> {
        let request = SubmitOrderRequest {
            client_order_id: order.id().clone(),
            symbol: order.symbol().clone(),
            side: order.side(),
            order_type: order.order_type(),
            quantity: order.quantity().amount(),
            limit_price: order.limit_price().map(|m| m.amount()),
            stop_price: order.stop_price().map(|m| m.amount()),
            time_in_force: order.time_in_force(),
            extended_hours: false,
        };

        match self.broker.submit_order(request).await {
            Ok(ack) => order.accept(ack.broker_order_id).map_err(|e| e.to_string()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::ports::{
        BrokerError, EventPublishError, InMemoryRiskRepository, NoOpEventPublisher, OrderAck,
    };
    use crate::domain::order_execution::errors::OrderError;
    use crate::domain::order_execution::value_objects::{
        OrderPurpose, OrderSide, OrderStatus, OrderType, TimeInForce,
    };
    use crate::domain::shared::BrokerId;
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
        async fn submit_order(&self, request: SubmitOrderRequest) -> Result<OrderAck, BrokerError> {
            if self.should_fail {
                return Err(BrokerError::OrderRejected {
                    reason: "Test rejection".to_string(),
                });
            }
            Ok(OrderAck {
                broker_order_id: BrokerId::new("broker-123"),
                client_order_id: request.client_order_id,
                status: OrderStatus::Accepted,
                filled_qty: Decimal::ZERO,
                avg_fill_price: None,
            })
        }

        async fn cancel_order(
            &self,
            _request: crate::application::ports::CancelOrderRequest,
        ) -> Result<(), BrokerError> {
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

    fn create_order_dto() -> CreateOrderDto {
        CreateOrderDto {
            client_order_id: "test-order-1".to_string(),
            symbol: "AAPL".to_string(),
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            quantity: Decimal::new(100, 0),
            limit_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
        }
    }

    #[tokio::test]
    async fn submit_orders_success() {
        let broker = Arc::new(MockBroker { should_fail: false });
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = SubmitOrdersUseCase::new(broker, risk_repo, order_repo, event_publisher);

        let request = SubmitOrdersRequestDto {
            orders: vec![create_order_dto()],
            validate_risk: false,
        };

        let response = use_case.execute(request).await;

        assert!(!response.submitted.is_empty());
        assert!(response.rejected.is_empty());
    }

    #[tokio::test]
    async fn submit_orders_broker_rejection() {
        let broker = Arc::new(MockBroker { should_fail: true });
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = SubmitOrdersUseCase::new(broker, risk_repo, order_repo, event_publisher);

        let request = SubmitOrdersRequestDto {
            orders: vec![create_order_dto()],
            validate_risk: false,
        };

        let response = use_case.execute(request).await;

        assert!(response.submitted.is_empty());
        assert!(!response.rejected.is_empty());
    }
}
