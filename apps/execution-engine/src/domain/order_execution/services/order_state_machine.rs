//! Order State Machine Service
//!
//! Validates state transitions according to FIX protocol.

use crate::domain::order_execution::errors::OrderError;
use crate::domain::order_execution::value_objects::OrderStatus;

/// Order State Machine for validating transitions.
///
/// Implements FIX protocol order state transitions.
pub struct OrderStateMachine;

impl OrderStateMachine {
    /// Check if a state transition is valid.
    #[must_use]
    pub fn is_valid_transition(from: OrderStatus, to: OrderStatus) -> bool {
        matches!(
            (from, to),
            // From New
            (OrderStatus::New, OrderStatus::PendingNew)
                | (OrderStatus::New, OrderStatus::Accepted)
                | (OrderStatus::New, OrderStatus::Rejected)
                | (OrderStatus::New, OrderStatus::Canceled)
                // From PendingNew
                | (OrderStatus::PendingNew, OrderStatus::Accepted)
                | (OrderStatus::PendingNew, OrderStatus::Rejected)
                | (OrderStatus::PendingNew, OrderStatus::Canceled)
                // From Accepted
                | (OrderStatus::Accepted, OrderStatus::PartiallyFilled)
                | (OrderStatus::Accepted, OrderStatus::Filled)
                | (OrderStatus::Accepted, OrderStatus::PendingCancel)
                | (OrderStatus::Accepted, OrderStatus::Canceled)
                | (OrderStatus::Accepted, OrderStatus::Expired)
                // From PartiallyFilled
                | (OrderStatus::PartiallyFilled, OrderStatus::PartiallyFilled)
                | (OrderStatus::PartiallyFilled, OrderStatus::Filled)
                | (OrderStatus::PartiallyFilled, OrderStatus::PendingCancel)
                | (OrderStatus::PartiallyFilled, OrderStatus::Canceled)
                | (OrderStatus::PartiallyFilled, OrderStatus::Expired)
                // From PendingCancel
                | (OrderStatus::PendingCancel, OrderStatus::Canceled)
                | (OrderStatus::PendingCancel, OrderStatus::Filled)
                | (OrderStatus::PendingCancel, OrderStatus::PartiallyFilled)
        )
    }

    /// Validate a state transition.
    ///
    /// # Errors
    ///
    /// Returns error if the transition is invalid.
    pub fn validate_transition(from: OrderStatus, to: OrderStatus) -> Result<(), OrderError> {
        if Self::is_valid_transition(from, to) {
            Ok(())
        } else {
            Err(OrderError::InvalidStateTransition {
                from,
                to,
                reason: Self::transition_error_reason(from, to),
            })
        }
    }

    /// Get a human-readable reason for an invalid transition.
    #[must_use]
    pub fn transition_error_reason(from: OrderStatus, to: OrderStatus) -> String {
        match from {
            OrderStatus::Filled => format!("Order is already filled, cannot transition to {to}"),
            OrderStatus::Canceled => format!("Order is canceled, cannot transition to {to}"),
            OrderStatus::Rejected => format!("Order was rejected, cannot transition to {to}"),
            OrderStatus::Expired => format!("Order has expired, cannot transition to {to}"),
            _ => format!("Invalid transition from {from} to {to}"),
        }
    }

