//! Option Position Errors

use thiserror::Error;

/// Errors that can occur with option positions.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum OptionPositionError {
    /// Invalid option contract.
    #[error("Invalid option contract: {message}")]
    InvalidContract { message: String },

    /// Invalid spread configuration.
    #[error("Invalid spread configuration: {message}")]
    InvalidSpread { message: String },

    /// Position not found.
    #[error("Position not found: {position_id}")]
    PositionNotFound { position_id: String },

    /// Invalid leg configuration.
    #[error("Invalid leg: {message}")]
    InvalidLeg { message: String },

    /// Greeks calculation error.
    #[error("Greeks calculation error: {message}")]
    GreeksError { message: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_display() {
        let err = OptionPositionError::InvalidContract {
            message: "expired option".to_string(),
        };
        assert_eq!(err.to_string(), "Invalid option contract: expired option");

        let err = OptionPositionError::InvalidSpread {
            message: "mismatched underlyings".to_string(),
        };
        assert_eq!(
            err.to_string(),
            "Invalid spread configuration: mismatched underlyings"
        );

        let err = OptionPositionError::PositionNotFound {
            position_id: "pos-123".to_string(),
        };
        assert_eq!(err.to_string(), "Position not found: pos-123");
    }
}
