//! Shared Domain Types
//!
//! Value objects and errors shared across bounded contexts.

pub mod errors;
pub mod value_objects;

pub use errors::DomainError;
pub use value_objects::{
    BrokerId, CycleId, DecisionId, InstrumentId, Money, OrderId, PlanId, Quantity, Symbol,
    Timestamp,
};
