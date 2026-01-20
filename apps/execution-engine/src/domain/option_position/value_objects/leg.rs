//! Option Spread Leg Value Object

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::OptionContract;
use crate::domain::risk_management::value_objects::Greeks;

/// Position side (long or short).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PositionSide {
    /// Long position (bought).
    Long,
    /// Short position (sold/written).
    Short,
}

impl PositionSide {
    /// Get the sign multiplier for this side.
    #[must_use]
    pub const fn sign(&self) -> i32 {
        match self {
            Self::Long => 1,
            Self::Short => -1,
        }
    }

    /// Check if this is a long position.
    #[must_use]
    pub const fn is_long(&self) -> bool {
        matches!(self, Self::Long)
    }

    /// Check if this is a short position.
    #[must_use]
    pub const fn is_short(&self) -> bool {
        matches!(self, Self::Short)
    }
}

/// Leg type in a spread.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LegType {
    /// Primary/anchor leg.
    Primary,
    /// Secondary leg (e.g., short strike in vertical).
    Secondary,
    /// Wing leg (e.g., in butterfly/condor).
    Wing,
    /// Body leg (e.g., middle strikes in butterfly).
    Body,
}

/// A single leg of an options spread.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Leg {
    /// The option contract.
    contract: OptionContract,
    /// Position side.
    side: PositionSide,
    /// Number of contracts.
    quantity: Decimal,
    /// Role of this leg in the spread (primary, secondary, wing, body).
    kind: LegType,
    /// Current Greeks for this leg.
    greeks: Greeks,
}

impl Leg {
    /// Create a new leg.
    #[must_use]
    pub const fn new(
        contract: OptionContract,
        side: PositionSide,
        quantity: Decimal,
        kind: LegType,
    ) -> Self {
        Self {
            contract,
            side,
            quantity,
            kind,
            greeks: Greeks::ZERO,
        }
    }

    /// Create a long leg.
    #[must_use]
    pub const fn long(contract: OptionContract, quantity: Decimal, kind: LegType) -> Self {
        Self::new(contract, PositionSide::Long, quantity, kind)
    }

    /// Create a short leg.
    #[must_use]
    pub const fn short(contract: OptionContract, quantity: Decimal, kind: LegType) -> Self {
        Self::new(contract, PositionSide::Short, quantity, kind)
    }

    /// Get the contract.
    #[must_use]
    pub const fn contract(&self) -> &OptionContract {
        &self.contract
    }

    /// Get the position side.
    #[must_use]
    pub const fn side(&self) -> PositionSide {
        self.side
    }

    /// Get the quantity.
    #[must_use]
    pub const fn quantity(&self) -> Decimal {
        self.quantity
    }

    /// Get the leg kind (role in spread).
    #[must_use]
    pub const fn kind(&self) -> LegType {
        self.kind
    }

    /// Get the Greeks.
    #[must_use]
    pub const fn greeks(&self) -> &Greeks {
        &self.greeks
    }

    /// Update the Greeks.
    pub const fn update_greeks(&mut self, greeks: Greeks) {
        self.greeks = greeks;
    }

    /// Get signed quantity (positive for long, negative for short).
    #[must_use]
    pub fn signed_quantity(&self) -> Decimal {
        self.quantity * Decimal::from(self.side.sign())
    }

    /// Calculate position Greeks (adjusted for quantity and side).
    #[must_use]
    pub fn position_greeks(&self) -> Greeks {
        self.greeks.scale(self.signed_quantity())
    }

    /// Calculate notional exposure.
    #[must_use]
    pub fn notional(&self, underlying_price: Decimal) -> Decimal {
        self.contract.notional(underlying_price, self.quantity) * Decimal::from(self.side.sign())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::option_position::value_objects::OptionRight;
    use crate::domain::shared::Symbol;
    use chrono::NaiveDate;

    fn test_contract() -> OptionContract {
        OptionContract::new(
            Symbol::new("AAPL  250117C00150000"),
            "AAPL",
            Decimal::new(150, 0),
            NaiveDate::from_ymd_opt(2025, 1, 17).unwrap(),
            OptionRight::Call,
        )
    }

    #[test]
    fn position_side_sign() {
        assert_eq!(PositionSide::Long.sign(), 1);
        assert_eq!(PositionSide::Short.sign(), -1);
    }

    #[test]
    fn position_side_predicates() {
        assert!(PositionSide::Long.is_long());
        assert!(!PositionSide::Long.is_short());
        assert!(!PositionSide::Short.is_long());
        assert!(PositionSide::Short.is_short());
    }

    #[test]
    fn leg_new() {
        let leg = Leg::new(
            test_contract(),
            PositionSide::Long,
            Decimal::new(10, 0),
            LegType::Primary,
        );

        assert_eq!(leg.side(), PositionSide::Long);
        assert_eq!(leg.quantity(), Decimal::new(10, 0));
        assert_eq!(leg.kind(), LegType::Primary);
    }

    #[test]
    fn leg_long_short() {
        let long_leg = Leg::long(test_contract(), Decimal::new(5, 0), LegType::Primary);
        assert!(long_leg.side().is_long());

        let short_leg = Leg::short(test_contract(), Decimal::new(5, 0), LegType::Secondary);
        assert!(short_leg.side().is_short());
    }

    #[test]
    fn leg_signed_quantity() {
        let long_leg = Leg::long(test_contract(), Decimal::new(10, 0), LegType::Primary);
        assert_eq!(long_leg.signed_quantity(), Decimal::new(10, 0));

        let short_leg = Leg::short(test_contract(), Decimal::new(10, 0), LegType::Secondary);
        assert_eq!(short_leg.signed_quantity(), Decimal::new(-10, 0));
    }

    #[test]
    fn leg_position_greeks() {
        let mut leg = Leg::long(test_contract(), Decimal::new(10, 0), LegType::Primary);
        leg.update_greeks(Greeks::with_delta(Decimal::new(50, 2))); // 0.50 delta

        let position_greeks = leg.position_greeks();
        // 0.50 x 10 = 5.00
        assert_eq!(position_greeks.delta, Decimal::new(500, 2));
    }

    #[test]
    fn leg_position_greeks_short() {
        let mut leg = Leg::short(test_contract(), Decimal::new(10, 0), LegType::Secondary);
        leg.update_greeks(Greeks::with_delta(Decimal::new(50, 2))); // 0.50 delta

        let position_greeks = leg.position_greeks();
        // 0.50 x -10 = -5.00
        assert_eq!(position_greeks.delta, Decimal::new(-500, 2));
    }

    #[test]
    fn leg_notional() {
        let leg = Leg::long(test_contract(), Decimal::new(10, 0), LegType::Primary);
        let notional = leg.notional(Decimal::new(150, 0));
        // $150 x 100 x 10 = $150,000
        assert_eq!(notional, Decimal::new(150_000, 0));
    }

    #[test]
    fn leg_notional_short() {
        let leg = Leg::short(test_contract(), Decimal::new(10, 0), LegType::Secondary);
        let notional = leg.notional(Decimal::new(150, 0));
        // $150 x 100 x 10 x -1 = -$150,000
        assert_eq!(notional, Decimal::new(-150_000, 0));
    }

    #[test]
    fn leg_serde() {
        let leg = Leg::long(test_contract(), Decimal::new(10, 0), LegType::Primary);
        let json = serde_json::to_string(&leg).unwrap();
        let parsed: Leg = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.quantity(), leg.quantity());
    }
}
