//! Broker integration and resilience patterns.
//!
//! This module provides broker adapters with retry policies,
//! circuit breakers, and error handling for API calls.

mod retry;

pub use retry::{
    AlpacaErrorHandler, BrokerRetryPolicy, ErrorCategory, ExponentialBackoffCalculator,
    RetryAfterExtractor, is_retryable_error, is_retryable_status,
};