    /// Get all valid next states from a given state.
    #[must_use]
    pub fn valid_next_states(from: OrderStatus) -> Vec<OrderStatus> {
        match from {
            OrderStatus::New => vec![
                OrderStatus::PendingNew,
                OrderStatus::Accepted,
                OrderStatus::Rejected,
                OrderStatus::Canceled,
            ],
            OrderStatus::PendingNew => vec![
                OrderStatus::Accepted,
                OrderStatus::Rejected,
                OrderStatus::Canceled,
            ],
            OrderStatus::Accepted => vec![
                OrderStatus::PartiallyFilled,
                OrderStatus::Filled,
                OrderStatus::PendingCancel,
                OrderStatus::Canceled,
                OrderStatus::Expired,
            ],
            OrderStatus::PartiallyFilled => vec![
                OrderStatus::PartiallyFilled,
                OrderStatus::Filled,
                OrderStatus::PendingCancel,
                OrderStatus::Canceled,
                OrderStatus::Expired,
            ],
            OrderStatus::PendingCancel => vec![
                OrderStatus::Canceled,
                OrderStatus::Filled,
                OrderStatus::PartiallyFilled,
            ],
            // Terminal states
            OrderStatus::Filled
            | OrderStatus::Canceled
            | OrderStatus::Rejected
            | OrderStatus::Expired => vec![],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_transitions_from_new() {
        assert!(OrderStateMachine::is_valid_transition(
            OrderStatus::New,
            OrderStatus::Accepted
        ));
        assert!(OrderStateMachine::is_valid_transition(
            OrderStatus::New,
            OrderStatus::Rejected
        ));
        assert!(OrderStateMachine::is_valid_transition(
            OrderStatus::New,
            OrderStatus::Canceled
        ));
    }

    #[test]
    fn invalid_transitions_from_new() {
        assert!(!OrderStateMachine::is_valid_transition(
            OrderStatus::New,
            OrderStatus::Filled
        ));
        assert!(!OrderStateMachine::is_valid_transition(
            OrderStatus::New,
            OrderStatus::PartiallyFilled
        ));
    }

    #[test]
    fn valid_transitions_from_accepted() {
        assert!(OrderStateMachine::is_valid_transition(
            OrderStatus::Accepted,
            OrderStatus::PartiallyFilled
        ));
        assert!(OrderStateMachine::is_valid_transition(
            OrderStatus::Accepted,
            OrderStatus::Filled
        ));
        assert!(OrderStateMachine::is_valid_transition(
            OrderStatus::Accepted,
            OrderStatus::Canceled
        ));
    }

    #[test]
    fn valid_transitions_from_partially_filled() {
        assert!(OrderStateMachine::is_valid_transition(
            OrderStatus::PartiallyFilled,
            OrderStatus::PartiallyFilled
        ));
        assert!(OrderStateMachine::is_valid_transition(
            OrderStatus::PartiallyFilled,
            OrderStatus::Filled
        ));
        assert!(OrderStateMachine::is_valid_transition(
            OrderStatus::PartiallyFilled,
            OrderStatus::Canceled
        ));
    }

    #[test]
    fn no_transitions_from_terminal_states() {
        for terminal in [
            OrderStatus::Filled,
            OrderStatus::Canceled,
            OrderStatus::Rejected,
            OrderStatus::Expired,
        ] {
            assert!(OrderStateMachine::valid_next_states(terminal).is_empty());
        }
    }

    #[test]
    fn validate_transition_returns_error_for_invalid() {
        let result =
            OrderStateMachine::validate_transition(OrderStatus::Filled, OrderStatus::Canceled);
        assert!(result.is_err());
    }

    #[test]
    fn validate_transition_returns_ok_for_valid() {
        let result =
            OrderStateMachine::validate_transition(OrderStatus::New, OrderStatus::Accepted);
        assert!(result.is_ok());
    }

    #[test]
    fn transition_error_reason_terminal_states() {
        let reason =
            OrderStateMachine::transition_error_reason(OrderStatus::Filled, OrderStatus::Canceled);
        assert!(reason.contains("already filled"));
    }

    #[test]
    fn valid_next_states_from_new() {
        let states = OrderStateMachine::valid_next_states(OrderStatus::New);
        assert!(states.contains(&OrderStatus::Accepted));
        assert!(states.contains(&OrderStatus::Rejected));
        assert!(!states.contains(&OrderStatus::Filled));
    }

    #[test]
    fn pending_cancel_can_still_fill() {
        assert!(OrderStateMachine::is_valid_transition(
            OrderStatus::PendingCancel,
            OrderStatus::Filled
        ));
        assert!(OrderStateMachine::is_valid_transition(
            OrderStatus::PendingCancel,
            OrderStatus::PartiallyFilled
        ));
    }
}
