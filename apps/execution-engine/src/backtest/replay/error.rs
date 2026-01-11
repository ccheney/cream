//! Replay engine error types.

use thiserror::Error;

/// Replay engine errors.
#[derive(Debug, Error)]
pub enum ReplayError {
    /// IO error reading data.
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// Arrow error.
    #[error("Arrow error: {0}")]
    Arrow(String),

    /// Flight RPC error.
    #[error("Flight RPC error: {0}")]
    FlightRpc(String),

    /// No data available for instrument.
    #[error("No data for instrument: {0}")]
    NoData(String),

    /// Invalid date range.
    #[error("Invalid date range: start {0} >= end {1}")]
    InvalidDateRange(String, String),

    /// Configuration error.
    #[error("Configuration error: {0}")]
    Config(String),
}
