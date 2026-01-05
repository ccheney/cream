//! Resilience patterns for external service calls.
//!
//! This module provides circuit breakers, bulkheads, and other
//! resilience patterns for handling external service failures.

mod circuit_breaker;

pub use circuit_breaker::{
    CircuitBreaker, CircuitBreakerConfig, CircuitBreakerState, ServiceCircuitBreakers,
};
