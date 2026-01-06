//! HTTP/JSON API server implementation.
//!
//! This provides a simple REST API for the execution engine endpoints.
//! Once proper gRPC is set up via buf generate, this will be deprecated.

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
#[must_use]
pub fn create_router(server: ExecutionServer) -> Router {
    Router::new()
        .route("/health", get(health_check))
        .route("/v1/check-constraints", post(check_constraints))
        .route("/v1/submit-orders", post(submit_orders))
        .route("/v1/order-state", post(get_order_state))
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
    /// Environment (BACKTEST, PAPER, LIVE).
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

/// API error type with rich error details.
#[derive(Debug)]
pub struct ApiError(ExecutionError);

impl ApiError {
    /// Create from an execution error.
    #[must_use]
    pub fn from_error(error: ExecutionError) -> Self {
        Self(error)
    }

    /// Create a bad request error.
    #[must_use]
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self(ExecutionError::invalid_request(message))
    }

    /// Create an internal error.
    #[must_use]
    pub fn internal(message: impl Into<String>) -> Self {
        Self(ExecutionError::internal(message))
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
        Action, Decision, DecisionPlan, Direction, Size, SizeUnit, StrategyFamily, TimeHorizon,
    };
    use crate::risk::ConstraintValidator;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    fn make_server() -> ExecutionServer {
        let alpaca =
            AlpacaAdapter::new("test".to_string(), "test".to_string(), Environment::Paper).unwrap();
        let state_manager = OrderStateManager::new();
        let validator = ConstraintValidator::with_defaults();
        let gateway = ExecutionGateway::new(alpaca, state_manager, validator);

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
        }
    }

    #[tokio::test]
    async fn test_health_check() {
        let app = create_router(make_server());

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

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/check-constraints")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_string(&request).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

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

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/submit-orders")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_string(&request).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }
}
