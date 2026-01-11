//! Order execution gateway.
//!
//! This module provides the central gateway for order execution, including:
//! - Generic `BrokerAdapter` trait for broker integrations
//! - Order routing logic with constraint validation
//! - Order state tracking with FIX protocol semantics
//! - Cancel order functionality
//! - Circuit breaker integration for broker resilience
//!
//! # Module Structure
//!
//! - [`adapter`]: Broker adapter trait definition
//! - [`core`]: Execution gateway implementation
//! - [`mock`]: Mock broker adapter for testing
//! - [`types`]: Error types for gateway operations

mod adapter;
mod core;
mod mock;
mod types;

pub use adapter::BrokerAdapter;
pub use core::ExecutionGateway;
pub use mock::MockBrokerAdapter;
pub use types::{BrokerError, CancelOrderError, SubmitOrdersError};
