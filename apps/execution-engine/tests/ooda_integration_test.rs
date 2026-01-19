//! OODA Loop Integration Tests
//!
//! End-to-end tests that simulate realistic `DecisionPlan` payloads from the agent
//! network flowing through constraint checking and order submission.
//!
//! These tests load JSON fixtures representing various trading scenarios:
//! - Equity swing trades
//! - Options vertical spreads
//! - PDT-aware position closes
//! - Portfolio rebalancing (multi-decision)
//! - No-trade cycles (`HOLD`/`NO_TRADE` only)
//! - Rejected plans (risk manager rejection)

#![allow(clippy::expect_used, clippy::unwrap_used, clippy::unreadable_literal)]

use axum::body::Body;
use axum::http::{Request, StatusCode};
use execution_engine::execution::{AlpacaAdapter, ExecutionGateway, OrderStateManager};
use execution_engine::models::{DecisionPlan, Environment};
use execution_engine::risk::ConstraintValidator;
use execution_engine::server::{
    CheckConstraintsRequest, CheckConstraintsResponse, ExecutionServer, SubmitOrdersRequest,
    SubmitOrdersResponse, create_router,
};
use rust_decimal::Decimal;
use std::path::PathBuf;
use tower::ServiceExt;

/// Load a JSON fixture from the fixtures directory.
fn load_fixture(name: &str) -> DecisionPlan {
    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("tests/fixtures");
    path.push(name);

    let content = std::fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("Failed to read fixture {}: {e}", path.display()));

    serde_json::from_str(&content)
        .unwrap_or_else(|e| panic!("Failed to parse fixture {}: {e}", path.display()))
}

/// Create a test server with mock Alpaca adapter.
fn make_test_server() -> ExecutionServer {
    let alpaca = AlpacaAdapter::new("test".to_string(), "test".to_string(), Environment::Paper)
        .expect("should create Alpaca adapter");
    let state_manager = OrderStateManager::new();
    let validator = ConstraintValidator::with_defaults();
    let gateway = ExecutionGateway::with_defaults(alpaca, state_manager, validator);

    ExecutionServer::new(gateway)
}

// ============================================
// Fixture Loading Tests
// ============================================

#[test]
fn test_load_equity_swing_trade_fixture() {
    let plan = load_fixture("equity_swing_trade.json");

    assert_eq!(plan.cycle_id, "cycle-2026-01-19-14-00");
    assert_eq!(plan.decisions.len(), 1);
    assert!(plan.is_approved());

    let decision = &plan.decisions[0];
    assert_eq!(decision.instrument_id, "AAPL");
    assert_eq!(decision.action, execution_engine::models::Action::Buy);
    assert_eq!(
        decision.direction,
        execution_engine::models::Direction::Long
    );
    assert_eq!(
        decision.size.unit,
        execution_engine::models::SizeUnit::Dollars
    );
    assert_eq!(decision.stop_loss_level, Decimal::new(22850, 2));
    assert!(!decision.bullish_factors.is_empty());
}

#[test]
fn test_load_options_vertical_spread_fixture() {
    let plan = load_fixture("options_vertical_spread.json");

    assert_eq!(plan.decisions.len(), 1);
    assert!(plan.is_approved());

    let decision = &plan.decisions[0];
    assert_eq!(
        decision.strategy_family,
        execution_engine::models::StrategyFamily::VerticalSpread
    );
    assert_eq!(decision.legs.len(), 2);
    assert_eq!(decision.legs[0].ratio_qty, 1); // Buy leg
    assert_eq!(decision.legs[1].ratio_qty, -1); // Sell leg
    assert!(decision.net_limit_price.is_some());
}

#[test]
fn test_load_pdt_close_position_fixture() {
    let plan = load_fixture("pdt_close_position.json");

    let decision = &plan.decisions[0];
    assert_eq!(decision.action, execution_engine::models::Action::Close);
    assert_eq!(
        decision.thesis_state,
        execution_engine::models::ThesisState::Exiting
    );
    assert_eq!(
        decision.time_horizon,
        execution_engine::models::TimeHorizon::Intraday
    );
}

