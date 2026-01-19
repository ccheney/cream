//! HTTP/JSON API server implementation.
//!
//! Primary REST API for the execution engine, providing:
//! - Constraint checking endpoints
//! - Order submission and execution
//! - Health check endpoints

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use tonic::Code;

use crate::error::{ErrorCode, ExecutionError};
use crate::execution::{AlpacaAdapter, ExecutionGateway};
use crate::models::{DecisionPlan, Environment};

/// Shared state for the HTTP server.
#[derive(Clone)]
pub struct ExecutionServer {
    gateway: Arc<ExecutionGateway<AlpacaAdapter>>,
}

impl ExecutionServer {
    /// Create a new execution server.
    #[must_use]
    pub fn new(gateway: ExecutionGateway<AlpacaAdapter>) -> Self {
        Self {
            gateway: Arc::new(gateway),
        }
    }
}

/// Create the Axum router with all endpoints.
pub fn create_router(server: ExecutionServer) -> Router {
    Router::new()
        .route("/health", get(health_check))
        .route("/v1/check-constraints", post(check_constraints))
        .route("/v1/submit-orders", post(submit_orders))
        .route("/v1/order-state", post(get_order_state))
        .route("/v1/feed-health", get(feed_health))
        .route("/v1/circuit-breaker", get(circuit_breaker_status))
        .with_state(server)
}

/// Health check endpoint.
async fn health_check() -> &'static str {
    "OK"
}

/// Request to check constraints.
#[derive(Debug, Serialize, Deserialize)]
pub struct CheckConstraintsRequest {
    /// Request ID.
    pub request_id: String,
    /// Cycle ID.
    pub cycle_id: String,
    /// Risk policy ID.
    pub risk_policy_id: String,
    /// Account equity.
    pub account_equity: String,
    /// Decision plan.
    pub plan: DecisionPlan,
}

/// Response from constraint check.
#[derive(Debug, Serialize)]
pub struct CheckConstraintsResponse {
    /// Whether constraints passed.
    pub ok: bool,
    /// Violations.
    pub violations: Vec<crate::models::ConstraintViolation>,
}

/// Check constraints endpoint.
async fn check_constraints(
    State(server): State<ExecutionServer>,
    Json(req): Json<CheckConstraintsRequest>,
) -> Result<Json<CheckConstraintsResponse>, ApiError> {
    tracing::info!(
        request_id = %req.request_id,
        cycle_id = %req.cycle_id,
        "Checking constraints"
    );

    let account_equity = Decimal::from_str(&req.account_equity).map_err(|e| {
        ApiError::from_error(
            ExecutionError::new(
                ErrorCode::InvalidRequest,
                format!("Invalid account_equity: {e}"),
            )
            .with_context("field", "account_equity"),
        )
    })?;

    let check_request = crate::models::ConstraintCheckRequest {
        request_id: req.request_id,
        cycle_id: req.cycle_id,
        risk_policy_id: req.risk_policy_id,
        account_equity,
        plan: req.plan,
    };

    let result = server.gateway.check_constraints(&check_request);

    Ok(Json(CheckConstraintsResponse {
        ok: result.ok,
        violations: result.violations,
    }))
}

/// Request to submit orders.
#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitOrdersRequest {
    /// Cycle ID.
    pub cycle_id: String,
    /// Environment (PAPER, LIVE).
    pub environment: String,
    /// Decision plan.
    pub plan: DecisionPlan,
}

/// Response from order submission.
#[derive(Debug, Serialize)]
pub struct SubmitOrdersResponse {
    /// Cycle ID.
    pub cycle_id: String,
    /// Environment.
    pub environment: String,
    /// Acknowledgment time (ISO 8601).
    pub ack_time: String,
    /// Orders.
    pub orders: Vec<crate::models::OrderState>,
    /// Errors.
    pub errors: Vec<crate::models::ExecutionError>,
}

