//! Option Spread Value Object

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::{Leg, SpreadType};
use crate::domain::risk_management::value_objects::Greeks;

/// Multi-leg options spread.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OptionSpread {
    /// Spread type.
    spread_type: SpreadType,
    /// Individual legs.
    legs: Vec<Leg>,
    /// Underlying symbol.
    underlying: String,
}

impl OptionSpread {
    /// Create a new option spread.
    #[must_use]
    pub fn new(spread_type: SpreadType, legs: Vec<Leg>, underlying: impl Into<String>) -> Self {
        Self {
            spread_type,
            legs,
            underlying: underlying.into(),
        }
    }

    /// Create a single-leg position.
    #[must_use]
    pub fn single(leg: Leg, underlying: impl Into<String>) -> Self {
        Self::new(SpreadType::Single, vec![leg], underlying)
    }

    /// Create a vertical spread.
    #[must_use]
    pub fn vertical(long_leg: Leg, short_leg: Leg, underlying: impl Into<String>) -> Self {
        Self::new(SpreadType::Vertical, vec![long_leg, short_leg], underlying)
    }

    /// Get the spread type.
    #[must_use]
    pub const fn spread_type(&self) -> SpreadType {
        self.spread_type
    }

    /// Get the legs.
    #[must_use]
    pub fn legs(&self) -> &[Leg] {
        &self.legs
    }

    /// Get mutable legs.
    pub fn legs_mut(&mut self) -> &mut [Leg] {
        &mut self.legs
    }

    /// Get the underlying symbol.
    #[must_use]
    pub fn underlying(&self) -> &str {
        &self.underlying
    }

    /// Get the number of legs.
    #[must_use]
    pub fn leg_count(&self) -> usize {
        self.legs.len()
    }

    /// Calculate aggregate Greeks for the spread.
    #[must_use]
    pub fn aggregate_greeks(&self) -> Greeks {
        self.legs
            .iter()
            .map(Leg::position_greeks)
            .fold(Greeks::ZERO, |acc, g| acc + g)
    }

    /// Calculate total notional exposure.
    #[must_use]
    pub fn total_notional(&self, underlying_price: Decimal) -> Decimal {
        self.legs
            .iter()
            .map(|leg| leg.notional(underlying_price))
            .sum()
    }

    /// Check if this is a defined-risk position.
    #[must_use]
    pub const fn is_defined_risk(&self) -> bool {
        self.spread_type.is_defined_risk()
    }

    /// Validate that the spread configuration is sensible.
    #[must_use]
    pub fn is_valid(&self) -> bool {
        // Basic validation
        if self.legs.is_empty() {
            return false;
        }

        // All legs should have the same underlying
        self.legs
            .iter()
            .all(|leg| leg.contract().underlying() == self.underlying)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::option_position::value_objects::{LegType, OptionContract, OptionRight};
    use crate::domain::shared::Symbol;
    use chrono::NaiveDate;

    fn test_call_contract(strike: i64) -> OptionContract {
        OptionContract::new(
            Symbol::new(format!("AAPL  250117C00{strike}000")),
            "AAPL",
            Decimal::new(strike, 0),
            NaiveDate::from_ymd_opt(2025, 1, 17).unwrap(),
            OptionRight::Call,
        )
    }

    #[test]
    fn option_spread_single() {
        let leg = Leg::long(
            test_call_contract(150),
            Decimal::new(10, 0),
            LegType::Primary,
        );
        let spread = OptionSpread::single(leg, "AAPL");

        assert_eq!(spread.spread_type(), SpreadType::Single);
        assert_eq!(spread.leg_count(), 1);
        assert_eq!(spread.underlying(), "AAPL");
    }

    #[test]
    fn option_spread_vertical() {
        let long_leg = Leg::long(
            test_call_contract(150),
            Decimal::new(10, 0),
            LegType::Primary,
        );
        let short_leg = Leg::short(
            test_call_contract(160),
            Decimal::new(10, 0),
            LegType::Secondary,
        );
        let spread = OptionSpread::vertical(long_leg, short_leg, "AAPL");

        assert_eq!(spread.spread_type(), SpreadType::Vertical);
        assert_eq!(spread.leg_count(), 2);
        assert!(spread.is_defined_risk());
    }

    #[test]
    fn option_spread_aggregate_greeks() {
        let mut long_leg = Leg::long(
            test_call_contract(150),
            Decimal::new(10, 0),
            LegType::Primary,
        );
        long_leg.update_greeks(Greeks::with_delta(Decimal::new(60, 2))); // 0.60

        let mut short_leg = Leg::short(
            test_call_contract(160),
            Decimal::new(10, 0),
            LegType::Secondary,
        );
        short_leg.update_greeks(Greeks::with_delta(Decimal::new(40, 2))); // 0.40

        let spread = OptionSpread::vertical(long_leg, short_leg, "AAPL");
        let greeks = spread.aggregate_greeks();

        // Long: 0.60 × 10 = 6.00
        // Short: 0.40 × -10 = -4.00
        // Net: 6.00 - 4.00 = 2.00
        assert_eq!(greeks.delta, Decimal::new(200, 2));
    }

    #[test]
    fn option_spread_total_notional() {
        let long_leg = Leg::long(
            test_call_contract(150),
            Decimal::new(10, 0),
            LegType::Primary,
        );
        let short_leg = Leg::short(
            test_call_contract(160),
            Decimal::new(10, 0),
            LegType::Secondary,
        );
        let spread = OptionSpread::vertical(long_leg, short_leg, "AAPL");

        // Long notional: $150 × 100 × 10 = $150,000
        // Short notional: $150 × 100 × 10 × -1 = -$150,000
        // Net: $0 (for simplification, both use same underlying price)
        let notional = spread.total_notional(Decimal::new(150, 0));
        assert_eq!(notional, Decimal::ZERO);
    }

    #[test]
    fn option_spread_is_valid() {
        let leg = Leg::long(
            test_call_contract(150),
            Decimal::new(10, 0),
            LegType::Primary,
        );
        let spread = OptionSpread::single(leg, "AAPL");

        assert!(spread.is_valid());
    }

    #[test]
    fn option_spread_is_valid_empty() {
        let spread = OptionSpread::new(SpreadType::Custom, vec![], "AAPL");
        assert!(!spread.is_valid());
    }

    #[test]
    fn option_spread_serde() {
        let leg = Leg::long(
            test_call_contract(150),
            Decimal::new(10, 0),
            LegType::Primary,
        );
        let spread = OptionSpread::single(leg, "AAPL");

        let json = serde_json::to_string(&spread).unwrap();
        let parsed: OptionSpread = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.spread_type(), spread.spread_type());
    }
}
