//! Order execution gateway.
//!
//! This module provides the central gateway for order execution, including:
//! - Generic `BrokerAdapter` trait for broker integrations
//! - Order routing logic with constraint validation
//! - Order state tracking with FIX protocol semantics
//! - Cancel order functionality
//! - Circuit breaker integration for broker resilience

use std::sync::Arc;

use async_trait::async_trait;

use crate::execution::StatePersistence;
use crate::models::{
    ConstraintCheckRequest, ConstraintCheckResponse, ExecutionAck, OrderState, SubmitOrdersRequest,
};
use crate::resilience::{CircuitBreaker, CircuitBreakerConfig};
use crate::risk::ConstraintValidator;

use super::OrderStateManager;

// ============================================
// BrokerAdapter Trait
// ============================================

/// Trait for broker adapters.
///
/// This trait defines the interface that all broker integrations must implement.
/// It follows FIX protocol semantics for order lifecycle management.
///
/// # FIX Protocol Order Lifecycle
///
/// 1. **New (39=0)**: Order created but not yet submitted to broker
/// 2. **`PendingNew` (39=A)**: Order submitted, awaiting broker acknowledgment
/// 3. **Accepted (39=1)**: Broker acknowledged order (equivalent to FIX "Filled" for acknowledgment)
/// 4. **`PartiallyFilled` (39=1)**: Order partially executed
/// 5. **Filled (39=2)**: Order completely executed
/// 6. **`PendingCancel` (39=6)**: Cancel request submitted, awaiting confirmation
/// 7. **Canceled (39=4)**: Order successfully canceled
/// 8. **Rejected (39=8)**: Order rejected by broker
/// 9. **Expired (39=C)**: Order expired (e.g., Day order at market close)
///
/// # Error Handling
///
/// Implementations should return specific errors for:
/// - Authentication failures
/// - Rate limiting (with retry-after information)
/// - Order rejections (with rejection reasons)
/// - Environment mismatches (PAPER vs LIVE)
#[async_trait]
pub trait BrokerAdapter: Send + Sync {
    /// Submit orders from a decision plan.
    ///
    /// This is the primary order routing method. It should:
    /// 1. Validate the request environment matches the adapter's environment
    /// 2. Convert decisions to broker-specific order format
    /// 3. Submit orders via broker API
    /// 4. Return execution acknowledgment with order states
    ///
    /// # Arguments
    ///
    /// * `request` - Order submission request containing decision plan
    ///
    /// # Returns
    ///
    /// * `Ok(ExecutionAck)` - Successfully submitted orders with their states
    /// * `Err(BrokerError)` - Failed to submit orders
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Environment mismatch detected
    /// - Authentication fails
    /// - Rate limit exceeded
    /// - Order validation fails at broker
    async fn submit_orders(
        &self,
        request: &SubmitOrdersRequest,
    ) -> Result<ExecutionAck, BrokerError>;

    /// Get current order status from broker.
    ///
    /// Queries the broker for the current state of an order identified by
    /// the broker's order ID.
    ///
    /// # Arguments
    ///
    /// * `broker_order_id` - Broker's unique identifier for the order
    ///
    /// # Returns
    ///
    /// * `Ok(OrderState)` - Current order state
    /// * `Err(BrokerError)` - Failed to retrieve order state
    async fn get_order_status(&self, broker_order_id: &str) -> Result<OrderState, BrokerError>;

    /// Cancel an order.
    ///
    /// Submits a cancel request for the specified order. Note that cancellation
    /// is not guaranteed - the order may already be filled or in a non-cancelable state.
    ///
    /// # Arguments
    ///
    /// * `broker_order_id` - Broker's unique identifier for the order
    ///
    /// # Returns
    ///
    /// * `Ok(())` - Cancel request accepted (order may transition to `PendingCancel` -> `Canceled`)
    /// * `Err(BrokerError)` - Failed to submit cancel request
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Order not found
    /// - Order already in terminal state (Filled, Canceled, Rejected, Expired)
    /// - Broker API error
    async fn cancel_order(&self, broker_order_id: &str) -> Result<(), BrokerError>;

    /// Get broker name for logging and metrics.
    fn broker_name(&self) -> &'static str;

