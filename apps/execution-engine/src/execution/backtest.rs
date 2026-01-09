//! Backtest adapter for simulated order execution.
//!
//! This adapter implements the `BrokerAdapter` trait for backtest environments,
//! providing deterministic order simulation without real broker API calls.
//!
//! # Features
//!
//! - Deterministic order fills based on configurable fill models
//! - Simulated slippage and commission
//! - Order history tracking for verification
//! - Compatible with the existing `SimulationEngine` for full backtesting
//!
//! # Usage
//!
//! ```rust,ignore
//! use execution_engine::execution::BacktestAdapter;
//! use execution_engine::models::Environment;
//!
//! let adapter = BacktestAdapter::new();
//!
//! // Submit orders - they will be simulated deterministically
//! let ack = adapter.submit_orders(&request).await?;
//! ```

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use async_trait::async_trait;
use rust_decimal::Decimal;

use crate::backtest::{BacktestConfig, FillResult, simulate_market_order};
use crate::models::{
    Environment, ExecutionAck, ExecutionError, OrderSide, OrderState, OrderStatus, OrderType,
    SubmitOrdersRequest, TimeInForce,
};

use super::gateway::{BrokerAdapter, BrokerError};

/// Backtest adapter for simulated order execution.
///
/// This adapter provides deterministic order simulation for backtesting.
/// Orders are filled immediately using configurable fill models, without
/// making real broker API calls.
///
/// # Order Recording
///
/// All submitted orders are recorded for later verification, accessible
/// via `submitted_orders()`. This is useful for testing that decision plans
/// result in expected order submissions.
#[derive(Debug)]
pub struct BacktestAdapter {
    /// Backtest configuration for fill simulation.
    config: BacktestConfig,
    /// Order counter for generating unique IDs.
    order_counter: AtomicU64,
    /// Recorded submitted orders for verification.
    submitted_orders: Arc<RwLock<Vec<RecordedOrder>>>,
    /// Current simulated price (used when no candle data available).
    simulated_price: Arc<RwLock<Decimal>>,
}

/// Recorded order for backtest verification.
#[derive(Debug, Clone)]
pub struct RecordedOrder {
    /// Order ID assigned by the adapter.
    pub order_id: String,
    /// Broker order ID (same as `order_id` in backtest).
    pub broker_order_id: String,
    /// Original decision ID from the plan.
    pub decision_id: String,
    /// Instrument being traded.
    pub instrument_id: String,
    /// Order side.
    pub side: OrderSide,
    /// Order type.
    pub order_type: OrderType,
    /// Requested quantity.
    pub quantity: Decimal,
    /// Limit price if specified.
    pub limit_price: Option<Decimal>,
    /// Stop loss level from decision.
    pub stop_loss_level: Decimal,
    /// Take profit level from decision.
    pub take_profit_level: Decimal,
    /// Simulated fill price.
    pub fill_price: Decimal,
    /// Simulated fill quantity.
    pub fill_quantity: Decimal,
    /// Order status after simulation.
    pub status: OrderStatus,
    /// Timestamp of submission.
    pub submitted_at: String,
}

impl Default for BacktestAdapter {
    fn default() -> Self {
        Self::new()
    }
}

impl BacktestAdapter {
    /// Create a new backtest adapter with default configuration.
    #[must_use]
    pub fn new() -> Self {
        Self {
            config: BacktestConfig::default(),
            order_counter: AtomicU64::new(1),
            submitted_orders: Arc::new(RwLock::new(Vec::new())),
            simulated_price: Arc::new(RwLock::new(Decimal::new(100, 0))),
        }
    }

    /// Create a backtest adapter with custom configuration.
    #[must_use]
    pub fn with_config(config: BacktestConfig) -> Self {
        Self {
            config,
            order_counter: AtomicU64::new(1),
            submitted_orders: Arc::new(RwLock::new(Vec::new())),
            simulated_price: Arc::new(RwLock::new(Decimal::new(100, 0))),
        }
    }

