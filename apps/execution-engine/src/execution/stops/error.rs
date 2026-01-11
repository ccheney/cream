//! Stop/target error types.

use thiserror::Error;

/// Errors that can occur during stop/target operations.
#[derive(Debug, Error)]
pub enum StopsError {
    /// Stop loss level is invalid.
    #[error("Invalid stop loss: {0}")]
    InvalidStopLoss(String),

    /// Take profit level is invalid.
    #[error("Invalid take profit: {0}")]
    InvalidTakeProfit(String),

    /// Validation failed.
    #[error("Validation failed: {0}")]
    ValidationFailed(String),

    /// Bracket order not supported for this instrument.
    #[error("Bracket orders not supported: {0}")]
    BracketNotSupported(String),

    /// Price monitoring error.
    #[error("Price monitoring error: {0}")]
    MonitoringError(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display() {
        let err = StopsError::InvalidStopLoss("test message".to_string());
        assert_eq!(err.to_string(), "Invalid stop loss: test message");

        let err = StopsError::InvalidTakeProfit("test message".to_string());
        assert_eq!(err.to_string(), "Invalid take profit: test message");

        let err = StopsError::ValidationFailed("test message".to_string());
        assert_eq!(err.to_string(), "Validation failed: test message");

        let err = StopsError::BracketNotSupported("test message".to_string());
        assert_eq!(
            err.to_string(),
            "Bracket orders not supported: test message"
        );

        let err = StopsError::MonitoringError("test message".to_string());
        assert_eq!(err.to_string(), "Price monitoring error: test message");
    }
}
