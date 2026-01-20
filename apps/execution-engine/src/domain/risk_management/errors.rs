//! Risk management errors.

use std::fmt;

/// Errors that can occur in risk validation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RiskError {
    /// Constraint validation failed.
    ConstraintViolation {
        /// Violation code.
        code: String,
        /// Error message.
        message: String,
    },

    /// Insufficient buying power.
    InsufficientBuyingPower {
        /// Required amount.
        required: String,
        /// Available amount.
        available: String,
    },

    /// PDT violation.
    PdtViolation {
        /// Day trades remaining.
        day_trades_remaining: u8,
        /// Message.
        message: String,
    },

    /// Risk policy not found.
    PolicyNotFound {
        /// Policy ID.
        policy_id: String,
    },

    /// Invalid risk configuration.
    InvalidConfiguration {
        /// Configuration field.
        field: String,
        /// Error message.
        message: String,
    },
}

impl fmt::Display for RiskError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::ConstraintViolation { code, message } => {
                write!(f, "Constraint violation [{code}]: {message}")
            }
            Self::InsufficientBuyingPower {
                required,
                available,
            } => {
                write!(
                    f,
                    "Insufficient buying power: required {required}, available {available}"
                )
            }
            Self::PdtViolation {
                day_trades_remaining,
                message,
            } => {
                write!(
                    f,
                    "PDT violation ({day_trades_remaining} day trades remaining): {message}"
                )
            }
            Self::PolicyNotFound { policy_id } => {
                write!(f, "Risk policy not found: {policy_id}")
            }
            Self::InvalidConfiguration { field, message } => {
                write!(f, "Invalid risk configuration [{field}]: {message}")
            }
        }
    }
}

impl std::error::Error for RiskError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn risk_error_constraint_violation_display() {
        let err = RiskError::ConstraintViolation {
            code: "MAX_NOTIONAL".to_string(),
            message: "Exceeds limit".to_string(),
        };
        let msg = format!("{err}");
        assert!(msg.contains("MAX_NOTIONAL"));
    }

    #[test]
    fn risk_error_insufficient_buying_power_display() {
        let err = RiskError::InsufficientBuyingPower {
            required: "$50,000".to_string(),
            available: "$30,000".to_string(),
        };
        let msg = format!("{err}");
        assert!(msg.contains("$50,000"));
        assert!(msg.contains("$30,000"));
    }

    #[test]
    fn risk_error_pdt_violation_display() {
        let err = RiskError::PdtViolation {
            day_trades_remaining: 0,
            message: "Would exceed day trade limit".to_string(),
        };
        let msg = format!("{err}");
        assert!(msg.contains("PDT"));
    }

    #[test]
    fn risk_error_policy_not_found_display() {
        let err = RiskError::PolicyNotFound {
            policy_id: "policy-abc".to_string(),
        };
        let msg = format!("{err}");
        assert!(msg.contains("policy-abc"));
        assert!(msg.contains("not found"));
    }

    #[test]
    fn risk_error_invalid_configuration_display() {
        let err = RiskError::InvalidConfiguration {
            field: "max_loss_pct".to_string(),
            message: "must be between 0 and 1".to_string(),
        };
        let msg = format!("{err}");
        assert!(msg.contains("max_loss_pct"));
        assert!(msg.contains("between 0 and 1"));
    }

    #[test]
    fn risk_error_is_std_error() {
        let err: Box<dyn std::error::Error> = Box::new(RiskError::PolicyNotFound {
            policy_id: "test".to_string(),
        });
        assert!(!err.to_string().is_empty());
    }
}
