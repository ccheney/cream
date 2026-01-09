//! Execution Engine - Rust Core Library
//!
//! Deterministic execution engine for the Cream trading system.
//!
//! # Architecture
//!
//! The execution engine handles:
//! - **Validation**: Validates `DecisionPlans` from TypeScript agents
//! - **Risk Checks**: Enforces position limits, drawdown constraints
//! - **Order Routing**: Routes orders to brokers (Alpaca)
//! - **Position Management**: Tracks positions and P&L
//!
//! # Modules
//!
//! - [`models`]: Core domain types (orders, decisions, constraints)
//! - [`risk`]: Constraint validation and risk checks
//! - [`execution`]: Order routing and state management
//! - [`server`]: gRPC service implementation
//!
//! # Coverage
//!
//! Coverage threshold: 90% (Critical tier)
//! See: docs/plans/14-testing.md
//!
//! Run coverage:
//! ```bash
//! cargo cov       # Generate lcov.info
//! cargo cov-html  # Generate HTML report
//! cargo cov-check # Verify >= 80% coverage
//! ```

#![forbid(unsafe_code)]
#![warn(missing_docs)]
#![warn(clippy::pedantic)]

pub mod backtest;
pub mod broker;
pub mod config;
pub mod error;
pub mod execution;
pub mod feed;
pub mod models;
pub mod observability;
pub mod options;
pub mod pricing;
pub mod resilience;
pub mod risk;
pub mod safety;
pub mod server;

// Re-export commonly used types
pub use backtest::{
    BacktestConfig, Candle, FillResult, MultiLegFillResult, SimOrder, SimPosition, SimTrade,
    SimulationEngine, simulate_limit_order, simulate_market_order, simulate_multi_leg_order,
    simulate_order,
};
pub use error::{ErrorCode, ExecutionError, HttpErrorResponse};
pub use execution::{AlpacaAdapter, BacktestAdapter, ExecutionGateway, OrderStateManager};
pub use models::{
    ConstraintCheckRequest, ConstraintCheckResponse, DecisionPlan, Environment, ExecutionAck,
    OrderState, SubmitOrdersRequest,
};
pub use options::{
    AssignmentRisk, AssignmentRiskLevel, EarlyExerciseAlert, EarlyExerciseRisk, Greeks,
    MultiLegOrder, MultiLegPosition, MultiLegValidationResult, OptionContract, OptionLeg,
    OptionStyle, OptionType, PositionLimits, PositionTracker, aggregate_greeks,
    assess_early_exercise_risk, calculate_assignment_risk, calculate_portfolio_greeks,
    validate_leg_ratios, validate_multi_leg_order,
};
pub use pricing::{
    IvError, IvSolver, IvSolverConfig, LegDirection, OptionKind, OptionsStrategy, StrategyBuilder,
    StrategyBuilderConfig, StrategyError, StrategyLeg, StrategyType,
};
pub use risk::{
    ConstraintValidator, PositionSizer, PositionSizerConfig, SizingError, SizingInput,
    SizingResult, SizingUnit,
};
pub use safety::{
    DisconnectHandler, GtcOrderPolicy, MassCancelConfig, MassCancelEvent, MassCancelResult,
    SafetyError,
};
pub use server::ExecutionServer;
