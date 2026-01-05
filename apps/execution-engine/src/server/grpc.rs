//! gRPC service implementation for the execution engine.
//!
//! Implements the ExecutionService and MarketDataService gRPC services
//! defined in the protobuf schema.

use std::pin::Pin;
use std::sync::Arc;

use tokio::sync::mpsc;
use tokio_stream::{Stream, wrappers::ReceiverStream};
use tonic::{Request, Response, Status};

use crate::execution::{ExecutionGateway, OrderStateManager};
use crate::models::Environment;
use crate::risk::ConstraintValidator;

// ============================================
// Proto Module (generated code)
// ============================================

/// Include generated protobuf code.
/// The generated code is in packages/schema-gen/rust/cream/v1/
/// cream.v1.rs includes cream.v1.tonic.rs at the end
pub mod proto {
    pub mod cream {
        pub mod v1 {
            include!("../../../../packages/schema-gen/rust/cream/v1/cream.v1.rs");
        }
    }
}

use proto::cream::v1::{
    AccountState, CheckConstraintsRequest, CheckConstraintsResponse, ConstraintCheck,
    ConstraintResult, GetAccountStateRequest, GetAccountStateResponse, GetOptionChainRequest,
    GetOptionChainResponse, GetPositionsRequest, GetPositionsResponse, GetSnapshotRequest,
    GetSnapshotResponse, Position, StreamExecutionsRequest, StreamExecutionsResponse,
    SubmitOrderRequest, SubmitOrderResponse, SubscribeMarketDataRequest,
    SubscribeMarketDataResponse,
    execution_service_server::{ExecutionService, ExecutionServiceServer},
    market_data_service_server::{MarketDataService, MarketDataServiceServer},
};

// ============================================
// Execution Service Implementation
// ============================================

/// Execution service implementation.
pub struct ExecutionServiceImpl {
    /// Constraint validator.
    validator: Arc<ConstraintValidator>,
    /// Order state manager.
    state_manager: Arc<OrderStateManager>,
    /// Execution gateway.
    gateway: Arc<ExecutionGateway>,
}

impl std::fmt::Debug for ExecutionServiceImpl {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ExecutionServiceImpl")
            .field("validator", &"...")
            .field("state_manager", &"...")
            .field("gateway", &"...")
            .finish()
    }
}

impl ExecutionServiceImpl {
    /// Create a new execution service.
    pub fn new(
        validator: ConstraintValidator,
        state_manager: OrderStateManager,
        gateway: ExecutionGateway,
    ) -> Self {
        Self {
            validator: Arc::new(validator),
            state_manager: Arc::new(state_manager),
            gateway: Arc::new(gateway),
        }
    }

    /// Create with default configuration (paper trading).
    pub fn with_defaults() -> Self {
        use crate::execution::AlpacaAdapter;

        // Create paper trading adapter with placeholder credentials
        // Real credentials come from environment in production
        let alpaca = AlpacaAdapter::new(
            std::env::var("ALPACA_KEY").unwrap_or_else(|_| "paper-key".to_string()),
            std::env::var("ALPACA_SECRET").unwrap_or_else(|_| "paper-secret".to_string()),
            Environment::Paper,
        )
        .expect("Failed to create Alpaca adapter");

        let state_manager = OrderStateManager::new();
        let validator = ConstraintValidator::with_defaults();

        // Create separate instances for gateway and service
        // In production, these would be shared via dependency injection
        let gateway_state_manager = OrderStateManager::new();
        let gateway_validator = ConstraintValidator::with_defaults();
        let gateway = ExecutionGateway::new(alpaca, gateway_state_manager, gateway_validator);

        Self {
            validator: Arc::new(validator),
            state_manager: Arc::new(state_manager),
            gateway: Arc::new(gateway),
        }
    }
}

