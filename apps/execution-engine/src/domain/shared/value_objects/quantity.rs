//! Quantity value object for order quantities.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::fmt;
use std::ops::{Add, Sub};

use crate::domain::shared::DomainError;

/// A quantity for orders (shares or contracts).
///
/// Represented as a Decimal to handle partial quantities from fills.
/// For options, 1 contract = 100 shares underlying.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Quantity(Decimal);

impl Quantity {
    /// Create a new Quantity from a Decimal.
    #[must_use]
    pub const fn new(amount: Decimal) -> Self {
        Self(amount)
    }

    /// Create a Quantity from an integer.
    #[must_use]
    pub fn from_i64(amount: i64) -> Self {
        Self(Decimal::new(amount, 0))
    }

    /// Create a Quantity from a u32.
    #[must_use]
    pub fn from_u32(amount: u32) -> Self {
        Self(Decimal::from(amount))
    }

    /// Zero quantity.
    pub const ZERO: Self = Self(Decimal::ZERO);

    /// Get the inner Decimal value.
    #[must_use]
    pub const fn amount(&self) -> Decimal {
        self.0
    }

    /// Get the integer portion (truncated).
    ///
    /// # Note on Truncation
    ///
    /// This method casts i128 to i64, which may truncate values exceeding `i64::MAX`.
    /// This is acceptable for order quantities in this domain because:
    /// - Maximum order quantity is validated to 100,000 shares (see `validate_for_order`)
    /// - Real-world order quantities never approach `i64::MAX` (~9.2 quintillion)
    /// - The truncation would only occur for astronomically large invalid quantities
    #[must_use]
    #[allow(clippy::cast_possible_truncation)]
    pub const fn as_i64(&self) -> i64 {
        let divisor = 10i128.pow(self.0.scale());
        let result = self.0.mantissa() / divisor;
        result as i64
    }

    /// Returns true if this quantity is positive.
    #[must_use]
    pub fn is_positive(&self) -> bool {
        self.0 > Decimal::ZERO
    }

    /// Returns true if this quantity is negative.
    #[must_use]
    pub fn is_negative(&self) -> bool {
        self.0 < Decimal::ZERO
    }

    /// Returns true if this quantity is zero.
    #[must_use]
    pub fn is_zero(&self) -> bool {
        self.0 == Decimal::ZERO
    }

    /// Get the absolute value.
    #[must_use]
    pub fn abs(&self) -> Self {
        Self(self.0.abs())
    }

    /// Validate quantity for order submission.
    ///
    /// # Errors
    ///
    /// Returns error if quantity is zero, negative, or exceeds limits.
    pub fn validate_for_order(&self) -> Result<(), DomainError> {
        if self.0 <= Decimal::ZERO {
            return Err(DomainError::InvalidValue {
                field: "quantity".to_string(),
                message: "Order quantity must be positive".to_string(),
            });
        }
        let max = Decimal::new(100_000, 0);
        if self.0 > max {
            return Err(DomainError::InvalidValue {
                field: "quantity".to_string(),
                message: format!("Order quantity exceeds maximum: {max}"),
            });
        }
        Ok(())
    }

    /// Round to whole units (for final order submission).
    #[must_use]
    pub fn round_down(&self) -> Self {
        Self(self.0.floor())
    }
}

impl Default for Quantity {
    fn default() -> Self {
        Self::ZERO
    }
}

impl fmt::Display for Quantity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.0.fract().is_zero() {
            write!(f, "{}", self.0.trunc())
        } else {
            write!(f, "{:.4}", self.0)
        }
    }
}

impl PartialOrd for Quantity {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Quantity {
    fn cmp(&self, other: &Self) -> Ordering {
        self.0.cmp(&other.0)
    }
}

impl Add for Quantity {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self(self.0 + rhs.0)
    }
}

impl Sub for Quantity {
    type Output = Self;

    fn sub(self, rhs: Self) -> Self::Output {
        Self(self.0 - rhs.0)
    }
}

impl From<Decimal> for Quantity {
    fn from(value: Decimal) -> Self {
        Self(value)
    }
}

impl From<i64> for Quantity {
    fn from(value: i64) -> Self {
        Self::from_i64(value)
    }
}

impl From<u32> for Quantity {
    fn from(value: u32) -> Self {
        Self::from_u32(value)
    }
}

