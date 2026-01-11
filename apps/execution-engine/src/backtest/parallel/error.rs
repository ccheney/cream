//! Error types for parallel backtesting operations.

use thiserror::Error;

/// Errors from parallel backtesting operations.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum ParallelError {
    /// Thread pool initialization failed.
    #[error("Failed to initialize thread pool: {message}")]
    ThreadPoolError {
        /// Error message.
        message: String,
    },

    /// Backtest execution failed.
    #[error("Backtest failed for job '{job_id}': {message}")]
    BacktestFailed {
        /// Job identifier.
        job_id: String,
        /// Error message.
        message: String,
    },

    /// Parameter combination is invalid.
    #[error("Invalid parameter combination: {message}")]
    InvalidParameters {
        /// Error message.
        message: String,
    },

    /// No jobs to execute.
    #[error("No backtest jobs provided")]
    NoJobs,

    /// Timeout exceeded.
    #[error("Backtest timed out after {seconds}s")]
    Timeout {
        /// Timeout duration in seconds.
        seconds: u64,
    },
}