    /// Check broker connection health.
    ///
    /// Performs a lightweight check to verify the broker connection is healthy.
    /// Used by the connection monitor for heartbeat checks.
    ///
    /// # Returns
    ///
    /// * `Ok(())` - Connection is healthy
    /// * `Err(BrokerError)` - Connection check failed
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Authentication fails
    /// - Network error
    /// - Broker API error
    async fn health_check(&self) -> Result<(), BrokerError>;
}

/// Errors from broker operations.
#[derive(Debug, thiserror::Error)]
pub enum BrokerError {
    /// HTTP request failed.
    #[error("HTTP error: {0}")]
    Http(String),

    /// API returned an error.
    #[error("API error: {code} - {message}")]
    Api {
        /// Error code from broker.
        code: String,
        /// Error message from broker.
        message: String,
    },

    /// Order was rejected.
    #[error("Order rejected: {0}")]
    OrderRejected(String),

    /// Authentication failed.
    #[error("Authentication failed")]
    AuthenticationFailed,

    /// Rate limited.
    #[error("Rate limited, retry after {retry_after_secs}s")]
    RateLimited {
        /// Seconds to wait before retrying.
        retry_after_secs: u64,
    },

    /// Environment mismatch.
    #[error("Environment mismatch: expected {expected}, got {actual}")]
    EnvironmentMismatch {
        /// Expected environment.
        expected: String,
        /// Actual environment in request.
        actual: String,
    },

    /// Order not found.
    #[error("Order not found: {0}")]
    OrderNotFound(String),

    /// Order cannot be canceled (already in terminal state).
    #[error("Order cannot be canceled: {0}")]
    OrderNotCancelable(String),
}

// ============================================
// ExecutionGateway
// ============================================

/// Central gateway for order execution.
///
/// This gateway provides a unified interface for order routing, validation,
/// and state management. It is generic over the broker adapter type, allowing
/// for different broker integrations while maintaining consistent validation
/// and state tracking logic.
///
/// The gateway includes circuit breaker protection for broker API calls to
/// prevent cascading failures when the broker becomes unavailable.
///
/// Optionally supports state persistence for crash recovery.
#[derive(Clone)]
pub struct ExecutionGateway<B: BrokerAdapter> {
    /// Broker adapter for order routing.
    broker: Arc<B>,
    /// Order state manager.
    state_manager: Arc<OrderStateManager>,
    /// Constraint validator.
    validator: Arc<ConstraintValidator>,
    /// Circuit breaker for broker API calls.
    circuit_breaker: Arc<CircuitBreaker>,
    /// Optional state persistence for crash recovery.
    persistence: Option<Arc<StatePersistence>>,
}

impl<B: BrokerAdapter> ExecutionGateway<B> {
    /// Create a new execution gateway with circuit breaker protection.
    ///
    /// # Arguments
    ///
    /// * `broker` - The broker adapter for order routing
    /// * `state_manager` - Order state manager for tracking order lifecycle
    /// * `validator` - Constraint validator for risk checks
    /// * `circuit_config` - Circuit breaker configuration for broker resilience
    #[must_use]
    pub fn new(
        broker: B,
        state_manager: OrderStateManager,
        validator: ConstraintValidator,
        circuit_config: CircuitBreakerConfig,
    ) -> Self {
        let broker_name = broker.broker_name();
        Self {
            broker: Arc::new(broker),
            state_manager: Arc::new(state_manager),
            validator: Arc::new(validator),
            circuit_breaker: Arc::new(CircuitBreaker::new(broker_name, circuit_config)),
            persistence: None,
        }
    }

    /// Create a new execution gateway with persistence enabled.
    ///
    /// # Arguments
    ///
    /// * `broker` - The broker adapter for order routing
    /// * `state_manager` - Order state manager for tracking order lifecycle
    /// * `validator` - Constraint validator for risk checks
    /// * `circuit_config` - Circuit breaker configuration for broker resilience
    /// * `persistence` - State persistence manager for crash recovery
    #[must_use]
    pub fn with_persistence(
        broker: B,
        state_manager: OrderStateManager,
        validator: ConstraintValidator,
        circuit_config: CircuitBreakerConfig,
        persistence: StatePersistence,
    ) -> Self {
        let broker_name = broker.broker_name();
        Self {
            broker: Arc::new(broker),
            state_manager: Arc::new(state_manager),
            validator: Arc::new(validator),
            circuit_breaker: Arc::new(CircuitBreaker::new(broker_name, circuit_config)),
            persistence: Some(Arc::new(persistence)),
        }
    }

