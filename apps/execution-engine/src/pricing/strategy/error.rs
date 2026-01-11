//! Strategy error types.

use thiserror::Error;

/// Errors from strategy construction.
#[derive(Debug, Error)]
pub enum StrategyError {
    /// Invalid strike configuration.
    #[error("Invalid strike configuration: {message}")]
    InvalidStrikes {
        /// Error message.
        message: String,
    },

    /// Width constraint violated.
    #[error("Width constraint violated: {message}")]
    WidthConstraint {
        /// Error message.
        message: String,
    },

    /// Insufficient option chain data.
    #[error("Insufficient option chain: {message}")]
    InsufficientChain {
        /// Error message.
        message: String,
    },
}