#[test]
fn test_load_portfolio_rebalance_fixture() {
    let plan = load_fixture("portfolio_rebalance.json");

    assert_eq!(plan.decisions.len(), 3);
    assert!(plan.is_approved());

    // First decision: MSFT buy (adding)
    assert_eq!(plan.decisions[0].instrument_id, "MSFT");
    assert_eq!(
        plan.decisions[0].action,
        execution_engine::models::Action::Buy
    );
    assert_eq!(
        plan.decisions[0].thesis_state,
        execution_engine::models::ThesisState::Adding
    );

    // Second decision: GOOGL trim (sell)
    assert_eq!(plan.decisions[1].instrument_id, "GOOGL");
    assert_eq!(
        plan.decisions[1].action,
        execution_engine::models::Action::Sell
    );

    // Third decision: AMZN hold
    assert_eq!(plan.decisions[2].instrument_id, "AMZN");
    assert_eq!(
        plan.decisions[2].action,
        execution_engine::models::Action::Hold
    );

    // Only 2 tradeable decisions (HOLD doesn't count)
    assert_eq!(plan.tradeable_count(), 2);
}

#[test]
fn test_load_no_trade_cycle_fixture() {
    let plan = load_fixture("no_trade_cycle.json");

    assert_eq!(plan.decisions.len(), 2);
    assert!(plan.is_approved());

    // All decisions are HOLD or NO_TRADE
    assert_eq!(plan.tradeable_count(), 0);

    assert_eq!(
        plan.decisions[0].action,
        execution_engine::models::Action::Hold
    );
    assert_eq!(
        plan.decisions[1].action,
        execution_engine::models::Action::NoTrade
    );
}

#[test]
fn test_load_rejected_by_risk_fixture() {
    let plan = load_fixture("rejected_by_risk.json");

    // Plan was rejected by risk manager
    assert!(!plan.risk_manager_approved);
    assert!(plan.critic_approved);
    assert!(!plan.is_approved());
}

// ============================================
// HTTP Endpoint Integration Tests
// ============================================

#[tokio::test]
async fn test_check_constraints_equity_swing_trade() {
    let app = create_router(make_test_server());
    let plan = load_fixture("equity_swing_trade.json");

    let request = CheckConstraintsRequest {
        request_id: "test-001".to_string(),
        cycle_id: plan.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: "100000".to_string(),
        plan,
    };

    let body = serde_json::to_string(&request).expect("should serialize request");
    let http_request = Request::builder()
        .method("POST")
        .uri("/v1/check-constraints")
        .header("content-type", "application/json")
        .body(Body::from(body))
        .expect("should build request");

    let response = app
        .oneshot(http_request)
        .await
        .expect("request should succeed");
    assert_eq!(response.status(), StatusCode::OK);

    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("should read body");
    let result: CheckConstraintsResponse =
        serde_json::from_slice(&body_bytes).expect("should parse response");

    // With mock adapter (no buying power), we expect INSUFFICIENT_BUYING_POWER violation
    // The risk/reward constraint should pass (1.5:1 ratio in fixture)
    // This test verifies the constraint checking pipeline is working
    let buying_power_violation = result
        .violations
        .iter()
        .any(|v| v.code == "INSUFFICIENT_BUYING_POWER");
    let risk_reward_violation = result
        .violations
        .iter()
        .any(|v| v.code == "INSUFFICIENT_RISK_REWARD");

    // Mock adapter has no buying power - this is expected
    assert!(
        buying_power_violation,
        "Expected buying power violation with mock adapter"
    );
    // Risk/reward should be valid (1.5:1 ratio)
    assert!(
        !risk_reward_violation,
        "Risk/reward should pass with 1.5:1 ratio"
    );
}

