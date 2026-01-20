//! Option Contract Value Object

use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::domain::shared::Symbol;

/// Option right (call or put).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OptionRight {
    /// Call option (right to buy).
    Call,
    /// Put option (right to sell).
    Put,
}

impl std::fmt::Display for OptionRight {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Call => write!(f, "CALL"),
            Self::Put => write!(f, "PUT"),
        }
    }
}

/// Option contract specification.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OptionContract {
    /// OCC symbol (e.g., "AAPL  250117C00150000").
    symbol: Symbol,
    /// Underlying symbol.
    underlying: String,
    /// Strike price.
    strike: Decimal,
    /// Expiration date.
    expiration: NaiveDate,
    /// Call or put.
    right: OptionRight,
    /// Contract multiplier (typically 100 for equity options).
    multiplier: u32,
}

impl OptionContract {
    /// Create a new option contract.
    #[must_use]
    pub fn new(
        symbol: Symbol,
        underlying: impl Into<String>,
        strike: Decimal,
        expiration: NaiveDate,
        right: OptionRight,
    ) -> Self {
        Self {
            symbol,
            underlying: underlying.into(),
            strike,
            expiration,
            right,
            multiplier: 100,
        }
    }

    /// Create a call option contract.
    #[must_use]
    pub fn call(
        symbol: Symbol,
        underlying: impl Into<String>,
        strike: Decimal,
        expiration: NaiveDate,
    ) -> Self {
        Self::new(symbol, underlying, strike, expiration, OptionRight::Call)
    }

    /// Create a put option contract.
    #[must_use]
    pub fn put(
        symbol: Symbol,
        underlying: impl Into<String>,
        strike: Decimal,
        expiration: NaiveDate,
    ) -> Self {
        Self::new(symbol, underlying, strike, expiration, OptionRight::Put)
    }

    /// Set a custom multiplier.
    #[must_use]
    pub const fn with_multiplier(mut self, multiplier: u32) -> Self {
        self.multiplier = multiplier;
        self
    }

    /// Get the OCC symbol.
    #[must_use]
    pub const fn symbol(&self) -> &Symbol {
        &self.symbol
    }

    /// Get the underlying symbol.
    #[must_use]
    pub fn underlying(&self) -> &str {
        &self.underlying
    }

    /// Get the strike price.
    #[must_use]
    pub const fn strike(&self) -> Decimal {
        self.strike
    }

    /// Get the expiration date.
    #[must_use]
    pub const fn expiration(&self) -> NaiveDate {
        self.expiration
    }

    /// Get the option right.
    #[must_use]
    pub const fn right(&self) -> OptionRight {
        self.right
    }

    /// Get the contract multiplier.
    #[must_use]
    pub const fn multiplier(&self) -> u32 {
        self.multiplier
    }

    /// Check if this is a call option.
    #[must_use]
    pub const fn is_call(&self) -> bool {
        matches!(self.right, OptionRight::Call)
    }

    /// Check if this is a put option.
    #[must_use]
    pub const fn is_put(&self) -> bool {
        matches!(self.right, OptionRight::Put)
    }

    /// Calculate notional value of contracts.
    #[must_use]
    pub fn notional(&self, underlying_price: Decimal, contracts: Decimal) -> Decimal {
        underlying_price * Decimal::from(self.multiplier) * contracts
    }

    /// Check if the option has expired.
    #[must_use]
    pub fn is_expired(&self, as_of: NaiveDate) -> bool {
        self.expiration < as_of
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_expiration() -> NaiveDate {
        NaiveDate::from_ymd_opt(2025, 1, 17).unwrap()
    }

    #[test]
    fn option_right_display() {
        assert_eq!(OptionRight::Call.to_string(), "CALL");
        assert_eq!(OptionRight::Put.to_string(), "PUT");
    }

    #[test]
    fn option_right_serde() {
        let right = OptionRight::Call;
        let json = serde_json::to_string(&right).unwrap();
        assert_eq!(json, "\"CALL\"");

        let parsed: OptionRight = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, OptionRight::Call);
    }

    #[test]
    fn option_contract_new() {
        let contract = OptionContract::new(
            Symbol::new("AAPL  250117C00150000"),
            "AAPL",
            Decimal::new(150, 0),
            test_expiration(),
            OptionRight::Call,
        );

        assert_eq!(contract.underlying(), "AAPL");
        assert_eq!(contract.strike(), Decimal::new(150, 0));
        assert_eq!(contract.expiration(), test_expiration());
        assert_eq!(contract.right(), OptionRight::Call);
        assert_eq!(contract.multiplier(), 100);
    }

    #[test]
    fn option_contract_call() {
        let contract = OptionContract::call(
            Symbol::new("AAPL  250117C00150000"),
            "AAPL",
            Decimal::new(150, 0),
            test_expiration(),
        );

        assert!(contract.is_call());
        assert!(!contract.is_put());
    }

    #[test]
    fn option_contract_put() {
        let contract = OptionContract::put(
            Symbol::new("AAPL  250117P00150000"),
            "AAPL",
            Decimal::new(150, 0),
            test_expiration(),
        );

        assert!(!contract.is_call());
        assert!(contract.is_put());
    }

    #[test]
    fn option_contract_with_multiplier() {
        let contract = OptionContract::call(
            Symbol::new("SPX  250117C04500000"),
            "SPX",
            Decimal::new(4500, 0),
            test_expiration(),
        )
        .with_multiplier(100);

        assert_eq!(contract.multiplier(), 100);
    }

    #[test]
    fn option_contract_notional() {
        let contract = OptionContract::call(
            Symbol::new("AAPL  250117C00150000"),
            "AAPL",
            Decimal::new(150, 0),
            test_expiration(),
        );

        // 10 contracts at $150 underlying = $150 × 100 × 10 = $150,000
        let notional = contract.notional(Decimal::new(150, 0), Decimal::new(10, 0));
        assert_eq!(notional, Decimal::new(150_000, 0));
    }

    #[test]
    fn option_contract_is_expired() {
        let contract = OptionContract::call(
            Symbol::new("AAPL  250117C00150000"),
            "AAPL",
            Decimal::new(150, 0),
            test_expiration(),
        );

        let before = NaiveDate::from_ymd_opt(2025, 1, 16).unwrap();
        let after = NaiveDate::from_ymd_opt(2025, 1, 18).unwrap();

        assert!(!contract.is_expired(before));
        assert!(contract.is_expired(after));
    }

    #[test]
    fn option_contract_serde() {
        let contract = OptionContract::call(
            Symbol::new("AAPL  250117C00150000"),
            "AAPL",
            Decimal::new(150, 0),
            test_expiration(),
        );

        let json = serde_json::to_string(&contract).unwrap();
        let parsed: OptionContract = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, contract);
    }
}
