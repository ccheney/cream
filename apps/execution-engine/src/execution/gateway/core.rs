//! Execution gateway core implementation.
//!
//! This module provides the central gateway for order execution, including:
//! - Order routing logic with constraint validation
//! - Order state tracking with FIX protocol semantics
//! - Cancel order functionality
//! - Circuit breaker integration for broker resilience

use std::sync::Arc;

use tokio::sync::RwLock;

use crate::execution::persistence::StatePersistence;
use crate::execution::state::OrderStateManager;
use crate::execution::stops::{
    MonitoredPosition, StopTargetLevels, StopsConfig, StopsEnforcer, supports_bracket_orders,
};
use crate::models::{
    ConstraintCheckRequest, ConstraintCheckResponse, Environment, OrderState, SubmitOrdersRequest,
};
use crate::resilience::{CircuitBreaker, CircuitBreakerConfig};
use crate::risk::ConstraintValidator;
use rust_decimal::Decimal;

use super::{BrokerAdapter, BrokerError, CancelOrderError, SubmitOrdersError};

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
    broker: Arc<B>,
    state_manager: Arc<OrderStateManager>,
    validator: Arc<ConstraintValidator>,
    circuit_breaker: Arc<CircuitBreaker>,
    persistence: Option<Arc<StatePersistence>>,
    stops_enforcer: Arc<RwLock<StopsEnforcer>>,
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
        Self::with_stops(
            broker,
            state_manager,
            validator,
            circuit_config,
            StopsEnforcer::new(Environment::Paper),
        )
    }

    /// Create a new execution gateway with circuit breaker protection and custom environment.
    ///
    /// # Arguments
    ///
    /// * `broker` - The broker adapter for order routing
    /// * `state_manager` - Order state manager for tracking order lifecycle
    /// * `validator` - Constraint validator for risk checks
    /// * `circuit_config` - Circuit breaker configuration for broker resilience
    /// * `environment` - Trading environment (PAPER/LIVE)
    #[must_use]
    pub fn with_environment(
        broker: B,
        state_manager: OrderStateManager,
        validator: ConstraintValidator,
        circuit_config: CircuitBreakerConfig,
        environment: Environment,
    ) -> Self {
        Self::with_stops(
            broker,
            state_manager,
            validator,
            circuit_config,
            StopsEnforcer::new(environment),
        )
    }

    /// Create a new execution gateway with custom stops configuration.
    ///
    /// # Arguments
    ///
    /// * `broker` - The broker adapter for order routing
    /// * `state_manager` - Order state manager for tracking order lifecycle
    /// * `validator` - Constraint validator for risk checks
    /// * `circuit_config` - Circuit breaker configuration for broker resilience
    /// * `stops_enforcer` - Pre-configured stops enforcer
    #[must_use]
    pub fn with_stops(
        broker: B,
        state_manager: OrderStateManager,
        validator: ConstraintValidator,
        circuit_config: CircuitBreakerConfig,
        stops_enforcer: StopsEnforcer,
    ) -> Self {
        let broker_name = broker.broker_name();
        Self {
            broker: Arc::new(broker),
            state_manager: Arc::new(state_manager),
            validator: Arc::new(validator),
            circuit_breaker: Arc::new(CircuitBreaker::new(broker_name, circuit_config)),
            persistence: None,
            stops_enforcer: Arc::new(RwLock::new(stops_enforcer)),
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
            stops_enforcer: Arc::new(RwLock::new(StopsEnforcer::new(Environment::Paper))),
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
            stops_enforcer: Arc::new(RwLock::new(StopsEnforcer::new(Environment::Paper))),
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
    /// * `environment` - Trading environment (PAPER/LIVE)
    /// * `stops_config` - Stops enforcement configuration
    #[must_use]
    #[allow(clippy::too_many_arguments)]
    pub fn with_all_arcs(
        broker: Arc<B>,
        broker_name: &'static str,
        state_manager: Arc<OrderStateManager>,
        validator: ConstraintValidator,
        circuit_config: CircuitBreakerConfig,
        persistence: Arc<StatePersistence>,
        environment: Environment,
        stops_config: StopsConfig,
    ) -> Self {
        Self {
            broker,
            state_manager,
            validator: Arc::new(validator),
            circuit_breaker: Arc::new(CircuitBreaker::new(broker_name, circuit_config)),
            persistence: Some(persistence),
            stops_enforcer: Arc::new(RwLock::new(StopsEnforcer::with_config(
                environment,
                stops_config,
            ))),
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
    #[allow(clippy::missing_const_for_fn)] // Option::is_some is not const
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

    /// Get a clone of the stops enforcer for external use (e.g., price monitoring).
    #[must_use]
    pub fn stops_enforcer(&self) -> Arc<RwLock<StopsEnforcer>> {
        Arc::clone(&self.stops_enforcer)
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
    ) -> Result<crate::models::ExecutionAck, SubmitOrdersError> {
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

        let result = self.broker.submit_orders(&request).await;

        match result {
            Ok(ack) => {
                self.circuit_breaker.record_success();
                self.store_and_persist_orders(&ack.orders).await;

                // Register options positions with stop/target levels for price monitoring
                // (stocks use bracket orders, options need price-based monitoring)
                self.register_options_for_monitoring(&request, &ack.orders)
                    .await;

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

    /// Register options positions for price monitoring.
    ///
    /// Options don't support bracket orders on Alpaca, so we use price monitoring
    /// to enforce stop/target levels instead.
    #[allow(clippy::significant_drop_tightening)]
    async fn register_options_for_monitoring(
        &self,
        request: &SubmitOrdersRequest,
        orders: &[OrderState],
    ) {
        // Collect positions to monitor first, then acquire lock briefly
        let mut positions_to_monitor = Vec::new();

        for decision in &request.plan.decisions {
            // Skip if this isn't an option or has no stop/target levels
            if supports_bracket_orders(&decision.instrument_id) {
                continue;
            }

            let has_stop = decision.stop_loss_level > Decimal::ZERO;
            let has_target = decision.take_profit_level > Decimal::ZERO;
            if !has_stop && !has_target {
                continue;
            }

            // Find the corresponding order
            let order = orders
                .iter()
                .find(|o| o.instrument_id == decision.instrument_id);

            if let Some(order) = order {
                let levels = StopTargetLevels::new(
                    decision.stop_loss_level,
                    decision.take_profit_level,
                    decision.limit_price.unwrap_or(decision.stop_loss_level), // Use limit or stop as entry proxy
                    decision.direction,
                );

                let monitored = MonitoredPosition {
                    position_id: order.order_id.clone(),
                    instrument_id: order.instrument_id.clone(),
                    levels,
                    active: true,
                };

                positions_to_monitor.push((
                    monitored,
                    order.order_id.clone(),
                    order.instrument_id.clone(),
                    decision.stop_loss_level,
                    decision.take_profit_level,
                ));
            }
        }

        // Acquire lock only for the brief insertion phase
        if !positions_to_monitor.is_empty() {
            let mut enforcer = self.stops_enforcer.write().await;
            for (monitored, order_id, instrument_id, stop_loss, take_profit) in positions_to_monitor
            {
                enforcer.monitor_position(monitored);
                tracing::info!(
                    order_id = %order_id,
                    instrument_id = %instrument_id,
                    stop_loss = %stop_loss,
                    take_profit = %take_profit,
                    "Registered options position for price monitoring"
                );
            }
        }
    }

    /// Store orders in state manager and persist to database.
    #[allow(clippy::unused_async)] // Async for spawned persistence tasks
    async fn store_and_persist_orders(&self, orders: &[OrderState]) {
        for order in orders {
            self.state_manager.insert(order.clone());
            tracing::debug!(
                order_id = %order.order_id,
                broker_order_id = %order.broker_order_id,
                instrument = %order.instrument_id,
                status = ?order.status,
                "Order state stored"
            );

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

        let order_state = self
            .state_manager
            .get_by_broker_id(broker_order_id)
            .ok_or_else(|| CancelOrderError::OrderNotFound(broker_order_id.to_string()))?;

        if order_state.status.is_terminal() {
            return Err(CancelOrderError::OrderNotCancelable(format!(
                "Order {} is in terminal state: {:?}",
                broker_order_id, order_state.status
            )));
        }

        let result = self.broker.cancel_order(broker_order_id).await;

        match result {
            Ok(()) => {
                self.circuit_breaker.record_success();
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution::gateway::MockBrokerAdapter;
    use crate::models::{
        Action, Decision, DecisionPlan, Direction, Environment, Size, SizeUnit, StrategyFamily,
        ThesisState, TimeHorizon,
    };
    use rust_decimal::Decimal;

    fn make_gateway() -> ExecutionGateway<MockBrokerAdapter> {
        let mock = MockBrokerAdapter::new();
        let state_manager = OrderStateManager::new();
        let validator = ConstraintValidator::with_defaults();

        ExecutionGateway::with_defaults(mock, state_manager, validator)
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
                    strategy_family: StrategyFamily::EquityLong,
                    time_horizon: TimeHorizon::Swing,
                    thesis_state: ThesisState::Watching,
                    bullish_factors: vec!["Test".to_string()],
                    bearish_factors: vec![],
                    rationale: "Test".to_string(),
                    confidence: Decimal::new(75, 2),
                    legs: vec![],
                    net_limit_price: None,
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

        let result = gateway.cancel_order(&order.broker_order_id).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cancel_order_not_found() {
        let gateway = make_gateway();

        let result = gateway.cancel_order("nonexistent-order-id").await;
        let Err(err) = result else {
            panic!("cancel_order should fail for nonexistent order");
        };
        assert!(matches!(err, CancelOrderError::OrderNotFound(_)));
    }

    #[tokio::test]
    async fn test_get_active_orders() {
        let gateway = make_gateway();

        let request = SubmitOrdersRequest {
            cycle_id: "c1".to_string(),
            environment: Environment::Paper,
            plan: make_valid_request().plan,
        };

        if let Err(e) = gateway.submit_orders(request).await {
            panic!("submit_orders should succeed: {e}");
        }

        let active_orders = gateway.get_active_orders();
        assert!(!active_orders.is_empty());
    }

    #[tokio::test]
    async fn test_get_order_states() {
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
        let order_ids: Vec<String> = ack.orders.iter().map(|o| o.order_id.clone()).collect();

        let states = gateway.get_order_states(&order_ids);
        assert_eq!(states.len(), order_ids.len());
    }

    #[test]
    fn test_has_persistence_disabled_by_default() {
        let gateway = make_gateway();
        assert!(!gateway.has_persistence());
    }

    /// Get test database URL from environment.
    fn get_test_database_url() -> Option<String> {
        std::env::var("TEST_DATABASE_URL")
            .or_else(|_| std::env::var("DATABASE_URL"))
            .ok()
    }

    #[tokio::test]
    #[ignore = "Requires PostgreSQL TEST_DATABASE_URL"]
    #[allow(clippy::expect_used)]
    async fn test_gateway_with_persistence() {
        let database_url = get_test_database_url().expect("TEST_DATABASE_URL required");
        let persistence = match StatePersistence::new(&database_url, "PAPER").await {
            Ok(p) => p,
            Err(e) => panic!("should create persistence: {e}"),
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
    #[ignore = "Requires PostgreSQL TEST_DATABASE_URL"]
    #[allow(clippy::expect_used)]
    async fn test_submit_orders_with_persistence() {
        let database_url = get_test_database_url().expect("TEST_DATABASE_URL required");
        let persistence = match StatePersistence::new(&database_url, "PAPER").await {
            Ok(p) => p,
            Err(e) => panic!("should create persistence: {e}"),
        };
        let persistence_arc = Arc::new(persistence);
        let persistence_check = Arc::clone(&persistence_arc);

        let mock = MockBrokerAdapter::new();
        let state_manager = OrderStateManager::new();
        let validator = ConstraintValidator::with_defaults();

        let broker_name = mock.broker_name();
        let gateway = ExecutionGateway {
            broker: Arc::new(mock),
            state_manager: Arc::new(state_manager),
            validator: Arc::new(validator),
            circuit_breaker: Arc::new(CircuitBreaker::new(
                broker_name,
                CircuitBreakerConfig::default(),
            )),
            persistence: Some(persistence_arc),
            stops_enforcer: Arc::new(RwLock::new(StopsEnforcer::new(Environment::Paper))),
        };

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

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        let recovery_state_manager = OrderStateManager::new();
        let loaded_count = match persistence_check
            .load_active_orders(&recovery_state_manager)
            .await
        {
            Ok(count) => count,
            Err(e) => panic!("should load active orders: {e}"),
        };

        assert_eq!(loaded_count, 1);

        let loaded_orders = recovery_state_manager.get_active_orders();
        assert_eq!(loaded_orders.len(), 1);
        assert_eq!(loaded_orders[0].instrument_id, "AAPL");
    }
}