#[tokio::test]
async fn test_check_constraints_options_spread() {
    let app = create_router(make_test_server());
    let plan = load_fixture("options_vertical_spread.json");

    let request = CheckConstraintsRequest {
        request_id: "test-002".to_string(),
        cycle_id: plan.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: "100000".to_string(),
        plan,
    };

    let body = serde_json::to_string(&request).expect("should serialize request");
    let http_request = Request::builder()
        .method("POST")
        .uri("/v1/check-constraints")
        .header("content-type", "application/json")
        .body(Body::from(body))
        .expect("should build request");

    let response = app
        .oneshot(http_request)
        .await
        .expect("request should succeed");
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_check_constraints_portfolio_rebalance() {
    let app = create_router(make_test_server());
    let plan = load_fixture("portfolio_rebalance.json");

    let request = CheckConstraintsRequest {
        request_id: "test-003".to_string(),
        cycle_id: plan.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: "100000".to_string(),
        plan,
    };

    let body = serde_json::to_string(&request).expect("should serialize request");
    let http_request = Request::builder()
        .method("POST")
        .uri("/v1/check-constraints")
        .header("content-type", "application/json")
        .body(Body::from(body))
        .expect("should build request");

    let response = app
        .oneshot(http_request)
        .await
        .expect("request should succeed");
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_check_constraints_no_trade_cycle() {
    let app = create_router(make_test_server());
    let plan = load_fixture("no_trade_cycle.json");

    let request = CheckConstraintsRequest {
        request_id: "test-004".to_string(),
        cycle_id: plan.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: "100000".to_string(),
        plan,
    };

    let body = serde_json::to_string(&request).expect("should serialize request");
    let http_request = Request::builder()
        .method("POST")
        .uri("/v1/check-constraints")
        .header("content-type", "application/json")
        .body(Body::from(body))
        .expect("should build request");

    let response = app
        .oneshot(http_request)
        .await
        .expect("request should succeed");
    assert_eq!(response.status(), StatusCode::OK);

    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("should read body");
    let result: CheckConstraintsResponse =
        serde_json::from_slice(&body_bytes).expect("should parse response");

    // No-trade cycles should pass constraints (nothing to violate)
    assert!(result.ok);
}

#[tokio::test]
async fn test_submit_orders_equity_swing_trade() {
    let app = create_router(make_test_server());
    let plan = load_fixture("equity_swing_trade.json");

    let request = SubmitOrdersRequest {
        cycle_id: plan.cycle_id.clone(),
        environment: "PAPER".to_string(),
        plan,
    };

    let body = serde_json::to_string(&request).expect("should serialize request");
    let http_request = Request::builder()
        .method("POST")
        .uri("/v1/submit-orders")
        .header("content-type", "application/json")
        .body(Body::from(body))
        .expect("should build request");

    let response = app
        .oneshot(http_request)
        .await
        .expect("request should succeed");
    assert_eq!(response.status(), StatusCode::OK);

    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("should read body");
    let result: SubmitOrdersResponse =
        serde_json::from_slice(&body_bytes).expect("should parse response");

    assert_eq!(result.cycle_id, "cycle-2026-01-19-14-00");
    assert_eq!(result.environment, "PAPER");
}

#[tokio::test]
async fn test_submit_orders_no_trade_cycle() {
    let app = create_router(make_test_server());
    let plan = load_fixture("no_trade_cycle.json");

    let request = SubmitOrdersRequest {
        cycle_id: plan.cycle_id.clone(),
        environment: "PAPER".to_string(),
        plan,
    };

    let body = serde_json::to_string(&request).expect("should serialize request");
    let http_request = Request::builder()
        .method("POST")
        .uri("/v1/submit-orders")
        .header("content-type", "application/json")
        .body(Body::from(body))
        .expect("should build request");

    let response = app
        .oneshot(http_request)
        .await
        .expect("request should succeed");
    assert_eq!(response.status(), StatusCode::OK);

    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("should read body");
    let result: SubmitOrdersResponse =
        serde_json::from_slice(&body_bytes).expect("should parse response");

    // No orders submitted for HOLD/NO_TRADE decisions
    assert!(result.orders.is_empty());
}

// ============================================
// Constraint Violation Tests
// ============================================

#[tokio::test]
async fn test_check_constraints_exceeds_position_size() {
    let app = create_router(make_test_server());
    let mut plan = load_fixture("equity_swing_trade.json");

    // Modify to request a huge position
    plan.decisions[0].size.quantity = Decimal::new(500000, 0); // $500k on $100k equity

    let request = CheckConstraintsRequest {
        request_id: "test-oversize".to_string(),
        cycle_id: plan.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: "100000".to_string(),
        plan,
    };

    let body = serde_json::to_string(&request).expect("should serialize request");
    let http_request = Request::builder()
        .method("POST")
        .uri("/v1/check-constraints")
        .header("content-type", "application/json")
        .body(Body::from(body))
        .expect("should build request");

    let response = app
        .oneshot(http_request)
        .await
        .expect("request should succeed");
    assert_eq!(response.status(), StatusCode::OK);

    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("should read body");
    let result: CheckConstraintsResponse =
        serde_json::from_slice(&body_bytes).expect("should parse response");

    // Should fail - position size exceeds buying power
    assert!(!result.ok);
    assert!(!result.violations.is_empty());
}

#[tokio::test]
async fn test_check_constraints_missing_stop_loss() {
    let app = create_router(make_test_server());
    let mut plan = load_fixture("equity_swing_trade.json");

    // Remove stop loss (set to 0)
    plan.decisions[0].stop_loss_level = Decimal::ZERO;

    let request = CheckConstraintsRequest {
        request_id: "test-no-stop".to_string(),
        cycle_id: plan.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: "100000".to_string(),
        plan,
    };

    let body = serde_json::to_string(&request).expect("should serialize request");
    let http_request = Request::builder()
        .method("POST")
        .uri("/v1/check-constraints")
        .header("content-type", "application/json")
        .body(Body::from(body))
        .expect("should build request");

    let response = app
        .oneshot(http_request)
        .await
        .expect("request should succeed");
    assert_eq!(response.status(), StatusCode::OK);

    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("should read body");
    let result: CheckConstraintsResponse =
        serde_json::from_slice(&body_bytes).expect("should parse response");

    // Should fail - BUY action requires stop loss
    assert!(!result.ok);
}

// ============================================
// Serialization Round-Trip Tests
// ============================================

#[test]
fn test_decision_plan_json_round_trip() {
    let fixtures = [
        "equity_swing_trade.json",
        "options_vertical_spread.json",
        "pdt_close_position.json",
        "portfolio_rebalance.json",
        "no_trade_cycle.json",
        "rejected_by_risk.json",
        "short_sell_entry.json",
        "buy_to_cover.json",
        "single_leg_call.json",
        "single_leg_put.json",
        "iron_condor.json",
        "butterfly_spread.json",
    ];

    for fixture in fixtures {
        let original = load_fixture(fixture);
        let serialized = serde_json::to_string(&original)
            .unwrap_or_else(|e| panic!("Failed to serialize {fixture}: {e}"));
        let deserialized: DecisionPlan = serde_json::from_str(&serialized)
            .unwrap_or_else(|e| panic!("Failed to deserialize {fixture}: {e}"));

        assert_eq!(
            original.plan_id, deserialized.plan_id,
            "plan_id mismatch in {fixture}"
        );
        assert_eq!(
            original.cycle_id, deserialized.cycle_id,
            "cycle_id mismatch in {fixture}"
        );
        assert_eq!(
            original.decisions.len(),
            deserialized.decisions.len(),
            "decisions count mismatch in {fixture}"
        );
    }
}

// ============================================
// Short Selling Tests
// ============================================

#[test]
fn test_load_short_sell_entry_fixture() {
    let plan = load_fixture("short_sell_entry.json");

    assert_eq!(plan.decisions.len(), 1);
    assert!(plan.is_approved());

    let decision = &plan.decisions[0];
    assert_eq!(decision.instrument_id, "NFLX");
    assert_eq!(decision.action, execution_engine::models::Action::Sell);
    assert_eq!(
        decision.direction,
        execution_engine::models::Direction::Short
    );
    assert_eq!(
        decision.strategy_family,
        execution_engine::models::StrategyFamily::EquityShort
    );
    assert_eq!(
        decision.size.unit,
        execution_engine::models::SizeUnit::Shares
    );
    assert_eq!(decision.size.quantity, Decimal::new(30, 0));
}

#[test]
fn test_load_buy_to_cover_fixture() {
    let plan = load_fixture("buy_to_cover.json");

    let decision = &plan.decisions[0];
    assert_eq!(decision.instrument_id, "NFLX");
    assert_eq!(decision.action, execution_engine::models::Action::Close);
    assert_eq!(
        decision.direction,
        execution_engine::models::Direction::Flat
    );
    assert_eq!(
        decision.thesis_state,
        execution_engine::models::ThesisState::Exiting
    );
}

#[tokio::test]
async fn test_submit_orders_short_sell() {
    let app = create_router(make_test_server());
    let plan = load_fixture("short_sell_entry.json");

    let request = SubmitOrdersRequest {
        cycle_id: plan.cycle_id.clone(),
        environment: "PAPER".to_string(),
        plan,
    };

    let body = serde_json::to_string(&request).expect("should serialize request");
    let http_request = Request::builder()
        .method("POST")
        .uri("/v1/submit-orders")
        .header("content-type", "application/json")
        .body(Body::from(body))
        .expect("should build request");

    let response = app
        .oneshot(http_request)
        .await
        .expect("request should succeed");
    assert_eq!(response.status(), StatusCode::OK);
}

// ============================================
// Single-Leg Options Tests
// ============================================

#[test]
fn test_load_single_leg_call_fixture() {
    let plan = load_fixture("single_leg_call.json");

    let decision = &plan.decisions[0];
    // OCC symbol format: AAPL260321C00250000 = AAPL Mar 21 2026 $250 Call
    assert_eq!(decision.instrument_id, "AAPL260321C00250000");
    assert_eq!(decision.action, execution_engine::models::Action::Buy);
    assert_eq!(
        decision.strategy_family,
        execution_engine::models::StrategyFamily::OptionLong
    );
    assert_eq!(
        decision.size.unit,
        execution_engine::models::SizeUnit::Contracts
    );
    assert_eq!(decision.size.quantity, Decimal::new(3, 0));
    // Single-leg: no legs array
    assert!(decision.legs.is_empty());
}

#[test]
fn test_load_single_leg_put_fixture() {
    let plan = load_fixture("single_leg_put.json");

    let decision = &plan.decisions[0];
    // OCC symbol format: SPY260220P00560000 = SPY Feb 20 2026 $560 Put
    assert_eq!(decision.instrument_id, "SPY260220P00560000");
    assert_eq!(decision.action, execution_engine::models::Action::Buy);
    assert_eq!(
        decision.strategy_family,
        execution_engine::models::StrategyFamily::OptionLong
    );
    assert!(decision.legs.is_empty());
}

#[tokio::test]
async fn test_submit_orders_single_leg_call() {
    let app = create_router(make_test_server());
    let plan = load_fixture("single_leg_call.json");

    let request = SubmitOrdersRequest {
        cycle_id: plan.cycle_id.clone(),
        environment: "PAPER".to_string(),
        plan,
    };

    let body = serde_json::to_string(&request).expect("should serialize request");
    let http_request = Request::builder()
        .method("POST")
        .uri("/v1/submit-orders")
        .header("content-type", "application/json")
        .body(Body::from(body))
        .expect("should build request");

    let response = app
        .oneshot(http_request)
        .await
        .expect("request should succeed");
    assert_eq!(response.status(), StatusCode::OK);
}

// ============================================
// PCT_EQUITY Conversion Tests
// ============================================

#[test]
fn test_pct_equity_sizing_in_portfolio_rebalance() {
    let plan = load_fixture("portfolio_rebalance.json");

    // First decision uses PCT_EQUITY
    let msft_decision = &plan.decisions[0];
    assert_eq!(msft_decision.instrument_id, "MSFT");
    assert_eq!(
        msft_decision.size.unit,
        execution_engine::models::SizeUnit::PctEquity
    );
    assert_eq!(msft_decision.size.quantity, Decimal::new(30, 0)); // 30%

    // Second decision also uses PCT_EQUITY
    let googl_decision = &plan.decisions[1];
    assert_eq!(googl_decision.instrument_id, "GOOGL");
    assert_eq!(
        googl_decision.size.unit,
        execution_engine::models::SizeUnit::PctEquity
    );
    assert_eq!(googl_decision.size.quantity, Decimal::new(15, 0)); // 15%
}

// ============================================
// Complex Multi-Leg Options Tests
// ============================================

#[test]
fn test_load_iron_condor_fixture() {
    let plan = load_fixture("iron_condor.json");

    assert_eq!(plan.decisions.len(), 1);
    assert!(plan.is_approved());

    let decision = &plan.decisions[0];
    assert_eq!(decision.instrument_id, "SPY");
    assert_eq!(
        decision.strategy_family,
        execution_engine::models::StrategyFamily::IronCondor
    );

    // Iron condor has 4 legs
    assert_eq!(decision.legs.len(), 4);

    // Verify leg structure: buy put (wing), sell put, sell call, buy call (wing)
    // Leg 0: Buy 540 put (lower wing protection)
    assert_eq!(decision.legs[0].symbol, "SPY260221P00540000");
    assert_eq!(decision.legs[0].ratio_qty, 5);

    // Leg 1: Sell 550 put (collect premium)
    assert_eq!(decision.legs[1].symbol, "SPY260221P00550000");
    assert_eq!(decision.legs[1].ratio_qty, -5);

    // Leg 2: Sell 590 call (collect premium)
    assert_eq!(decision.legs[2].symbol, "SPY260221C00590000");
    assert_eq!(decision.legs[2].ratio_qty, -5);

    // Leg 3: Buy 600 call (upper wing protection)
    assert_eq!(decision.legs[3].symbol, "SPY260221C00600000");
    assert_eq!(decision.legs[3].ratio_qty, 5);

    // Net credit
    assert!(decision.net_limit_price.is_some());
    assert_eq!(decision.net_limit_price.unwrap(), Decimal::new(150, 2)); // $1.50 credit
}

#[test]
fn test_load_butterfly_spread_fixture() {
    let plan = load_fixture("butterfly_spread.json");

    assert_eq!(plan.decisions.len(), 1);
    assert!(plan.is_approved());

    let decision = &plan.decisions[0];
    assert_eq!(decision.instrument_id, "QQQ");
    assert_eq!(
        decision.strategy_family,
        execution_engine::models::StrategyFamily::VerticalSpread
    );

    // Butterfly has 3 legs (with 2x middle)
    assert_eq!(decision.legs.len(), 3);

    // Leg 0: Buy 480 call (lower strike)
    assert_eq!(decision.legs[0].symbol, "QQQ260228C00480000");
    assert_eq!(decision.legs[0].ratio_qty, 10);

    // Leg 1: Sell 490 call x2 (middle strike)
    assert_eq!(decision.legs[1].symbol, "QQQ260228C00490000");
    assert_eq!(decision.legs[1].ratio_qty, -20);

    // Leg 2: Buy 500 call (upper strike)
    assert_eq!(decision.legs[2].symbol, "QQQ260228C00500000");
    assert_eq!(decision.legs[2].ratio_qty, 10);

    // Net debit
    assert!(decision.net_limit_price.is_some());
    assert_eq!(decision.net_limit_price.unwrap(), Decimal::new(215, 2)); // $2.15 debit
}

#[tokio::test]
async fn test_check_constraints_iron_condor() {
    let app = create_router(make_test_server());
    let plan = load_fixture("iron_condor.json");

    let request = CheckConstraintsRequest {
        request_id: "test-iron-condor".to_string(),
        cycle_id: plan.cycle_id.clone(),
        risk_policy_id: "default".to_string(),
        account_equity: "100000".to_string(),
        plan,
    };

    let body = serde_json::to_string(&request).expect("should serialize request");
    let http_request = Request::builder()
        .method("POST")
        .uri("/v1/check-constraints")
        .header("content-type", "application/json")
        .body(Body::from(body))
        .expect("should build request");

    let response = app
        .oneshot(http_request)
        .await
        .expect("request should succeed");
    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn test_submit_orders_iron_condor() {
    let app = create_router(make_test_server());
    let plan = load_fixture("iron_condor.json");

    let request = SubmitOrdersRequest {
        cycle_id: plan.cycle_id.clone(),
        environment: "PAPER".to_string(),
        plan,
    };

    let body = serde_json::to_string(&request).expect("should serialize request");
    let http_request = Request::builder()
        .method("POST")
        .uri("/v1/submit-orders")
        .header("content-type", "application/json")
        .body(Body::from(body))
        .expect("should build request");

    let response = app
        .oneshot(http_request)
        .await
        .expect("request should succeed");
    assert_eq!(response.status(), StatusCode::OK);

    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("should read body");
    let result: SubmitOrdersResponse =
        serde_json::from_slice(&body_bytes).expect("should parse response");

    assert_eq!(result.cycle_id, "cycle-2026-01-19-10-00");
}

#[tokio::test]
async fn test_submit_orders_butterfly_spread() {
    let app = create_router(make_test_server());
    let plan = load_fixture("butterfly_spread.json");

    let request = SubmitOrdersRequest {
        cycle_id: plan.cycle_id.clone(),
        environment: "PAPER".to_string(),
        plan,
    };

    let body = serde_json::to_string(&request).expect("should serialize request");
    let http_request = Request::builder()
        .method("POST")
        .uri("/v1/submit-orders")
        .header("content-type", "application/json")
        .body(Body::from(body))
        .expect("should build request");

    let response = app
        .oneshot(http_request)
        .await
        .expect("request should succeed");
    assert_eq!(response.status(), StatusCode::OK);

    let body_bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("should read body");
    let result: SubmitOrdersResponse =
        serde_json::from_slice(&body_bytes).expect("should parse response");

    assert_eq!(result.cycle_id, "cycle-2026-01-19-11-00");
}
