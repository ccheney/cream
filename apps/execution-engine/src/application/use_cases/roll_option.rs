//! Roll Option Use Case
//!
//! Handles rolling an option position to a new expiration date.
//! This involves closing the current position and opening a new one.

use std::sync::Arc;

use rust_decimal::Decimal;

use crate::application::dto::{OrderDto, OrderResponseDto};
use crate::application::ports::{
    BrokerPort, EventPublisherPort, RiskRepositoryPort, SubmitOrderRequest,
};
use crate::domain::order_execution::aggregate::{CreateOrderCommand, Order};
use crate::domain::order_execution::errors::OrderError;
use crate::domain::order_execution::repository::OrderRepository;
use crate::domain::order_execution::value_objects::{
    OrderPurpose, OrderSide, OrderType, TimeInForce,
};
use crate::domain::risk_management::services::RiskValidationService;
use crate::domain::shared::{Money, Quantity, Symbol};

/// Request to roll an option position.
#[derive(Debug, Clone)]
pub struct RollOptionRequest {
    /// Symbol of the current position to close.
    pub close_symbol: String,
    /// Symbol of the new position to open.
    pub open_symbol: String,
    /// Quantity to roll (contracts).
    pub quantity: Decimal,
    /// Optional limit price for the closing order.
    pub close_limit_price: Option<Decimal>,
    /// Optional limit price for the opening order.
    pub open_limit_price: Option<Decimal>,
    /// Time in force for both orders.
    pub time_in_force: TimeInForce,
    /// Whether to validate risk before rolling.
    pub validate_risk: bool,
}

/// Response from rolling an option position.
#[derive(Debug)]
pub struct RollOptionResponse {
    /// Whether the roll was successful.
    pub ok: bool,
    /// Close order result.
    pub close_order: Option<OrderResponseDto>,
    /// Open order result.
    pub open_order: Option<OrderResponseDto>,
    /// Risk violations if any.
    pub risk_violations: Vec<String>,
    /// Error message if failed.
    pub error: Option<String>,
}

impl RollOptionResponse {
    /// Create a successful response.
    const fn success(close_order: OrderResponseDto, open_order: OrderResponseDto) -> Self {
        Self {
            ok: true,
            close_order: Some(close_order),
            open_order: Some(open_order),
            risk_violations: vec![],
            error: None,
        }
    }

    /// Create a partial success response (close succeeded, open failed).
    fn partial(close_order: OrderResponseDto, open_error: &str) -> Self {
        Self {
            ok: false,
            close_order: Some(close_order),
            open_order: None,
            risk_violations: vec![],
            error: Some(format!("Close succeeded but open failed: {open_error}")),
        }
    }

    /// Create a risk rejection response.
    const fn risk_rejected(violations: Vec<String>) -> Self {
        Self {
            ok: false,
            close_order: None,
            open_order: None,
            risk_violations: violations,
            error: None,
        }
    }

    /// Create a failure response.
    const fn failed(error: String) -> Self {
        Self {
            ok: false,
            close_order: None,
            open_order: None,
            risk_violations: vec![],
            error: Some(error),
        }
    }
}

/// Use case for rolling an option position to a new expiration.
pub struct RollOptionUseCase<B, R, O, E>
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

