//! Roll operation errors.

use serde::{Deserialize, Serialize};

/// Errors during rolling operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RollError {
    /// Invalid order specification.
    InvalidOrder(String),
    /// Partial fill not recoverable.
    PartialFillUnrecoverable(String),
    /// Assignment occurred during roll.
    AssignmentDuringRoll(String),
    /// Broker rejected order.
    BrokerRejection(String),
    /// Timeout exceeded.
    Timeout(String),
}

impl std::fmt::Display for RollError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidOrder(msg) => write!(f, "Invalid order: {msg}"),
            Self::PartialFillUnrecoverable(msg) => write!(f, "Partial fill unrecoverable: {msg}"),
            Self::AssignmentDuringRoll(msg) => write!(f, "Assignment during roll: {msg}"),
            Self::BrokerRejection(msg) => write!(f, "Broker rejected: {msg}"),
            Self::Timeout(msg) => write!(f, "Timeout: {msg}"),
        }
    }
}

impl std::error::Error for RollError {}
