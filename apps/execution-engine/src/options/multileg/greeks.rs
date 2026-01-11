//! Greeks calculation and aggregation.
//!
//! Provides the Greeks struct for option sensitivities and functions
//! for aggregating Greeks across positions and portfolios.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::leg::OptionLeg;

/// Greeks for an option or portfolio.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Greeks {
    /// Delta - rate of change of option price with respect to underlying price.
    /// Range: -1.0 to 1.0 for individual options.
    pub delta: Decimal,
    /// Gamma - rate of change of delta with respect to underlying price.
    pub gamma: Decimal,
    /// Theta - rate of change of option price with respect to time (per day).
    /// Typically negative for long options.
    pub theta: Decimal,
    /// Vega - sensitivity to implied volatility (per 1% change in IV).
    pub vega: Decimal,
    /// Rho - sensitivity to interest rate changes (per 1% change in rates).
    pub rho: Decimal,
    /// Vanna - sensitivity of delta to IV changes (optional, higher-order Greek).
    pub vanna: Option<Decimal>,
    /// Charm - rate of change of delta over time (optional, higher-order Greek).
    pub charm: Option<Decimal>,
}

impl Greeks {
    /// Create new Greeks with basic values.
    #[must_use]
    pub const fn new(
        delta: Decimal,
        gamma: Decimal,
        theta: Decimal,
        vega: Decimal,
        rho: Decimal,
    ) -> Self {
        Self {
            delta,
            gamma,
            theta,
            vega,
            rho,
            vanna: None,
            charm: None,
        }
    }

    /// Scale Greeks by a quantity (positive for long, negative for short).
    #[must_use]
    pub fn scale(&self, quantity: Decimal) -> Self {
        Self {
            delta: self.delta * quantity,
            gamma: self.gamma * quantity,
            theta: self.theta * quantity,
            vega: self.vega * quantity,
            rho: self.rho * quantity,
            vanna: self.vanna.map(|v| v * quantity),
            charm: self.charm.map(|c| c * quantity),
        }
    }

    /// Add another Greeks to this one.
    #[must_use]
    pub fn add(&self, other: &Self) -> Self {
        Self {
            delta: self.delta + other.delta,
            gamma: self.gamma + other.gamma,
            theta: self.theta + other.theta,
            vega: self.vega + other.vega,
            rho: self.rho + other.rho,
            vanna: match (self.vanna, other.vanna) {
                (Some(a), Some(b)) => Some(a + b),
                (Some(a), None) | (None, Some(a)) => Some(a),
                (None, None) => None,
            },
            charm: match (self.charm, other.charm) {
                (Some(a), Some(b)) => Some(a + b),
                (Some(a), None) | (None, Some(a)) => Some(a),
                (None, None) => None,
            },
        }
    }

    /// Create zero Greeks.
    #[must_use]
    pub const fn zero() -> Self {
        Self {
            delta: Decimal::ZERO,
            gamma: Decimal::ZERO,
            theta: Decimal::ZERO,
            vega: Decimal::ZERO,
            rho: Decimal::ZERO,
            vanna: None,
            charm: None,
        }
    }
}

/// Aggregate Greeks across all legs of a multi-leg strategy.
///
/// Each leg's Greeks are scaled by its signed quantity (positive for
/// long, negative for short) and summed.
///
/// # Arguments
/// * `legs` - The option legs to aggregate
///
/// # Returns
/// Aggregated Greeks for the entire strategy
#[must_use]
pub fn aggregate_greeks(legs: &[OptionLeg]) -> Greeks {
    legs.iter()
        .fold(Greeks::zero(), |acc, leg| acc.add(&leg.total_greeks()))
}

/// Calculate portfolio-level Greeks from multiple positions.
///
/// # Arguments
/// * `positions` - Map of position ID to (Greeks, signed quantity)
///
/// # Returns
/// Aggregated Greeks for the entire portfolio
#[must_use]
#[allow(clippy::implicit_hasher)]
pub fn calculate_portfolio_greeks(positions: &HashMap<String, (Greeks, Decimal)>) -> Greeks {
    positions
        .values()
        .fold(Greeks::zero(), |acc, (greeks, quantity)| {
            acc.add(&greeks.scale(*quantity))
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::options::multileg::{OptionContract, OptionStyle, OptionType};

    #[test]
    fn test_greeks_scale() {
        let greeks = Greeks::new(
            Decimal::new(5, 1),  // 0.5 delta
            Decimal::new(1, 2),  // 0.01 gamma
            Decimal::new(-5, 0), // -5 theta
            Decimal::new(10, 0), // 10 vega
            Decimal::new(1, 0),  // 1 rho
        );

        // Scale by +10 (long 10 contracts)
        let scaled = greeks.scale(Decimal::new(10, 0));
        assert_eq!(scaled.delta, Decimal::new(5, 0)); // 5 delta
        assert_eq!(scaled.gamma, Decimal::new(1, 1)); // 0.1 gamma
        assert_eq!(scaled.theta, Decimal::new(-50, 0)); // -50 theta

        // Scale by -5 (short 5 contracts)
        let scaled = greeks.scale(Decimal::new(-5, 0));
        assert_eq!(scaled.delta, Decimal::new(-25, 1)); // -2.5 delta
    }

    #[test]
    fn test_greeks_add() {
        let g1 = Greeks::new(
            Decimal::new(5, 0),
            Decimal::new(1, 0),
            Decimal::new(-10, 0),
            Decimal::new(20, 0),
            Decimal::new(2, 0),
        );

        let g2 = Greeks::new(
            Decimal::new(-3, 0),
            Decimal::new(2, 0),
            Decimal::new(-5, 0),
            Decimal::new(10, 0),
            Decimal::new(1, 0),
        );

        let sum = g1.add(&g2);
        assert_eq!(sum.delta, Decimal::new(2, 0));
        assert_eq!(sum.gamma, Decimal::new(3, 0));
        assert_eq!(sum.theta, Decimal::new(-15, 0));
        assert_eq!(sum.vega, Decimal::new(30, 0));
        assert_eq!(sum.rho, Decimal::new(3, 0));
    }

    #[test]
    fn test_aggregate_greeks() {
        let legs = vec![
            OptionLeg {
                leg_index: 0,
                contract: make_test_contract("AAPL240119C00150000"),
                quantity: 1,
                ratio: 1,
                is_long: true,
                greeks: Greeks::new(
                    Decimal::new(6, 1),  // 0.6 delta
                    Decimal::new(2, 2),  // 0.02 gamma
                    Decimal::new(-8, 0), // -8 theta
                    Decimal::new(15, 0), // 15 vega
                    Decimal::new(1, 0),
                ),
            },
            OptionLeg {
                leg_index: 1,
                contract: make_test_contract("AAPL240119C00155000"),
                quantity: 1,
                ratio: 1,
                is_long: false, // Short leg
                greeks: Greeks::new(
                    Decimal::new(4, 1),  // 0.4 delta
                    Decimal::new(2, 2),  // 0.02 gamma
                    Decimal::new(-6, 0), // -6 theta
                    Decimal::new(12, 0), // 12 vega
                    Decimal::new(1, 0),
                ),
            },
        ];

        let agg = aggregate_greeks(&legs);
        // Long 1 @ 0.6 + Short 1 @ 0.4 = 0.6 - 0.4 = 0.2
        assert_eq!(agg.delta, Decimal::new(2, 1));
        // Long 1 @ 0.02 + Short 1 @ 0.02 = 0.02 - 0.02 = 0
        assert_eq!(agg.gamma, Decimal::ZERO);
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
