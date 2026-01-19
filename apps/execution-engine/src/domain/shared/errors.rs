//! Domain errors for the execution engine.

use std::fmt;

/// Domain-level errors that can occur in business logic.
///
/// These errors are independent of infrastructure concerns.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DomainError {
    /// Invalid state transition attempted.
    InvalidStateTransition {
        /// Entity type (e.g., "Order").
        entity: String,
        /// Current state.
        from: String,
        /// Attempted state.
        to: String,
        /// Reason for failure.
        reason: String,
    },

    /// Invalid value for a field.
    InvalidValue {
        /// Field name.
        field: String,
        /// Error message.
        message: String,
    },

    /// Business rule violation.
    BusinessRuleViolation {
        /// Rule name or code.
        rule: String,
        /// Description of the violation.
        message: String,
    },

    /// Entity not found.
    NotFound {
        /// Entity type.
        entity_type: String,
        /// Entity identifier.
        id: String,
    },

    /// Aggregate invariant violated.
    InvariantViolation {
        /// Aggregate type.
        aggregate: String,
        /// Invariant that was violated.
        invariant: String,
        /// Current state description.
        state: String,
    },

    /// Constraint validation failed.
    ConstraintViolation {
        /// Constraint code.
        code: String,
        /// Human-readable message.
        message: String,
    },

    /// FIX protocol error.
    FixProtocolError {
        /// FIX error code.
        code: String,
        /// Error message.
        message: String,
    },
}

impl fmt::Display for DomainError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidStateTransition {
                entity,
                from,
                to,
                reason,
            } => {
                write!(
                    f,
                    "Invalid state transition for {entity}: {from} -> {to}: {reason}"
                )
            }
            Self::InvalidValue { field, message } => {
                write!(f, "Invalid value for '{field}': {message}")
            }
            Self::BusinessRuleViolation { rule, message } => {
                write!(f, "Business rule '{rule}' violated: {message}")
            }
            Self::NotFound { entity_type, id } => {
                write!(f, "{entity_type} not found: {id}")
            }
            Self::InvariantViolation {
                aggregate,
                invariant,
                state,
            } => {
                write!(
                    f,
                    "Invariant violation in {aggregate}: {invariant} (state: {state})"
                )
            }
            Self::ConstraintViolation { code, message } => {
                write!(f, "Constraint violation [{code}]: {message}")
            }
            Self::FixProtocolError { code, message } => {
                write!(f, "FIX protocol error [{code}]: {message}")
            }
        }
    }
}

impl std::error::Error for DomainError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn domain_error_invalid_state_transition_display() {
        let err = DomainError::InvalidStateTransition {
            entity: "Order".to_string(),
            from: "New".to_string(),
            to: "Filled".to_string(),
            reason: "Order must be accepted first".to_string(),
        };
        let msg = format!("{err}");
        assert!(msg.contains("Order"));
        assert!(msg.contains("New"));
        assert!(msg.contains("Filled"));
    }

    #[test]
    fn domain_error_invalid_value_display() {
        let err = DomainError::InvalidValue {
            field: "quantity".to_string(),
            message: "must be positive".to_string(),
        };
        let msg = format!("{err}");
        assert!(msg.contains("quantity"));
        assert!(msg.contains("positive"));
    }

    #[test]
    fn domain_error_business_rule_display() {
        let err = DomainError::BusinessRuleViolation {
            rule: "PDT_CHECK".to_string(),
            message: "Pattern day trader limit exceeded".to_string(),
        };
        let msg = format!("{err}");
        assert!(msg.contains("PDT_CHECK"));
    }

    #[test]
    fn domain_error_not_found_display() {
        let err = DomainError::NotFound {
            entity_type: "Order".to_string(),
            id: "ord-123".to_string(),
        };
        let msg = format!("{err}");
        assert!(msg.contains("Order"));
        assert!(msg.contains("ord-123"));
    }

    #[test]
    fn domain_error_invariant_display() {
        let err = DomainError::InvariantViolation {
            aggregate: "Order".to_string(),
            invariant: "OrderQty = CumQty + LeavesQty".to_string(),
            state: "CumQty=50, LeavesQty=60, OrderQty=100".to_string(),
        };
        let msg = format!("{err}");
        assert!(msg.contains("OrderQty = CumQty + LeavesQty"));
    }

    #[test]
    fn domain_error_constraint_display() {
        let err = DomainError::ConstraintViolation {
            code: "MAX_NOTIONAL".to_string(),
            message: "Exceeds $50,000 limit".to_string(),
        };
        let msg = format!("{err}");
        assert!(msg.contains("MAX_NOTIONAL"));
    }

    #[test]
    fn domain_error_fix_protocol_display() {
        let err = DomainError::FixProtocolError {
            code: "39=8".to_string(),
            message: "Order rejected by exchange".to_string(),
        };
        let msg = format!("{err}");
        assert!(msg.contains("39=8"));
    }

    #[test]
    fn domain_error_is_std_error() {
        let err: Box<dyn std::error::Error> = Box::new(DomainError::InvalidValue {
            field: "test".to_string(),
            message: "test".to_string(),
        });
        assert!(!err.to_string().is_empty());
    }
}