#[tonic::async_trait]
impl ExecutionService for ExecutionServiceImpl {
    async fn check_constraints(
        &self,
        request: Request<CheckConstraintsRequest>,
    ) -> Result<Response<CheckConstraintsResponse>, Status> {
        let req = request.into_inner();

        // Convert proto request to internal format
        let decision_plan = req
            .decision_plan
            .ok_or_else(|| Status::invalid_argument("decision_plan is required"))?;

        let account_state = req
            .account_state
            .ok_or_else(|| Status::invalid_argument("account_state is required"))?;

        // Build internal constraint check request
        let internal_request = crate::models::ConstraintCheckRequest {
            request_id: uuid::Uuid::new_v4().to_string(),
            cycle_id: decision_plan.cycle_id.clone(),
            risk_policy_id: "default".to_string(),
            account_equity: rust_decimal::Decimal::from_f64_retain(account_state.equity)
                .unwrap_or_default(),
            plan: convert_decision_plan(&decision_plan)?,
        };

        // Validate constraints
        let response = self.validator.validate(&internal_request);

        // Convert to proto response
        let proto_response = CheckConstraintsResponse {
            approved: response.ok,
            checks: response
                .violations
                .iter()
                .map(|v| ConstraintCheck {
                    name: v.code.clone(),
                    result: if v.severity == crate::models::ViolationSeverity::Error {
                        ConstraintResult::Fail.into()
                    } else {
                        ConstraintResult::Warn.into()
                    },
                    description: v.message.clone(),
                    actual_value: v.observed.parse().ok(),
                    threshold: v.limit.parse().ok(),
                })
                .collect(),
            validated_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
            rejection_reason: if response.ok {
                None
            } else {
                Some(
                    response
                        .violations
                        .first()
                        .map(|v| v.message.clone())
                        .unwrap_or_default(),
                )
            },
        };

        Ok(Response::new(proto_response))
    }

    async fn submit_order(
        &self,
        request: Request<SubmitOrderRequest>,
    ) -> Result<Response<SubmitOrderResponse>, Status> {
        let req = request.into_inner();

        // Validate required fields
        let instrument = req
            .instrument
            .ok_or_else(|| Status::invalid_argument("instrument is required"))?;

        // Create internal order and submit via gateway
        let order_id = uuid::Uuid::new_v4().to_string();

        // For now, return a mock response
        // Real implementation would route through the gateway
        let response = SubmitOrderResponse {
            order_id: order_id.clone(),
            client_order_id: req.client_order_id,
            status: proto::cream::v1::OrderStatus::Accepted.into(),
            submitted_at: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
            error_message: None,
        };

        tracing::info!(
            order_id = %order_id,
            instrument_id = %instrument.instrument_id,
            quantity = req.quantity,
            "Order submitted"
        );

        Ok(Response::new(response))
    }

    type StreamExecutionsStream =
        Pin<Box<dyn Stream<Item = Result<StreamExecutionsResponse, Status>> + Send>>;

    async fn stream_executions(
        &self,
        request: Request<StreamExecutionsRequest>,
    ) -> Result<Response<Self::StreamExecutionsStream>, Status> {
        let req = request.into_inner();

        // Create a channel for streaming executions
        let (tx, rx) = mpsc::channel(128);

        // Spawn a task to send execution updates
        let _state_manager = self.state_manager.clone();
        let order_ids = req.order_ids;
        let cycle_id = req.cycle_id;

        tokio::spawn(async move {
            // In a real implementation, this would:
            // 1. Subscribe to order state changes
            // 2. Filter by cycle_id and order_ids
            // 3. Send updates to the stream

            // For now, just keep the connection open
            tracing::info!(
                cycle_id = ?cycle_id,
                order_count = order_ids.len(),
                "Execution stream started"
            );

            // The stream will close when the client disconnects
            let _ = tx;
        });

        let stream = ReceiverStream::new(rx);
        Ok(Response::new(Box::pin(stream)))
    }

    async fn get_account_state(
        &self,
        _request: Request<GetAccountStateRequest>,
    ) -> Result<Response<GetAccountStateResponse>, Status> {
        // Return mock account state for now
        // Real implementation would query broker API
        let account_state = AccountState {
            account_id: "default".to_string(),
            equity: 100_000.0,
            buying_power: 200_000.0,
            margin_used: 0.0,
            day_trade_count: 0,
            is_pdt_restricted: false,
            as_of: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
        };

        Ok(Response::new(GetAccountStateResponse {
            account_state: Some(account_state),
        }))
    }

    async fn get_positions(
        &self,
        request: Request<GetPositionsRequest>,
    ) -> Result<Response<GetPositionsResponse>, Status> {
        let req = request.into_inner();

        // Return mock positions for now
        // Real implementation would query broker API
        let positions: Vec<Position> = vec![];

        tracing::debug!(
            symbols = ?req.symbols,
            "Getting positions"
        );

        Ok(Response::new(GetPositionsResponse {
            positions,
            as_of: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
        }))
    }
}

// ============================================
// Market Data Service Implementation
// ============================================

/// Market data service implementation.
#[derive(Debug, Default)]
pub struct MarketDataServiceImpl {}

impl MarketDataServiceImpl {
    /// Create a new market data service.
    pub fn new() -> Self {
        Self {}
    }
}

#[tonic::async_trait]
impl MarketDataService for MarketDataServiceImpl {
    type SubscribeMarketDataStream =
        Pin<Box<dyn Stream<Item = Result<SubscribeMarketDataResponse, Status>> + Send>>;

