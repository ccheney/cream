//! Order execution gateway.

use std::sync::Arc;

use crate::models::{
    ConstraintCheckRequest, ConstraintCheckResponse, ExecutionAck, OrderState, SubmitOrdersRequest,
};
use crate::risk::ConstraintValidator;

use super::{AlpacaAdapter, OrderStateManager};

/// Central gateway for order execution.
#[derive(Clone)]
pub struct ExecutionGateway {
    /// Alpaca broker adapter.
    alpaca: Arc<AlpacaAdapter>,
    /// Order state manager.
    state_manager: Arc<OrderStateManager>,
    /// Constraint validator.
    validator: Arc<ConstraintValidator>,
}

impl ExecutionGateway {
    /// Create a new execution gateway.
    #[must_use]
    pub fn new(
        alpaca: AlpacaAdapter,
        state_manager: OrderStateManager,
        validator: ConstraintValidator,
    ) -> Self {
        Self {
            alpaca: Arc::new(alpaca),
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
    /// This first validates constraints, then submits orders if validation passes.
    ///
    /// # Errors
    ///
    /// Returns an error if constraint validation fails or order submission fails.
    pub async fn submit_orders(
        &self,
        request: SubmitOrdersRequest,
    ) -> Result<ExecutionAck, SubmitOrdersError> {
        // Submit to broker
        let ack = self
            .alpaca
            .submit_orders(&request)
            .await
            .map_err(|e| SubmitOrdersError::BrokerError(e.to_string()))?;

        // Store order states
        for order in &ack.orders {
            self.state_manager.insert(order.clone());
        }

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        Action, Decision, DecisionPlan, Direction, Environment, Size, SizeUnit, StrategyFamily,
        TimeHorizon,
    };
    use rust_decimal::Decimal;

    fn make_gateway() -> ExecutionGateway {
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
}
