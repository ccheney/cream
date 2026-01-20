//! E2E Integration Tests for Order/Decision Fixtures
//!
//! Tests the full execution flow from fixture JSON → HTTP API → use cases → domain.

// Allow dead_code for fixture types that capture full JSON structure
// Allow unwrap in tests - tests should panic on unexpected errors
#![allow(dead_code, clippy::unwrap_used)]

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::sync::RwLock;
use tower::ServiceExt;

use execution_engine::application::ports::{
    BrokerError, BrokerPort, CancelOrderRequest, InMemoryRiskRepository, NoOpEventPublisher,
    OrderAck, SubmitOrderRequest,
};
use execution_engine::application::use_cases::{
    CancelOrdersUseCase, SubmitOrdersUseCase, ValidateRiskUseCase,
};
use execution_engine::domain::order_execution::aggregate::Order;
use execution_engine::domain::order_execution::errors::OrderError;
use execution_engine::domain::order_execution::repository::OrderRepository;
use execution_engine::domain::order_execution::value_objects::{
    OrderPurpose, OrderSide, OrderStatus, OrderType, TimeInForce,
};
use execution_engine::domain::shared::{BrokerId, InstrumentId, OrderId};
use execution_engine::infrastructure::http::{AppState, create_router};

// =============================================================================
// Fixture JSON structures
// =============================================================================

#[derive(Debug, Clone, Deserialize)]
struct FixturePlan {
    plan_id: String,
    cycle_id: String,
    timestamp: String,
    decisions: Vec<FixtureDecision>,
    risk_manager_approved: bool,
    critic_approved: bool,
    plan_rationale: String,
}

#[derive(Debug, Clone, Deserialize)]
struct FixtureDecision {
    decision_id: String,
    instrument_id: String,
    action: String,
    direction: String,
    size: FixtureSize,
    stop_loss_level: String,
    take_profit_level: String,
    limit_price: Option<String>,
    strategy_family: String,
    time_horizon: String,
    thesis_state: String,
    #[serde(default)]
    bullish_factors: Vec<String>,
    #[serde(default)]
    bearish_factors: Vec<String>,
    rationale: String,
    confidence: String,
    #[serde(default)]
    legs: Vec<FixtureLeg>,
    net_limit_price: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct FixtureSize {
    quantity: String,
    unit: String,
}

#[derive(Debug, Clone, Deserialize)]
struct FixtureLeg {
    symbol: String,
    ratio_qty: i32,
    position_intent: String,
}

// =============================================================================
// HTTP request/response structures (matching API)
// =============================================================================

#[derive(Debug, Serialize)]
struct SubmitOrdersRequest {
    request_id: String,
    cycle_id: String,
    risk_policy_id: String,
    account_equity: Decimal,
    decisions: Vec<DecisionRequest>,
}

#[derive(Debug, Serialize)]
struct DecisionRequest {
    symbol: String,
    side: OrderSide,
    order_type: OrderType,
    quantity: Decimal,
    limit_price: Option<Decimal>,
    stop_price: Option<Decimal>,
    time_in_force: TimeInForce,
    purpose: OrderPurpose,
}

#[derive(Debug, Deserialize)]
struct SubmitOrdersResponse {
    ok: bool,
    orders: Vec<OrderResponse>,
    error: Option<String>,
    risk_violations: Option<Vec<ViolationResponse>>,
}

#[derive(Debug, Deserialize)]
struct OrderResponse {
    order_id: String,
    broker_id: Option<String>,
    symbol: String,
    side: OrderSide,
    order_type: OrderType,
    quantity: Decimal,
    limit_price: Option<Decimal>,
    status: OrderStatus,
    time_in_force: TimeInForce,
    filled_qty: Decimal,
    avg_fill_price: Option<Decimal>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ViolationResponse {
    code: String,
    severity: String,
    message: String,
    instrument_id: Option<String>,
    observed: Option<String>,
    limit: Option<String>,
}

#[derive(Debug, Serialize)]
struct CheckConstraintsRequest {
    request_id: String,
    cycle_id: String,
    risk_policy_id: String,
    account_equity: Decimal,
    decisions: Vec<DecisionRequest>,
    include_portfolio_context: bool,
}

#[derive(Debug, Deserialize)]
struct CheckConstraintsResponse {
    ok: bool,
    violations: Vec<ViolationResponse>,
    per_order: Option<HashMap<String, OrderConstraintResult>>,
}

#[derive(Debug, Deserialize)]
struct OrderConstraintResult {
    passed: bool,
    violations: Vec<ViolationResponse>,
}

#[derive(Debug, Deserialize)]
struct HealthResponse {
    status: String,
    version: String,
}

// =============================================================================
// Mock Broker
// =============================================================================

struct MockBroker {
    accept_orders: bool,
}

impl MockBroker {
    const fn new() -> Self {
        Self {
            accept_orders: true,
        }
    }

