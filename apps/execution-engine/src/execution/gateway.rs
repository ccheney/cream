//! Order execution gateway.
//!
//! This module provides the central gateway for order execution, including:
//! - Generic BrokerAdapter trait for broker integrations
//! - Order routing logic with constraint validation
//! - Order state tracking with FIX protocol semantics
//! - Cancel order functionality

use std::sync::Arc;

use async_trait::async_trait;

use crate::models::{
    ConstraintCheckRequest, ConstraintCheckResponse, ExecutionAck, OrderState, SubmitOrdersRequest,
};
use crate::risk::ConstraintValidator;

use super::{AlpacaAdapter, OrderStateManager};

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
/// 2. **PendingNew (39=A)**: Order submitted, awaiting broker acknowledgment
/// 3. **Accepted (39=1)**: Broker acknowledged order (equivalent to FIX "Filled" for acknowledgment)
/// 4. **PartiallyFilled (39=1)**: Order partially executed
/// 5. **Filled (39=2)**: Order completely executed
/// 6. **PendingCancel (39=6)**: Cancel request submitted, awaiting confirmation
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
    /// * `Ok(())` - Cancel request accepted (order may transition to PendingCancel → Canceled)
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
    fn broker_name(&self) -> &str;
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
#[derive(Clone)]
pub struct ExecutionGateway<B: BrokerAdapter> {
    /// Broker adapter for order routing.
    broker: Arc<B>,
    /// Order state manager.
    state_manager: Arc<OrderStateManager>,
    /// Constraint validator.
    validator: Arc<ConstraintValidator>,
}

impl<B: BrokerAdapter> ExecutionGateway<B> {
    /// Create a new execution gateway.
    #[must_use]
    pub fn new(broker: B, state_manager: OrderStateManager, validator: ConstraintValidator) -> Self {
        Self {
            broker: Arc::new(broker),
            state_manager: Arc::new(state_manager),
            validator: Arc::new(validator),
        }
    }

    /// Check constraints for a decision plan.
    #[must_use]
    pub fn check_constraints(&self, request: &ConstraintCheckRequest) -> ConstraintCheckResponse {
        self.validator.validate(request)
    }

    /// Submit orders from a decision plan.
    ///
    /// This routes orders through the broker adapter and tracks their state.
    /// Order validation happens at the broker level.
    ///
    /// # Workflow
    ///
    /// 1. Route orders to broker via BrokerAdapter
    /// 2. Store returned order states in OrderStateManager
    /// 3. Return execution acknowledgment
    ///
    /// # Errors
    ///
    /// Returns an error if order submission fails at the broker level.
    pub async fn submit_orders(
        &self,
        request: SubmitOrdersRequest,
    ) -> Result<ExecutionAck, SubmitOrdersError> {
        tracing::info!(
            cycle_id = %request.cycle_id,
            broker = %self.broker.broker_name(),
            order_count = request.plan.decisions.len(),
            "Submitting orders to broker"
        );

        // Submit to broker
        let ack = self
            .broker
            .submit_orders(&request)
            .await
            .map_err(|e| SubmitOrdersError::BrokerError(e.to_string()))?;

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
        }

        tracing::info!(
            cycle_id = %request.cycle_id,
            submitted_count = ack.orders.len(),
            error_count = ack.errors.len(),
            "Order submission complete"
        );

        Ok(ack)
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
    /// - Order not found in state manager
    /// - Order is already in a terminal state
    /// - Broker API call fails
    pub async fn cancel_order(&self, broker_order_id: &str) -> Result<(), CancelOrderError> {
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

        // Submit cancel request to broker
        self.broker
            .cancel_order(broker_order_id)
            .await
            .map_err(|e| match e {
                BrokerError::OrderNotFound(msg) => CancelOrderError::OrderNotFound(msg),
                BrokerError::OrderNotCancelable(msg) => CancelOrderError::OrderNotCancelable(msg),
                _ => CancelOrderError::BrokerError(e.to_string()),
            })?;

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
    /// Returns an error if the broker API call fails.
    pub async fn refresh_order_state(
        &self,
        broker_order_id: &str,
    ) -> Result<OrderState, String> {
        tracing::debug!(
            broker_order_id = %broker_order_id,
            "Refreshing order state from broker"
        );

        let order_state = self
            .broker
            .get_order_status(broker_order_id)
            .await
            .map_err(|e| e.to_string())?;

        // Update state manager
        self.state_manager.update(order_state.clone());

        tracing::debug!(
            broker_order_id = %broker_order_id,
            status = ?order_state.status,
            "Order state refreshed"
        );

        Ok(order_state)
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        Action, Decision, DecisionPlan, Direction, Environment, Size, SizeUnit, StrategyFamily,
        TimeHorizon,
    };
    use rust_decimal::Decimal;

    fn make_gateway() -> ExecutionGateway<AlpacaAdapter> {
        let alpaca =
            AlpacaAdapter::new("test".to_string(), "test".to_string(), Environment::Paper).unwrap();
        let state_manager = OrderStateManager::new();
        let validator = ConstraintValidator::with_defaults();

        ExecutionGateway::new(alpaca, state_manager, validator)
    }

    fn make_valid_request() -> ConstraintCheckRequest {
        ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100000, 0),
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
                        quantity: Decimal::new(10000, 0),
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
        let gateway = make_gateway();
        let request = make_valid_request();

        let response = gateway.check_constraints(&request);
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

        let result = gateway.submit_orders(request).await;
        assert!(result.is_ok());

        let ack = result.unwrap();
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

        let ack = gateway.submit_orders(request).await.unwrap();
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
        assert!(result.is_err());
        assert!(matches!(result.unwrap_err(), CancelOrderError::OrderNotFound(_)));
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

        gateway.submit_orders(request).await.unwrap();

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

        let ack = gateway.submit_orders(request).await.unwrap();
        let order_ids: Vec<String> = ack.orders.iter().map(|o| o.order_id.clone()).collect();

        // Get order states
        let states = gateway.get_order_states(&order_ids);
        assert_eq!(states.len(), order_ids.len());
    }
}
