//! Symbol value object for instrument identifiers.

use serde::{Deserialize, Serialize};
use std::fmt;

use crate::domain::shared::DomainError;

/// A trading symbol (ticker or OCC option symbol).
///
/// Examples:
/// - Equity: "AAPL", "MSFT", "GOOGL"
/// - Option: "AAPL250117P00190000" (OCC format)
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Symbol(String);

impl Symbol {
    /// Create a new Symbol.
    ///
    /// The symbol is normalized to uppercase.
    #[must_use]
    pub fn new(value: impl Into<String>) -> Self {
        Self(value.into().to_uppercase())
    }

    /// Get the symbol string.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Consume and return the inner string.
    #[must_use]
    pub fn into_inner(self) -> String {
        self.0
    }

    /// Check if this is an option symbol (OCC format).
    ///
    /// OCC format: `{ROOT}{YY}{MM}{DD}{P/C}{PRICE}`
    /// - Root: 1-6 characters
    /// - Date: 6 digits (YYMMDD)
    /// - Type: P (put) or C (call)
    /// - Price: 8 digits (strike × 1000)
    #[must_use]
    pub fn is_option(&self) -> bool {
        let s = &self.0;
        if s.len() < 15 || s.len() > 21 {
            return false;
        }

        // Find the date/type/price portion (last 15 characters for standard OCC)
        // Check for P or C in the expected position
        let len = s.len();
        if len >= 15 {
            let type_pos = len - 9;
            let type_char = s.chars().nth(type_pos);
            if type_char == Some('P') || type_char == Some('C') {
                // Check that the last 8 chars are digits (strike price)
                let price_part = &s[len - 8..];
                let date_part = &s[type_pos - 6..type_pos];
                return price_part.chars().all(|c| c.is_ascii_digit())
                    && date_part.chars().all(|c| c.is_ascii_digit());
            }
        }

        false
    }

    /// Check if this is an equity symbol.
    #[must_use]
    pub fn is_equity(&self) -> bool {
        !self.is_option()
    }

    /// Extract the underlying symbol from an option.
    ///
    /// Returns the full symbol if it's not an option.
    #[must_use]
    pub fn underlying(&self) -> Self {
        if self.is_option() && self.0.len() >= 15 {
            let root_len = self.0.len() - 15;
            Self(self.0[..root_len].to_string())
        } else {
            self.clone()
        }
    }

    /// Validate the symbol for order submission.
    ///
    /// # Errors
    ///
    /// Returns error if symbol is empty or contains invalid characters.
    pub fn validate(&self) -> Result<(), DomainError> {
        if self.0.is_empty() {
            return Err(DomainError::InvalidValue {
                field: "symbol".to_string(),
                message: "Symbol cannot be empty".to_string(),
            });
        }

        if self.0.len() > 21 {
            return Err(DomainError::InvalidValue {
                field: "symbol".to_string(),
                message: "Symbol exceeds maximum length".to_string(),
            });
        }

        // Only alphanumeric characters allowed
        if !self.0.chars().all(|c| c.is_ascii_alphanumeric()) {
            return Err(DomainError::InvalidValue {
                field: "symbol".to_string(),
                message: "Symbol contains invalid characters".to_string(),
            });
        }

        Ok(())
    }
}

impl fmt::Display for Symbol {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl AsRef<str> for Symbol {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl From<String> for Symbol {
    fn from(value: String) -> Self {
        Self::new(value)
    }
}

impl From<&str> for Symbol {
    fn from(value: &str) -> Self {
        Self::new(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn symbol_new_normalizes_case() {
        let s = Symbol::new("aapl");
        assert_eq!(s.as_str(), "AAPL");
    }

    #[test]
    fn symbol_display() {
        let s = Symbol::new("MSFT");
        assert_eq!(format!("{s}"), "MSFT");
    }

    #[test]
    fn symbol_is_equity() {
        assert!(Symbol::new("AAPL").is_equity());
        assert!(Symbol::new("MSFT").is_equity());
        assert!(Symbol::new("GOOGL").is_equity());
    }

    #[test]
    fn symbol_is_option() {
        // Standard OCC format: ROOT (1-6 chars) + YYMMDD + P/C + 8 digit price
        assert!(Symbol::new("AAPL250117P00190000").is_option());
        assert!(Symbol::new("AAPL250117C00200000").is_option());
        assert!(Symbol::new("SPY250121P00450000").is_option());
        assert!(Symbol::new("GOOGL250221C00150000").is_option());
    }

    #[test]
    fn symbol_is_not_option() {
        assert!(!Symbol::new("AAPL").is_option());
        assert!(!Symbol::new("MSFT").is_option());
        assert!(!Symbol::new("SHORT").is_option());
    }

    #[test]
    fn symbol_underlying_from_option() {
        let opt = Symbol::new("AAPL250117P00190000");
        assert_eq!(opt.underlying().as_str(), "AAPL");

        let opt2 = Symbol::new("GOOGL250221C00150000");
        assert_eq!(opt2.underlying().as_str(), "GOOGL");
    }

    #[test]
    fn symbol_underlying_from_equity() {
        let eq = Symbol::new("AAPL");
        assert_eq!(eq.underlying().as_str(), "AAPL");
    }

    #[test]
    fn symbol_validate_empty() {
        let s = Symbol::new("");
        assert!(s.validate().is_err());
    }

    #[test]
    fn symbol_validate_too_long() {
        let s = Symbol::new("A".repeat(25));
        assert!(s.validate().is_err());
    }

    #[test]
    fn symbol_validate_invalid_chars() {
        let s = Symbol::new("AAPL!");
        assert!(s.validate().is_err());

        let s2 = Symbol::new("AA PL");
        assert!(s2.validate().is_err());
    }

    #[test]
    fn symbol_validate_valid() {
        assert!(Symbol::new("AAPL").validate().is_ok());
        assert!(Symbol::new("AAPL250117P00190000").validate().is_ok());
    }

    #[test]
    fn symbol_from_conversions() {
        let s1: Symbol = "AAPL".into();
        assert_eq!(s1.as_str(), "AAPL");

        let s2: Symbol = String::from("MSFT").into();
        assert_eq!(s2.as_str(), "MSFT");
    }

    #[test]
    fn symbol_serde_roundtrip() {
        let s = Symbol::new("AAPL");
        let json = serde_json::to_string(&s).unwrap();
        assert_eq!(json, "\"AAPL\"");

        let parsed: Symbol = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, s);
    }

    #[test]
    fn symbol_hash_works() {
        use std::collections::HashSet;
        let mut set = HashSet::new();
        set.insert(Symbol::new("AAPL"));
        set.insert(Symbol::new("MSFT"));
        set.insert(Symbol::new("aapl")); // Should be same as AAPL

        assert_eq!(set.len(), 2);
    }

    #[test]
    fn symbol_into_inner() {
        let s = Symbol::new("AAPL");
        let inner = s.into_inner();
        assert_eq!(inner, "AAPL");
    }
}
