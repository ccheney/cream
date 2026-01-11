//! Error types for gateway operations.

/// Errors from broker operations.
#[derive(Debug, thiserror::Error)]
pub enum BrokerError {
    /// HTTP request failed.
    #[error("HTTP error: {0}")]
    Http(String),

    /// API returned an error.
    #[error("API error: {code} - {message}")]
    Api {
        /// Error code from broker.
        code: String,
        /// Error message from broker.
        message: String,
    },

    /// Order was rejected.
    #[error("Order rejected: {0}")]
    OrderRejected(String),

    /// Authentication failed.
    #[error("Authentication failed")]
    AuthenticationFailed,

    /// Rate limited.
    #[error("Rate limited, retry after {retry_after_secs}s")]
    RateLimited {
        /// Seconds to wait before retrying.
        retry_after_secs: u64,
    },

    /// Environment mismatch.
    #[error("Environment mismatch: expected {expected}, got {actual}")]
    EnvironmentMismatch {
        /// Expected environment.
        expected: String,
        /// Actual environment in request.
        actual: String,
    },

    /// Order not found.
    #[error("Order not found: {0}")]
    OrderNotFound(String),

    /// Order cannot be canceled (already in terminal state).
    #[error("Order cannot be canceled: {0}")]
    OrderNotCancelable(String),
}

/// Errors from order submission.
#[derive(Debug, thiserror::Error)]
pub enum SubmitOrdersError {
    /// Constraint validation failed.
    #[error("Constraint validation failed: {0}")]
    ConstraintViolation(String),

    /// Broker returned an error.
    #[error("Broker error: {0}")]
    BrokerError(String),

    /// Circuit breaker is open, broker calls are not permitted.
    #[error("Circuit breaker open: {0}")]
    CircuitOpen(String),
}

/// Errors from order cancellation.
#[derive(Debug, thiserror::Error)]
pub enum CancelOrderError {
    /// Order not found in state manager.
    #[error("Order not found: {0}")]
    OrderNotFound(String),

    /// Order cannot be canceled (already in terminal state).
    #[error("Order not cancelable: {0}")]
    OrderNotCancelable(String),

    /// Broker returned an error.
    #[error("Broker error: {0}")]
    BrokerError(String),

    /// Circuit breaker is open, broker calls are not permitted.
    #[error("Circuit breaker open: {0}")]
    CircuitOpen(String),
}
