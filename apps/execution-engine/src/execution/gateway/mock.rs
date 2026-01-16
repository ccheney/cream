//! Mock broker adapter for testing.
//!
//! This module provides a mock implementation of `BrokerAdapter` that returns
//! simulated responses without making actual API calls. Useful for unit tests
//! and integration tests that don't require real broker connectivity.

use std::sync::atomic::{AtomicU64, Ordering};

use async_trait::async_trait;
use rust_decimal::Decimal;

use crate::models::{
    Action, ExecutionAck, OrderSide, OrderState, OrderStatus, OrderType, SubmitOrdersRequest,
    TimeInForce,
};

use super::{BrokerAdapter, BrokerError};

/// Mock broker adapter for testing.
///
/// This mock returns simulated responses without making actual API calls.
/// Order IDs are generated sequentially starting from 1.
#[derive(Debug, Default)]
pub struct MockBrokerAdapter {
    order_counter: AtomicU64,
}

impl MockBrokerAdapter {
    /// Create a new mock broker adapter.
    #[must_use]
    #[allow(clippy::missing_const_for_fn)] // AtomicU64::new is not const-stable
    pub fn new() -> Self {
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
        Ok(())
    }
}

#[cfg(test)]
#[allow(clippy::expect_used)]
mod tests {
    use super::*;
    use crate::models::{
        Decision, DecisionPlan, Direction, Environment, Size, SizeUnit, StrategyFamily, TimeHorizon,
    };

    fn make_test_request() -> SubmitOrdersRequest {
        SubmitOrdersRequest {
            cycle_id: "test-cycle".to_string(),
            environment: Environment::Paper,
            plan: DecisionPlan {
                plan_id: "p1".to_string(),
                cycle_id: "test-cycle".to_string(),
                timestamp: "2026-01-04T12:00:00Z".to_string(),
                decisions: vec![Decision {
                    decision_id: "d1".to_string(),
                    instrument_id: "AAPL".to_string(),
                    action: Action::Buy,
                    direction: Direction::Long,
                    size: Size {
                        quantity: Decimal::new(100, 0),
                        unit: SizeUnit::Shares,
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

    #[tokio::test]
    async fn test_submit_orders_returns_accepted_state() {
        let mock = MockBrokerAdapter::new();
        let request = make_test_request();

        let ack = mock.submit_orders(&request).await.expect("should submit");
        assert_eq!(ack.orders.len(), 1);
        assert_eq!(ack.orders[0].status, OrderStatus::Accepted);
        assert_eq!(ack.orders[0].instrument_id, "AAPL");
    }

    #[tokio::test]
    async fn test_order_ids_are_sequential() {
        let mock = MockBrokerAdapter::new();
        let request = make_test_request();

        let ack1 = mock.submit_orders(&request).await.expect("should submit");
        let ack2 = mock.submit_orders(&request).await.expect("should submit");

        assert_eq!(ack1.orders[0].order_id, "order-1");
        assert_eq!(ack2.orders[0].order_id, "order-2");
    }

    #[tokio::test]
    async fn test_cancel_order_succeeds() {
        let mock = MockBrokerAdapter::new();
        let result = mock.cancel_order("any-order-id").await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_health_check_succeeds() {
        let mock = MockBrokerAdapter::new();
        let result = mock.health_check().await;
        assert!(result.is_ok());
    }

    #[test]
    fn test_broker_name() {
        let mock = MockBrokerAdapter::new();
        assert_eq!(mock.broker_name(), "mock");
    }
}