impl<B, R, O, E> RollOptionUseCase<B, R, O, E>
where
    B: BrokerPort,
    R: RiskRepositoryPort,
    O: OrderRepository,
    E: EventPublisherPort,
{
    /// Create a new `RollOptionUseCase`.
    pub const fn new(
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

    /// Execute the roll option use case.
    ///
    /// This creates two orders:
    /// 1. A sell-to-close order for the current position
    /// 2. A buy-to-open order for the new position
    pub async fn execute(&self, request: RollOptionRequest) -> RollOptionResponse {
        // Validate symbols are different
        if request.close_symbol == request.open_symbol {
            return RollOptionResponse::failed(
                "Close and open symbols must be different for a roll".to_string(),
            );
        }

        // Validate quantity
        if request.quantity <= Decimal::ZERO {
            return RollOptionResponse::failed("Quantity must be positive".to_string());
        }

        // Create close order (sell to close)
        let close_order = match Self::create_close_order(&request) {
            Ok(order) => order,
            Err(e) => {
                return RollOptionResponse::failed(format!("Failed to create close order: {e}"));
            }
        };

        // Create open order (buy to open)
        let open_order = match Self::create_open_order(&request) {
            Ok(order) => order,
            Err(e) => {
                return RollOptionResponse::failed(format!("Failed to create open order: {e}"));
            }
        };

        // Validate risk if requested
        if request.validate_risk
            && let Err(violations) = self
                .validate_risk(&[close_order.clone(), open_order.clone()])
                .await
        {
            return RollOptionResponse::risk_rejected(violations);
        }

        // Submit close order first
        let mut close_order = close_order;
        match self.submit_to_broker(&mut close_order).await {
            Ok(()) => {
                // Save close order
                if let Err(e) = self.order_repo.save(&close_order).await {
                    tracing::error!("Failed to save close order: {}", e);
                }

                // Publish close order events
                let events = close_order.drain_events();
                if let Err(e) = self.event_publisher.publish_order_events(events).await {
                    tracing::error!("Failed to publish close order events: {}", e);
                }

                let close_response = OrderResponseDto {
                    order: OrderDto::from_order(&close_order),
                    error: None,
                };

                // Submit open order
                let mut open_order = open_order;
                match self.submit_to_broker(&mut open_order).await {
                    Ok(()) => {
                        // Save open order
                        if let Err(e) = self.order_repo.save(&open_order).await {
                            tracing::error!("Failed to save open order: {}", e);
                        }

                        // Publish open order events
                        let events = open_order.drain_events();
                        if let Err(e) = self.event_publisher.publish_order_events(events).await {
                            tracing::error!("Failed to publish open order events: {}", e);
                        }

                        let open_response = OrderResponseDto {
                            order: OrderDto::from_order(&open_order),
                            error: None,
                        };

                        RollOptionResponse::success(close_response, open_response)
                    }
                    Err(e) => {
                        // Close succeeded but open failed - this is a problematic state
                        tracing::error!(
                            "Roll partial failure: close succeeded but open failed: {}",
                            e
                        );
                        RollOptionResponse::partial(close_response, &e)
                    }
                }
            }
            Err(e) => RollOptionResponse::failed(format!("Failed to submit close order: {e}")),
        }
    }

    /// Create the close order (sell to close).
    fn create_close_order(request: &RollOptionRequest) -> Result<Order, OrderError> {
        let order_type = if request.close_limit_price.is_some() {
            OrderType::Limit
        } else {
            OrderType::Market
        };

        let command = CreateOrderCommand {
            symbol: Symbol::new(&request.close_symbol),
            side: OrderSide::Sell,
            order_type,
            quantity: Quantity::new(request.quantity),
            limit_price: request.close_limit_price.map(Money::new),
            stop_price: None,
            time_in_force: request.time_in_force,
            purpose: OrderPurpose::Exit,
            legs: vec![],
        };

        Order::new(command)
    }

    /// Create the open order (buy to open).
    fn create_open_order(request: &RollOptionRequest) -> Result<Order, OrderError> {
        let order_type = if request.open_limit_price.is_some() {
            OrderType::Limit
        } else {
            OrderType::Market
        };

        let command = CreateOrderCommand {
            symbol: Symbol::new(&request.open_symbol),
            side: OrderSide::Buy,
            order_type,
            quantity: Quantity::new(request.quantity),
            limit_price: request.open_limit_price.map(Money::new),
            stop_price: None,
            time_in_force: request.time_in_force,
            purpose: OrderPurpose::Entry,
            legs: vec![],
        };

        Order::new(command)
    }

    /// Validate orders against risk limits.
    async fn validate_risk(&self, orders: &[Order]) -> Result<(), Vec<String>> {
        let policy = match self.risk_repo.find_active_policy().await {
            Ok(Some(policy)) => policy,
            Ok(None) => {
                tracing::warn!("No active risk policy found, skipping validation");
                return Ok(());
            }
            Err(e) => return Err(vec![format!("Failed to load risk policy: {e}")]),
        };

        let context = match self.risk_repo.build_risk_context().await {
            Ok(ctx) => ctx,
            Err(e) => return Err(vec![format!("Failed to build risk context: {e}")]),
        };

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
        BrokerError, CancelOrderRequest, InMemoryRiskRepository, NoOpEventPublisher, OrderAck,
    };
    use crate::domain::order_execution::value_objects::OrderStatus;
    use crate::domain::shared::{BrokerId, InstrumentId, OrderId};
    use async_trait::async_trait;
    use std::collections::HashMap;
    use std::sync::RwLock;

    // Mock broker
    struct MockBroker {
        should_fail_close: bool,
        should_fail_open: bool,
    }

    impl MockBroker {
        const fn new() -> Self {
            Self {
                should_fail_close: false,
                should_fail_open: false,
            }
        }

        const fn fail_close() -> Self {
            Self {
                should_fail_close: true,
                should_fail_open: false,
            }
        }

        const fn fail_open() -> Self {
            Self {
                should_fail_close: false,
                should_fail_open: true,
            }
        }
    }

    #[async_trait]
    impl BrokerPort for MockBroker {
        async fn submit_order(&self, request: SubmitOrderRequest) -> Result<OrderAck, BrokerError> {
            // Check if this is a close or open order based on side
            if request.side == OrderSide::Sell && self.should_fail_close {
                return Err(BrokerError::OrderRejected {
                    reason: "Close order rejected for testing".to_string(),
                });
            }
            if request.side == OrderSide::Buy && self.should_fail_open {
                return Err(BrokerError::OrderRejected {
                    reason: "Open order rejected for testing".to_string(),
                });
            }

            Ok(OrderAck {
                broker_order_id: BrokerId::new(format!("broker-{}", request.client_order_id)),
                client_order_id: request.client_order_id,
                status: OrderStatus::Accepted,
                filled_qty: Decimal::ZERO,
                avg_fill_price: None,
            })
        }

        async fn cancel_order(&self, _request: CancelOrderRequest) -> Result<(), BrokerError> {
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
            _instrument_id: &InstrumentId,
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
            let mut orders = self
                .orders
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            orders.insert(order.id().to_string(), order.clone());
            Ok(())
        }

        async fn find_by_id(&self, id: &OrderId) -> Result<Option<Order>, OrderError> {
            let orders = self
                .orders
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            Ok(orders.get(id.as_str()).cloned())
        }

        async fn find_by_broker_id(
            &self,
            _broker_id: &BrokerId,
        ) -> Result<Option<Order>, OrderError> {
            Ok(None)
        }

        async fn find_by_status(&self, status: OrderStatus) -> Result<Vec<Order>, OrderError> {
            let orders = self
                .orders
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            Ok(orders
                .values()
                .filter(|o| o.status() == status)
                .cloned()
                .collect())
        }

        async fn find_active(&self) -> Result<Vec<Order>, OrderError> {
            let orders = self
                .orders
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            Ok(orders
                .values()
                .filter(|o| !o.status().is_terminal())
                .cloned()
                .collect())
        }

        async fn exists(&self, id: &OrderId) -> Result<bool, OrderError> {
            let orders = self
                .orders
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            Ok(orders.contains_key(id.as_str()))
        }

        async fn delete(&self, id: &OrderId) -> Result<(), OrderError> {
            let mut orders = self
                .orders
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            orders.remove(id.as_str());
            Ok(())
        }
    }

    fn create_roll_request() -> RollOptionRequest {
        RollOptionRequest {
            close_symbol: "AAPL240119C00150000".to_string(),
            open_symbol: "AAPL240216C00150000".to_string(),
            quantity: Decimal::new(10, 0),
            close_limit_price: None,
            open_limit_price: None,
            time_in_force: TimeInForce::Day,
            validate_risk: false,
        }
    }

    #[tokio::test]
    async fn roll_option_success() {
        let broker = Arc::new(MockBroker::new());
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = RollOptionUseCase::new(broker, risk_repo, order_repo, event_publisher);

        let request = create_roll_request();
        let response = use_case.execute(request).await;

        assert!(response.ok, "Roll should succeed");
        assert!(response.close_order.is_some(), "Should have close order");
        assert!(response.open_order.is_some(), "Should have open order");
        assert!(response.error.is_none());
        assert!(response.risk_violations.is_empty());

        // Verify order details
        let close_order = response.close_order.unwrap();
        assert_eq!(close_order.order.side, OrderSide::Sell);
        assert_eq!(close_order.order.status, OrderStatus::Accepted);

        let open_order = response.open_order.unwrap();
        assert_eq!(open_order.order.side, OrderSide::Buy);
        assert_eq!(open_order.order.status, OrderStatus::Accepted);
    }

    #[tokio::test]
    async fn roll_option_with_limit_prices() {
        let broker = Arc::new(MockBroker::new());
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = RollOptionUseCase::new(broker, risk_repo, order_repo, event_publisher);

        let request = RollOptionRequest {
            close_symbol: "AAPL240119C00150000".to_string(),
            open_symbol: "AAPL240216C00150000".to_string(),
            quantity: Decimal::new(10, 0),
            close_limit_price: Some(Decimal::new(500, 2)), // $5.00
            open_limit_price: Some(Decimal::new(600, 2)),  // $6.00
            time_in_force: TimeInForce::Day,
            validate_risk: false,
        };

        let response = use_case.execute(request).await;

        assert!(response.ok);

        let close_order = response.close_order.unwrap();
        assert_eq!(close_order.order.order_type, OrderType::Limit);

        let open_order = response.open_order.unwrap();
        assert_eq!(open_order.order.order_type, OrderType::Limit);
    }

    #[tokio::test]
    async fn roll_option_same_symbol_fails() {
        let broker = Arc::new(MockBroker::new());
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = RollOptionUseCase::new(broker, risk_repo, order_repo, event_publisher);

        let request = RollOptionRequest {
            close_symbol: "AAPL240119C00150000".to_string(),
            open_symbol: "AAPL240119C00150000".to_string(), // Same symbol
            quantity: Decimal::new(10, 0),
            close_limit_price: None,
            open_limit_price: None,
            time_in_force: TimeInForce::Day,
            validate_risk: false,
        };

        let response = use_case.execute(request).await;

        assert!(!response.ok);
        assert!(response.error.is_some());
        assert!(response.error.unwrap().contains("must be different"));
    }

    #[tokio::test]
    async fn roll_option_zero_quantity_fails() {
        let broker = Arc::new(MockBroker::new());
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = RollOptionUseCase::new(broker, risk_repo, order_repo, event_publisher);

        let request = RollOptionRequest {
            close_symbol: "AAPL240119C00150000".to_string(),
            open_symbol: "AAPL240216C00150000".to_string(),
            quantity: Decimal::ZERO,
            close_limit_price: None,
            open_limit_price: None,
            time_in_force: TimeInForce::Day,
            validate_risk: false,
        };

        let response = use_case.execute(request).await;

        assert!(!response.ok);
        assert!(response.error.is_some());
        assert!(response.error.unwrap().contains("positive"));
    }

    #[tokio::test]
    async fn roll_option_close_fails() {
        let broker = Arc::new(MockBroker::fail_close());
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = RollOptionUseCase::new(broker, risk_repo, order_repo, event_publisher);

        let request = create_roll_request();
        let response = use_case.execute(request).await;

        assert!(!response.ok);
        assert!(response.close_order.is_none());
        assert!(response.open_order.is_none());
        assert!(response.error.is_some());
        assert!(
            response
                .error
                .unwrap()
                .contains("Failed to submit close order")
        );
    }

    #[tokio::test]
    async fn roll_option_open_fails_partial() {
        let broker = Arc::new(MockBroker::fail_open());
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = RollOptionUseCase::new(broker, risk_repo, order_repo, event_publisher);

        let request = create_roll_request();
        let response = use_case.execute(request).await;

        assert!(!response.ok);
        assert!(
            response.close_order.is_some(),
            "Close should have succeeded"
        );
        assert!(response.open_order.is_none(), "Open should have failed");
        assert!(response.error.is_some());
        assert!(
            response
                .error
                .unwrap()
                .contains("Close succeeded but open failed")
        );
    }

    #[tokio::test]
    async fn roll_option_with_risk_validation() {
        let broker = Arc::new(MockBroker::new());
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = RollOptionUseCase::new(broker, risk_repo, order_repo, event_publisher);

        let request = RollOptionRequest {
            close_symbol: "AAPL240119C00150000".to_string(),
            open_symbol: "AAPL240216C00150000".to_string(),
            quantity: Decimal::new(10, 0),
            close_limit_price: None,
            open_limit_price: None,
            time_in_force: TimeInForce::Day,
            validate_risk: true,
        };

        let response = use_case.execute(request).await;

        // Should pass (no active policy configured, validation is skipped)
        assert!(response.ok);
    }

    #[tokio::test]
    async fn roll_option_orders_saved() {
        let broker = Arc::new(MockBroker::new());
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = RollOptionUseCase::new(
            Arc::clone(&broker),
            Arc::clone(&risk_repo),
            Arc::clone(&order_repo),
            event_publisher,
        );

        let request = create_roll_request();
        let response = use_case.execute(request).await;

        assert!(response.ok);

        // Verify orders were saved
        let orders = order_repo.orders.read().unwrap();
        assert_eq!(orders.len(), 2, "Both orders should be saved");
    }

    #[tokio::test]
    async fn roll_option_negative_quantity_fails() {
        let broker = Arc::new(MockBroker::new());
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = RollOptionUseCase::new(broker, risk_repo, order_repo, event_publisher);

        let request = RollOptionRequest {
            close_symbol: "AAPL240119C00150000".to_string(),
            open_symbol: "AAPL240216C00150000".to_string(),
            quantity: Decimal::new(-10, 0),
            close_limit_price: None,
            open_limit_price: None,
            time_in_force: TimeInForce::Day,
            validate_risk: false,
        };

        let response = use_case.execute(request).await;

        assert!(!response.ok);
        assert!(response.error.is_some());
        assert!(response.error.unwrap().contains("positive"));
    }

    #[tokio::test]
    async fn roll_option_gtc_time_in_force() {
        let broker = Arc::new(MockBroker::new());
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(NoOpEventPublisher);

        let use_case = RollOptionUseCase::new(broker, risk_repo, order_repo, event_publisher);

        let request = RollOptionRequest {
            close_symbol: "AAPL240119C00150000".to_string(),
            open_symbol: "AAPL240216C00150000".to_string(),
            quantity: Decimal::new(10, 0),
            close_limit_price: None,
            open_limit_price: None,
            time_in_force: TimeInForce::Gtc,
            validate_risk: false,
        };

        let response = use_case.execute(request).await;

        assert!(response.ok);

        let close_order = response.close_order.unwrap();
        assert_eq!(close_order.order.time_in_force, TimeInForce::Gtc);

        let open_order = response.open_order.unwrap();
        assert_eq!(open_order.order.time_in_force, TimeInForce::Gtc);
    }
}
