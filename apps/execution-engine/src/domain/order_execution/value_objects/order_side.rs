//! Order side (buy or sell).

use serde::{Deserialize, Serialize};
use std::fmt;

/// Order side (buy or sell).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderSide {
    /// Buy order.
    Buy,
    /// Sell order.
    Sell,
}

impl OrderSide {
    /// Returns the opposite side.
    #[must_use]
    pub const fn opposite(&self) -> Self {
        match self {
            Self::Buy => Self::Sell,
            Self::Sell => Self::Buy,
        }
    }

    /// Returns the sign for position calculations.
    ///
    /// Buy = +1, Sell = -1
    #[must_use]
    pub const fn sign(&self) -> i32 {
        match self {
            Self::Buy => 1,
            Self::Sell => -1,
        }
    }
}

impl fmt::Display for OrderSide {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Buy => write!(f, "BUY"),
            Self::Sell => write!(f, "SELL"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn order_side_opposite() {
        assert_eq!(OrderSide::Buy.opposite(), OrderSide::Sell);
        assert_eq!(OrderSide::Sell.opposite(), OrderSide::Buy);
    }

    #[test]
    fn order_side_sign() {
        assert_eq!(OrderSide::Buy.sign(), 1);
        assert_eq!(OrderSide::Sell.sign(), -1);
    }

    #[test]
    fn order_side_display() {
        assert_eq!(format!("{}", OrderSide::Buy), "BUY");
        assert_eq!(format!("{}", OrderSide::Sell), "SELL");
    }

    #[test]
    fn order_side_serde() {
        let json = serde_json::to_string(&OrderSide::Buy).unwrap();
        assert_eq!(json, "\"BUY\"");

        let parsed: OrderSide = serde_json::from_str("\"SELL\"").unwrap();
        assert_eq!(parsed, OrderSide::Sell);
    }
}