    /// Create a new execution gateway with pre-wrapped Arc references.
    ///
    /// This is useful when the state manager and persistence have already been
    /// created (e.g., after crash recovery).
    ///
    /// # Arguments
    ///
    /// * `broker` - Broker adapter for order routing
    /// * `state_manager` - Arc-wrapped order state manager
    /// * `validator` - Constraint validator for risk checks
    /// * `circuit_config` - Circuit breaker configuration
    /// * `persistence` - Arc-wrapped state persistence manager
    #[must_use]
    pub fn with_persistence_arc(
        broker: B,
        state_manager: Arc<OrderStateManager>,
        validator: ConstraintValidator,
        circuit_config: CircuitBreakerConfig,
        persistence: Arc<StatePersistence>,
    ) -> Self {
        let broker_name = broker.broker_name();
        Self {
            broker: Arc::new(broker),
            state_manager,
            validator: Arc::new(validator),
            circuit_breaker: Arc::new(CircuitBreaker::new(broker_name, circuit_config)),
            persistence: Some(persistence),
        }
    }

    /// Create a new execution gateway with all Arc-wrapped components.
    ///
    /// This allows the caller to retain Arc references for background tasks
    /// like reconciliation while still passing them to the gateway.
    ///
    /// # Arguments
    ///
    /// * `broker` - Arc-wrapped broker adapter
    /// * `broker_name` - Name of the broker for circuit breaker identification
    /// * `state_manager` - Arc-wrapped order state manager
    /// * `validator` - Constraint validator (wrapped internally)
    /// * `circuit_config` - Circuit breaker configuration
    /// * `persistence` - Arc-wrapped state persistence manager
    #[must_use]
    pub fn with_all_arcs(
        broker: Arc<B>,
        broker_name: &'static str,
        state_manager: Arc<OrderStateManager>,
        validator: ConstraintValidator,
        circuit_config: CircuitBreakerConfig,
        persistence: Arc<StatePersistence>,
    ) -> Self {
        Self {
            broker,
            state_manager,
            validator: Arc::new(validator),
            circuit_breaker: Arc::new(CircuitBreaker::new(broker_name, circuit_config)),
            persistence: Some(persistence),
        }
    }

    /// Create a new execution gateway with default circuit breaker settings.
    ///
    /// Primarily for testing or when circuit breaker config is not needed.
    #[must_use]
    pub fn with_defaults(
        broker: B,
        state_manager: OrderStateManager,
        validator: ConstraintValidator,
    ) -> Self {
        Self::new(
            broker,
            state_manager,
            validator,
            CircuitBreakerConfig::default(),
        )
    }

    /// Check if persistence is enabled.
    #[must_use]
    pub fn has_persistence(&self) -> bool {
        self.persistence.is_some()
    }

    /// Get the current circuit breaker state.
    #[must_use]
    pub fn circuit_breaker_state(&self) -> crate::resilience::CircuitBreakerState {
        self.circuit_breaker.state()
    }

    /// Check if broker calls are currently permitted.
    #[must_use]
    pub fn is_broker_available(&self) -> bool {
        self.circuit_breaker.is_call_permitted()
    }

    /// Get circuit breaker metrics.
    #[must_use]
    pub fn circuit_breaker_metrics(&self) -> crate::resilience::CircuitBreakerMetrics {
        self.circuit_breaker.metrics()
    }

    /// Check constraints for a decision plan using default context.
    ///
    /// Note: This uses zero buying power by default. For production use,
    /// prefer `check_constraints_with_context` with actual buying power info.
    #[must_use]
    pub fn check_constraints(&self, request: &ConstraintCheckRequest) -> ConstraintCheckResponse {
        self.validator.validate(request)
    }

