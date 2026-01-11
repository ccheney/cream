//! Error types for position sizing calculations.

use rust_decimal::Decimal;
use std::fmt;

/// Error during position sizing calculation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SizingError {
    /// Invalid input (zero or negative price, etc.).
    InvalidInput(String),
    /// Position would exceed maximum allowed size.
    ExceedsMaxPosition {
        /// Number of shares requested.
        requested: u64,
        /// Maximum allowed position size.
        max: u64,
    },
    /// Position is below minimum order size.
    BelowMinimum {
        /// Calculated position size in shares.
        calculated: u64,
        /// Minimum required order size.
        min: u64,
    },
    /// Insufficient cash for the position.
    InsufficientCash {
        /// Amount of cash required for the trade.
        required: Decimal,
        /// Amount of cash currently available.
        available: Decimal,
    },
    /// Zero equity for percentage-based sizing.
    ZeroEquity,
}

impl fmt::Display for SizingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInput(msg) => write!(f, "Invalid input: {msg}"),
            Self::ExceedsMaxPosition { requested, max } => {
                write!(f, "Position size {requested} exceeds maximum {max}")
            }
            Self::BelowMinimum { calculated, min } => {
                write!(f, "Calculated size {calculated} is below minimum {min}")
            }
            Self::InsufficientCash {
                required,
                available,
            } => {
                write!(
                    f,
                    "Insufficient cash: required {required}, available {available}"
                )
            }
            Self::ZeroEquity => write!(f, "Cannot calculate percentage of zero equity"),
        }
    }
}

impl std::error::Error for SizingError {}
