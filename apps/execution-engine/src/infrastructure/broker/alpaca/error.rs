//! Alpaca-specific error types.

use thiserror::Error;

use crate::application::ports::BrokerError;

/// Errors from the Alpaca adapter.
#[derive(Debug, Error, Clone)]
pub enum AlpacaError {
    /// HTTP request failed.
    #[error("HTTP error: {0}")]
    Http(String),

    /// API returned an error.
    #[error("API error: {code} - {message}")]
    Api {
        /// Error code from the API.
        code: String,
        /// Error message from the API.
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
        /// Suggested retry delay in seconds.
        retry_after_secs: u64,
    },

    /// Environment mismatch.
    #[error("Environment mismatch: expected {expected}, got {actual}")]
    EnvironmentMismatch {
        /// Expected environment.
        expected: String,
        /// Actual environment.
        actual: String,
    },

    /// Network error (retryable).
    #[error("Network error: {0}")]
    Network(String),

    /// JSON parsing error.
    #[error("JSON parsing error: {0}")]
    JsonParse(String),

    /// Max retries exceeded.
    #[error("Max retries exceeded after {attempts} attempts")]
    MaxRetriesExceeded {
        /// Number of attempts made before giving up.
        attempts: u32,
    },

    /// Invalid order request.
    #[error("Invalid order: {0}")]
    InvalidOrder(String),

    /// Order not found.
    #[error("Order not found: {order_id}")]
    OrderNotFound {
        /// The order ID that was not found.
        order_id: String,
    },
}

impl From<AlpacaError> for BrokerError {
    fn from(err: AlpacaError) -> Self {
        match err {
            AlpacaError::Http(msg) | AlpacaError::Network(msg) | AlpacaError::JsonParse(msg) => {
                Self::ConnectionError { message: msg }
            }
            AlpacaError::Api { code, message } => Self::Unknown {
                message: format!("{}: {}", code, message),
            },
            AlpacaError::OrderRejected(msg) | AlpacaError::InvalidOrder(msg) => {
                Self::OrderRejected { reason: msg }
            }
            AlpacaError::AuthenticationFailed => Self::Unknown {
                message: "Authentication failed".to_string(),
            },
            AlpacaError::RateLimited { .. } => Self::RateLimited,
            AlpacaError::EnvironmentMismatch { expected, actual } => Self::Unknown {
                message: format!(
                    "Environment mismatch: expected {}, got {}",
                    expected, actual
                ),
            },
            AlpacaError::MaxRetriesExceeded { attempts } => Self::ConnectionError {
                message: format!("Max retries exceeded after {} attempts", attempts),
            },
            AlpacaError::OrderNotFound { order_id } => Self::OrderNotFound { order_id },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alpaca_error_to_broker_error_http() {
        let err = AlpacaError::Http("connection refused".to_string());
        let broker_err: BrokerError = err.into();
        assert!(matches!(broker_err, BrokerError::ConnectionError { .. }));
    }

    #[test]
    fn alpaca_error_to_broker_error_auth() {
        let err = AlpacaError::AuthenticationFailed;
        let broker_err: BrokerError = err.into();
        assert!(matches!(broker_err, BrokerError::Unknown { .. }));
    }

    #[test]
    fn alpaca_error_to_broker_error_rate_limited() {
        let err = AlpacaError::RateLimited {
            retry_after_secs: 60,
        };
        let broker_err: BrokerError = err.into();
        assert!(matches!(broker_err, BrokerError::RateLimited));
    }

    #[test]
    fn alpaca_error_to_broker_error_order_rejected() {
        let err = AlpacaError::OrderRejected("insufficient funds".to_string());
        let broker_err: BrokerError = err.into();
        assert!(matches!(broker_err, BrokerError::OrderRejected { .. }));
    }

    #[test]
    fn alpaca_error_to_broker_error_order_not_found() {
        let err = AlpacaError::OrderNotFound {
            order_id: "abc123".to_string(),
        };
        let broker_err: BrokerError = err.into();
        assert!(matches!(broker_err, BrokerError::OrderNotFound { .. }));
    }
}
