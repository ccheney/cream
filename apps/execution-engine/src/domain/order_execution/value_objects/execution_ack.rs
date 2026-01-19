//! Execution acknowledgment response.

use serde::{Deserialize, Serialize};

use crate::domain::shared::{CycleId, Timestamp};

/// Environment for trading operations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Environment {
    /// Paper trading mode - simulated orders with live data.
    Paper,
    /// Live trading mode - real orders with real money.
    Live,
}

impl Environment {
    /// Returns true if this is a live trading environment.
    #[must_use]
    pub const fn is_live(&self) -> bool {
        matches!(self, Self::Live)
    }

    /// Returns true if this is a paper trading environment.
    #[must_use]
    pub const fn is_paper(&self) -> bool {
        matches!(self, Self::Paper)
    }
}

impl std::fmt::Display for Environment {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Paper => write!(f, "PAPER"),
            Self::Live => write!(f, "LIVE"),
        }
    }
}

/// Execution acknowledgment from order submission.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionAck {
    /// Cycle ID.
    pub cycle_id: CycleId,
    /// Environment.
    pub environment: Environment,
    /// Acknowledgment timestamp.
    pub ack_time: Timestamp,
    /// Number of orders submitted.
    pub orders_submitted: usize,
    /// Number of orders accepted.
    pub orders_accepted: usize,
    /// Number of orders rejected.
    pub orders_rejected: usize,
    /// Error messages (if any).
    pub errors: Vec<ExecutionAckError>,
}

impl ExecutionAck {
    /// Create a new execution acknowledgment.
    #[must_use]
    pub fn new(cycle_id: CycleId, environment: Environment) -> Self {
        Self {
            cycle_id,
            environment,
            ack_time: Timestamp::now(),
            orders_submitted: 0,
            orders_accepted: 0,
            orders_rejected: 0,
            errors: Vec::new(),
        }
    }

    /// Check if all orders were successfully submitted.
    #[must_use]
    pub fn all_accepted(&self) -> bool {
        self.orders_rejected == 0 && self.errors.is_empty()
    }

    /// Check if any orders failed.
    #[must_use]
    pub fn has_failures(&self) -> bool {
        self.orders_rejected > 0 || !self.errors.is_empty()
    }
}

/// Error in execution acknowledgment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionAckError {
    /// Error code.
    pub code: String,
    /// Error message.
    pub message: String,
    /// Related instrument ID (if applicable).
    pub instrument_id: Option<String>,
    /// Related order ID (if applicable).
    pub order_id: Option<String>,
}

impl ExecutionAckError {
    /// Create a new execution error.
    #[must_use]
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            instrument_id: None,
            order_id: None,
        }
    }

    /// Set the instrument ID.
    #[must_use]
    pub fn with_instrument(mut self, instrument_id: impl Into<String>) -> Self {
        self.instrument_id = Some(instrument_id.into());
        self
    }

    /// Set the order ID.
    #[must_use]
    pub fn with_order(mut self, order_id: impl Into<String>) -> Self {
        self.order_id = Some(order_id.into());
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn environment_is_live() {
        assert!(Environment::Live.is_live());
        assert!(!Environment::Paper.is_live());
    }

    #[test]
    fn environment_is_paper() {
        assert!(Environment::Paper.is_paper());
        assert!(!Environment::Live.is_paper());
    }

    #[test]
    fn environment_display() {
        assert_eq!(format!("{}", Environment::Paper), "PAPER");
        assert_eq!(format!("{}", Environment::Live), "LIVE");
    }

    #[test]
    fn execution_ack_new() {
        let ack = ExecutionAck::new(CycleId::new("cycle-1"), Environment::Paper);
        assert_eq!(ack.cycle_id.as_str(), "cycle-1");
        assert_eq!(ack.environment, Environment::Paper);
        assert_eq!(ack.orders_submitted, 0);
    }

    #[test]
    fn execution_ack_all_accepted() {
        let mut ack = ExecutionAck::new(CycleId::new("cycle-1"), Environment::Paper);
        ack.orders_submitted = 5;
        ack.orders_accepted = 5;
        assert!(ack.all_accepted());
    }

    #[test]
    fn execution_ack_has_failures() {
        let mut ack = ExecutionAck::new(CycleId::new("cycle-1"), Environment::Paper);
        ack.orders_submitted = 5;
        ack.orders_accepted = 4;
        ack.orders_rejected = 1;
        assert!(ack.has_failures());
    }

    #[test]
    fn execution_ack_error_new() {
        let err = ExecutionAckError::new("TEST_ERROR", "Test message");
        assert_eq!(err.code, "TEST_ERROR");
        assert_eq!(err.message, "Test message");
        assert!(err.instrument_id.is_none());
        assert!(err.order_id.is_none());
    }

    #[test]
    fn execution_ack_error_with_context() {
        let err = ExecutionAckError::new("TEST_ERROR", "Test message")
            .with_instrument("AAPL")
            .with_order("ord-123");
        assert_eq!(err.instrument_id, Some("AAPL".to_string()));
        assert_eq!(err.order_id, Some("ord-123".to_string()));
    }

    #[test]
    fn execution_ack_serde() {
        let ack = ExecutionAck::new(CycleId::new("cycle-1"), Environment::Paper);
        let json = serde_json::to_string(&ack).unwrap();
        let parsed: ExecutionAck = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.cycle_id, ack.cycle_id);
    }
}
