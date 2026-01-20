//! gRPC `ExecutionService` implementation.
//!
//! Implements the `ExecutionService` gRPC service using Clean Architecture use cases.

use std::pin::Pin;
use std::sync::Arc;

use tokio::sync::mpsc;
use tokio_stream::{Stream, wrappers::ReceiverStream};
use tonic::{Request, Response, Status};

use super::proto::cream::v1::{
    AccountState, CancelOrderRequest, CancelOrderResponse, CheckConstraintsRequest,
    CheckConstraintsResponse, GetAccountStateRequest, GetAccountStateResponse,
    GetOrderStateRequest, GetOrderStateResponse, GetPositionsRequest, GetPositionsResponse,
    StreamExecutionsRequest, StreamExecutionsResponse, SubmitOrderRequest, SubmitOrderResponse,
    execution_service_server::{ExecutionService, ExecutionServiceServer},
};

use crate::application::dto::{CreateOrderDto, SubmitOrdersRequestDto};
use crate::application::ports::{BrokerPort, EventPublisherPort, RiskRepositoryPort};
use crate::application::use_cases::{
    CancelOrdersUseCase, SubmitOrdersUseCase, ValidateRiskUseCase,
};
use crate::domain::order_execution::repository::OrderRepository;
use crate::domain::order_execution::value_objects::{
    CancelReason, OrderPurpose, OrderSide, OrderType, TimeInForce,
};
use crate::domain::shared::OrderId;

/// gRPC `ExecutionService` adapter using Clean Architecture.
pub struct ExecutionServiceAdapter<B, R, O, E>
where
    B: BrokerPort,
    R: RiskRepositoryPort,
    O: OrderRepository,
    E: EventPublisherPort,
{
    submit_orders: Arc<SubmitOrdersUseCase<B, R, O, E>>,
    #[allow(dead_code)]
    validate_risk: Arc<ValidateRiskUseCase<R, O>>,
    cancel_orders: Arc<CancelOrdersUseCase<B, O, E>>,
    order_repo: Arc<O>,
    broker: Arc<B>,
}

impl<B, R, O, E> ExecutionServiceAdapter<B, R, O, E>
where
    B: BrokerPort,
    R: RiskRepositoryPort,
    O: OrderRepository,
    E: EventPublisherPort,
{
    /// Create a new `ExecutionService` adapter.
    pub const fn new(
        submit_orders: Arc<SubmitOrdersUseCase<B, R, O, E>>,
        validate_risk: Arc<ValidateRiskUseCase<R, O>>,
        cancel_orders: Arc<CancelOrdersUseCase<B, O, E>>,
        order_repo: Arc<O>,
        broker: Arc<B>,
    ) -> Self {
        Self {
            submit_orders,
            validate_risk,
            cancel_orders,
            order_repo,
            broker,
        }
    }
}

/// Create an `ExecutionService` gRPC server.
pub fn create_execution_service<B, R, O, E>(
    submit_orders: Arc<SubmitOrdersUseCase<B, R, O, E>>,
    validate_risk: Arc<ValidateRiskUseCase<R, O>>,
    cancel_orders: Arc<CancelOrdersUseCase<B, O, E>>,
    order_repo: Arc<O>,
    broker: Arc<B>,
) -> ExecutionServiceServer<ExecutionServiceAdapter<B, R, O, E>>
where
    B: BrokerPort + 'static,
    R: RiskRepositoryPort + 'static,
    O: OrderRepository + 'static,
    E: EventPublisherPort + 'static,
{
    let service = ExecutionServiceAdapter::new(
        submit_orders,
        validate_risk,
        cancel_orders,
        order_repo,
        broker,
    );
    ExecutionServiceServer::new(service)
}

