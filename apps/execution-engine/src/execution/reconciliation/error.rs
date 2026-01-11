//! Reconciliation error types.
//!
//! Error types for reconciliation operations.

/// Errors from reconciliation operations.
#[derive(Debug, thiserror::Error)]
pub enum ReconciliationError {
    /// Broker API error.
    #[error("Broker error: {0}")]
    BrokerError(String),

    /// Invalid state for operation.
    #[error("Invalid state: {0}")]
    InvalidState(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_broker_error_display() {
        let err = ReconciliationError::BrokerError("connection failed".to_string());
        assert_eq!(format!("{err}"), "Broker error: connection failed");
    }

    #[test]
    fn test_invalid_state_error_display() {
        let err = ReconciliationError::InvalidState("order not found".to_string());
        assert_eq!(format!("{err}"), "Invalid state: order not found");
    }
}