    /// Check constraints for a decision plan with extended context.
    ///
    /// Use this method to provide buying power information and Greeks for
    /// more accurate constraint validation.
    #[must_use]
    pub fn check_constraints_with_context(
        &self,
        request: &ConstraintCheckRequest,
        context: &crate::risk::ExtendedConstraintContext,
    ) -> ConstraintCheckResponse {
        self.validator.validate_with_context(request, context)
    }

    /// Submit orders from a decision plan.
    ///
    /// This routes orders through the broker adapter and tracks their state.
    /// Order validation happens at the broker level.
    ///
    /// # Workflow
    ///
    /// 1. Route orders to broker via `BrokerAdapter`
    /// 2. Store returned order states in `OrderStateManager`
    /// 3. Return execution acknowledgment
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Circuit breaker is open (broker is unavailable)
    /// - Order submission fails at the broker level
    pub async fn submit_orders(
        &self,
        request: SubmitOrdersRequest,
    ) -> Result<ExecutionAck, SubmitOrdersError> {
        // Check circuit breaker first
        if !self.circuit_breaker.is_call_permitted() {
            tracing::warn!(
                cycle_id = %request.cycle_id,
                broker = %self.broker.broker_name(),
                circuit_state = %self.circuit_breaker.state(),
                "Order submission blocked by circuit breaker"
            );
            return Err(SubmitOrdersError::CircuitOpen(format!(
                "Broker {} circuit breaker is {}",
                self.broker.broker_name(),
                self.circuit_breaker.state()
            )));
        }

        tracing::info!(
            cycle_id = %request.cycle_id,
            broker = %self.broker.broker_name(),
            order_count = request.plan.decisions.len(),
            "Submitting orders to broker"
        );

        // Submit to broker with circuit breaker tracking
        let result = self.broker.submit_orders(&request).await;

        match result {
            Ok(ack) => {
                self.circuit_breaker.record_success();

                // Store order states
                for order in &ack.orders {
                    self.state_manager.insert(order.clone());
                    tracing::debug!(
                        order_id = %order.order_id,
                        broker_order_id = %order.broker_order_id,
                        instrument = %order.instrument_id,
                        status = ?order.status,
                        "Order state stored"
                    );

                    // Persist order to database (best-effort, non-blocking)
                    if let Some(persistence) = &self.persistence {
                        let persistence = Arc::clone(persistence);
                        let order_clone = order.clone();
                        tokio::spawn(async move {
                            if let Err(e) = persistence.save_order(&order_clone).await {
                                tracing::warn!(
                                    order_id = %order_clone.order_id,
                                    error = %e,
                                    "Failed to persist order state"
                                );
                            }
                        });
                    }
                }

                tracing::info!(
                    cycle_id = %request.cycle_id,
                    submitted_count = ack.orders.len(),
                    error_count = ack.errors.len(),
                    "Order submission complete"
                );

                Ok(ack)
            }
            Err(e) => {
                self.circuit_breaker.record_failure();
                tracing::error!(
                    cycle_id = %request.cycle_id,
                    broker = %self.broker.broker_name(),
                    error = %e,
                    "Broker submission failed, circuit breaker recorded failure"
                );
                Err(SubmitOrdersError::BrokerError(e.to_string()))
            }
        }
    }

    /// Get order states by IDs.
    #[must_use]
    pub fn get_order_states(&self, order_ids: &[String]) -> Vec<OrderState> {
        self.state_manager.get_many(order_ids)
    }

    /// Get all active orders.
    #[must_use]
    pub fn get_active_orders(&self) -> Vec<OrderState> {
        self.state_manager.get_active_orders()
    }

