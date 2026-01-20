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
use crate::domain::shared::{Money, Quantity, Symbol};

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
    use crate::domain::shared::{BrokerId, OrderId};
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

    #[tokio::test]
    async fn submit_orders_invalid_order_dto() {
        let broker = Arc::new(MockBroker { should_fail: false });
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = SubmitOrdersUseCase::new(broker, risk_repo, order_repo, event_publisher);

        // Create order with invalid quantity
        let invalid_dto = CreateOrderDto {
            client_order_id: "test-order-1".to_string(),
            symbol: "AAPL".to_string(),
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            quantity: Decimal::new(100, 0),
            limit_price: Some(Decimal::new(-10, 0)), // Invalid negative price
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
        };

        let request = SubmitOrdersRequestDto {
            orders: vec![invalid_dto],
            validate_risk: false,
        };

        let response = use_case.execute(request).await;

        // Should fail during order creation
        assert!(response.submitted.is_empty());
        assert!(!response.risk_violations.is_empty());
    }

    #[tokio::test]
    async fn submit_orders_with_risk_validation() {
        let broker = Arc::new(MockBroker { should_fail: false });
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = SubmitOrdersUseCase::new(broker, risk_repo, order_repo, event_publisher);

        let request = SubmitOrdersRequestDto {
            orders: vec![create_order_dto()],
            validate_risk: true, // Enable risk validation
        };

        let response = use_case.execute(request).await;

        // Should pass (no active policy configured)
        assert!(!response.submitted.is_empty());
    }

    use crate::domain::risk_management::errors::RiskError;
    use crate::domain::risk_management::value_objects::Exposure;
    use crate::domain::shared::InstrumentId;

    // Failing risk repo to test error paths
    struct FailingRiskRepo;

    #[async_trait]
    impl RiskRepositoryPort for FailingRiskRepo {
        async fn save_policy(
            &self,
            _policy: &crate::domain::risk_management::aggregate::RiskPolicy,
        ) -> Result<(), RiskError> {
            Err(RiskError::PolicyNotFound {
                policy_id: "test".to_string(),
            })
        }
        async fn find_policy_by_id(
            &self,
            _id: &str,
        ) -> Result<Option<crate::domain::risk_management::aggregate::RiskPolicy>, RiskError>
        {
            Err(RiskError::PolicyNotFound {
                policy_id: "test".to_string(),
            })
        }
        async fn find_active_policy(
            &self,
        ) -> Result<Option<crate::domain::risk_management::aggregate::RiskPolicy>, RiskError>
        {
            Err(RiskError::PolicyNotFound {
                policy_id: "test".to_string(),
            })
        }
        async fn list_policies(
            &self,
        ) -> Result<Vec<crate::domain::risk_management::aggregate::RiskPolicy>, RiskError> {
            Ok(vec![])
        }
        async fn delete_policy(&self, _id: &str) -> Result<(), RiskError> {
            Ok(())
        }
        async fn get_portfolio_exposure(&self) -> Result<Exposure, RiskError> {
            Ok(Exposure::default())
        }
        async fn get_instrument_exposure(
            &self,
            _instrument_id: &InstrumentId,
        ) -> Result<Exposure, RiskError> {
            Ok(Exposure::default())
        }
        async fn get_portfolio_greeks(
            &self,
        ) -> Result<crate::domain::risk_management::value_objects::Greeks, RiskError> {
            Ok(crate::domain::risk_management::value_objects::Greeks::ZERO)
        }
        async fn get_buying_power(&self) -> Result<Decimal, RiskError> {
            Ok(Decimal::new(100_000, 0))
        }
        async fn get_day_trade_count(&self) -> Result<u32, RiskError> {
            Ok(0)
        }
        async fn build_risk_context(
            &self,
        ) -> Result<crate::domain::risk_management::value_objects::RiskContext, RiskError> {
            Err(RiskError::PolicyNotFound {
                policy_id: "context".to_string(),
            })
        }
    }

    #[tokio::test]
    async fn submit_orders_risk_policy_load_error() {
        let broker = Arc::new(MockBroker { should_fail: false });
        let risk_repo = Arc::new(FailingRiskRepo);
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = SubmitOrdersUseCase::new(broker, risk_repo, order_repo, event_publisher);

        let request = SubmitOrdersRequestDto {
            orders: vec![create_order_dto()],
            validate_risk: true,
        };

        let response = use_case.execute(request).await;

        // Should fail due to risk policy load error
        assert!(!response.risk_violations.is_empty());
        assert!(response.risk_violations[0].contains("Failed to load risk policy"));
    }

    // Risk repo that has policy but fails to build context
    struct RiskRepoWithPolicyButFailingContext;

    #[async_trait]
    impl RiskRepositoryPort for RiskRepoWithPolicyButFailingContext {
        async fn save_policy(
            &self,
            _policy: &crate::domain::risk_management::aggregate::RiskPolicy,
        ) -> Result<(), RiskError> {
            Ok(())
        }
        async fn find_policy_by_id(
            &self,
            _id: &str,
        ) -> Result<Option<crate::domain::risk_management::aggregate::RiskPolicy>, RiskError>
        {
            Ok(None)
        }
        async fn find_active_policy(
            &self,
        ) -> Result<Option<crate::domain::risk_management::aggregate::RiskPolicy>, RiskError>
        {
            Ok(Some(
                crate::domain::risk_management::aggregate::RiskPolicy::default(),
            ))
        }
        async fn list_policies(
            &self,
        ) -> Result<Vec<crate::domain::risk_management::aggregate::RiskPolicy>, RiskError> {
            Ok(vec![])
        }
        async fn delete_policy(&self, _id: &str) -> Result<(), RiskError> {
            Ok(())
        }
        async fn get_portfolio_exposure(&self) -> Result<Exposure, RiskError> {
            Ok(Exposure::default())
        }
        async fn get_instrument_exposure(
            &self,
            _instrument_id: &InstrumentId,
        ) -> Result<Exposure, RiskError> {
            Ok(Exposure::default())
        }
        async fn get_portfolio_greeks(
            &self,
        ) -> Result<crate::domain::risk_management::value_objects::Greeks, RiskError> {
            Ok(crate::domain::risk_management::value_objects::Greeks::ZERO)
        }
        async fn get_buying_power(&self) -> Result<Decimal, RiskError> {
            Ok(Decimal::new(100_000, 0))
        }
        async fn get_day_trade_count(&self) -> Result<u32, RiskError> {
            Ok(0)
        }
        async fn build_risk_context(
            &self,
        ) -> Result<crate::domain::risk_management::value_objects::RiskContext, RiskError> {
            Err(RiskError::PolicyNotFound {
                policy_id: "context".to_string(),
            })
        }
    }

    #[tokio::test]
    async fn submit_orders_risk_context_build_error() {
        let broker = Arc::new(MockBroker { should_fail: false });
        let risk_repo = Arc::new(RiskRepoWithPolicyButFailingContext);
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = SubmitOrdersUseCase::new(broker, risk_repo, order_repo, event_publisher);

        let request = SubmitOrdersRequestDto {
            orders: vec![create_order_dto()],
            validate_risk: true,
        };

        let response = use_case.execute(request).await;

        // Should fail due to risk context build error
        assert!(!response.risk_violations.is_empty());
        assert!(response.risk_violations[0].contains("Failed to build risk context"));
    }

    // Failing order repo to test save error path
    struct FailingSaveOrderRepo;

    #[async_trait]
    impl OrderRepository for FailingSaveOrderRepo {
        async fn save(&self, _order: &Order) -> Result<(), OrderError> {
            Err(OrderError::NotFound {
                order_id: "save-failed".to_string(),
            })
        }

        async fn find_by_id(&self, _id: &OrderId) -> Result<Option<Order>, OrderError> {
            Ok(None)
        }

        async fn find_by_broker_id(
            &self,
            _broker_id: &BrokerId,
        ) -> Result<Option<Order>, OrderError> {
            Ok(None)
        }

        async fn find_by_status(&self, _status: OrderStatus) -> Result<Vec<Order>, OrderError> {
            Ok(vec![])
        }

        async fn find_active(&self) -> Result<Vec<Order>, OrderError> {
            Ok(vec![])
        }

        async fn exists(&self, _id: &OrderId) -> Result<bool, OrderError> {
            Ok(false)
        }

        async fn delete(&self, _id: &OrderId) -> Result<(), OrderError> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn submit_orders_save_error_still_returns_success() {
        let broker = Arc::new(MockBroker { should_fail: false });
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(FailingSaveOrderRepo);
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = SubmitOrdersUseCase::new(broker, risk_repo, order_repo, event_publisher);

        let request = SubmitOrdersRequestDto {
            orders: vec![create_order_dto()],
            validate_risk: false,
        };

        let response = use_case.execute(request).await;

        // Save error is logged but order is still reported as submitted
        assert!(!response.submitted.is_empty());
    }

    // Failing event publisher to test publish error path
    struct FailingEventPublisher;

    #[async_trait]
    impl EventPublisherPort for FailingEventPublisher {
        async fn publish_order_events(
            &self,
            _events: Vec<crate::domain::order_execution::events::OrderEvent>,
        ) -> Result<(), EventPublishError> {
            Err(EventPublishError::PublishFailed {
                message: "Publish failed".to_string(),
            })
        }
    }

    #[tokio::test]
    async fn submit_orders_publish_error_still_returns_success() {
        let broker = Arc::new(MockBroker { should_fail: false });
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(FailingEventPublisher);

        let use_case = SubmitOrdersUseCase::new(broker, risk_repo, order_repo, event_publisher);

        let request = SubmitOrdersRequestDto {
            orders: vec![create_order_dto()],
            validate_risk: false,
        };

        let response = use_case.execute(request).await;

        // Publish error is logged but order is still reported as submitted
        assert!(!response.submitted.is_empty());
    }
}