impl From<Quantity> for Decimal {
    fn from(value: Quantity) -> Self {
        value.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quantity_new_and_display() {
        let q = Quantity::new(Decimal::new(100, 0));
        assert_eq!(format!("{q}"), "100");
    }

    #[test]
    fn quantity_with_decimals_display() {
        let q = Quantity::new(Decimal::new(1005, 1)); // 100.5
        assert_eq!(format!("{q}"), "100.5000");
    }

    #[test]
    fn quantity_from_i64() {
        let q = Quantity::from_i64(500);
        assert_eq!(q.amount(), Decimal::new(500, 0));
    }

    #[test]
    fn quantity_from_u32() {
        let q = Quantity::from_u32(500);
        assert_eq!(q.amount(), Decimal::from(500));
    }

    #[test]
    fn quantity_zero() {
        assert!(Quantity::ZERO.is_zero());
        assert!(!Quantity::ZERO.is_positive());
        assert!(!Quantity::ZERO.is_negative());
    }

    #[test]
    fn quantity_positive_negative() {
        let pos = Quantity::from_i64(100);
        let neg = Quantity::from_i64(-50);

        assert!(pos.is_positive());
        assert!(!pos.is_negative());

        assert!(!neg.is_positive());
        assert!(neg.is_negative());
    }

    #[test]
    fn quantity_abs() {
        let neg = Quantity::from_i64(-100);
        assert_eq!(neg.abs(), Quantity::from_i64(100));
    }

    #[test]
    fn quantity_arithmetic() {
        let a = Quantity::from_i64(100);
        let b = Quantity::from_i64(30);

        assert_eq!(a + b, Quantity::from_i64(130));
        assert_eq!(a - b, Quantity::from_i64(70));
    }

    #[test]
    fn quantity_ordering() {
        let a = Quantity::from_i64(100);
        let b = Quantity::from_i64(50);

        assert!(a > b);
        assert!(b < a);
    }

    #[test]
    fn quantity_validate_for_order_zero() {
        let q = Quantity::ZERO;
        assert!(q.validate_for_order().is_err());
    }

    #[test]
    fn quantity_validate_for_order_negative() {
        let q = Quantity::from_i64(-10);
        assert!(q.validate_for_order().is_err());
    }

    #[test]
    fn quantity_validate_for_order_exceeds_max() {
        let q = Quantity::from_i64(200_000);
        assert!(q.validate_for_order().is_err());
    }

    #[test]
    fn quantity_validate_for_order_valid() {
        let q = Quantity::from_i64(100);
        assert!(q.validate_for_order().is_ok());
    }

    #[test]
    fn quantity_round_down() {
        let q = Quantity::new(Decimal::new(1055, 1)); // 105.5
        let rounded = q.round_down();
        assert_eq!(rounded.amount(), Decimal::new(105, 0));
    }

    #[test]
    fn quantity_serde_roundtrip() {
        let q = Quantity::from_i64(100);
        let json = serde_json::to_string(&q).unwrap();
        let parsed: Quantity = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, q);
    }

    #[test]
    fn quantity_from_conversions() {
        let q1: Quantity = 100i64.into();
        assert_eq!(q1, Quantity::from_i64(100));

        let q2: Quantity = 50u32.into();
        assert_eq!(q2, Quantity::from_u32(50));

        let q3: Quantity = Decimal::new(200, 0).into();
        assert_eq!(q3, Quantity::new(Decimal::new(200, 0)));
    }

    #[test]
    fn decimal_from_quantity() {
        let q = Quantity::from_i64(100);
        let d: Decimal = q.into();
        assert_eq!(d, Decimal::new(100, 0));
    }

    #[test]
    fn quantity_as_i64() {
        let q = Quantity::new(Decimal::new(1005, 1)); // 100.5
        assert_eq!(q.as_i64(), 100); // Truncates to 100
    }

    #[test]
    fn quantity_as_i64_negative() {
        let q = Quantity::new(Decimal::new(-505, 1)); // -50.5
        assert_eq!(q.as_i64(), -50);
    }

    #[test]
    fn quantity_default() {
        let q = Quantity::default();
        assert!(q.is_zero());
        assert_eq!(q, Quantity::ZERO);
    }

    #[test]
    fn quantity_partial_ord() {
        let a = Quantity::from_i64(100);
        let b = Quantity::from_i64(50);
        let c = Quantity::from_i64(100);

        assert!(a.partial_cmp(&b) == Some(Ordering::Greater));
        assert!(b.partial_cmp(&a) == Some(Ordering::Less));
        assert!(a.partial_cmp(&c) == Some(Ordering::Equal));
    }
}