    /// Cancel an order.
    ///
    /// Attempts to cancel an order by its broker order ID. The order must be
    /// in an active (non-terminal) state to be cancelable.
    ///
    /// # Arguments
    ///
    /// * `broker_order_id` - The broker's order ID to cancel
    ///
    /// # Returns
    ///
    /// * `Ok(())` - Cancel request submitted successfully
    /// * `Err(CancelOrderError)` - Failed to cancel order
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Circuit breaker is open (broker is unavailable)
    /// - Order not found in state manager
    /// - Order is already in a terminal state
    /// - Broker API call fails
    pub async fn cancel_order(&self, broker_order_id: &str) -> Result<(), CancelOrderError> {
        // Check circuit breaker first
        if !self.circuit_breaker.is_call_permitted() {
            tracing::warn!(
                broker_order_id = %broker_order_id,
                broker = %self.broker.broker_name(),
                circuit_state = %self.circuit_breaker.state(),
                "Cancel request blocked by circuit breaker"
            );
            return Err(CancelOrderError::CircuitOpen(format!(
                "Broker {} circuit breaker is {}",
                self.broker.broker_name(),
                self.circuit_breaker.state()
            )));
        }

        tracing::info!(
            broker_order_id = %broker_order_id,
            broker = %self.broker.broker_name(),
            "Canceling order"
        );

        // Retrieve order from state manager
        let order_state = self
            .state_manager
            .get_by_broker_id(broker_order_id)
            .ok_or_else(|| CancelOrderError::OrderNotFound(broker_order_id.to_string()))?;

        // Check if order is in a cancelable state
        if order_state.status.is_terminal() {
            return Err(CancelOrderError::OrderNotCancelable(format!(
                "Order {} is in terminal state: {:?}",
                broker_order_id, order_state.status
            )));
        }

        // Submit cancel request to broker with circuit breaker tracking
        let result = self.broker.cancel_order(broker_order_id).await;

        match result {
            Ok(()) => {
                self.circuit_breaker.record_success();

                // Note: Order state will be updated via execution stream or polling
                // We don't update it immediately here to maintain eventual consistency
                // with the broker's authoritative state

                tracing::info!(
                    broker_order_id = %broker_order_id,
                    order_id = %order_state.order_id,
                    "Cancel request submitted"
                );

                Ok(())
            }
            Err(e) => {
                self.circuit_breaker.record_failure();
                tracing::error!(
                    broker_order_id = %broker_order_id,
                    broker = %self.broker.broker_name(),
                    error = %e,
                    "Cancel request failed, circuit breaker recorded failure"
                );
                match e {
                    BrokerError::OrderNotFound(msg) => Err(CancelOrderError::OrderNotFound(msg)),
                    BrokerError::OrderNotCancelable(msg) => {
                        Err(CancelOrderError::OrderNotCancelable(msg))
                    }
                    _ => Err(CancelOrderError::BrokerError(e.to_string())),
                }
            }
        }
    }

    /// Refresh order state from broker.
    ///
    /// Queries the broker for the current order state and updates the state manager.
    /// This is useful for polling order status when execution streams are not available.
    ///
    /// # Arguments
    ///
    /// * `broker_order_id` - The broker's order ID to refresh
    ///
    /// # Returns
    ///
    /// * `Ok(OrderState)` - Updated order state
    /// * `Err(String)` - Failed to refresh order state
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Circuit breaker is open (broker is unavailable)
    /// - The broker API call fails
    pub async fn refresh_order_state(&self, broker_order_id: &str) -> Result<OrderState, String> {
        // Check circuit breaker first
        if !self.circuit_breaker.is_call_permitted() {
            tracing::warn!(
                broker_order_id = %broker_order_id,
                broker = %self.broker.broker_name(),
                circuit_state = %self.circuit_breaker.state(),
                "Refresh state blocked by circuit breaker"
            );
            return Err(format!(
                "Broker {} circuit breaker is {}",
                self.broker.broker_name(),
                self.circuit_breaker.state()
            ));
        }

        tracing::debug!(
            broker_order_id = %broker_order_id,
            "Refreshing order state from broker"
        );

        let result = self.broker.get_order_status(broker_order_id).await;

        match result {
            Ok(order_state) => {
                self.circuit_breaker.record_success();

                // Update state manager
                self.state_manager.update(order_state.clone());

                tracing::debug!(
                    broker_order_id = %broker_order_id,
                    status = ?order_state.status,
                    "Order state refreshed"
                );

                Ok(order_state)
            }
            Err(e) => {
                self.circuit_breaker.record_failure();
                tracing::error!(
                    broker_order_id = %broker_order_id,
                    broker = %self.broker.broker_name(),
                    error = %e,
                    "Refresh state failed, circuit breaker recorded failure"
                );
                Err(e.to_string())
            }
        }
    }
}