    /// Set the simulated current price for order fills.
    ///
    /// This is used when no candle data is available. In a full backtest,
    /// the `SimulationEngine` provides candle data for more accurate fills.
    pub fn set_simulated_price(&self, price: Decimal) {
        if let Ok(mut p) = self.simulated_price.write() {
            *p = price;
        }
    }

    /// Get all submitted orders for verification.
    ///
    /// Useful for testing that decision plans produce expected orders.
    #[must_use]
    pub fn submitted_orders(&self) -> Vec<RecordedOrder> {
        self.submitted_orders
            .read()
            .map(|orders| orders.clone())
            .unwrap_or_default()
    }

    /// Clear recorded orders.
    pub fn clear_orders(&self) {
        if let Ok(mut orders) = self.submitted_orders.write() {
            orders.clear();
        }
    }

    /// Get the count of submitted orders.
    #[must_use]
    pub fn order_count(&self) -> usize {
        self.submitted_orders
            .read()
            .map(|orders| orders.len())
            .unwrap_or(0)
    }

    /// Generate a new unique order ID.
    fn next_order_id(&self) -> String {
        let id = self.order_counter.fetch_add(1, Ordering::SeqCst);
        format!("backtest-order-{id:08}")
    }

    /// Simulate a fill for the given decision.
    fn simulate_fill(&self, side: OrderSide, quantity: Decimal) -> FillResult {
        // Get current simulated price
        let price = self
            .simulated_price
            .read()
            .map_or_else(|_| Decimal::new(100, 0), |p| *p);

        // Create a synthetic candle for simulation
        let candle = crate::backtest::Candle {
            open: price,
            high: price * Decimal::new(101, 2), // +1%
            low: price * Decimal::new(99, 2),   // -1%
            close: price,
            volume: Decimal::new(100_000, 0),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        // Simulate market order fill
        simulate_market_order(side, quantity, &candle, &self.config, true, None)
    }
}

impl Clone for BacktestAdapter {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            order_counter: AtomicU64::new(self.order_counter.load(Ordering::SeqCst)),
            submitted_orders: Arc::clone(&self.submitted_orders),
            simulated_price: Arc::clone(&self.simulated_price),
        }
    }
}

#[async_trait]
impl BrokerAdapter for BacktestAdapter {
    async fn submit_orders(
        &self,
        request: &SubmitOrdersRequest,
    ) -> Result<ExecutionAck, BrokerError> {
        // Validate environment is backtest
        if request.environment != Environment::Backtest {
            return Err(BrokerError::EnvironmentMismatch {
                expected: "BACKTEST".to_string(),
                actual: request.environment.to_string(),
            });
        }

        let now = chrono::Utc::now().to_rfc3339();
        let mut orders = Vec::new();
        let mut errors = Vec::new();
        let mut recorded = Vec::new();

        for decision in &request.plan.decisions {
            let order_id = self.next_order_id();
            let broker_order_id = order_id.clone();

            // Determine order side from action
            let side = match decision.action {
                crate::models::Action::Buy => OrderSide::Buy,
                crate::models::Action::Sell | crate::models::Action::Close => OrderSide::Sell,
                crate::models::Action::Hold | crate::models::Action::NoTrade => {
                    // Skip orders for Hold/NoTrade
                    tracing::debug!(
                        decision_id = %decision.decision_id,
                        action = ?decision.action,
                        "Skipping order for non-trading action"
                    );
                    continue;
                }
            };

            // Determine order type
            let order_type = if decision.limit_price.is_some() {
                OrderType::Limit
            } else {
                OrderType::Market
            };

            // Simulate fill
            let fill_result = self.simulate_fill(side, decision.size.quantity);

            if fill_result.filled {
                let fill_price = fill_result.price.unwrap_or_else(|| Decimal::new(100, 0));

                let order_state = OrderState {
                    order_id: order_id.clone(),
                    broker_order_id: broker_order_id.clone(),
                    is_multi_leg: false,
                    instrument_id: decision.instrument_id.clone(),
                    status: OrderStatus::Filled,
                    side,
                    order_type,
                    time_in_force: TimeInForce::Day,
                    requested_quantity: decision.size.quantity,
                    filled_quantity: fill_result.filled_quantity,
                    avg_fill_price: fill_price,
                    limit_price: decision.limit_price,
                    stop_price: None,
                    submitted_at: now.clone(),
                    last_update_at: now.clone(),
                    status_message: "Simulated fill".to_string(),
                    legs: Vec::new(),
                };

                orders.push(order_state);

                // Record order for verification
                recorded.push(RecordedOrder {
                    order_id: order_id.clone(),
                    broker_order_id,
                    decision_id: decision.decision_id.clone(),
                    instrument_id: decision.instrument_id.clone(),
                    side,
                    order_type,
                    quantity: decision.size.quantity,
                    limit_price: decision.limit_price,
                    stop_loss_level: decision.stop_loss_level,
                    take_profit_level: decision.take_profit_level,
                    fill_price,
                    fill_quantity: fill_result.filled_quantity,
                    status: OrderStatus::Filled,
                    submitted_at: now.clone(),
                });

                tracing::info!(
                    order_id = %order_id,
                    instrument = %decision.instrument_id,
                    side = ?side,
                    quantity = %decision.size.quantity,
                    fill_price = %fill_price,
                    "Backtest order simulated"
                );
            } else {
                // Order rejected in simulation
                errors.push(ExecutionError {
                    code: "SIMULATION_REJECT".to_string(),
                    message: "Order rejected in backtest simulation".to_string(),
                    instrument_id: decision.instrument_id.clone(),
                    order_id: order_id.clone(),
                });

                tracing::warn!(
                    order_id = %order_id,
                    instrument = %decision.instrument_id,
                    "Backtest order rejected"
                );
            }
        }

        // Store recorded orders
        if let Ok(mut orders_lock) = self.submitted_orders.write() {
            orders_lock.extend(recorded);
        }

        Ok(ExecutionAck {
            cycle_id: request.cycle_id.clone(),
            environment: Environment::Backtest,
            ack_time: now,
            orders,
            errors,
        })
    }

