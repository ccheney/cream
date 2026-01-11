//! Core option contract types.
//!
//! Defines the fundamental types for options contracts including
//! option type (call/put), style (American/European), and contract details.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Option type (call or put).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OptionType {
    /// Call option (right to buy).
    Call,
    /// Put option (right to sell).
    Put,
}

impl std::fmt::Display for OptionType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Call => write!(f, "Call"),
            Self::Put => write!(f, "Put"),
        }
    }
}

/// Option style (American or European).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OptionStyle {
    /// American - can be exercised any time before expiration.
    American,
    /// European - can only be exercised at expiration.
    European,
}

/// An option contract.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionContract {
    /// Unique contract identifier (e.g., `"AAPL240119C00150000"`).
    pub contract_id: String,
    /// Underlying symbol.
    pub underlying_symbol: String,
    /// Strike price.
    pub strike: Decimal,
    /// Expiration date (ISO 8601).
    pub expiration: String,
    /// Option type (call/put).
    pub option_type: OptionType,
    /// Option style (American/European).
    pub style: OptionStyle,
    /// Contract multiplier (typically 100 for equity options).
    pub multiplier: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_option_type_display() {
        assert_eq!(format!("{}", OptionType::Call), "Call");
        assert_eq!(format!("{}", OptionType::Put), "Put");
    }

    #[test]
    fn test_option_contract_creation() {
        let contract = OptionContract {
            contract_id: "AAPL240119C00150000".to_string(),
            underlying_symbol: "AAPL".to_string(),
            strike: Decimal::new(150, 0),
            expiration: "2024-01-19".to_string(),
            option_type: OptionType::Call,
            style: OptionStyle::American,
            multiplier: 100,
        };

        assert_eq!(contract.underlying_symbol, "AAPL");
        assert_eq!(contract.option_type, OptionType::Call);
        assert_eq!(contract.style, OptionStyle::American);
    }
}
