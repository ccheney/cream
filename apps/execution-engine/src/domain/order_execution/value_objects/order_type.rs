//! Order type (market, limit, etc.).

use serde::{Deserialize, Serialize};
use std::fmt;

/// Order type specifying execution behavior.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderType {
    /// Market order - execute at best available price.
    Market,
    /// Limit order - execute at specified price or better.
    Limit,
    /// Stop order - becomes market order when stop price is reached.
    Stop,
    /// Stop-limit order - becomes limit order when stop price is reached.
    StopLimit,
}

impl OrderType {
    /// Returns true if this order type requires a limit price.
    #[must_use]
    pub const fn requires_limit_price(&self) -> bool {
        matches!(self, Self::Limit | Self::StopLimit)
    }

    /// Returns true if this order type requires a stop price.
    #[must_use]
    pub const fn requires_stop_price(&self) -> bool {
        matches!(self, Self::Stop | Self::StopLimit)
    }

    /// Returns true if this is a market order (immediate execution).
    #[must_use]
    pub const fn is_market(&self) -> bool {
        matches!(self, Self::Market)
    }

    /// Returns true if this is a passive order (waits for price).
    #[must_use]
    pub const fn is_passive(&self) -> bool {
        matches!(self, Self::Limit)
    }
}

impl fmt::Display for OrderType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Market => write!(f, "MARKET"),
            Self::Limit => write!(f, "LIMIT"),
            Self::Stop => write!(f, "STOP"),
            Self::StopLimit => write!(f, "STOP_LIMIT"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn order_type_requires_limit_price() {
        assert!(!OrderType::Market.requires_limit_price());
        assert!(OrderType::Limit.requires_limit_price());
        assert!(!OrderType::Stop.requires_limit_price());
        assert!(OrderType::StopLimit.requires_limit_price());
    }

    #[test]
    fn order_type_requires_stop_price() {
        assert!(!OrderType::Market.requires_stop_price());
        assert!(!OrderType::Limit.requires_stop_price());
        assert!(OrderType::Stop.requires_stop_price());
        assert!(OrderType::StopLimit.requires_stop_price());
    }

    #[test]
    fn order_type_is_market() {
        assert!(OrderType::Market.is_market());
        assert!(!OrderType::Limit.is_market());
    }

    #[test]
    fn order_type_is_passive() {
        assert!(OrderType::Limit.is_passive());
        assert!(!OrderType::Market.is_passive());
    }

    #[test]
    fn order_type_display() {
        assert_eq!(format!("{}", OrderType::Market), "MARKET");
        assert_eq!(format!("{}", OrderType::Limit), "LIMIT");
        assert_eq!(format!("{}", OrderType::Stop), "STOP");
        assert_eq!(format!("{}", OrderType::StopLimit), "STOP_LIMIT");
    }

    #[test]
    fn order_type_serde() {
        let json = serde_json::to_string(&OrderType::StopLimit).unwrap();
        assert_eq!(json, "\"STOP_LIMIT\"");

        let parsed: OrderType = serde_json::from_str("\"MARKET\"").unwrap();
        assert_eq!(parsed, OrderType::Market);
    }
}