/// Submit orders endpoint.
async fn submit_orders(
    State(server): State<ExecutionServer>,
    Json(req): Json<SubmitOrdersRequest>,
) -> Result<Json<SubmitOrdersResponse>, ApiError> {
    tracing::info!(
        cycle_id = %req.cycle_id,
        environment = %req.environment,
        "Submitting orders"
    );

    let environment = Environment::from_str(&req.environment).map_err(|e| {
        ApiError::from_error(
            ExecutionError::new(
                ErrorCode::InvalidEnvironment,
                format!("Invalid environment: {e}"),
            )
            .with_context("field", "environment")
            .with_context("value", &req.environment),
        )
    })?;

    let submit_request = crate::models::SubmitOrdersRequest {
        cycle_id: req.cycle_id,
        environment,
        plan: req.plan,
    };

    let result = server
        .gateway
        .submit_orders(submit_request)
        .await
        .map_err(|e| ApiError::from_error(ExecutionError::broker_error(e.to_string())))?;

    Ok(Json(SubmitOrdersResponse {
        cycle_id: result.cycle_id,
        environment: result.environment.to_string(),
        ack_time: result.ack_time,
        orders: result.orders,
        errors: result.errors,
    }))
}

/// Request to get order state.
#[derive(Debug, Serialize, Deserialize)]
pub struct GetOrderStateRequest {
    /// Order IDs to query.
    pub order_ids: Vec<String>,
}

/// Response with order states.
#[derive(Debug, Serialize)]
pub struct GetOrderStateResponse {
    /// Orders.
    pub orders: Vec<crate::models::OrderState>,
}

/// Get order state endpoint.
async fn get_order_state(
    State(server): State<ExecutionServer>,
    Json(req): Json<GetOrderStateRequest>,
) -> Json<GetOrderStateResponse> {
    tracing::info!(order_count = req.order_ids.len(), "Getting order states");

    let orders = server.gateway.get_order_states(&req.order_ids);

    Json(GetOrderStateResponse { orders })
}

/// Feed health response.
#[derive(Debug, Serialize)]
pub struct FeedHealthResponse {
    /// Whether feed is configured and enabled.
    pub enabled: bool,
    /// Feed status description.
    pub status: String,
}

/// Feed health endpoint.
///
/// Returns basic feed configuration status. For detailed feed metrics,
/// the feed health tracker would need to be shared from the `AlpacaFeed` task.
async fn feed_health() -> Json<FeedHealthResponse> {
    // Check if feed is configured via environment
    let api_key = std::env::var("ALPACA_KEY").unwrap_or_default();
    let api_secret = std::env::var("ALPACA_SECRET").unwrap_or_default();

    let enabled = !api_key.is_empty() && !api_secret.is_empty();
    let status = if enabled {
        "Feed configured and running".to_string()
    } else {
        "Feed disabled (no API credentials)".to_string()
    };

    Json(FeedHealthResponse { enabled, status })
}

/// Circuit breaker status response.
#[derive(Debug, Serialize)]
pub struct CircuitBreakerResponse {
    /// Current state (CLOSED, OPEN, `HALF_OPEN`).
    pub state: String,
    /// Whether broker calls are permitted.
    pub is_broker_available: bool,
    /// Total calls count.
    pub total_calls: u64,
    /// Total failures count.
    pub total_failures: u64,
    /// Current failure rate (0.0-1.0).
    pub failure_rate: f64,
}

/// Circuit breaker status endpoint.
async fn circuit_breaker_status(
    State(server): State<ExecutionServer>,
) -> Json<CircuitBreakerResponse> {
    let state = server.gateway.circuit_breaker_state();
    let metrics = server.gateway.circuit_breaker_metrics();

    Json(CircuitBreakerResponse {
        state: format!("{state:?}"),
        is_broker_available: server.gateway.is_broker_available(),
        total_calls: metrics.total_calls,
        total_failures: metrics.total_failures,
        failure_rate: metrics.failure_rate,
    })
}

