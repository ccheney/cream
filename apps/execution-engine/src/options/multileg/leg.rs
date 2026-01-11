//! Option leg and multi-leg order types.
//!
//! Defines individual option legs and multi-leg order structures
//! for complex options strategies like spreads, condors, and butterflies.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::greeks::{Greeks, aggregate_greeks};
use super::types::OptionContract;

/// A single leg in a multi-leg order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionLeg {
    /// Leg index (0-based).
    pub leg_index: u32,
    /// Option contract.
    pub contract: OptionContract,
    /// Quantity (absolute value, sign determined by `is_long`).
    pub quantity: u32,
    /// Ratio for this leg (e.g., 1 for single, 2 for butterfly wing).
    pub ratio: u32,
    /// Whether this is a long position.
    pub is_long: bool,
    /// Greeks for this leg (per contract).
    pub greeks: Greeks,
}

impl OptionLeg {
    /// Get signed quantity (positive for long, negative for short).
    #[must_use]
    pub fn signed_quantity(&self) -> i64 {
        let qty = i64::from(self.quantity);
        if self.is_long { qty } else { -qty }
    }

    /// Get total Greeks for this leg (scaled by signed quantity).
    #[must_use]
    pub fn total_greeks(&self) -> Greeks {
        let signed = Decimal::from(self.signed_quantity());
        self.greeks.scale(signed)
    }
}

/// A multi-leg options order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiLegOrder {
    /// Order ID.
    pub order_id: String,
    /// Underlying symbol.
    pub underlying_symbol: String,
    /// Strategy name (e.g., `"iron_condor"`, `"vertical_spread"`).
    pub strategy_name: String,
    /// Order legs.
    pub legs: Vec<OptionLeg>,
    /// Net debit (positive) or credit (negative).
    pub net_premium: Decimal,
}

impl MultiLegOrder {
    /// Get all leg ratios.
    #[must_use]
    pub fn leg_ratios(&self) -> Vec<u32> {
        self.legs.iter().map(|l| l.ratio).collect()
    }

    /// Calculate aggregate Greeks for the entire strategy.
    #[must_use]
    pub fn aggregate_greeks(&self) -> Greeks {
        aggregate_greeks(&self.legs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::options::multileg::{OptionStyle, OptionType};

    #[test]
    fn test_option_leg_signed_quantity() {
        let long_leg = OptionLeg {
            leg_index: 0,
            contract: make_test_contract("C1"),
            quantity: 5,
            ratio: 1,
            is_long: true,
            greeks: Greeks::zero(),
        };
        assert_eq!(long_leg.signed_quantity(), 5);

        let short_leg = OptionLeg {
            leg_index: 1,
            contract: make_test_contract("C2"),
            quantity: 3,
            ratio: 1,
            is_long: false,
            greeks: Greeks::zero(),
        };
        assert_eq!(short_leg.signed_quantity(), -3);
    }

    #[test]
    fn test_multi_leg_order_leg_ratios() {
        let order = MultiLegOrder {
            order_id: "O1".to_string(),
            underlying_symbol: "AAPL".to_string(),
            strategy_name: "butterfly".to_string(),
            legs: vec![
                OptionLeg {
                    leg_index: 0,
                    contract: make_test_contract("C1"),
                    quantity: 1,
                    ratio: 1,
                    is_long: true,
                    greeks: Greeks::zero(),
                },
                OptionLeg {
                    leg_index: 1,
                    contract: make_test_contract("C2"),
                    quantity: 2,
                    ratio: 2,
                    is_long: false,
                    greeks: Greeks::zero(),
                },
                OptionLeg {
                    leg_index: 2,
                    contract: make_test_contract("C3"),
                    quantity: 1,
                    ratio: 1,
                    is_long: true,
                    greeks: Greeks::zero(),
                },
            ],
            net_premium: Decimal::ZERO,
        };

        assert_eq!(order.leg_ratios(), vec![1, 2, 1]);
    }

    fn make_test_contract(id: &str) -> OptionContract {
        OptionContract {
            contract_id: id.to_string(),
            underlying_symbol: "AAPL".to_string(),
            strike: Decimal::new(150, 0),
            expiration: "2024-01-19".to_string(),
            option_type: OptionType::Call,
            style: OptionStyle::American,
            multiplier: 100,
        }
    }
}