#[tonic::async_trait]
impl<B, R, O, E> ExecutionService for ExecutionServiceAdapter<B, R, O, E>
where
    B: BrokerPort + 'static,
    R: RiskRepositoryPort + 'static,
    O: OrderRepository + 'static,
    E: EventPublisherPort + 'static,
{
    async fn check_constraints(
        &self,
        request: Request<CheckConstraintsRequest>,
    ) -> Result<Response<CheckConstraintsResponse>, Status> {
        let req = request.into_inner();

        let decision_plan = req
            .decision_plan
            .ok_or_else(|| Status::invalid_argument("decision_plan is required"))?;

        // Extract constraints if provided (uses defaults if None)
        let constraints = req.constraints;
        if let Some(ref c) = constraints {
            tracing::debug!(
                max_positions = c.max_positions,
                max_risk_per_trade_bps = c.max_risk_per_trade_bps,
                max_sector_exposure_bps = c.max_sector_exposure_bps,
                "Runtime constraints received"
            );
        }

        // Convert proto decisions to CreateOrderDto
        let _orders: Vec<CreateOrderDto> = decision_plan
            .decisions
            .iter()
            .filter_map(|d| {
                let instrument = d.instrument.as_ref()?;
                let size = d.size.as_ref()?;
                let order_plan = d.order_plan.as_ref()?;

                Some(CreateOrderDto {
                    client_order_id: format!(
                        "{}-{}",
                        decision_plan.cycle_id, instrument.instrument_id
                    ),
                    symbol: instrument.instrument_id.clone(),
                    side: convert_action_to_side(d.action),
                    order_type: convert_proto_order_type(order_plan.entry_order_type),
                    quantity: rust_decimal::Decimal::from(size.quantity),
                    limit_price: order_plan
                        .entry_limit_price
                        .and_then(rust_decimal::Decimal::from_f64_retain),
                    time_in_force: TimeInForce::Day,
                    purpose: OrderPurpose::Entry,
                })
            })
            .collect();

        // For constraint checking, return passed for now
        // TODO: Implement actual validation using runtime constraints
        // Real implementation would validate via use case with constraints
        let response = CheckConstraintsResponse {
            approved: true,
            checks: vec![],
            violations: vec![],
            validated_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
            rejection_reason: None,
        };

        Ok(Response::new(response))
    }

    async fn submit_order(
        &self,
        request: Request<SubmitOrderRequest>,
    ) -> Result<Response<SubmitOrderResponse>, Status> {
        let req = request.into_inner();

        let instrument = req
            .instrument
            .ok_or_else(|| Status::invalid_argument("instrument is required"))?;

        // Create order DTO
        let order_dto = CreateOrderDto {
            client_order_id: req.client_order_id.clone(),
            symbol: instrument.instrument_id.clone(),
            side: convert_proto_side(req.side),
            order_type: convert_proto_order_type(req.order_type),
            quantity: rust_decimal::Decimal::from(req.quantity),
            limit_price: req
                .limit_price
                .and_then(rust_decimal::Decimal::from_f64_retain),
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
        };

        let submit_request = SubmitOrdersRequestDto {
            orders: vec![order_dto],
            validate_risk: true,
        };

        let result = self.submit_orders.execute(submit_request).await;

        if result.success && !result.submitted.is_empty() {
            let order = &result.submitted[0].order;
            let response = SubmitOrderResponse {
                order_id: order.order_id.clone(),
                client_order_id: req.client_order_id,
                status: convert_to_proto_status(order.status),
                submitted_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
                error_message: result.submitted[0].error.clone(),
            };
            Ok(Response::new(response))
        } else {
            let error_msg = if !result.risk_violations.is_empty() {
                result.risk_violations.join(", ")
            } else if !result.rejected.is_empty() {
                result.rejected[0].error.clone().unwrap_or_default()
            } else {
                "Order submission failed".to_string()
            };

            let response = SubmitOrderResponse {
                order_id: String::new(),
                client_order_id: req.client_order_id,
                status: super::proto::cream::v1::OrderStatus::Rejected.into(),
                submitted_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
                error_message: Some(error_msg),
            };
            Ok(Response::new(response))
        }
    }

    type StreamExecutionsStream =
        Pin<Box<dyn Stream<Item = Result<StreamExecutionsResponse, Status>> + Send>>;

    async fn stream_executions(
        &self,
        request: Request<StreamExecutionsRequest>,
    ) -> Result<Response<Self::StreamExecutionsStream>, Status> {
        let req = request.into_inner();
        let (_tx, rx) = mpsc::channel(128);

        tracing::info!(
            cycle_id = ?req.cycle_id,
            order_count = req.order_ids.len(),
            "Execution stream started"
        );

        let stream = ReceiverStream::new(rx);
        Ok(Response::new(Box::pin(stream)))
    }

    async fn get_account_state(
        &self,
        _request: Request<GetAccountStateRequest>,
    ) -> Result<Response<GetAccountStateResponse>, Status> {
        // Get buying power from broker
        let buying_power = self
            .broker
            .get_buying_power()
            .await
            .map_err(|e| Status::internal(format!("Failed to get buying power: {e}")))?;

        let bp_f64: f64 = buying_power.to_string().parse().unwrap_or(0.0);

        let account_state = AccountState {
            account_id: "default".to_string(),
            equity: bp_f64,
            buying_power: bp_f64,
            margin_used: 0.0,
            day_trade_count: 0,
            is_pdt_restricted: false,
            as_of: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
            last_equity: bp_f64,
            daytrading_buying_power: bp_f64,
            remaining_day_trades: 3,
            under_pdt_threshold: false,
        };

        Ok(Response::new(GetAccountStateResponse {
            account_state: Some(account_state),
        }))
    }

    async fn get_positions(
        &self,
        _request: Request<GetPositionsRequest>,
    ) -> Result<Response<GetPositionsResponse>, Status> {
        // For now, return empty positions
        // Real implementation would query positions from broker
        Ok(Response::new(GetPositionsResponse {
            positions: vec![],
            as_of: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
        }))
    }

    async fn get_order_state(
        &self,
        request: Request<GetOrderStateRequest>,
    ) -> Result<Response<GetOrderStateResponse>, Status> {
        let req = request.into_inner();
        let order_id = OrderId::new(&req.order_id);

        match self.order_repo.find_by_id(&order_id).await {
            Ok(Some(order)) => {
                use crate::application::dto::OrderDto;
                let dto = OrderDto::from_order(&order);

                let response = GetOrderStateResponse {
                    order_id: dto.order_id,
                    broker_order_id: dto.broker_id.unwrap_or_default(),
                    instrument: Some(super::proto::cream::v1::Instrument {
                        instrument_id: dto.symbol,
                        instrument_type: super::proto::cream::v1::InstrumentType::Equity.into(),
                        option_contract: None,
                    }),
                    status: convert_to_proto_status(dto.status),
                    side: convert_to_proto_side(dto.side),
                    order_type: convert_to_proto_order_type(dto.order_type),
                    requested_quantity: dto.quantity.to_string().parse().unwrap_or(0),
                    filled_quantity: dto.filled_qty.to_string().parse().unwrap_or(0),
                    avg_fill_price: dto
                        .avg_fill_price
                        .map_or(0.0, |p| p.to_string().parse().unwrap_or(0.0)),
                    limit_price: dto
                        .limit_price
                        .map(|p| p.to_string().parse().unwrap_or(0.0)),
                    stop_price: None,
                    submitted_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
                    last_update_at: Some(
                        prost_types::Timestamp::from(std::time::SystemTime::now()),
                    ),
                    status_message: String::new(),
                };

                Ok(Response::new(response))
            }
            Ok(None) => Err(Status::not_found(format!(
                "Order not found: {}",
                req.order_id
            ))),
            Err(e) => Err(Status::internal(format!("Failed to get order: {e}"))),
        }
    }

    async fn cancel_order(
        &self,
        request: Request<CancelOrderRequest>,
    ) -> Result<Response<CancelOrderResponse>, Status> {
        let req = request.into_inner();

        let result = self
            .cancel_orders
            .cancel_by_client_id(&req.order_id, CancelReason::user_requested())
            .await;

        let response = CancelOrderResponse {
            accepted: result.success,
            order_id: result.order_id,
            status: if result.success {
                super::proto::cream::v1::OrderStatus::Cancelled.into()
            } else {
                super::proto::cream::v1::OrderStatus::Unspecified.into()
            },
            error_message: result.error,
        };

        Ok(Response::new(response))
    }
}

