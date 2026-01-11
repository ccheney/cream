//! Strategy leg types and operations.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::options::{Greeks, OptionContract};

/// Position direction for a leg.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LegDirection {
    /// Long position (bought).
    Long,
    /// Short position (sold/written).
    Short,
}

/// A single leg of an options strategy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyLeg {
    /// The option contract.
    pub contract: OptionContract,
    /// Position direction.
    pub direction: LegDirection,
    /// Number of contracts.
    pub quantity: u32,
    /// Entry price (premium).
    pub premium: Decimal,
    /// Greeks for this leg.
    pub greeks: Option<Greeks>,
}

impl StrategyLeg {
    /// Create a new strategy leg.
    #[must_use]
    pub const fn new(
        contract: OptionContract,
        direction: LegDirection,
        quantity: u32,
        premium: Decimal,
    ) -> Self {
        Self {
            contract,
            direction,
            quantity,
            premium,
            greeks: None,
        }
    }

    /// Set Greeks for this leg.
    #[must_use]
    pub const fn with_greeks(mut self, greeks: Greeks) -> Self {
        self.greeks = Some(greeks);
        self
    }

    /// Net premium (positive = credit, negative = debit).
    #[must_use]
    pub fn net_premium(&self) -> Decimal {
        let multiplier = Decimal::from(self.contract.multiplier);
        let qty = Decimal::from(self.quantity);
        match self.direction {
            LegDirection::Short => self.premium * multiplier * qty,
            LegDirection::Long => -self.premium * multiplier * qty,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::options::{OptionStyle, OptionType};

    #[test]
    fn test_leg_net_premium() {
        let leg = StrategyLeg::new(
            OptionContract {
                contract_id: "TEST".to_string(),
                underlying_symbol: "TEST".to_string(),
                strike: Decimal::new(100, 0),
                expiration: "2026-01-17".to_string(),
                option_type: OptionType::Call,
                style: OptionStyle::American,
                multiplier: 100,
            },
            LegDirection::Short,
            1,
            Decimal::new(250, 2), // $2.50 premium
        );

        // Short leg = credit = 2.50 * 100 = $250
        assert_eq!(leg.net_premium(), Decimal::new(250, 0));
    }
}
