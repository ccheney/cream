//! Stop Enforcement Errors

use thiserror::Error;

/// Errors that can occur during stop enforcement.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum StopEnforcementError {
    /// Position not found.
    #[error("Position not found: {position_id}")]
    PositionNotFound {
        /// The missing position ID.
        position_id: String,
    },

    /// Invalid stop/target configuration.
    #[error("Invalid stop/target levels: {message}")]
    InvalidLevels {
        /// Error details.
        message: String,
    },

    /// Position already being monitored.
    #[error("Position already monitored: {position_id}")]
    AlreadyMonitored {
        /// The already monitored position ID.
        position_id: String,
    },

    /// Monitoring failed.
    #[error("Monitoring error: {message}")]
    MonitoringError {
        /// Error details.
        message: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_display() {
        let err = StopEnforcementError::PositionNotFound {
            position_id: "pos-123".to_string(),
        };
        assert_eq!(err.to_string(), "Position not found: pos-123");

        let err = StopEnforcementError::InvalidLevels {
            message: "stop above entry".to_string(),
        };
        assert_eq!(
            err.to_string(),
            "Invalid stop/target levels: stop above entry"
        );

        let err = StopEnforcementError::AlreadyMonitored {
            position_id: "pos-123".to_string(),
        };
        assert_eq!(err.to_string(), "Position already monitored: pos-123");
    }
}