/// API error type with rich error details.
#[derive(Debug)]
pub struct ApiError(ExecutionError);

impl ApiError {
    /// Create from an execution error.
    #[must_use]
    pub const fn from_error(error: ExecutionError) -> Self {
        Self(error)
    }
}

impl From<ExecutionError> for ApiError {
    fn from(error: ExecutionError) -> Self {
        Self(error)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let http_response = self.0.to_http_response();
        let grpc_code = self.0.code().grpc_code();

        // Map gRPC codes to HTTP status codes
        let status = match grpc_code {
            Code::InvalidArgument | Code::OutOfRange => StatusCode::BAD_REQUEST,
            Code::NotFound => StatusCode::NOT_FOUND,
            Code::AlreadyExists => StatusCode::CONFLICT,
            Code::PermissionDenied => StatusCode::FORBIDDEN,
            Code::ResourceExhausted => StatusCode::TOO_MANY_REQUESTS,
            Code::FailedPrecondition | Code::Aborted => StatusCode::PRECONDITION_FAILED,
            Code::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };

        (status, Json(http_response)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution::{AlpacaAdapter, OrderStateManager};
    use crate::models::{
        Action, Decision, DecisionPlan, Direction, Size, SizeUnit, StrategyFamily, ThesisState,
        TimeHorizon,
    };
    use crate::risk::ConstraintValidator;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    fn make_server() -> ExecutionServer {
        let alpaca =
            match AlpacaAdapter::new("test".to_string(), "test".to_string(), Environment::Paper) {
                Ok(a) => a,
                Err(e) => panic!("should create Alpaca adapter: {e}"),
            };
        let state_manager = OrderStateManager::new();
        let validator = ConstraintValidator::with_defaults();
        let gateway = ExecutionGateway::with_defaults(alpaca, state_manager, validator);

        ExecutionServer::new(gateway)
    }

    fn make_valid_plan() -> DecisionPlan {
        DecisionPlan {
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
        }
    }

    #[tokio::test]
    async fn test_health_check() {
        let app = create_router(make_server());

        let request = match Request::builder().uri("/health").body(Body::empty()) {
            Ok(r) => r,
            Err(e) => panic!("should build health check request: {e}"),
        };
        let response = match app.oneshot(request).await {
            Ok(r) => r,
            Err(e) => panic!("health check should succeed: {e}"),
        };

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_check_constraints() {
        let app = create_router(make_server());

        let request = CheckConstraintsRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: "100000".to_string(),
            plan: make_valid_plan(),
        };

        let body_str = match serde_json::to_string(&request) {
            Ok(s) => s,
            Err(e) => panic!("should serialize request: {e}"),
        };
        let http_request = match Request::builder()
            .method("POST")
            .uri("/v1/check-constraints")
            .header("content-type", "application/json")
            .body(Body::from(body_str))
        {
            Ok(r) => r,
            Err(e) => panic!("should build check-constraints request: {e}"),
        };
        let response = match app.oneshot(http_request).await {
            Ok(r) => r,
            Err(e) => panic!("check-constraints should succeed: {e}"),
        };

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_submit_orders() {
        let app = create_router(make_server());

        let request = SubmitOrdersRequest {
            cycle_id: "c1".to_string(),
            environment: "PAPER".to_string(),
            plan: make_valid_plan(),
        };

        let body_str = match serde_json::to_string(&request) {
            Ok(s) => s,
            Err(e) => panic!("should serialize request: {e}"),
        };
        let http_request = match Request::builder()
            .method("POST")
            .uri("/v1/submit-orders")
            .header("content-type", "application/json")
            .body(Body::from(body_str))
        {
            Ok(r) => r,
            Err(e) => panic!("should build submit-orders request: {e}"),
        };
        let response = match app.oneshot(http_request).await {
            Ok(r) => r,
            Err(e) => panic!("submit-orders should succeed: {e}"),
        };

        assert_eq!(response.status(), StatusCode::OK);
    }
}
