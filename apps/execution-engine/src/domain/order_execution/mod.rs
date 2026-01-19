//! Order Execution Bounded Context
//!
//! Manages the complete order lifecycle from submission to completion,
//! following FIX protocol semantics.
//!
//! # Key Concepts
//!
//! - **Order Aggregate**: The root entity managing order state transitions
//! - **Partial Fills**: FIX-compliant tracking with `OrderQty = CumQty + LeavesQty`
//! - **Domain Events**: Capturing all state transitions

pub mod aggregate;
pub mod errors;
pub mod events;
pub mod repository;
pub mod services;
pub mod value_objects;

pub use aggregate::{Order, OrderLine};
pub use errors::OrderError;
pub use events::{
    OrderAccepted, OrderCanceled, OrderEvent, OrderFilled, OrderPartiallyFilled, OrderRejected,
    OrderSubmitted,
};
pub use repository::OrderRepository;
pub use services::OrderStateMachine;
pub use value_objects::{
    CancelReason, ExecutionAck, FillReport, OrderPurpose, OrderSide, OrderStatus, OrderType,
    PartialFillState, PartialFillTimeoutAction, PartialFillTimeoutConfig, RejectReason,
    TimeInForce,
};