    async fn get_order_status(&self, broker_order_id: &str) -> Result<OrderState, BrokerError> {
        // Look up order in recorded orders
        let orders = self.submitted_orders();
        orders
            .iter()
            .find(|o| o.broker_order_id == broker_order_id)
            .map_or_else(
                || Err(BrokerError::OrderNotFound(broker_order_id.to_string())),
                |order| {
                    let now = chrono::Utc::now().to_rfc3339();
                    Ok(OrderState {
                        order_id: order.order_id.clone(),
                        broker_order_id: order.broker_order_id.clone(),
                        is_multi_leg: false,
                        instrument_id: order.instrument_id.clone(),
                        status: order.status,
                        side: order.side,
                        order_type: order.order_type,
                        time_in_force: TimeInForce::Day,
                        requested_quantity: order.quantity,
                        filled_quantity: order.fill_quantity,
                        avg_fill_price: order.fill_price,
                        limit_price: order.limit_price,
                        stop_price: None,
                        submitted_at: order.submitted_at.clone(),
                        last_update_at: now,
                        status_message: String::new(),
                        legs: Vec::new(),
                    })
                },
            )
    }

    async fn cancel_order(&self, broker_order_id: &str) -> Result<(), BrokerError> {
        // In backtest, orders are filled immediately, so cancellation is a no-op
        // unless the order was not filled
        let orders = self.submitted_orders();
        let exists = orders.iter().any(|o| o.broker_order_id == broker_order_id);

        if exists {
            tracing::debug!(
                broker_order_id = %broker_order_id,
                "Backtest order cancel request (no-op for filled orders)"
            );
            Ok(())
        } else {
            Err(BrokerError::OrderNotFound(broker_order_id.to_string()))
        }
    }

