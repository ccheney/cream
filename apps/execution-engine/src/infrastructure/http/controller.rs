//! HTTP Controller (Driver Adapter)
//!
//! Axum-based REST API that delegates to application use cases.

use std::sync::Arc;

use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
};

use crate::application::dto::{CreateOrderDto, OrderDto, SubmitOrdersRequestDto};
use crate::application::ports::{BrokerPort, EventPublisherPort, RiskRepositoryPort};
use crate::application::use_cases::{
    CancelOrdersUseCase, SubmitOrdersUseCase, ValidateRiskUseCase,
};
use crate::domain::order_execution::repository::OrderRepository;
use crate::domain::order_execution::value_objects::CancelReason;
use crate::domain::shared::OrderId;

use super::request::{
    CancelOrdersRequest, CheckConstraintsRequest, GetOrderStateRequest, SubmitOrdersRequest,
};
use super::response::{
    CancelOrdersResponse, CancelResult, CheckConstraintsResponse, GetOrderStateResponse,
    HealthResponse, OrderConstraintResult, OrderResponse, SubmitOrdersResponse, ViolationResponse,
};

/// Application state shared across handlers.
pub struct AppState<B, R, O, E>
where
    B: BrokerPort,
    R: RiskRepositoryPort,
    O: OrderRepository,
    E: EventPublisherPort,
{
    /// Use case for submitting orders.
    pub submit_orders: Arc<SubmitOrdersUseCase<B, R, O, E>>,
    /// Use case for validating risk.
    pub validate_risk: Arc<ValidateRiskUseCase<R, O>>,
    /// Use case for canceling orders.
    pub cancel_orders: Arc<CancelOrdersUseCase<B, O, E>>,
    /// Order repository for queries.
    pub order_repo: Arc<O>,
    /// Application version.
    pub version: String,
}

impl<B, R, O, E> Clone for AppState<B, R, O, E>
where
    B: BrokerPort,
    R: RiskRepositoryPort,
    O: OrderRepository,
    E: EventPublisherPort,
{
    fn clone(&self) -> Self {
        Self {
            submit_orders: Arc::clone(&self.submit_orders),
            validate_risk: Arc::clone(&self.validate_risk),
            cancel_orders: Arc::clone(&self.cancel_orders),
            order_repo: Arc::clone(&self.order_repo),
            version: self.version.clone(),
        }
    }
}

/// Create the HTTP router with all endpoints.
pub fn create_router<B, R, O, E>(state: AppState<B, R, O, E>) -> Router
where
    B: BrokerPort + 'static,
    R: RiskRepositoryPort + 'static,
    O: OrderRepository + 'static,
    E: EventPublisherPort + 'static,
{
    Router::new()
        .route("/health", get(health_check))
        .route("/api/v1/check-constraints", post(check_constraints))
        .route("/api/v1/submit-orders", post(submit_orders))
        .route("/api/v1/orders", post(get_order_state))
        .route("/api/v1/cancel-orders", post(cancel_orders))
        .with_state(state)
}

/// Health check endpoint.
async fn health_check<B, R, O, E>(State(state): State<AppState<B, R, O, E>>) -> impl IntoResponse
where
    B: BrokerPort,
    R: RiskRepositoryPort,
    O: OrderRepository,
    E: EventPublisherPort,
{
    Json(HealthResponse {
        status: "healthy".to_string(),
        version: state.version.clone(),
    })
}