/// Errors from order submission.
#[derive(Debug, thiserror::Error)]
pub enum SubmitOrdersError {
    /// Constraint validation failed.
    #[error("Constraint validation failed: {0}")]
    ConstraintViolation(String),

    /// Broker returned an error.
    #[error("Broker error: {0}")]
    BrokerError(String),

    /// Circuit breaker is open, broker calls are not permitted.
    #[error("Circuit breaker open: {0}")]
    CircuitOpen(String),
}

/// Errors from order cancellation.
#[derive(Debug, thiserror::Error)]
pub enum CancelOrderError {
    /// Order not found in state manager.
    #[error("Order not found: {0}")]
    OrderNotFound(String),

    /// Order cannot be canceled (already in terminal state).
    #[error("Order not cancelable: {0}")]
    OrderNotCancelable(String),

    /// Broker returned an error.
    #[error("Broker error: {0}")]
    BrokerError(String),

    /// Circuit breaker is open, broker calls are not permitted.
    #[error("Circuit breaker open: {0}")]
    CircuitOpen(String),
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution::AlpacaAdapter;
    use crate::models::{
        Action, Decision, DecisionPlan, Direction, Environment, OrderSide, OrderStatus, OrderType,
        Size, SizeUnit, StrategyFamily, TimeHorizon, TimeInForce,
    };
    use rust_decimal::Decimal;
    use std::sync::atomic::{AtomicU64, Ordering};

    /// Mock broker adapter for testing.
    ///
    /// This mock returns simulated responses without making actual API calls.
    #[derive(Debug, Default)]
    struct MockBrokerAdapter {
        order_counter: AtomicU64,
    }

    impl MockBrokerAdapter {
        fn new() -> Self {
            Self {
                order_counter: AtomicU64::new(1),
            }
        }
    }

    #[async_trait]
    impl BrokerAdapter for MockBrokerAdapter {
        async fn submit_orders(
            &self,
            request: &SubmitOrdersRequest,
        ) -> Result<ExecutionAck, BrokerError> {
            let mut orders = Vec::new();

            for decision in &request.plan.decisions {
                let order_id = self.order_counter.fetch_add(1, Ordering::SeqCst);
                let now = chrono::Utc::now().to_rfc3339();
                orders.push(OrderState {
                    order_id: format!("order-{order_id}"),
                    broker_order_id: format!("broker-{order_id}"),
                    is_multi_leg: false,
                    instrument_id: decision.instrument_id.clone(),
                    status: OrderStatus::Accepted,
                    side: if decision.action == Action::Buy {
                        OrderSide::Buy
                    } else {
                        OrderSide::Sell
                    },
                    order_type: OrderType::Limit,
                    time_in_force: TimeInForce::Day,
                    requested_quantity: decision.size.quantity,
                    filled_quantity: Decimal::ZERO,
                    avg_fill_price: Decimal::ZERO,
                    limit_price: decision.limit_price,
                    stop_price: None,
                    submitted_at: now.clone(),
                    last_update_at: now,
                    status_message: String::new(),
                    legs: Vec::new(),
                });
            }

            Ok(ExecutionAck {
                cycle_id: request.cycle_id.clone(),
                environment: request.environment,
                ack_time: chrono::Utc::now().to_rfc3339(),
                orders,
                errors: Vec::new(),
            })
        }

        async fn get_order_status(&self, broker_order_id: &str) -> Result<OrderState, BrokerError> {
            let now = chrono::Utc::now().to_rfc3339();
            Ok(OrderState {
                order_id: format!("order-{broker_order_id}"),
                broker_order_id: broker_order_id.to_string(),
                is_multi_leg: false,
                instrument_id: "AAPL".to_string(),
                status: OrderStatus::Accepted,
                side: OrderSide::Buy,
                order_type: OrderType::Limit,
                time_in_force: TimeInForce::Day,
                requested_quantity: Decimal::new(100, 0),
                filled_quantity: Decimal::ZERO,
                avg_fill_price: Decimal::ZERO,
                limit_price: Some(Decimal::new(150, 0)),
                stop_price: None,
                submitted_at: now.clone(),
                last_update_at: now,
                status_message: String::new(),
                legs: Vec::new(),
            })
        }

