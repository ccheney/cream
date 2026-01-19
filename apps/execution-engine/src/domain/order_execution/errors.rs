//! Order execution errors.

use std::fmt;

use super::value_objects::OrderStatus;

/// Errors that can occur in order execution.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OrderError {
    /// Invalid state transition attempted.
    InvalidStateTransition {
        /// Current order status.
        from: OrderStatus,
        /// Attempted status.
        to: OrderStatus,
        /// Reason for failure.
        reason: String,
    },

    /// Order cannot be filled in current state.
    CannotFill {
        /// Current status.
        status: OrderStatus,
    },

    /// Order cannot be canceled in current state.
    CannotCancel {
        /// Current status.
        status: OrderStatus,
    },

    /// Fill quantity exceeds remaining quantity.
    FillExceedsRemaining {
        /// Fill quantity attempted.
        fill_qty: String,
        /// Remaining quantity.
        remaining_qty: String,
    },

    /// FIX protocol invariant violated.
    FixInvariantViolation {
        /// Invariant description.
        invariant: String,
        /// Current state values.
        state: String,
    },

    /// Invalid order parameters.
    InvalidParameters {
        /// Field with invalid value.
        field: String,
        /// Error message.
        message: String,
    },

    /// Order not found.
    NotFound {
        /// Order ID.
        order_id: String,
    },

    /// Duplicate order ID.
    DuplicateOrderId {
        /// Order ID.
        order_id: String,
    },
}

impl fmt::Display for OrderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidStateTransition { from, to, reason } => {
                write!(
                    f,
                    "Invalid order state transition: {from} -> {to}: {reason}"
                )
            }
            Self::CannotFill { status } => {
                write!(f, "Cannot fill order in status: {status}")
            }
            Self::CannotCancel { status } => {
                write!(f, "Cannot cancel order in status: {status}")
            }
            Self::FillExceedsRemaining {
                fill_qty,
                remaining_qty,
            } => {
                write!(
                    f,
                    "Fill quantity {fill_qty} exceeds remaining {remaining_qty}"
                )
            }
            Self::FixInvariantViolation { invariant, state } => {
                write!(f, "FIX invariant violation: {invariant} (state: {state})")
            }
            Self::InvalidParameters { field, message } => {
                write!(f, "Invalid order parameter '{field}': {message}")
            }
            Self::NotFound { order_id } => {
                write!(f, "Order not found: {order_id}")
            }
            Self::DuplicateOrderId { order_id } => {
                write!(f, "Duplicate order ID: {order_id}")
            }
        }
    }
}

impl std::error::Error for OrderError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn order_error_invalid_state_transition_display() {
        let err = OrderError::InvalidStateTransition {
            from: OrderStatus::New,
            to: OrderStatus::Filled,
            reason: "Order must be accepted first".to_string(),
        };
        let msg = format!("{err}");
        assert!(msg.contains("NEW"));
        assert!(msg.contains("FILLED"));
    }

    #[test]
    fn order_error_cannot_fill_display() {
        let err = OrderError::CannotFill {
            status: OrderStatus::Canceled,
        };
        let msg = format!("{err}");
        assert!(msg.contains("CANCELED"));
    }

    #[test]
    fn order_error_cannot_cancel_display() {
        let err = OrderError::CannotCancel {
            status: OrderStatus::Filled,
        };
        let msg = format!("{err}");
        assert!(msg.contains("FILLED"));
    }

    #[test]
    fn order_error_fill_exceeds_remaining_display() {
        let err = OrderError::FillExceedsRemaining {
            fill_qty: "150".to_string(),
            remaining_qty: "100".to_string(),
        };
        let msg = format!("{err}");
        assert!(msg.contains("150"));
        assert!(msg.contains("100"));
    }

    #[test]
    fn order_error_fix_invariant_display() {
        let err = OrderError::FixInvariantViolation {
            invariant: "OrderQty = CumQty + LeavesQty".to_string(),
            state: "100 != 50 + 60".to_string(),
        };
        let msg = format!("{err}");
        assert!(msg.contains("OrderQty"));
    }

    #[test]
    fn order_error_not_found_display() {
        let err = OrderError::NotFound {
            order_id: "ord-123".to_string(),
        };
        let msg = format!("{err}");
        assert!(msg.contains("ord-123"));
    }

    #[test]
    fn order_error_is_std_error() {
        let err: Box<dyn std::error::Error> = Box::new(OrderError::NotFound {
            order_id: "test".to_string(),
        });
        assert!(!err.to_string().is_empty());
    }
}
