//! Money value object for currency amounts.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::fmt;
use std::ops::{Add, Mul, Neg, Sub};

use crate::domain::shared::DomainError;

/// A monetary amount in USD.
///
/// Represented as a Decimal for precise financial calculations.
/// Always uses 2 decimal places for display (but internal precision is higher).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Money(Decimal);

impl Money {
    /// Create a new Money value from a Decimal.
    #[must_use]
    pub const fn new(amount: Decimal) -> Self {
        Self(amount)
    }

    /// Create a Money value from a USD amount (as f64).
    ///
    /// # Panics
    ///
    /// Panics if the f64 cannot be converted to Decimal.
    #[must_use]
    pub fn usd(amount: f64) -> Self {
        Self(Decimal::try_from(amount).expect("valid f64"))
    }

    /// Create a Money value from cents (integer).
    #[must_use]
    pub fn from_cents(cents: i64) -> Self {
        Self(Decimal::new(cents, 2))
    }

    /// Zero amount.
    pub const ZERO: Self = Self(Decimal::ZERO);

    /// Get the inner Decimal value.
    #[must_use]
    pub const fn amount(&self) -> Decimal {
        self.0
    }

    /// Returns true if this amount is positive.
    #[must_use]
    pub fn is_positive(&self) -> bool {
        self.0 > Decimal::ZERO
    }

    /// Returns true if this amount is negative.
    #[must_use]
    pub fn is_negative(&self) -> bool {
        self.0 < Decimal::ZERO
    }

    /// Returns true if this amount is zero.
    #[must_use]
    pub fn is_zero(&self) -> bool {
        self.0 == Decimal::ZERO
    }

    /// Get the absolute value.
    #[must_use]
    pub fn abs(&self) -> Self {
        Self(self.0.abs())
    }

    /// Round to 2 decimal places.
    #[must_use]
    pub fn round(&self) -> Self {
        Self(self.0.round_dp(2))
    }

    /// Check if within allowed range for orders.
    ///
    /// # Errors
    ///
    /// Returns error if amount is negative or exceeds max allowed.
    pub fn validate_for_order(&self) -> Result<(), DomainError> {
        if self.is_negative() {
            return Err(DomainError::InvalidValue {
                field: "money".to_string(),
                message: "Order amount cannot be negative".to_string(),
            });
        }
        let max = Decimal::new(10_000_000, 0); // $10M max per order
        if self.0 > max {
            return Err(DomainError::InvalidValue {
                field: "money".to_string(),
                message: format!("Order amount exceeds maximum: ${max}"),
            });
        }
        Ok(())
    }
}

impl Default for Money {
    fn default() -> Self {
        Self::ZERO
    }
}

impl fmt::Display for Money {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "${:.2}", self.0)
    }
}

impl PartialOrd for Money {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Money {
    fn cmp(&self, other: &Self) -> Ordering {
        self.0.cmp(&other.0)
    }
}

impl Add for Money {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self(self.0 + rhs.0)
    }
}

impl Sub for Money {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self::Output {
        Self(self.0 - rhs.0)
    }
}

impl Neg for Money {
    type Output = Self;

    fn neg(self) -> Self::Output {
        Self(-self.0)
    }
}

impl Mul<Decimal> for Money {
    type Output = Self;

    fn mul(self, rhs: Decimal) -> Self::Output {
        Self(self.0 * rhs)
    }
}

impl Mul<i32> for Money {
    type Output = Self;

    fn mul(self, rhs: i32) -> Self::Output {
        Self(self.0 * Decimal::from(rhs))
    }
}

impl From<Decimal> for Money {
    fn from(value: Decimal) -> Self {
        Self(value)
    }
}

impl From<Money> for Decimal {
    fn from(value: Money) -> Self {
        value.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn money_new_and_display() {
        let m = Money::new(Decimal::new(15050, 2));
        assert_eq!(format!("{m}"), "$150.50");
    }

    #[test]
    fn money_usd() {
        let m = Money::usd(150.50);
        assert_eq!(m.amount(), Decimal::try_from(150.50).unwrap());
    }

    #[test]
    fn money_from_cents() {
        let m = Money::from_cents(15050);
        assert_eq!(m.amount(), Decimal::new(15050, 2));
        assert_eq!(format!("{m}"), "$150.50");
    }

    #[test]
    fn money_zero() {
        assert!(Money::ZERO.is_zero());
        assert!(!Money::ZERO.is_positive());
        assert!(!Money::ZERO.is_negative());
    }

    #[test]
    fn money_positive_negative() {
        let pos = Money::usd(100.0);
        let neg = Money::usd(-50.0);

        assert!(pos.is_positive());
        assert!(!pos.is_negative());

        assert!(!neg.is_positive());
        assert!(neg.is_negative());
    }

    #[test]
    fn money_abs() {
        let neg = Money::usd(-100.0);
        assert_eq!(neg.abs(), Money::usd(100.0));

        let pos = Money::usd(50.0);
        assert_eq!(pos.abs(), Money::usd(50.0));
    }

    #[test]
    fn money_round() {
        let m = Money::new(Decimal::new(150555, 3)); // 150.555
        let rounded = m.round();
        assert_eq!(rounded.amount(), Decimal::new(15056, 2)); // 150.56
    }

    #[test]
    fn money_arithmetic() {
        let a = Money::usd(100.0);
        let b = Money::usd(50.0);

        assert_eq!((a + b).amount(), Decimal::try_from(150.0).unwrap());
        assert_eq!((a - b).amount(), Decimal::try_from(50.0).unwrap());
        assert_eq!((-a).amount(), Decimal::try_from(-100.0).unwrap());
    }

    #[test]
    fn money_multiply() {
        let m = Money::usd(100.0);
        let result = m * Decimal::new(2, 0);
        assert_eq!(result.amount(), Decimal::try_from(200.0).unwrap());

        let result2 = m * 3;
        assert_eq!(result2.amount(), Decimal::try_from(300.0).unwrap());
    }

    #[test]
    fn money_ordering() {
        let a = Money::usd(100.0);
        let b = Money::usd(50.0);
        let c = Money::usd(100.0);

        assert!(a > b);
        assert!(b < a);
        assert!(a == c);
        assert!(a >= c);
        assert!(a <= c);
    }

    #[test]
    fn money_validate_for_order_negative() {
        let m = Money::usd(-100.0);
        assert!(m.validate_for_order().is_err());
    }

    #[test]
    fn money_validate_for_order_exceeds_max() {
        let m = Money::usd(20_000_000.0);
        assert!(m.validate_for_order().is_err());
    }

    #[test]
    fn money_validate_for_order_valid() {
        let m = Money::usd(50_000.0);
        assert!(m.validate_for_order().is_ok());
    }

    #[test]
    fn money_serde_roundtrip() {
        let m = Money::usd(150.50);
        let json = serde_json::to_string(&m).unwrap();
        let parsed: Money = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, m);
    }

    #[test]
    fn money_default() {
        let m = Money::default();
        assert!(m.is_zero());
    }

    #[test]
    fn money_from_decimal() {
        let d = Decimal::new(15050, 2);
        let m: Money = d.into();
        assert_eq!(m.amount(), d);
    }

    #[test]
    fn decimal_from_money() {
        let m = Money::from_cents(15050);
        let d: Decimal = m.into();
        assert_eq!(d, Decimal::new(15050, 2));
    }
}
