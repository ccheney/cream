//! Alpaca-specific error types.

use thiserror::Error;

use crate::execution::gateway::BrokerError;

/// Errors from the Alpaca adapter.
#[derive(Debug, Error)]
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
}

impl From<reqwest::Error> for AlpacaError {
    fn from(err: reqwest::Error) -> Self {
        Self::Network(err.to_string())
    }
}

impl From<serde_json::Error> for AlpacaError {
    fn from(err: serde_json::Error) -> Self {
        Self::JsonParse(err.to_string())
    }
}

impl From<AlpacaError> for BrokerError {
    fn from(err: AlpacaError) -> Self {
        match err {
            AlpacaError::Http(msg) | AlpacaError::Network(msg) | AlpacaError::JsonParse(msg) => {
                Self::Http(msg)
            }
            AlpacaError::Api { code, message } => Self::Api { code, message },
            AlpacaError::OrderRejected(msg) | AlpacaError::InvalidOrder(msg) => {
                Self::OrderRejected(msg)
            }
            AlpacaError::AuthenticationFailed => Self::AuthenticationFailed,
            AlpacaError::RateLimited { retry_after_secs } => Self::RateLimited { retry_after_secs },
            AlpacaError::EnvironmentMismatch { expected, actual } => {
                Self::EnvironmentMismatch { expected, actual }
            }
            AlpacaError::MaxRetriesExceeded { attempts: _ } => {
                Self::Http("Max retries exceeded".to_string())
            }
        }
    }
}
