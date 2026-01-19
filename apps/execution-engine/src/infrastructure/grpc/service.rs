//! gRPC ExecutionService implementation.
//!
//! Implements the ExecutionService gRPC service using Clean Architecture use cases.

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

/// gRPC ExecutionService adapter using Clean Architecture.
pub struct ExecutionServiceAdapter<B, R, O, E>
where
    B: BrokerPort,
    R: RiskRepositoryPort,
    O: OrderRepository,
    E: EventPublisherPort,
{
    submit_orders: Arc<SubmitOrdersUseCase<B, R, O, E>>,
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
    /// Create a new ExecutionService adapter.
    pub fn new(
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

/// Create an ExecutionService gRPC server.
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

        // Convert proto decisions to CreateOrderDto
        let orders: Vec<CreateOrderDto> = decision_plan
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
                        .map(rust_decimal::Decimal::from_f64_retain)
                        .flatten(),
                    time_in_force: TimeInForce::Day,
                    purpose: OrderPurpose::Entry,
                })
            })
            .collect();

        // For constraint checking, return passed for now
        // Real implementation would validate via use case
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
                .map(rust_decimal::Decimal::from_f64_retain)
                .flatten(),
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
                        .map(|p| p.to_string().parse().unwrap_or(0.0))
                        .unwrap_or(0.0),
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
        Ok(Action::Buy) => OrderSide::Buy,
        Ok(Action::Sell) => OrderSide::Sell,
        _ => OrderSide::Buy,
    }
}

fn convert_proto_side(side: i32) -> OrderSide {
    use super::proto::cream::v1::OrderSide as ProtoSide;
    match ProtoSide::try_from(side) {
        Ok(ProtoSide::Buy) => OrderSide::Buy,
        Ok(ProtoSide::Sell) => OrderSide::Sell,
        _ => OrderSide::Buy,
    }
}

fn convert_proto_order_type(order_type: i32) -> OrderType {
    use super::proto::cream::v1::OrderType as ProtoOrderType;
    match ProtoOrderType::try_from(order_type) {
        Ok(ProtoOrderType::Market) => OrderType::Market,
        Ok(ProtoOrderType::Limit) => OrderType::Limit,
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
        OrderStatus::PendingNew => ProtoStatus::Pending.into(),
        OrderStatus::Accepted => ProtoStatus::Accepted.into(),
        OrderStatus::PartiallyFilled => ProtoStatus::PartialFill.into(),
        OrderStatus::Filled => ProtoStatus::Filled.into(),
        OrderStatus::Canceled => ProtoStatus::Cancelled.into(),
        OrderStatus::Rejected => ProtoStatus::Rejected.into(),
        OrderStatus::Expired => ProtoStatus::Cancelled.into(), // Map expired to cancelled
        OrderStatus::PendingCancel => ProtoStatus::Pending.into(), // Map to pending
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
        OrderType::Limit => ProtoOrderType::Limit.into(),
        OrderType::Stop | OrderType::StopLimit => ProtoOrderType::Limit.into(), // Fallback
    }
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
    use rust_decimal::Decimal;
    use std::collections::HashMap;
    use std::sync::RwLock;

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
}
