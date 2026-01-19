//! Options Greeks value object.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::ops::Add;

/// Options Greeks for risk measurement.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Greeks {
    /// Delta - directional exposure (position × underlying delta).
    pub delta: Decimal,
    /// Gamma - rate of change of delta.
    pub gamma: Decimal,
    /// Vega - sensitivity to volatility.
    pub vega: Decimal,
    /// Theta - time decay per day.
    pub theta: Decimal,
    /// Rho - sensitivity to interest rates.
    pub rho: Decimal,
}

impl Greeks {
    /// Create new Greeks.
    #[must_use]
    pub const fn new(
        delta: Decimal,
        gamma: Decimal,
        vega: Decimal,
        theta: Decimal,
        rho: Decimal,
    ) -> Self {
        Self {
            delta,
            gamma,
            vega,
            theta,
            rho,
        }
    }

    /// Create Greeks with just delta.
    #[must_use]
    pub fn with_delta(delta: Decimal) -> Self {
        Self {
            delta,
            ..Default::default()
        }
    }

    /// Zero Greeks.
    pub const ZERO: Self = Self {
        delta: Decimal::ZERO,
        gamma: Decimal::ZERO,
        vega: Decimal::ZERO,
        theta: Decimal::ZERO,
        rho: Decimal::ZERO,
    };

    /// Calculate delta-adjusted notional value.
    #[must_use]
    pub fn delta_notional(&self, underlying_price: Decimal, quantity: Decimal) -> Decimal {
        self.delta * underlying_price * quantity
    }

    /// Check if Greeks are within limits.
    #[must_use]
    pub fn within_limits(
        &self,
        max_delta: Decimal,
        max_gamma: Decimal,
        max_vega: Decimal,
        min_theta: Decimal,
    ) -> bool {
        self.delta.abs() <= max_delta
            && self.gamma.abs() <= max_gamma
            && self.vega.abs() <= max_vega
            && self.theta >= min_theta
    }

    /// Scale Greeks by a factor (e.g., for position sizing).
    #[must_use]
    pub fn scale(&self, factor: Decimal) -> Self {
        Self {
            delta: self.delta * factor,
            gamma: self.gamma * factor,
            vega: self.vega * factor,
            theta: self.theta * factor,
            rho: self.rho * factor,
        }
    }

    /// Negate Greeks (for closing positions).
    #[must_use]
    pub fn negate(&self) -> Self {
        self.scale(Decimal::NEGATIVE_ONE)
    }
}

impl Add for Greeks {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self {
            delta: self.delta + rhs.delta,
            gamma: self.gamma + rhs.gamma,
            vega: self.vega + rhs.vega,
            theta: self.theta + rhs.theta,
            rho: self.rho + rhs.rho,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn greeks_new() {
        let g = Greeks::new(
            Decimal::new(50, 2), // 0.50 delta
            Decimal::new(5, 2),  // 0.05 gamma
            Decimal::new(20, 0), // 20 vega
            Decimal::new(-5, 0), // -5 theta
            Decimal::new(1, 1),  // 0.1 rho
        );

        assert_eq!(g.delta, Decimal::new(50, 2));
        assert_eq!(g.theta, Decimal::new(-5, 0));
    }

    #[test]
    fn greeks_with_delta() {
        let g = Greeks::with_delta(Decimal::new(65, 2));
        assert_eq!(g.delta, Decimal::new(65, 2));
        assert_eq!(g.gamma, Decimal::ZERO);
    }

    #[test]
    fn greeks_zero() {
        let g = Greeks::ZERO;
        assert_eq!(g.delta, Decimal::ZERO);
        assert_eq!(g.gamma, Decimal::ZERO);
    }

    #[test]
    fn greeks_delta_notional() {
        let g = Greeks::with_delta(Decimal::new(50, 2)); // 0.50
        let notional = g.delta_notional(
            Decimal::new(150, 0), // $150 underlying
            Decimal::new(10, 0),  // 10 contracts
        );
        // 0.50 × $150 × 10 = $750
        assert_eq!(notional, Decimal::new(750, 0));
    }

    #[test]
    fn greeks_within_limits() {
        let g = Greeks::new(
            Decimal::new(50, 2),  // 0.50 delta
            Decimal::new(5, 2),   // 0.05 gamma
            Decimal::new(20, 0),  // 20 vega
            Decimal::new(-10, 0), // -10 theta
            Decimal::ZERO,
        );

        assert!(g.within_limits(
            Decimal::new(1, 0),   // max delta 1.0
            Decimal::new(1, 1),   // max gamma 0.1
            Decimal::new(50, 0),  // max vega 50
            Decimal::new(-20, 0), // min theta -20
        ));

        assert!(!g.within_limits(
            Decimal::new(40, 2), // max delta 0.40 (exceeded)
            Decimal::new(1, 1),
            Decimal::new(50, 0),
            Decimal::new(-20, 0),
        ));
    }

    #[test]
    fn greeks_scale() {
        let g = Greeks::with_delta(Decimal::new(50, 2)); // 0.50
        let scaled = g.scale(Decimal::new(2, 0)); // 2x
        assert_eq!(scaled.delta, Decimal::new(100, 2)); // 1.00
    }

    #[test]
    fn greeks_negate() {
        let g = Greeks::new(
            Decimal::new(50, 2),
            Decimal::new(5, 2),
            Decimal::new(20, 0),
            Decimal::new(-5, 0),
            Decimal::ZERO,
        );

        let neg = g.negate();
        assert_eq!(neg.delta, Decimal::new(-50, 2));
        assert_eq!(neg.theta, Decimal::new(5, 0));
    }

    #[test]
    fn greeks_add() {
        let g1 = Greeks::new(
            Decimal::new(30, 2),
            Decimal::new(3, 2),
            Decimal::new(10, 0),
            Decimal::new(-5, 0),
            Decimal::ZERO,
        );

        let g2 = Greeks::new(
            Decimal::new(20, 2),
            Decimal::new(2, 2),
            Decimal::new(5, 0),
            Decimal::new(-3, 0),
            Decimal::ZERO,
        );

        let sum = g1 + g2;
        assert_eq!(sum.delta, Decimal::new(50, 2));
        assert_eq!(sum.theta, Decimal::new(-8, 0));
    }

    #[test]
    fn greeks_serde() {
        let g = Greeks::with_delta(Decimal::new(50, 2));
        let json = serde_json::to_string(&g).unwrap();
        let parsed: Greeks = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, g);
    }
}