    const fn rejecting() -> Self {
        Self {
            accept_orders: false,
        }
    }
}

#[async_trait]
impl BrokerPort for MockBroker {
    async fn submit_order(&self, request: SubmitOrderRequest) -> Result<OrderAck, BrokerError> {
        if self.accept_orders {
            Ok(OrderAck {
                broker_order_id: BrokerId::new(format!("broker-{}", request.client_order_id)),
                client_order_id: request.client_order_id,
                status: OrderStatus::Accepted,
                filled_qty: Decimal::ZERO,
                avg_fill_price: None,
            })
        } else {
            Err(BrokerError::OrderRejected {
                reason: "Order rejected for testing".to_string(),
            })
        }
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

// =============================================================================
// Mock Order Repository
// =============================================================================

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

    async fn find_by_broker_id(&self, _broker_id: &BrokerId) -> Result<Option<Order>, OrderError> {
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
        Ok(orders.values().cloned().collect())
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

// =============================================================================
// Test Fixtures Helpers
// =============================================================================

fn load_fixture(name: &str) -> FixturePlan {
    let path = format!(
        "{}/tests/fixtures/{}.json",
        env!("CARGO_MANIFEST_DIR"),
        name
    );
    let content =
        std::fs::read_to_string(&path).unwrap_or_else(|_| panic!("Failed to read fixture: {path}"));
    serde_json::from_str(&content).unwrap_or_else(|e| panic!("Failed to parse fixture {name}: {e}"))
}

fn convert_action_to_side(action: &str, strategy_family: &str) -> OrderSide {
    match action.to_uppercase().as_str() {
        "BUY" => OrderSide::Buy,
        "SELL" => OrderSide::Sell,
        "BUY_TO_COVER" => OrderSide::Buy,
        "SELL_SHORT" => OrderSide::Sell,
        // For CLOSE action, determine side based on strategy
        "CLOSE" => {
            if strategy_family.contains("SHORT") {
                OrderSide::Buy // Buy to cover short
            } else {
                OrderSide::Sell // Sell to close long
            }
        }
        _ => OrderSide::Buy,
    }
}

const fn convert_strategy_to_order_type(
    _strategy: &str,
    limit_price: &Option<String>,
) -> OrderType {
    if limit_price.is_some() {
        OrderType::Limit
    } else {
        OrderType::Market
    }
}

fn convert_strategy_to_purpose(action: &str, thesis_state: &str) -> OrderPurpose {
    match action.to_uppercase().as_str() {
        "SELL" if thesis_state == "ENTERED" || thesis_state == "EXITING" => OrderPurpose::Exit,
        "BUY_TO_COVER" | "CLOSE" => OrderPurpose::Exit,
        _ if thesis_state == "EXITING" => OrderPurpose::Exit,
        _ => OrderPurpose::Entry,
    }
}

fn parse_quantity(size: &FixtureSize) -> Decimal {
    let qty_str = &size.quantity;
    qty_str.parse::<Decimal>().unwrap_or(Decimal::ONE)
}

fn fixture_to_decisions(fixture: &FixturePlan) -> Vec<DecisionRequest> {
    fixture
        .decisions
        .iter()
        .filter(|d| {
            // Filter out HOLD and NO_TRADE decisions - they don't produce orders
            let action = d.action.to_uppercase();
            action != "HOLD" && action != "NO_TRADE"
        })
        .flat_map(|d| {
            if d.legs.is_empty() {
                // Single-leg order
                vec![DecisionRequest {
                    symbol: d.instrument_id.clone(),
                    side: convert_action_to_side(&d.action, &d.strategy_family),
                    order_type: convert_strategy_to_order_type(&d.strategy_family, &d.limit_price),
                    quantity: parse_quantity(&d.size),
                    limit_price: d.limit_price.as_ref().and_then(|p| p.parse().ok()),
                    stop_price: None,
                    time_in_force: TimeInForce::Day,
                    purpose: convert_strategy_to_purpose(&d.action, &d.thesis_state),
                }]
            } else {
                // Multi-leg order (spreads)
                d.legs
                    .iter()
                    .map(|leg| {
                        let side = if leg.ratio_qty > 0 {
                            OrderSide::Buy
                        } else {
                            OrderSide::Sell
                        };
                        let purpose = if leg.position_intent.contains("open") {
                            OrderPurpose::Entry
                        } else {
                            OrderPurpose::Exit
                        };
                        DecisionRequest {
                            symbol: leg.symbol.clone(),
                            side,
                            order_type: if d.net_limit_price.is_some() {
                                OrderType::Limit
                            } else {
                                OrderType::Market
                            },
                            quantity: Decimal::from(leg.ratio_qty.unsigned_abs()),
                            limit_price: d.net_limit_price.as_ref().and_then(|p| p.parse().ok()),
                            stop_price: None,
                            time_in_force: TimeInForce::Day,
                            purpose,
                        }
                    })
                    .collect()
            }
        })
        .collect()
}

fn create_test_app(broker: Arc<MockBroker>) -> axum::Router {
    let risk_repo = Arc::new(InMemoryRiskRepository::new());
    let order_repo = Arc::new(MockOrderRepo::new());
    let event_publisher = Arc::new(NoOpEventPublisher);

    let submit_orders = Arc::new(SubmitOrdersUseCase::new(
        Arc::clone(&broker),
        Arc::clone(&risk_repo),
        Arc::clone(&order_repo),
        Arc::clone(&event_publisher),
    ));

    let validate_risk = Arc::new(ValidateRiskUseCase::new(
        Arc::clone(&risk_repo),
        Arc::clone(&order_repo),
    ));

    let cancel_orders = Arc::new(CancelOrdersUseCase::new(
        Arc::clone(&broker),
        Arc::clone(&order_repo),
        Arc::clone(&event_publisher),
    ));

    let state = AppState {
        submit_orders,
        validate_risk,
        cancel_orders,
        order_repo,
        version: "e2e-test".to_string(),
    };

    create_router(state)
}

// =============================================================================
// E2E Tests
// =============================================================================

#[tokio::test]
async fn e2e_health_check() {
    let app = create_test_app(Arc::new(MockBroker::new()));

    let response = app
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let health: HealthResponse = serde_json::from_slice(&body).unwrap();

    assert_eq!(health.status, "healthy");
    assert_eq!(health.version, "e2e-test");
}

#[tokio::test]
async fn e2e_equity_swing_trade_fixture() {
    let fixture = load_fixture("equity_swing_trade");
    let decisions = fixture_to_decisions(&fixture);

    assert_eq!(decisions.len(), 1, "Should have 1 decision (AAPL buy)");
    assert_eq!(decisions[0].symbol, "AAPL");
    assert_eq!(decisions[0].side, OrderSide::Buy);

    let app = create_test_app(Arc::new(MockBroker::new()));

    let request = SubmitOrdersRequest {
        request_id: "test-req-1".to_string(),
        cycle_id: fixture.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: Decimal::new(100_000, 0),
        decisions,
    };

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/submit-orders")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let result: SubmitOrdersResponse = serde_json::from_slice(&body).unwrap();

    assert!(result.ok, "Order submission should succeed");
    assert_eq!(result.orders.len(), 1);
    assert_eq!(result.orders[0].symbol, "AAPL");
    assert_eq!(result.orders[0].status, OrderStatus::Accepted);
}

#[tokio::test]
async fn e2e_options_vertical_spread_fixture() {
    let fixture = load_fixture("options_vertical_spread");
    let decisions = fixture_to_decisions(&fixture);

    // Vertical spread should create 2 legs
    assert_eq!(decisions.len(), 2, "Should have 2 legs for vertical spread");

    let app = create_test_app(Arc::new(MockBroker::new()));

    let request = SubmitOrdersRequest {
        request_id: "test-req-2".to_string(),
        cycle_id: fixture.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: Decimal::new(100_000, 0),
        decisions,
    };

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/submit-orders")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let result: SubmitOrdersResponse = serde_json::from_slice(&body).unwrap();

    assert!(result.ok);
    assert_eq!(result.orders.len(), 2, "Should have submitted 2 leg orders");
}

#[tokio::test]
async fn e2e_iron_condor_fixture() {
    let fixture = load_fixture("iron_condor");
    let decisions = fixture_to_decisions(&fixture);

    // Iron condor should create 4 legs
    assert_eq!(decisions.len(), 4, "Should have 4 legs for iron condor");

    let app = create_test_app(Arc::new(MockBroker::new()));

    let request = SubmitOrdersRequest {
        request_id: "test-req-3".to_string(),
        cycle_id: fixture.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: Decimal::new(100_000, 0),
        decisions,
    };

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/submit-orders")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let result: SubmitOrdersResponse = serde_json::from_slice(&body).unwrap();

    assert!(result.ok);
    assert_eq!(result.orders.len(), 4, "Should have submitted 4 leg orders");
}

#[tokio::test]
async fn e2e_butterfly_spread_fixture() {
    let fixture = load_fixture("butterfly_spread");
    let decisions = fixture_to_decisions(&fixture);

    // Butterfly has 3 legs (but middle leg has ratio 2, split into separate orders)
    assert!(
        !decisions.is_empty(),
        "Should have legs for butterfly spread"
    );

    let app = create_test_app(Arc::new(MockBroker::new()));

    let request = SubmitOrdersRequest {
        request_id: "test-req-4".to_string(),
        cycle_id: fixture.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: Decimal::new(100_000, 0),
        decisions,
    };

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/submit-orders")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let result: SubmitOrdersResponse = serde_json::from_slice(&body).unwrap();

    assert!(result.ok, "Butterfly spread submission should succeed");
}

#[tokio::test]
async fn e2e_no_trade_cycle_fixture() {
    let fixture = load_fixture("no_trade_cycle");
    let decisions = fixture_to_decisions(&fixture);

    // NO_TRADE and HOLD decisions should not generate orders
    assert!(
        decisions.is_empty(),
        "NO_TRADE/HOLD decisions should not generate orders"
    );
}

#[tokio::test]
async fn e2e_rejected_by_risk_fixture() {
    let fixture = load_fixture("rejected_by_risk");

    // This fixture has risk_manager_approved = false
    assert!(
        !fixture.risk_manager_approved,
        "Fixture should have risk rejection"
    );

    let decisions = fixture_to_decisions(&fixture);

    // Even though risk rejected, we still have a decision (the system should reject it)
    assert!(!decisions.is_empty(), "Should have decisions to reject");
}

#[tokio::test]
async fn e2e_short_sell_entry_fixture() {
    let fixture = load_fixture("short_sell_entry");
    let decisions = fixture_to_decisions(&fixture);

    assert_eq!(decisions.len(), 1, "Should have 1 short sell decision");
    assert_eq!(
        decisions[0].side,
        OrderSide::Sell,
        "Short sell should be a SELL"
    );

    let app = create_test_app(Arc::new(MockBroker::new()));

    let request = SubmitOrdersRequest {
        request_id: "test-req-5".to_string(),
        cycle_id: fixture.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: Decimal::new(100_000, 0),
        decisions,
    };

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/submit-orders")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let result: SubmitOrdersResponse = serde_json::from_slice(&body).unwrap();

    assert!(result.ok);
    assert_eq!(result.orders[0].side, OrderSide::Sell);
}

#[tokio::test]
async fn e2e_buy_to_cover_fixture() {
    let fixture = load_fixture("buy_to_cover");
    let decisions = fixture_to_decisions(&fixture);

    assert_eq!(decisions.len(), 1, "Should have 1 buy-to-cover decision");
    assert_eq!(
        decisions[0].side,
        OrderSide::Buy,
        "Buy-to-cover is a BUY order"
    );
    assert_eq!(
        decisions[0].purpose,
        OrderPurpose::Exit,
        "Buy-to-cover is an exit"
    );

    let app = create_test_app(Arc::new(MockBroker::new()));

    let request = SubmitOrdersRequest {
        request_id: "test-req-6".to_string(),
        cycle_id: fixture.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: Decimal::new(100_000, 0),
        decisions,
    };

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/submit-orders")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let result: SubmitOrdersResponse = serde_json::from_slice(&body).unwrap();

    assert!(result.ok);
}

#[tokio::test]
async fn e2e_single_leg_call_fixture() {
    let fixture = load_fixture("single_leg_call");
    let decisions = fixture_to_decisions(&fixture);

    assert_eq!(decisions.len(), 1, "Should have 1 call option decision");

    let app = create_test_app(Arc::new(MockBroker::new()));

    let request = SubmitOrdersRequest {
        request_id: "test-req-7".to_string(),
        cycle_id: fixture.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: Decimal::new(100_000, 0),
        decisions,
    };

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/submit-orders")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let result: SubmitOrdersResponse = serde_json::from_slice(&body).unwrap();

    assert!(result.ok);
}

#[tokio::test]
async fn e2e_single_leg_put_fixture() {
    let fixture = load_fixture("single_leg_put");
    let decisions = fixture_to_decisions(&fixture);

    assert_eq!(decisions.len(), 1, "Should have 1 put option decision");

    let app = create_test_app(Arc::new(MockBroker::new()));

    let request = SubmitOrdersRequest {
        request_id: "test-req-8".to_string(),
        cycle_id: fixture.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: Decimal::new(100_000, 0),
        decisions,
    };

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/submit-orders")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let result: SubmitOrdersResponse = serde_json::from_slice(&body).unwrap();

    assert!(result.ok);
}

#[tokio::test]
async fn e2e_pdt_close_position_fixture() {
    let fixture = load_fixture("pdt_close_position");
    let decisions = fixture_to_decisions(&fixture);

    assert!(
        !decisions.is_empty(),
        "Should have position close decisions"
    );

    let app = create_test_app(Arc::new(MockBroker::new()));

    let request = SubmitOrdersRequest {
        request_id: "test-req-9".to_string(),
        cycle_id: fixture.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: Decimal::new(100_000, 0),
        decisions,
    };

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/submit-orders")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let result: SubmitOrdersResponse = serde_json::from_slice(&body).unwrap();

    assert!(result.ok);
}

#[tokio::test]
async fn e2e_portfolio_rebalance_fixture() {
    let fixture = load_fixture("portfolio_rebalance");
    let decisions = fixture_to_decisions(&fixture);

    // Portfolio rebalance typically has multiple decisions
    assert!(!decisions.is_empty(), "Should have rebalance decisions");

    let app = create_test_app(Arc::new(MockBroker::new()));

    let request = SubmitOrdersRequest {
        request_id: "test-req-10".to_string(),
        cycle_id: fixture.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: Decimal::new(100_000, 0),
        decisions,
    };

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/submit-orders")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let result: SubmitOrdersResponse = serde_json::from_slice(&body).unwrap();

    assert!(result.ok, "Portfolio rebalance should succeed");
}

#[tokio::test]
async fn e2e_check_constraints_returns_error_for_nonexistent_orders() {
    // The check_constraints endpoint validates existing orders by ID.
    // When orders don't exist, it returns ok: false with a validation error.
    let fixture = load_fixture("equity_swing_trade");
    let decisions = fixture_to_decisions(&fixture);

    let app = create_test_app(Arc::new(MockBroker::new()));

    let request = CheckConstraintsRequest {
        request_id: "test-check-1".to_string(),
        cycle_id: fixture.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: Decimal::new(100_000, 0),
        decisions,
        include_portfolio_context: false,
    };

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/check-constraints")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let result: CheckConstraintsResponse = serde_json::from_slice(&body).unwrap();

    // Should return ok: false because orders don't exist yet
    assert!(!result.ok, "Should fail for non-existent orders");
    assert!(!result.violations.is_empty(), "Should have violations");
}

#[tokio::test]
async fn e2e_broker_rejection_propagates() {
    let fixture = load_fixture("equity_swing_trade");
    let decisions = fixture_to_decisions(&fixture);

    // Use a broker that rejects all orders
    let app = create_test_app(Arc::new(MockBroker::rejecting()));

    let request = SubmitOrdersRequest {
        request_id: "test-reject-1".to_string(),
        cycle_id: fixture.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: Decimal::new(100_000, 0),
        decisions,
    };

    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/v1/submit-orders")
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&request).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap();
    let result: SubmitOrdersResponse = serde_json::from_slice(&body).unwrap();

    // Overall ok is false because broker rejected
    assert!(!result.ok, "Order should fail when broker rejects");

    // Check that rejected orders have errors
    let rejected: Vec<_> = result.orders.iter().filter(|o| o.error.is_some()).collect();
    assert!(
        !rejected.is_empty(),
        "Should have rejected orders with errors"
    );
}

#[tokio::test]
async fn e2e_all_fixtures_parseable() {
    let fixtures = [
        "butterfly_spread",
        "buy_to_cover",
        "equity_swing_trade",
        "iron_condor",
        "no_trade_cycle",
        "options_vertical_spread",
        "pdt_close_position",
        "portfolio_rebalance",
        "rejected_by_risk",
        "short_sell_entry",
        "single_leg_call",
        "single_leg_put",
    ];

    for name in fixtures {
        let fixture = load_fixture(name);
        assert!(
            !fixture.plan_id.is_empty(),
            "Fixture {name} should have plan_id"
        );
        assert!(
            !fixture.cycle_id.is_empty(),
            "Fixture {name} should have cycle_id"
        );
        assert!(
            !fixture.decisions.is_empty(),
            "Fixture {name} should have decisions"
        );
    }
}
