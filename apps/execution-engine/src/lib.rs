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

pub mod broker;
pub mod config;
pub mod error;
pub mod execution;
pub mod models;
pub mod observability;
pub mod options;
pub mod resilience;
pub mod risk;
pub mod server;

// Re-export commonly used types
pub use error::{ErrorCode, ExecutionError, HttpErrorResponse};
pub use execution::{AlpacaAdapter, ExecutionGateway, OrderStateManager};
pub use models::{
    ConstraintCheckRequest, ConstraintCheckResponse, DecisionPlan, Environment, ExecutionAck,
    OrderState, SubmitOrdersRequest,
};
pub use options::{
    aggregate_greeks, assess_early_exercise_risk, calculate_assignment_risk,
    calculate_portfolio_greeks, validate_leg_ratios, validate_multi_leg_order, AssignmentRisk,
    AssignmentRiskLevel, EarlyExerciseAlert, EarlyExerciseRisk, Greeks, MultiLegOrder,
    MultiLegPosition, MultiLegValidationResult, OptionContract, OptionLeg, OptionStyle, OptionType,
    PositionLimits, PositionTracker,
};
pub use risk::ConstraintValidator;
pub use server::ExecutionServer;