/// Check constraints endpoint.
async fn check_constraints<B, R, O, E>(
    State(state): State<AppState<B, R, O, E>>,
    Json(request): Json<CheckConstraintsRequest>,
) -> impl IntoResponse
where
    B: BrokerPort,
    R: RiskRepositoryPort,
    O: OrderRepository,
    E: EventPublisherPort,
{
    // Convert decisions to orders for validation
    let orders: Vec<CreateOrderDto> = request
        .decisions
        .into_iter()
        .map(|d| CreateOrderDto {
            client_order_id: format!("{}-{}", request.cycle_id, d.symbol),
            symbol: d.symbol,
            side: d.side,
            order_type: d.order_type,
            quantity: d.quantity,
            limit_price: d.limit_price,
            time_in_force: d.time_in_force,
            purpose: d.purpose,
        })
        .collect();

    // Create request DTO
    let dto = SubmitOrdersRequestDto {
        orders,
        validate_risk: true,
    };

    // Execute validation through submit_orders (dry run would require separate use case)
    // For now, we validate by calling validate_orders
    let order_ids: Vec<String> = dto
        .orders
        .iter()
        .map(|o| o.client_order_id.clone())
        .collect();

    let validation_request = crate::application::dto::ConstraintCheckRequestDto {
        order_ids,
        include_portfolio_context: request.include_portfolio_context,
    };

    match state.validate_risk.execute(validation_request).await {
        Ok(result) => {
            let violations: Vec<ViolationResponse> = result
                .result
                .violations
                .into_iter()
                .map(|v| ViolationResponse {
                    code: v.code,
                    severity: v.severity,
                    message: v.message,
                    instrument_id: v.instrument_id,
                    observed: v.observed,
                    limit: v.limit,
                })
                .collect();

            let per_order = if !result.per_order_results.is_empty() {
                Some(
                    result
                        .per_order_results
                        .into_iter()
                        .map(|(id, r)| {
                            (
                                id,
                                OrderConstraintResult {
                                    passed: r.passed,
                                    violations: r
                                        .violations
                                        .into_iter()
                                        .map(|v| ViolationResponse {
                                            code: v.code,
                                            severity: v.severity,
                                            message: v.message,
                                            instrument_id: v.instrument_id,
                                            observed: v.observed,
                                            limit: v.limit,
                                        })
                                        .collect(),
                                },
                            )
                        })
                        .collect(),
                )
            } else {
                None
            };

            (
                StatusCode::OK,
                Json(CheckConstraintsResponse {
                    ok: result.result.passed,
                    violations,
                    per_order,
                }),
            )
        }
        Err(e) => (
            StatusCode::OK,
            Json(CheckConstraintsResponse {
                ok: false,
                violations: vec![ViolationResponse {
                    code: "VALIDATION_ERROR".to_string(),
                    severity: "Error".to_string(),
                    message: e,
                    instrument_id: None,
                    observed: None,
                    limit: None,
                }],
                per_order: None,
            }),
        ),
    }
}

/// Submit orders endpoint.
async fn submit_orders<B, R, O, E>(
    State(state): State<AppState<B, R, O, E>>,
    Json(request): Json<SubmitOrdersRequest>,
) -> impl IntoResponse
where
    B: BrokerPort,
    R: RiskRepositoryPort,
    O: OrderRepository,
    E: EventPublisherPort,
{
    // Convert decisions to create order DTOs
    let orders: Vec<CreateOrderDto> = request
        .decisions
        .into_iter()
        .map(|d| CreateOrderDto {
            client_order_id: format!("{}-{}", request.cycle_id, d.symbol),
            symbol: d.symbol,
            side: d.side,
            order_type: d.order_type,
            quantity: d.quantity,
            limit_price: d.limit_price,
            time_in_force: d.time_in_force,
            purpose: d.purpose,
        })
        .collect();

    let dto = SubmitOrdersRequestDto {
        orders,
        validate_risk: true,
    };

    let result = state.submit_orders.execute(dto).await;

    // Convert result to response
    let orders_response: Vec<OrderResponse> = result
        .submitted
        .into_iter()
        .chain(result.rejected)
        .map(|r| OrderResponse {
            order_id: r.order.order_id,
            broker_id: r.order.broker_id,
            symbol: r.order.symbol,
            side: r.order.side,
            order_type: r.order.order_type,
            quantity: r.order.quantity,
            limit_price: r.order.limit_price,
            status: r.order.status,
            time_in_force: r.order.time_in_force,
            filled_qty: r.order.filled_qty,
            avg_fill_price: r.order.avg_fill_price,
            error: r.error,
        })
        .collect();

    let risk_violations = if !result.risk_violations.is_empty() {
        Some(
            result
                .risk_violations
                .into_iter()
                .map(|msg| ViolationResponse {
                    code: "RISK_VIOLATION".to_string(),
                    severity: "Error".to_string(),
                    message: msg,
                    instrument_id: None,
                    observed: None,
                    limit: None,
                })
                .collect(),
        )
    } else {
        None
    };

    (
        StatusCode::OK,
        Json(SubmitOrdersResponse {
            ok: result.success,
            orders: orders_response,
            error: None,
            risk_violations,
        }),
    )
}

