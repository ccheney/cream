//! Execution Tactics Errors

use thiserror::Error;

/// Errors that can occur during tactic execution.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum TacticError {
    /// Invalid configuration provided.
    #[error("Invalid tactic configuration: {message}")]
    InvalidConfiguration {
        /// Error details.
        message: String,
    },

    /// Execution window has ended.
    #[error("Execution window has ended")]
    WindowEnded,

    /// No slices remaining to execute.
    #[error("No slices remaining to execute")]
    NoSlicesRemaining,

    /// Invalid quantity for slice.
    #[error("Invalid slice quantity: {quantity}")]
    InvalidSliceQuantity {
        /// The invalid quantity value.
        quantity: String,
    },

    /// Tactic mismatch.
    #[error("Tactic mismatch: expected {expected}, got {actual}")]
    TacticMismatch {
        /// Expected tactic type.
        expected: String,
        /// Actual tactic type.
        actual: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_display() {
        let err = TacticError::InvalidConfiguration {
            message: "invalid duration".to_string(),
        };
        assert_eq!(
            err.to_string(),
            "Invalid tactic configuration: invalid duration"
        );

        let err = TacticError::WindowEnded;
        assert_eq!(err.to_string(), "Execution window has ended");

        let err = TacticError::NoSlicesRemaining;
        assert_eq!(err.to_string(), "No slices remaining to execute");
    }
}