        async fn cancel_order(&self, _broker_order_id: &str) -> Result<(), BrokerError> {
            Ok(())
        }

        fn broker_name(&self) -> &'static str {
            "mock"
        }

        async fn health_check(&self) -> Result<(), BrokerError> {
            // Mock adapter is always healthy
            Ok(())
        }
    }

    fn make_gateway() -> ExecutionGateway<MockBrokerAdapter> {
        let mock = MockBrokerAdapter::new();
        let state_manager = OrderStateManager::new();
        let validator = ConstraintValidator::with_defaults();

        ExecutionGateway::with_defaults(mock, state_manager, validator)
    }

    // Keep the old function for integration tests that need real Alpaca
    #[allow(dead_code)]
    fn make_alpaca_gateway() -> ExecutionGateway<AlpacaAdapter> {
        let alpaca =
            match AlpacaAdapter::new("test".to_string(), "test".to_string(), Environment::Paper) {
                Ok(a) => a,
                Err(e) => panic!("should create test alpaca adapter: {e}"),
            };
        let state_manager = OrderStateManager::new();
        let validator = ConstraintValidator::with_defaults();

        ExecutionGateway::with_defaults(alpaca, state_manager, validator)
    }

    fn make_valid_request() -> ConstraintCheckRequest {
        ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            plan: DecisionPlan {
                plan_id: "p1".to_string(),
                cycle_id: "c1".to_string(),
                timestamp: "2026-01-04T12:00:00Z".to_string(),
                decisions: vec![Decision {
                    decision_id: "d1".to_string(),
                    instrument_id: "AAPL".to_string(),
                    action: Action::Buy,
                    direction: Direction::Long,
                    size: Size {
                        quantity: Decimal::new(10_000, 0),
                        unit: SizeUnit::Dollars,
                    },
                    stop_loss_level: Decimal::new(145, 0),
                    take_profit_level: Decimal::new(160, 0),
                    limit_price: Some(Decimal::new(150, 0)),
                    strategy_family: StrategyFamily::Momentum,
                    time_horizon: TimeHorizon::Swing,
                    bullish_factors: vec!["Test".to_string()],
                    bearish_factors: vec![],
                    rationale: "Test".to_string(),
                    confidence: Decimal::new(75, 2),
                }],
                risk_manager_approved: true,
                critic_approved: true,
                plan_rationale: "Test".to_string(),
            },
        }
    }

    #[test]
    fn test_check_constraints_valid() {
        use crate::risk::{BuyingPowerInfo, ExtendedConstraintContext};

        let gateway = make_gateway();
        let request = make_valid_request();

        let context = ExtendedConstraintContext {
            buying_power: BuyingPowerInfo::unlimited(),
            ..Default::default()
        };

        let response = gateway.check_constraints_with_context(&request, &context);
        assert!(response.ok);
    }

    #[tokio::test]
    async fn test_submit_orders() {
        let gateway = make_gateway();
        let request = SubmitOrdersRequest {
            cycle_id: "c1".to_string(),
            environment: Environment::Paper,
            plan: make_valid_request().plan,
        };

        let ack = match gateway.submit_orders(request).await {
            Ok(a) => a,
            Err(e) => panic!("submit_orders should succeed: {e}"),
        };
        assert_eq!(ack.cycle_id, "c1");
        assert!(!ack.orders.is_empty());
    }

    #[tokio::test]
    async fn test_cancel_order_success() {
        let gateway = make_gateway();

        // First submit an order
        let request = SubmitOrdersRequest {
            cycle_id: "c1".to_string(),
            environment: Environment::Paper,
            plan: make_valid_request().plan,
        };

        let ack = match gateway.submit_orders(request).await {
            Ok(a) => a,
            Err(e) => panic!("submit_orders should succeed: {e}"),
        };
        let order = &ack.orders[0];

        // Now cancel it
        let result = gateway.cancel_order(&order.broker_order_id).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cancel_order_not_found() {
        let gateway = make_gateway();

        // Try to cancel non-existent order
        let result = gateway.cancel_order("nonexistent-order-id").await;
        let Err(err) = result else {
            panic!("cancel_order should fail for nonexistent order");
        };
        assert!(matches!(err, CancelOrderError::OrderNotFound(_)));
    }

    #[tokio::test]
    async fn test_get_active_orders() {
        let gateway = make_gateway();

        // Submit an order
        let request = SubmitOrdersRequest {
            cycle_id: "c1".to_string(),
            environment: Environment::Paper,
            plan: make_valid_request().plan,
        };

        if let Err(e) = gateway.submit_orders(request).await {
            panic!("submit_orders should succeed: {e}");
        }

        // Get active orders
        let active_orders = gateway.get_active_orders();
        assert!(!active_orders.is_empty());
    }

    #[tokio::test]
    async fn test_get_order_states() {
        let gateway = make_gateway();

        // Submit an order
        let request = SubmitOrdersRequest {
            cycle_id: "c1".to_string(),
            environment: Environment::Paper,
            plan: make_valid_request().plan,
        };

        let ack = match gateway.submit_orders(request).await {
            Ok(a) => a,
            Err(e) => panic!("submit_orders should succeed: {e}"),
        };
        let order_ids: Vec<String> = ack.orders.iter().map(|o| o.order_id.clone()).collect();

        // Get order states
        let states = gateway.get_order_states(&order_ids);
        assert_eq!(states.len(), order_ids.len());
    }

    #[test]
    fn test_has_persistence_disabled_by_default() {
        let gateway = make_gateway();
        assert!(!gateway.has_persistence());
    }

    #[tokio::test]
    async fn test_gateway_with_persistence() {
        // Create in-memory persistence for testing
        let persistence = match StatePersistence::new_in_memory("PAPER").await {
            Ok(p) => p,
            Err(e) => panic!("should create in-memory persistence: {e}"),
        };

        let mock = MockBrokerAdapter::new();
        let state_manager = OrderStateManager::new();
        let validator = ConstraintValidator::with_defaults();

        let gateway = ExecutionGateway::with_persistence(
            mock,
            state_manager,
            validator,
            CircuitBreakerConfig::default(),
            persistence,
        );

        assert!(gateway.has_persistence());
    }

    #[tokio::test]
    async fn test_submit_orders_with_persistence() {
        // Create in-memory persistence for testing
        let persistence = match StatePersistence::new_in_memory("PAPER").await {
            Ok(p) => p,
            Err(e) => panic!("should create in-memory persistence: {e}"),
        };
        let persistence_arc = Arc::new(persistence);
        let persistence_check = Arc::clone(&persistence_arc);

        let mock = MockBrokerAdapter::new();
        let state_manager = OrderStateManager::new();
        let validator = ConstraintValidator::with_defaults();

        // Manually build gateway with Arc<StatePersistence>
        let gateway = {
            let broker_name = mock.broker_name();
            ExecutionGateway {
                broker: Arc::new(mock),
                state_manager: Arc::new(state_manager),
                validator: Arc::new(validator),
                circuit_breaker: Arc::new(CircuitBreaker::new(
                    broker_name,
                    CircuitBreakerConfig::default(),
                )),
                persistence: Some(persistence_arc),
            }
        };

        // Submit an order
        let request = SubmitOrdersRequest {
            cycle_id: "c1".to_string(),
            environment: Environment::Paper,
            plan: make_valid_request().plan,
        };

        let ack = match gateway.submit_orders(request).await {
            Ok(a) => a,
            Err(e) => panic!("submit_orders should succeed: {e}"),
        };
        assert!(!ack.orders.is_empty());

        // Give async persistence task time to complete
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        // Verify order was persisted by loading into a fresh state manager
        let recovery_state_manager = OrderStateManager::new();
        let loaded_count = match persistence_check
            .load_active_orders(&recovery_state_manager)
            .await
        {
            Ok(count) => count,
            Err(e) => panic!("should load active orders: {e}"),
        };

        assert_eq!(loaded_count, 1);

        // Verify the loaded order matches what was submitted
        let loaded_orders = recovery_state_manager.get_active_orders();
        assert_eq!(loaded_orders.len(), 1);
        assert_eq!(loaded_orders[0].instrument_id, "AAPL");
    }
}