/// Get order state endpoint.
async fn get_order_state<B, R, O, E>(
    State(state): State<AppState<B, R, O, E>>,
    Json(request): Json<GetOrderStateRequest>,
) -> impl IntoResponse
where
    B: BrokerPort,
    R: RiskRepositoryPort,
    O: OrderRepository,
    E: EventPublisherPort,
{
    let mut orders = Vec::new();
    let mut not_found = Vec::new();

    for order_id in request.order_ids {
        let id = OrderId::new(&order_id);
        match state.order_repo.find_by_id(&id).await {
            Ok(Some(order)) => {
                let dto = OrderDto::from_order(&order);
                orders.push(OrderResponse {
                    order_id: dto.order_id,
                    broker_id: dto.broker_id,
                    symbol: dto.symbol,
                    side: dto.side,
                    order_type: dto.order_type,
                    quantity: dto.quantity,
                    limit_price: dto.limit_price,
                    status: dto.status,
                    time_in_force: dto.time_in_force,
                    filled_qty: dto.filled_qty,
                    avg_fill_price: dto.avg_fill_price,
                    error: None,
                });
            }
            Ok(None) => not_found.push(order_id),
            Err(e) => {
                tracing::error!("Failed to load order {}: {}", order_id, e);
                not_found.push(order_id);
            }
        }
    }

    (
        StatusCode::OK,
        Json(GetOrderStateResponse { orders, not_found }),
    )
}

/// Cancel orders endpoint.
async fn cancel_orders<B, R, O, E>(
    State(state): State<AppState<B, R, O, E>>,
    Json(request): Json<CancelOrdersRequest>,
) -> impl IntoResponse
where
    B: BrokerPort,
    R: RiskRepositoryPort,
    O: OrderRepository,
    E: EventPublisherPort,
{
    let reason = request
        .reason
        .map_or_else(CancelReason::user_requested, |r| CancelReason::new(&r, &r));

    let results = state
        .cancel_orders
        .cancel_orders(&request.order_ids, reason)
        .await;

    let response_results: Vec<CancelResult> = results
        .into_iter()
        .map(|r| CancelResult {
            order_id: r.order_id,
            success: r.success,
            error: r.error,
        })
        .collect();

    (
        StatusCode::OK,
        Json(CancelOrdersResponse {
            results: response_results,
        }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::ports::{
        BrokerError, InMemoryRiskRepository, NoOpEventPublisher, OrderAck,
    };
    use crate::domain::order_execution::aggregate::Order;
    use crate::domain::order_execution::errors::OrderError;
    use crate::domain::order_execution::value_objects::OrderStatus;
    use crate::domain::shared::BrokerId;
    use async_trait::async_trait;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use rust_decimal::Decimal;
    use std::collections::HashMap;
    use std::sync::RwLock;
    use tower::ServiceExt;

    // Mock broker
    struct MockBroker;

    #[async_trait]
    impl BrokerPort for MockBroker {
        async fn submit_order(
            &self,
            request: crate::application::ports::SubmitOrderRequest,
        ) -> Result<OrderAck, BrokerError> {
            Ok(OrderAck {
                broker_order_id: BrokerId::new("broker-123"),
                client_order_id: request.client_order_id,
                status: OrderStatus::Accepted,
                filled_qty: Decimal::ZERO,
                avg_fill_price: None,
            })
        }

        async fn cancel_order(
            &self,
            _request: crate::application::ports::CancelOrderRequest,
        ) -> Result<(), BrokerError> {
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
            _instrument_id: &crate::domain::shared::InstrumentId,
        ) -> Result<Option<Decimal>, BrokerError> {
            Ok(None)
        }
    }

    // Mock order repository
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

        async fn find_by_broker_id(
            &self,
            _broker_id: &BrokerId,
        ) -> Result<Option<Order>, OrderError> {
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

    fn create_test_state()
    -> AppState<MockBroker, InMemoryRiskRepository, MockOrderRepo, NoOpEventPublisher> {
        let broker = Arc::new(MockBroker);
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

        AppState {
            submit_orders,
            validate_risk,
            cancel_orders,
            order_repo,
            version: "1.0.0-test".to_string(),
        }
    }

    #[tokio::test]
    async fn health_check_returns_ok() {
        let state = create_test_state();
        let app = create_router(state);

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
    async fn get_order_state_not_found() {
        let state = create_test_state();
        let app = create_router(state);

        let body = serde_json::json!({
            "order_ids": ["nonexistent-1", "nonexistent-2"]
        });

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/orders")
                    .header("content-type", "application/json")
                    .body(Body::from(serde_json::to_vec(&body).unwrap()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let response: GetOrderStateResponse = serde_json::from_slice(&body).unwrap();

        assert!(response.orders.is_empty());
        assert_eq!(response.not_found.len(), 2);
    }
}