// Conversion helpers

fn convert_action_to_side(action: i32) -> OrderSide {
    use super::proto::cream::v1::Action;
    match Action::try_from(action) {
        Ok(Action::Sell) => OrderSide::Sell,
        // Buy or unrecognized defaults to Buy
        _ => OrderSide::Buy,
    }
}

fn convert_proto_side(side: i32) -> OrderSide {
    use super::proto::cream::v1::OrderSide as ProtoSide;
    match ProtoSide::try_from(side) {
        Ok(ProtoSide::Sell) => OrderSide::Sell,
        // Buy or unrecognized defaults to Buy
        _ => OrderSide::Buy,
    }
}

fn convert_proto_order_type(order_type: i32) -> OrderType {
    use super::proto::cream::v1::OrderType as ProtoOrderType;
    match ProtoOrderType::try_from(order_type) {
        Ok(ProtoOrderType::Limit) => OrderType::Limit,
        // Market or unrecognized defaults to Market
        _ => OrderType::Market,
    }
}

fn convert_to_proto_status(
    status: crate::domain::order_execution::value_objects::OrderStatus,
) -> i32 {
    use super::proto::cream::v1::OrderStatus as ProtoStatus;
    use crate::domain::order_execution::value_objects::OrderStatus;
    match status {
        OrderStatus::New => ProtoStatus::New.into(),
        OrderStatus::PendingNew | OrderStatus::PendingCancel => ProtoStatus::Pending.into(),
        OrderStatus::Accepted => ProtoStatus::Accepted.into(),
        OrderStatus::PartiallyFilled => ProtoStatus::PartialFill.into(),
        OrderStatus::Filled => ProtoStatus::Filled.into(),
        OrderStatus::Canceled | OrderStatus::Expired => ProtoStatus::Cancelled.into(),
        OrderStatus::Rejected => ProtoStatus::Rejected.into(),
    }
}

fn convert_to_proto_side(side: OrderSide) -> i32 {
    use super::proto::cream::v1::OrderSide as ProtoSide;
    match side {
        OrderSide::Buy => ProtoSide::Buy.into(),
        OrderSide::Sell => ProtoSide::Sell.into(),
    }
}

fn convert_to_proto_order_type(order_type: OrderType) -> i32 {
    use super::proto::cream::v1::OrderType as ProtoOrderType;
    match order_type {
        OrderType::Market => ProtoOrderType::Market.into(),
        // Limit, Stop, and StopLimit all map to Limit in proto
        OrderType::Limit | OrderType::Stop | OrderType::StopLimit => ProtoOrderType::Limit.into(),
    }
}

