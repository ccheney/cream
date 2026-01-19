//! Core domain models for the execution engine.
//!
//! These types mirror the Protobuf schemas (when available) and define
//! the data structures for orders, constraints, and execution state.

mod constraint;
mod decision;
mod environment;
mod order;

pub use constraint::{
    ConstraintCheckRequest, ConstraintCheckResponse, ConstraintViolation, ExposureLimits,
    OptionsLimits, PerInstrumentLimits, PortfolioLimits, SizingLimits, ViolationSeverity,
};
pub use decision::{
    Action, Decision, DecisionPlan, Direction, OptionLeg, PositionIntent, Size, SizeUnit,
    StrategyFamily, ThesisState, TimeHorizon,
};
pub use environment::Environment;
pub use order::{
    ExecutionAck, ExecutionError, ExecutionFill, OrderLegState, OrderPurpose, OrderSide,
    OrderState, OrderStatus, OrderType, PartialFillState, PartialFillTimeoutAction,
    PartialFillTimeoutConfig, SubmitOrdersRequest, TimeInForce,
};
