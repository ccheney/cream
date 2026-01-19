//! Order Execution Domain Services
//!
//! Stateless business logic that doesn't fit in aggregates.

mod order_state_machine;

pub use order_state_machine::OrderStateMachine;