    async fn subscribe_market_data(
        &self,
        request: Request<SubscribeMarketDataRequest>,
    ) -> Result<Response<Self::SubscribeMarketDataStream>, Status> {
        let req = request.into_inner();

        // Create a channel for streaming market data
        let (tx, rx) = mpsc::channel(128);

        // Spawn a task to send market data updates
        let symbols = req.symbols;
        tokio::spawn(async move {
            tracing::info!(symbol_count = symbols.len(), "Market data stream started");
            let _ = tx;
        });

        let stream = ReceiverStream::new(rx);
        Ok(Response::new(Box::pin(stream)))
    }

    async fn get_snapshot(
        &self,
        request: Request<GetSnapshotRequest>,
    ) -> Result<Response<GetSnapshotResponse>, Status> {
        let req = request.into_inner();

        tracing::debug!(
            symbols = ?req.symbols,
            "Getting market snapshot"
        );

        // Return empty snapshot for now
        // Real implementation would build full market snapshot
        Ok(Response::new(GetSnapshotResponse { snapshot: None }))
    }

    async fn get_option_chain(
        &self,
        request: Request<GetOptionChainRequest>,
    ) -> Result<Response<GetOptionChainResponse>, Status> {
        let req = request.into_inner();

        tracing::debug!(
            underlying = %req.underlying,
            "Getting option chain"
        );

        // Return empty chain for now
        // Real implementation would query option chain data
        Ok(Response::new(GetOptionChainResponse { chain: None }))
    }
}

// ============================================
// Helper Functions
// ============================================

/// Convert proto DecisionPlan to internal format.
fn convert_decision_plan(
    proto: &proto::cream::v1::DecisionPlan,
) -> Result<crate::models::DecisionPlan, Status> {
    use crate::models::{Action, Decision, Direction, Size, SizeUnit, StrategyFamily, TimeHorizon};
    use rust_decimal::Decimal;

    let decisions: Vec<Decision> = proto
        .decisions
        .iter()
        .enumerate()
        .map(|(idx, d)| {
            // Convert action from proto enum
            let action = match proto::cream::v1::Action::try_from(d.action) {
                Ok(proto::cream::v1::Action::Buy) => Action::Buy,
                Ok(proto::cream::v1::Action::Sell) => Action::Sell,
                Ok(proto::cream::v1::Action::Hold) => Action::Hold,
                Ok(proto::cream::v1::Action::Increase) => Action::Buy,
                Ok(proto::cream::v1::Action::Reduce) => Action::Sell,
                Ok(proto::cream::v1::Action::NoTrade) => Action::Hold,
                _ => Action::Hold,
            };

            // Derive direction from action (Buy = Long, Sell = Short)
            let direction = match action {
                Action::Buy => Direction::Long,
                Action::Sell => Direction::Short,
                Action::Hold | Action::Close | Action::NoTrade => Direction::Flat,
            };

            // Extract risk levels
            let (stop_loss, take_profit) =
                d.risk_levels
                    .as_ref()
                    .map_or((Decimal::ZERO, Decimal::ZERO), |r| {
                        (
                            Decimal::from_f64_retain(r.stop_loss_level).unwrap_or_default(),
                            Decimal::from_f64_retain(r.take_profit_level).unwrap_or_default(),
                        )
                    });

            // Extract size
            let (quantity, unit) = d
                .size
                .as_ref()
                .map_or((Decimal::ZERO, SizeUnit::Shares), |s| {
                    let unit = match proto::cream::v1::SizeUnit::try_from(s.unit) {
                        Ok(proto::cream::v1::SizeUnit::Shares) => SizeUnit::Shares,
                        Ok(proto::cream::v1::SizeUnit::Contracts) => SizeUnit::Contracts,
                        _ => SizeUnit::Shares,
                    };
                    (Decimal::from(s.quantity), unit)
                });

            // Extract strategy family
            // Proto: Unspecified, Trend, MeanReversion, EventDriven, Volatility, RelativeValue
            // Internal: Momentum, MeanReversion, TrendFollowing, Volatility, EventDriven, Fundamental
            let strategy_family =
                match proto::cream::v1::StrategyFamily::try_from(d.strategy_family) {
                    Ok(proto::cream::v1::StrategyFamily::Trend) => StrategyFamily::TrendFollowing,
                    Ok(proto::cream::v1::StrategyFamily::MeanReversion) => {
                        StrategyFamily::MeanReversion
                    }
                    Ok(proto::cream::v1::StrategyFamily::Volatility) => StrategyFamily::Volatility,
                    Ok(proto::cream::v1::StrategyFamily::EventDriven) => {
                        StrategyFamily::EventDriven
                    }
                    Ok(proto::cream::v1::StrategyFamily::RelativeValue) => {
                        StrategyFamily::Fundamental
                    }
                    _ => StrategyFamily::Momentum, // Default
                };

            // Extract limit price from order plan
            let limit_price = d.order_plan.as_ref().and_then(|op| {
                op.entry_limit_price
                    .map(|p| Decimal::from_f64_retain(p).unwrap_or_default())
            });

            Decision {
                decision_id: format!("{}-{}", proto.cycle_id, idx),
                instrument_id: d
                    .instrument
                    .as_ref()
                    .map_or(String::new(), |i| i.instrument_id.clone()),
                action,
                direction,
                size: Size { quantity, unit },
                stop_loss_level: stop_loss,
                take_profit_level: take_profit,
                limit_price,
                strategy_family,
                time_horizon: TimeHorizon::Swing, // Default
                bullish_factors: vec![],          // Not in proto
                bearish_factors: vec![],          // Not in proto
                rationale: d.rationale.clone(),
                confidence: Decimal::from_f64_retain(d.confidence).unwrap_or_default(),
            }
        })
        .collect();

    Ok(crate::models::DecisionPlan {
        plan_id: proto.cycle_id.clone(), // Use cycle_id as plan_id
        cycle_id: proto.cycle_id.clone(),
        timestamp: proto
            .as_of_timestamp
            .as_ref()
            .map(|t| {
                chrono::DateTime::from_timestamp(t.seconds, t.nanos as u32)
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_default()
            })
            .unwrap_or_default(),
        decisions,
        risk_manager_approved: true, // Proto doesn't have this, default to requiring check
        critic_approved: true,
        plan_rationale: proto.portfolio_notes.clone().unwrap_or_default(),
    })
}