    fn broker_name(&self) -> &'static str {
        "Backtest"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        Action, Decision, DecisionPlan, Direction, Size, SizeUnit, StrategyFamily, TimeHorizon,
    };

    fn make_test_request() -> SubmitOrdersRequest {
        SubmitOrdersRequest {
            cycle_id: "test-cycle-1".to_string(),
            environment: Environment::Backtest,
            plan: DecisionPlan {
                plan_id: "plan-1".to_string(),
                cycle_id: "test-cycle-1".to_string(),
                timestamp: chrono::Utc::now().to_rfc3339(),
                decisions: vec![Decision {
                    decision_id: "decision-1".to_string(),
                    instrument_id: "AAPL".to_string(),
                    action: Action::Buy,
                    direction: Direction::Long,
                    size: Size {
                        quantity: Decimal::new(100, 0),
                        unit: SizeUnit::Shares,
                    },
                    stop_loss_level: Decimal::new(145, 0),
                    take_profit_level: Decimal::new(160, 0),
                    limit_price: None,
                    strategy_family: StrategyFamily::Momentum,
                    time_horizon: TimeHorizon::Swing,
                    bullish_factors: vec!["Test".to_string()],
                    bearish_factors: vec![],
                    rationale: "Test order".to_string(),
                    confidence: Decimal::new(75, 2),
                }],
                risk_manager_approved: true,
                critic_approved: true,
                plan_rationale: "Test plan".to_string(),
            },
        }
    }

    #[tokio::test]
    async fn test_backtest_adapter_creation() {
        let adapter = BacktestAdapter::new();
        assert_eq!(adapter.broker_name(), "Backtest");
        assert_eq!(adapter.order_count(), 0);
    }

    #[tokio::test]
    async fn test_submit_orders_success() {
        let adapter = BacktestAdapter::new();
        adapter.set_simulated_price(Decimal::new(150, 0));

        let request = make_test_request();
        let result = adapter.submit_orders(&request).await;

        let ack = match result {
            Ok(a) => a,
            Err(e) => panic!("submit_orders should succeed: {e}"),
        };

        assert_eq!(ack.cycle_id, "test-cycle-1");
        assert_eq!(ack.environment, Environment::Backtest);
        assert_eq!(ack.orders.len(), 1);
        assert!(ack.errors.is_empty());

        let order = &ack.orders[0];
        assert_eq!(order.status, OrderStatus::Filled);
        assert_eq!(order.instrument_id, "AAPL");
        assert_eq!(order.side, OrderSide::Buy);
        assert!(order.filled_quantity > Decimal::ZERO);
    }

    #[tokio::test]
    async fn test_submit_orders_records_for_verification() {
        let adapter = BacktestAdapter::new();
        adapter.set_simulated_price(Decimal::new(150, 0));

        let request = make_test_request();
        if let Err(e) = adapter.submit_orders(&request).await {
            panic!("submit_orders should succeed: {e}");
        }

        let recorded = adapter.submitted_orders();
        assert_eq!(recorded.len(), 1);

        let order = &recorded[0];
        assert_eq!(order.decision_id, "decision-1");
        assert_eq!(order.instrument_id, "AAPL");
        assert_eq!(order.quantity, Decimal::new(100, 0));
        assert_eq!(order.stop_loss_level, Decimal::new(145, 0));
        assert_eq!(order.take_profit_level, Decimal::new(160, 0));
    }

    #[tokio::test]
    async fn test_environment_mismatch_error() {
        let adapter = BacktestAdapter::new();

        let mut request = make_test_request();
        request.environment = Environment::Paper;

        let result = adapter.submit_orders(&request).await;
        let Err(err) = result else {
            panic!("expected error for environment mismatch");
        };
        match err {
            BrokerError::EnvironmentMismatch { expected, actual } => {
                assert_eq!(expected, "BACKTEST");
                assert_eq!(actual, "PAPER");
            }
            _ => panic!("Expected EnvironmentMismatch error"),
        }
    }

    #[tokio::test]
    async fn test_get_order_status() {
        let adapter = BacktestAdapter::new();
        adapter.set_simulated_price(Decimal::new(150, 0));

        let request = make_test_request();
        let ack = match adapter.submit_orders(&request).await {
            Ok(a) => a,
            Err(e) => panic!("submit_orders should succeed: {e}"),
        };

        let broker_order_id = &ack.orders[0].broker_order_id;
        let order = match adapter.get_order_status(broker_order_id).await {
            Ok(o) => o,
            Err(e) => panic!("get_order_status should succeed: {e}"),
        };
        assert_eq!(order.status, OrderStatus::Filled);
    }

    #[tokio::test]
    async fn test_get_order_status_not_found() {
        let adapter = BacktestAdapter::new();
        let result = adapter.get_order_status("nonexistent").await;

        let Err(err) = result else {
            panic!("expected error for nonexistent order");
        };
        match err {
            BrokerError::OrderNotFound(id) => assert_eq!(id, "nonexistent"),
            _ => panic!("Expected OrderNotFound error"),
        }
    }

    #[tokio::test]
    async fn test_cancel_order() {
        let adapter = BacktestAdapter::new();
        adapter.set_simulated_price(Decimal::new(150, 0));

        let request = make_test_request();
        let ack = match adapter.submit_orders(&request).await {
            Ok(a) => a,
            Err(e) => panic!("submit_orders should succeed: {e}"),
        };

        let broker_order_id = &ack.orders[0].broker_order_id;
        let result = adapter.cancel_order(broker_order_id).await;

        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_cancel_order_not_found() {
        let adapter = BacktestAdapter::new();
        let result = adapter.cancel_order("nonexistent").await;

        let Err(err) = result else {
            panic!("cancel_order should fail for nonexistent order");
        };
        match err {
            BrokerError::OrderNotFound(id) => assert_eq!(id, "nonexistent"),
            _ => panic!("Expected OrderNotFound error"),
        }
    }

    #[tokio::test]
    async fn test_clear_orders() {
        let adapter = BacktestAdapter::new();
        adapter.set_simulated_price(Decimal::new(150, 0));

        let request = make_test_request();
        if let Err(e) = adapter.submit_orders(&request).await {
            panic!("submit_orders should succeed: {e}");
        }

        assert_eq!(adapter.order_count(), 1);

        adapter.clear_orders();
        assert_eq!(adapter.order_count(), 0);
    }

    #[tokio::test]
    async fn test_hold_action_skipped() {
        let adapter = BacktestAdapter::new();

        let request = SubmitOrdersRequest {
            cycle_id: "test-cycle-1".to_string(),
            environment: Environment::Backtest,
            plan: DecisionPlan {
                plan_id: "plan-1".to_string(),
                cycle_id: "test-cycle-1".to_string(),
                timestamp: chrono::Utc::now().to_rfc3339(),
                decisions: vec![Decision {
                    decision_id: "decision-1".to_string(),
                    instrument_id: "AAPL".to_string(),
                    action: Action::Hold,
                    direction: Direction::Long,
                    size: Size {
                        quantity: Decimal::new(100, 0),
                        unit: SizeUnit::Shares,
                    },
                    stop_loss_level: Decimal::ZERO,
                    take_profit_level: Decimal::ZERO,
                    limit_price: None,
                    strategy_family: StrategyFamily::Momentum,
                    time_horizon: TimeHorizon::Swing,
                    bullish_factors: vec![],
                    bearish_factors: vec![],
                    rationale: "Hold position".to_string(),
                    confidence: Decimal::new(75, 2),
                }],
                risk_manager_approved: true,
                critic_approved: true,
                plan_rationale: "Test plan".to_string(),
            },
        };

        let ack = match adapter.submit_orders(&request).await {
            Ok(a) => a,
            Err(e) => panic!("submit_orders should succeed: {e}"),
        };

        // Hold action should not produce an order
        assert!(ack.orders.is_empty());
        assert!(ack.errors.is_empty());
        assert_eq!(adapter.order_count(), 0);
    }

    #[tokio::test]
    async fn test_clone_shares_state() {
        let adapter = BacktestAdapter::new();
        adapter.set_simulated_price(Decimal::new(150, 0));

        let request = make_test_request();
        if let Err(e) = adapter.submit_orders(&request).await {
            panic!("submit_orders should succeed: {e}");
        }

        let cloned = adapter.clone();

        // Cloned adapter should see the same submitted orders
        assert_eq!(cloned.order_count(), 1);
    }
}