#[cfg(test)]
mod tests {
    #![allow(
        clippy::float_cmp,
        clippy::significant_drop_tightening,
        clippy::too_many_lines
    )]
    use super::*;
    use crate::application::ports::{BrokerError, OrderAck};
    use crate::domain::order_execution::aggregate::Order;
    use crate::domain::order_execution::errors::OrderError;
    use crate::domain::order_execution::value_objects::OrderStatus;
    use crate::domain::shared::BrokerId;
    use async_trait::async_trait;
    use rust_decimal::Decimal;
    use std::collections::HashMap;
    use std::sync::RwLock;

    #[allow(dead_code)]
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
            let mut orders = self
                .orders
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            orders.insert(order.id().to_string(), order.clone());
            Ok(())
        }

        async fn find_by_id(&self, id: &OrderId) -> Result<Option<Order>, OrderError> {
            let orders = self
                .orders
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            Ok(orders.get(id.as_str()).cloned())
        }

        async fn find_by_broker_id(
            &self,
            _broker_id: &BrokerId,
        ) -> Result<Option<Order>, OrderError> {
            Ok(None)
        }

        async fn find_by_status(&self, status: OrderStatus) -> Result<Vec<Order>, OrderError> {
            let orders = self
                .orders
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            Ok(orders
                .values()
                .filter(|o| o.status() == status)
                .cloned()
                .collect())
        }

        async fn find_active(&self) -> Result<Vec<Order>, OrderError> {
            let orders = self
                .orders
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            Ok(orders.values().cloned().collect())
        }

        async fn exists(&self, id: &OrderId) -> Result<bool, OrderError> {
            let orders = self
                .orders
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            Ok(orders.contains_key(id.as_str()))
        }

        async fn delete(&self, id: &OrderId) -> Result<(), OrderError> {
            let mut orders = self
                .orders
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            orders.remove(id.as_str());
            Ok(())
        }
    }

    #[test]
    fn convert_action_buy() {
        let side = convert_action_to_side(super::super::proto::cream::v1::Action::Buy as i32);
        assert_eq!(side, OrderSide::Buy);
    }

    #[test]
    fn convert_action_sell() {
        let side = convert_action_to_side(super::super::proto::cream::v1::Action::Sell as i32);
        assert_eq!(side, OrderSide::Sell);
    }

    #[test]
    fn convert_order_type_market() {
        let order_type =
            convert_proto_order_type(super::super::proto::cream::v1::OrderType::Market as i32);
        assert_eq!(order_type, OrderType::Market);
    }

    #[test]
    fn convert_order_type_limit() {
        let order_type =
            convert_proto_order_type(super::super::proto::cream::v1::OrderType::Limit as i32);
        assert_eq!(order_type, OrderType::Limit);
    }

    #[test]
    fn convert_order_type_unspecified() {
        let order_type =
            convert_proto_order_type(super::super::proto::cream::v1::OrderType::Unspecified as i32);
        assert_eq!(order_type, OrderType::Market); // Default
    }

    #[test]
    fn convert_action_unspecified() {
        let side =
            convert_action_to_side(super::super::proto::cream::v1::Action::Unspecified as i32);
        assert_eq!(side, OrderSide::Buy); // Default
    }

    #[test]
    fn convert_proto_side_buy() {
        use super::super::proto::cream::v1::OrderSide as ProtoSide;
        let side = convert_proto_side(ProtoSide::Buy as i32);
        assert_eq!(side, OrderSide::Buy);
    }

    #[test]
    fn convert_proto_side_sell() {
        use super::super::proto::cream::v1::OrderSide as ProtoSide;
        let side = convert_proto_side(ProtoSide::Sell as i32);
        assert_eq!(side, OrderSide::Sell);
    }

    #[test]
    fn convert_proto_side_unspecified() {
        use super::super::proto::cream::v1::OrderSide as ProtoSide;
        let side = convert_proto_side(ProtoSide::Unspecified as i32);
        assert_eq!(side, OrderSide::Buy); // Default
    }

    #[test]
    fn convert_to_proto_status_new() {
        let status = convert_to_proto_status(OrderStatus::New);
        assert_eq!(
            status,
            super::super::proto::cream::v1::OrderStatus::New as i32
        );
    }

    #[test]
    fn convert_to_proto_status_accepted() {
        let status = convert_to_proto_status(OrderStatus::Accepted);
        assert_eq!(
            status,
            super::super::proto::cream::v1::OrderStatus::Accepted as i32
        );
    }

    #[test]
    fn convert_to_proto_status_filled() {
        let status = convert_to_proto_status(OrderStatus::Filled);
        assert_eq!(
            status,
            super::super::proto::cream::v1::OrderStatus::Filled as i32
        );
    }

    #[test]
    fn convert_to_proto_status_cancelled() {
        let status = convert_to_proto_status(OrderStatus::Canceled);
        assert_eq!(
            status,
            super::super::proto::cream::v1::OrderStatus::Cancelled as i32
        );
    }

    #[test]
    fn convert_to_proto_status_rejected() {
        let status = convert_to_proto_status(OrderStatus::Rejected);
        assert_eq!(
            status,
            super::super::proto::cream::v1::OrderStatus::Rejected as i32
        );
    }

    #[test]
    fn convert_to_proto_status_partial() {
        let status = convert_to_proto_status(OrderStatus::PartiallyFilled);
        assert_eq!(
            status,
            super::super::proto::cream::v1::OrderStatus::PartialFill as i32
        );
    }

    #[test]
    fn convert_to_proto_status_expired() {
        let status = convert_to_proto_status(OrderStatus::Expired);
        assert_eq!(
            status,
            super::super::proto::cream::v1::OrderStatus::Cancelled as i32
        );
    }

    #[test]
    fn convert_to_proto_status_pending_new() {
        let status = convert_to_proto_status(OrderStatus::PendingNew);
        assert_eq!(
            status,
            super::super::proto::cream::v1::OrderStatus::Pending as i32
        );
    }

    #[test]
    fn convert_to_proto_status_pending_cancel() {
        let status = convert_to_proto_status(OrderStatus::PendingCancel);
        assert_eq!(
            status,
            super::super::proto::cream::v1::OrderStatus::Pending as i32
        );
    }

    #[test]
    fn convert_to_proto_side_buy() {
        let side = convert_to_proto_side(OrderSide::Buy);
        assert_eq!(side, super::super::proto::cream::v1::OrderSide::Buy as i32);
    }

    #[test]
    fn convert_to_proto_side_sell() {
        let side = convert_to_proto_side(OrderSide::Sell);
        assert_eq!(side, super::super::proto::cream::v1::OrderSide::Sell as i32);
    }

    #[test]
    fn convert_to_proto_order_type_market() {
        let order_type = convert_to_proto_order_type(OrderType::Market);
        assert_eq!(
            order_type,
            super::super::proto::cream::v1::OrderType::Market as i32
        );
    }

    #[test]
    fn convert_to_proto_order_type_limit() {
        let order_type = convert_to_proto_order_type(OrderType::Limit);
        assert_eq!(
            order_type,
            super::super::proto::cream::v1::OrderType::Limit as i32
        );
    }

    #[test]
    fn convert_to_proto_order_type_stop() {
        let order_type = convert_to_proto_order_type(OrderType::Stop);
        assert_eq!(
            order_type,
            super::super::proto::cream::v1::OrderType::Limit as i32
        );
    }

    #[test]
    fn convert_to_proto_order_type_stop_limit() {
        let order_type = convert_to_proto_order_type(OrderType::StopLimit);
        assert_eq!(
            order_type,
            super::super::proto::cream::v1::OrderType::Limit as i32
        );
    }

    // Helper to create test dependencies
    fn create_test_service() -> ExecutionServiceAdapter<
        MockBroker,
        crate::application::ports::InMemoryRiskRepository,
        MockOrderRepo,
        crate::application::ports::NoOpEventPublisher,
    > {
        use crate::application::ports::{InMemoryRiskRepository, NoOpEventPublisher};

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

        ExecutionServiceAdapter::new(
            submit_orders,
            validate_risk,
            cancel_orders,
            order_repo,
            broker,
        )
    }

    #[tokio::test]
    async fn get_account_state_success() {
        let service = create_test_service();

        let request = Request::new(GetAccountStateRequest { account_id: None });
        let response = service.get_account_state(request).await.unwrap();
        let inner = response.into_inner();

        assert!(inner.account_state.is_some());
        let state = inner.account_state.unwrap();
        assert_eq!(state.account_id, "default");
        assert_eq!(state.equity, 100_000.0);
        assert_eq!(state.buying_power, 100_000.0);
    }

    #[tokio::test]
    async fn get_positions_returns_empty() {
        let service = create_test_service();

        let request = Request::new(GetPositionsRequest {
            account_id: None,
            symbols: vec![],
        });
        let response = service.get_positions(request).await.unwrap();
        let inner = response.into_inner();

        assert!(inner.positions.is_empty());
        assert!(inner.as_of.is_some());
    }

    #[tokio::test]
    async fn get_order_state_not_found() {
        let service = create_test_service();

        let request = Request::new(GetOrderStateRequest {
            order_id: "nonexistent-order".to_string(),
        });
        let result = service.get_order_state(request).await;

        assert!(result.is_err());
        let status = result.unwrap_err();
        assert_eq!(status.code(), tonic::Code::NotFound);
    }

    #[tokio::test]
    async fn get_order_state_found() {
        use crate::domain::order_execution::aggregate::{CreateOrderCommand, Order};
        use crate::domain::order_execution::value_objects::TimeInForce;
        use crate::domain::shared::{Money, Quantity, Symbol};

        let broker = Arc::new(MockBroker);
        let risk_repo = Arc::new(crate::application::ports::InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(crate::application::ports::NoOpEventPublisher);

        // Save an order to the repo using CreateOrderCommand
        let cmd = CreateOrderCommand {
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            quantity: Quantity::new(rust_decimal::Decimal::new(100, 0)),
            limit_price: Some(Money::usd(150.0)),
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: crate::domain::order_execution::value_objects::OrderPurpose::Entry,
            legs: vec![],
        };
        let order = Order::new(cmd).unwrap();
        let order_id = order.id().to_string();
        order_repo.save(&order).await.unwrap();

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

        let service = ExecutionServiceAdapter::new(
            submit_orders,
            validate_risk,
            cancel_orders,
            order_repo,
            broker,
        );

        let request = Request::new(GetOrderStateRequest { order_id });
        let response = service.get_order_state(request).await.unwrap();
        let inner = response.into_inner();

        assert!(inner.instrument.is_some());
        let instrument = inner.instrument.unwrap();
        assert_eq!(instrument.instrument_id, "AAPL");
    }

    #[tokio::test]
    async fn cancel_order_success() {
        let service = create_test_service();

        let request = Request::new(CancelOrderRequest {
            order_id: "order-to-cancel".to_string(),
        });
        let response = service.cancel_order(request).await.unwrap();
        let inner = response.into_inner();

        // Order doesn't exist so cancel will fail
        assert!(!inner.accepted);
    }

    #[tokio::test]
    async fn submit_order_success() {
        use super::super::proto::cream::v1::{Instrument, InstrumentType, OrderSide as ProtoSide};

        let service = create_test_service();

        let request = Request::new(SubmitOrderRequest {
            client_order_id: "client-order-1".to_string(),
            instrument: Some(Instrument {
                instrument_id: "AAPL".to_string(),
                instrument_type: InstrumentType::Equity.into(),
                option_contract: None,
            }),
            side: ProtoSide::Buy.into(),
            order_type: super::super::proto::cream::v1::OrderType::Market.into(),
            quantity: 100,
            limit_price: None,
            time_in_force: super::super::proto::cream::v1::TimeInForce::Day.into(),
            cycle_id: "cycle-123".to_string(),
        });

        let response = service.submit_order(request).await.unwrap();
        let inner = response.into_inner();

        assert!(!inner.order_id.is_empty());
        assert_eq!(inner.client_order_id, "client-order-1");
    }

    #[tokio::test]
    async fn submit_order_missing_instrument() {
        let service = create_test_service();

        let request = Request::new(SubmitOrderRequest {
            client_order_id: "client-order-1".to_string(),
            instrument: None, // Missing instrument
            side: 1,
            order_type: 1,
            quantity: 100,
            limit_price: None,
            time_in_force: 1,
            cycle_id: "cycle-123".to_string(),
        });

        let result = service.submit_order(request).await;
        assert!(result.is_err());
        let status = result.unwrap_err();
        assert_eq!(status.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn check_constraints_missing_decision_plan() {
        let service = create_test_service();

        let request = Request::new(CheckConstraintsRequest {
            decision_plan: None, // Missing
            account_state: None,
            positions: vec![],
            constraints: None,
        });

        let result = service.check_constraints(request).await;
        assert!(result.is_err());
        let status = result.unwrap_err();
        assert_eq!(status.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn check_constraints_with_valid_plan() {
        use super::super::proto::cream::v1::{
            Action, Decision, DecisionPlan, Direction, Environment, Instrument, InstrumentType,
            OrderPlan, OrderType, References, RiskDenomination, RiskLevels, Size, SizeUnit,
            StrategyFamily, ThesisState, TimeHorizon, TimeInForce,
        };

        let service = create_test_service();

        let request = Request::new(CheckConstraintsRequest {
            decision_plan: Some(DecisionPlan {
                cycle_id: "cycle-123".to_string(),
                as_of_timestamp: None,
                environment: Environment::Paper.into(),
                decisions: vec![Decision {
                    instrument: Some(Instrument {
                        instrument_id: "AAPL".to_string(),
                        instrument_type: InstrumentType::Equity.into(),
                        option_contract: None,
                    }),
                    action: Action::Buy.into(),
                    size: Some(Size {
                        quantity: 100,
                        unit: SizeUnit::Shares.into(),
                        target_position_quantity: 100,
                    }),
                    order_plan: Some(OrderPlan {
                        entry_order_type: OrderType::Market.into(),
                        entry_limit_price: None,
                        exit_order_type: OrderType::Market.into(),
                        time_in_force: TimeInForce::Day.into(),
                        execution_tactic: None,
                        execution_params: None,
                    }),
                    risk_levels: Some(RiskLevels {
                        stop_loss_level: 145.0,
                        take_profit_level: 160.0,
                        denomination: RiskDenomination::UnderlyingPrice.into(),
                    }),
                    strategy_family: StrategyFamily::EquityLong.into(),
                    rationale: "Test".to_string(),
                    confidence: 0.9,
                    references: Some(References {
                        used_indicators: vec![],
                        memory_case_ids: vec![],
                        event_ids: vec![],
                    }),
                    direction: Direction::Long.into(),
                    time_horizon: TimeHorizon::Swing.into(),
                    thesis_state: ThesisState::Watching.into(),
                    bullish_factors: vec![],
                    bearish_factors: vec![],
                    legs: vec![],
                    net_limit_price: None,
                }],
                portfolio_notes: None,
            }),
            account_state: None,
            positions: vec![],
            constraints: None,
        });

        let response = service.check_constraints(request).await.unwrap();
        let inner = response.into_inner();

        assert!(inner.approved);
        assert!(inner.violations.is_empty());
    }

    #[tokio::test]
    async fn stream_executions_returns_stream() {
        let service = create_test_service();

        let request = Request::new(StreamExecutionsRequest {
            cycle_id: Some("cycle-123".to_string()),
            order_ids: vec!["order-1".to_string(), "order-2".to_string()],
        });

        let response = service.stream_executions(request).await.unwrap();
        let _stream = response.into_inner();
        // Stream is created successfully (we don't send anything in the test)
    }

    #[tokio::test]
    async fn create_execution_service_function() {
        use crate::application::ports::{InMemoryRiskRepository, NoOpEventPublisher};

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

        // Test the create_execution_service function
        let _server = create_execution_service(
            submit_orders,
            validate_risk,
            cancel_orders,
            order_repo,
            broker,
        );
        // Successfully created server
    }

    // Broker that fails get_buying_power
    struct FailingBroker;

    #[async_trait]
    impl BrokerPort for FailingBroker {
        async fn submit_order(
            &self,
            _request: crate::application::ports::SubmitOrderRequest,
        ) -> Result<OrderAck, BrokerError> {
            Err(BrokerError::ConnectionError {
                message: "Broker unavailable".to_string(),
            })
        }

        async fn cancel_order(
            &self,
            _request: crate::application::ports::CancelOrderRequest,
        ) -> Result<(), BrokerError> {
            Err(BrokerError::ConnectionError {
                message: "Broker unavailable".to_string(),
            })
        }

        async fn get_order(&self, _broker_order_id: &BrokerId) -> Result<OrderAck, BrokerError> {
            Err(BrokerError::ConnectionError {
                message: "Broker unavailable".to_string(),
            })
        }

        async fn get_open_orders(&self) -> Result<Vec<OrderAck>, BrokerError> {
            Err(BrokerError::ConnectionError {
                message: "Broker unavailable".to_string(),
            })
        }

        async fn get_buying_power(&self) -> Result<Decimal, BrokerError> {
            Err(BrokerError::ConnectionError {
                message: "Broker unavailable".to_string(),
            })
        }

        async fn get_position(
            &self,
            _instrument_id: &crate::domain::shared::InstrumentId,
        ) -> Result<Option<Decimal>, BrokerError> {
            Err(BrokerError::ConnectionError {
                message: "Broker unavailable".to_string(),
            })
        }
    }

    fn create_failing_broker_service() -> ExecutionServiceAdapter<
        FailingBroker,
        crate::application::ports::InMemoryRiskRepository,
        MockOrderRepo,
        crate::application::ports::NoOpEventPublisher,
    > {
        use crate::application::ports::{InMemoryRiskRepository, NoOpEventPublisher};

        let broker = Arc::new(FailingBroker);
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

        ExecutionServiceAdapter::new(
            submit_orders,
            validate_risk,
            cancel_orders,
            order_repo,
            broker,
        )
    }

    #[tokio::test]
    async fn get_account_state_broker_error() {
        let service = create_failing_broker_service();

        let request = Request::new(GetAccountStateRequest { account_id: None });
        let result = service.get_account_state(request).await;

        assert!(result.is_err());
        let status = result.unwrap_err();
        assert_eq!(status.code(), tonic::Code::Internal);
    }

    #[tokio::test]
    async fn submit_order_with_limit_price() {
        use super::super::proto::cream::v1::{Instrument, InstrumentType, OrderSide as ProtoSide};

        let service = create_test_service();

        let request = Request::new(SubmitOrderRequest {
            client_order_id: "client-order-limit".to_string(),
            instrument: Some(Instrument {
                instrument_id: "AAPL".to_string(),
                instrument_type: InstrumentType::Equity.into(),
                option_contract: None,
            }),
            side: ProtoSide::Sell.into(),
            order_type: super::super::proto::cream::v1::OrderType::Limit.into(),
            quantity: 50,
            limit_price: Some(150.50),
            time_in_force: super::super::proto::cream::v1::TimeInForce::Day.into(),
            cycle_id: "cycle-456".to_string(),
        });

        let response = service.submit_order(request).await.unwrap();
        let inner = response.into_inner();

        assert!(!inner.order_id.is_empty());
        assert_eq!(inner.client_order_id, "client-order-limit");
    }

    #[tokio::test]
    async fn cancel_order_with_existing_order() {
        use crate::domain::order_execution::aggregate::{CreateOrderCommand, Order};
        use crate::domain::order_execution::value_objects::{OrderPurpose, TimeInForce};
        use crate::domain::shared::{Money, Quantity, Symbol};

        let broker = Arc::new(MockBroker);
        let risk_repo = Arc::new(crate::application::ports::InMemoryRiskRepository::new());
        let order_repo = Arc::new(MockOrderRepo::new());
        let event_publisher = Arc::new(crate::application::ports::NoOpEventPublisher);

        // Create and save an order
        let cmd = CreateOrderCommand {
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            quantity: Quantity::new(rust_decimal::Decimal::new(100, 0)),
            limit_price: Some(Money::usd(150.0)),
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
            legs: vec![],
        };
        let order = Order::new(cmd).unwrap();
        let order_id = order.id().to_string();
        order_repo.save(&order).await.unwrap();

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

        let service = ExecutionServiceAdapter::new(
            submit_orders,
            validate_risk,
            cancel_orders,
            order_repo,
            broker,
        );

        let request = Request::new(CancelOrderRequest { order_id });
        let response = service.cancel_order(request).await.unwrap();
        let inner = response.into_inner();

        // Cancel should process (the order exists)
        assert!(!inner.order_id.is_empty());
    }

    // Mock order repo that returns errors
    struct FailingOrderRepo;

    #[async_trait]
    impl OrderRepository for FailingOrderRepo {
        async fn save(&self, _order: &Order) -> Result<(), OrderError> {
            Err(OrderError::NotFound {
                order_id: "DB error".to_string(),
            })
        }

        async fn find_by_id(&self, _id: &OrderId) -> Result<Option<Order>, OrderError> {
            Err(OrderError::NotFound {
                order_id: "DB error".to_string(),
            })
        }

        async fn find_by_broker_id(
            &self,
            _broker_id: &BrokerId,
        ) -> Result<Option<Order>, OrderError> {
            Err(OrderError::NotFound {
                order_id: "DB error".to_string(),
            })
        }

        async fn find_by_status(&self, _status: OrderStatus) -> Result<Vec<Order>, OrderError> {
            Err(OrderError::NotFound {
                order_id: "DB error".to_string(),
            })
        }

        async fn find_active(&self) -> Result<Vec<Order>, OrderError> {
            Err(OrderError::NotFound {
                order_id: "DB error".to_string(),
            })
        }

        async fn exists(&self, _id: &OrderId) -> Result<bool, OrderError> {
            Err(OrderError::NotFound {
                order_id: "DB error".to_string(),
            })
        }

        async fn delete(&self, _id: &OrderId) -> Result<(), OrderError> {
            Err(OrderError::NotFound {
                order_id: "DB error".to_string(),
            })
        }
    }

    #[tokio::test]
    async fn get_order_state_repo_error() {
        use crate::application::ports::{InMemoryRiskRepository, NoOpEventPublisher};

        let broker = Arc::new(MockBroker);
        let risk_repo = Arc::new(InMemoryRiskRepository::new());
        let order_repo = Arc::new(FailingOrderRepo);
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

        let service = ExecutionServiceAdapter::new(
            submit_orders,
            validate_risk,
            cancel_orders,
            order_repo,
            broker,
        );

        let request = Request::new(GetOrderStateRequest {
            order_id: "some-order".to_string(),
        });
        let result = service.get_order_state(request).await;

        assert!(result.is_err());
        let status = result.unwrap_err();
        assert_eq!(status.code(), tonic::Code::Internal);
    }

    #[tokio::test]
    async fn check_constraints_with_multiple_decisions() {
        use super::super::proto::cream::v1::{
            Action, Decision, DecisionPlan, Direction, Environment, Instrument, InstrumentType,
            OrderPlan, OrderType, References, RiskDenomination, RiskLevels, Size, SizeUnit,
            StrategyFamily, ThesisState, TimeHorizon, TimeInForce,
        };

        let service = create_test_service();

        let request = Request::new(CheckConstraintsRequest {
            decision_plan: Some(DecisionPlan {
                cycle_id: "cycle-multi".to_string(),
                as_of_timestamp: None,
                environment: Environment::Paper.into(),
                decisions: vec![
                    Decision {
                        instrument: Some(Instrument {
                            instrument_id: "AAPL".to_string(),
                            instrument_type: InstrumentType::Equity.into(),
                            option_contract: None,
                        }),
                        action: Action::Buy.into(),
                        size: Some(Size {
                            quantity: 50,
                            unit: SizeUnit::Shares.into(),
                            target_position_quantity: 50,
                        }),
                        order_plan: Some(OrderPlan {
                            entry_order_type: OrderType::Market.into(),
                            entry_limit_price: None,
                            exit_order_type: OrderType::Market.into(),
                            time_in_force: TimeInForce::Day.into(),
                            execution_tactic: None,
                            execution_params: None,
                        }),
                        risk_levels: Some(RiskLevels {
                            stop_loss_level: 145.0,
                            take_profit_level: 160.0,
                            denomination: RiskDenomination::UnderlyingPrice.into(),
                        }),
                        strategy_family: StrategyFamily::EquityLong.into(),
                        rationale: "Test 1".to_string(),
                        confidence: 0.8,
                        references: Some(References {
                            used_indicators: vec![],
                            memory_case_ids: vec![],
                            event_ids: vec![],
                        }),
                        direction: Direction::Long.into(),
                        time_horizon: TimeHorizon::Swing.into(),
                        thesis_state: ThesisState::Watching.into(),
                        bullish_factors: vec![],
                        bearish_factors: vec![],
                        legs: vec![],
                        net_limit_price: None,
                    },
                    Decision {
                        instrument: Some(Instrument {
                            instrument_id: "MSFT".to_string(),
                            instrument_type: InstrumentType::Equity.into(),
                            option_contract: None,
                        }),
                        action: Action::Sell.into(),
                        size: Some(Size {
                            quantity: 30,
                            unit: SizeUnit::Shares.into(),
                            target_position_quantity: -30,
                        }),
                        order_plan: Some(OrderPlan {
                            entry_order_type: OrderType::Limit.into(),
                            entry_limit_price: Some(400.0),
                            exit_order_type: OrderType::Limit.into(),
                            time_in_force: TimeInForce::Day.into(),
                            execution_tactic: None,
                            execution_params: None,
                        }),
                        risk_levels: Some(RiskLevels {
                            stop_loss_level: 420.0,
                            take_profit_level: 380.0,
                            denomination: RiskDenomination::UnderlyingPrice.into(),
                        }),
                        strategy_family: StrategyFamily::EquityShort.into(),
                        rationale: "Test 2".to_string(),
                        confidence: 0.7,
                        references: Some(References {
                            used_indicators: vec![],
                            memory_case_ids: vec![],
                            event_ids: vec![],
                        }),
                        direction: Direction::Short.into(),
                        time_horizon: TimeHorizon::Intraday.into(),
                        thesis_state: ThesisState::Watching.into(),
                        bullish_factors: vec![],
                        bearish_factors: vec![],
                        legs: vec![],
                        net_limit_price: None,
                    },
                ],
                portfolio_notes: Some("Test portfolio".to_string()),
            }),
            account_state: None,
            positions: vec![],
            constraints: None,
        });

        let response = service.check_constraints(request).await.unwrap();
        let inner = response.into_inner();

        assert!(inner.approved);
    }

    #[tokio::test]
    async fn check_constraints_with_incomplete_decision() {
        use super::super::proto::cream::v1::{
            Action, Decision, DecisionPlan, Direction, Environment, RiskDenomination, RiskLevels,
            StrategyFamily, ThesisState, TimeHorizon,
        };

        let service = create_test_service();

        // Decision without instrument, size, or order_plan - should be filtered out
        let request = Request::new(CheckConstraintsRequest {
            decision_plan: Some(DecisionPlan {
                cycle_id: "cycle-incomplete".to_string(),
                as_of_timestamp: None,
                environment: Environment::Paper.into(),
                decisions: vec![Decision {
                    instrument: None, // Missing instrument
                    action: Action::Buy.into(),
                    size: None,       // Missing size
                    order_plan: None, // Missing order_plan
                    risk_levels: Some(RiskLevels {
                        stop_loss_level: 145.0,
                        take_profit_level: 160.0,
                        denomination: RiskDenomination::UnderlyingPrice.into(),
                    }),
                    strategy_family: StrategyFamily::EquityLong.into(),
                    rationale: "Incomplete".to_string(),
                    confidence: 0.8,
                    references: None,
                    direction: Direction::Long.into(),
                    time_horizon: TimeHorizon::Swing.into(),
                    thesis_state: ThesisState::Watching.into(),
                    bullish_factors: vec![],
                    bearish_factors: vec![],
                    legs: vec![],
                    net_limit_price: None,
                }],
                portfolio_notes: None,
            }),
            account_state: None,
            positions: vec![],
            constraints: None,
        });

        let response = service.check_constraints(request).await.unwrap();
        let inner = response.into_inner();

        // Should still succeed (incomplete decisions are filtered out)
        assert!(inner.approved);
    }
}