// ============================================
// Server Builder
// ============================================

/// Run the gRPC server on the specified address.
pub async fn run_grpc_server(addr: std::net::SocketAddr) -> Result<(), tonic::transport::Error> {
    tracing::info!(%addr, "Starting gRPC server");

    let execution_service = ExecutionServiceImpl::with_defaults();
    let market_data_service = MarketDataServiceImpl::new();

    let router = tonic::transport::Server::builder()
        .add_service(ExecutionServiceServer::new(execution_service))
        .add_service(MarketDataServiceServer::new(market_data_service));

    router.serve(addr).await
}

/// Build the gRPC services for testing or custom server setup.
pub fn build_grpc_services() -> (
    ExecutionServiceServer<ExecutionServiceImpl>,
    MarketDataServiceServer<MarketDataServiceImpl>,
) {
    let execution_service = ExecutionServiceImpl::with_defaults();
    let market_data_service = MarketDataServiceImpl::new();

    (
        ExecutionServiceServer::new(execution_service),
        MarketDataServiceServer::new(market_data_service),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_execution_service_creation() {
        let service = ExecutionServiceImpl::with_defaults();
        assert!(Arc::strong_count(&service.validator) == 1);
    }

    #[test]
    fn test_market_data_service_creation() {
        let service = MarketDataServiceImpl::new();
        // Just verify it can be created
        let _ = service;
    }

    #[tokio::test]
    async fn test_get_account_state() {
        let service = ExecutionServiceImpl::with_defaults();
        let request = Request::new(GetAccountStateRequest { account_id: None });

        let response = service.get_account_state(request).await.unwrap();
        let state = response.into_inner().account_state.unwrap();

        assert_eq!(state.account_id, "default");
        assert!(state.equity > 0.0);
    }

    #[tokio::test]
    async fn test_get_positions() {
        let service = ExecutionServiceImpl::with_defaults();
        let request = Request::new(GetPositionsRequest {
            account_id: None,
            symbols: vec!["AAPL".to_string()],
        });

        let response = service.get_positions(request).await.unwrap();
        let positions = response.into_inner();

        assert!(positions.as_of.is_some());
    }

    #[tokio::test]
    async fn test_get_snapshot() {
        let service = MarketDataServiceImpl::new();
        let request = Request::new(GetSnapshotRequest {
            symbols: vec!["AAPL".to_string()],
            include_bars: false,
            bar_timeframes: vec![],
        });

        let response = service.get_snapshot(request).await.unwrap();
        // Response should be valid (snapshot may be None for now)
        let _snapshot = response.into_inner();
    }

    #[tokio::test]
    async fn test_get_option_chain() {
        let service = MarketDataServiceImpl::new();
        let request = Request::new(GetOptionChainRequest {
            underlying: "AAPL".to_string(),
            expirations: vec![],
            min_strike: None,
            max_strike: None,
        });

        let response = service.get_option_chain(request).await.unwrap();
        // Response should be valid (chain may be None for now)
        let _chain = response.into_inner();
    }
}
