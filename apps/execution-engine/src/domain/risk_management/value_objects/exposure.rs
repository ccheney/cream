//! Exposure calculations.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::domain::shared::Money;

/// Portfolio exposure metrics.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Exposure {
    /// Gross exposure (sum of absolute values).
    pub gross: Money,
    /// Net exposure (long - short).
    pub net: Money,
    /// Long exposure.
    pub long: Money,
    /// Short exposure.
    pub short: Money,
}

impl Exposure {
    /// Create a new exposure.
    #[must_use]
    pub const fn new(gross: Money, net: Money, long: Money, short: Money) -> Self {
        Self {
            gross,
            net,
            long,
            short,
        }
    }

    /// Create from long and short values.
    #[must_use]
    pub fn from_long_short(long: Money, short: Money) -> Self {
        let long_val = long.amount();
        let short_val = short.amount().abs();
        Self {
            gross: Money::new(long_val + short_val),
            net: Money::new(long_val - short_val),
            long,
            short: Money::new(short_val),
        }
    }

    /// Calculate exposure as percentage of equity.
    #[must_use]
    pub fn as_pct_of_equity(&self, equity: Money) -> ExposurePercent {
        let equity_val = equity.amount();
        if equity_val == Decimal::ZERO {
            return ExposurePercent::default();
        }

        ExposurePercent {
            gross_pct: self.gross.amount() / equity_val,
            net_pct: self.net.amount() / equity_val,
            long_pct: self.long.amount() / equity_val,
            short_pct: self.short.amount().abs() / equity_val,
        }
    }

    /// Add another exposure to this one.
    #[must_use]
    pub fn add(&self, other: &Self) -> Self {
        Self {
            gross: self.gross + other.gross,
            net: self.net + other.net,
            long: self.long + other.long,
            short: self.short + other.short,
        }
    }
}

/// Exposure as percentage of equity.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ExposurePercent {
    /// Gross exposure %.
    pub gross_pct: Decimal,
    /// Net exposure %.
    pub net_pct: Decimal,
    /// Long exposure %.
    pub long_pct: Decimal,
    /// Short exposure %.
    pub short_pct: Decimal,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposure_from_long_short() {
        let exp = Exposure::from_long_short(Money::usd(10000.0), Money::usd(3000.0));

        assert_eq!(exp.long, Money::usd(10000.0));
        assert_eq!(exp.short, Money::usd(3000.0));
        assert_eq!(exp.gross, Money::usd(13000.0));
        assert_eq!(exp.net, Money::usd(7000.0));
    }

    #[test]
    fn exposure_as_pct_of_equity() {
        let exp = Exposure::from_long_short(Money::usd(10000.0), Money::usd(0.0));
        let pct = exp.as_pct_of_equity(Money::usd(50000.0));

        assert_eq!(pct.gross_pct, Decimal::new(2, 1)); // 0.2 = 20%
        assert_eq!(pct.long_pct, Decimal::new(2, 1));
    }

    #[test]
    fn exposure_as_pct_zero_equity() {
        let exp = Exposure::from_long_short(Money::usd(10000.0), Money::usd(0.0));
        let pct = exp.as_pct_of_equity(Money::ZERO);

        assert_eq!(pct.gross_pct, Decimal::ZERO);
    }

    #[test]
    fn exposure_add() {
        let exp1 = Exposure::from_long_short(Money::usd(5000.0), Money::usd(1000.0));
        let exp2 = Exposure::from_long_short(Money::usd(3000.0), Money::usd(500.0));

        let combined = exp1.add(&exp2);
        assert_eq!(combined.long, Money::usd(8000.0));
        assert_eq!(combined.short, Money::usd(1500.0));
    }

    #[test]
    fn exposure_serde() {
        let exp = Exposure::from_long_short(Money::usd(10000.0), Money::usd(3000.0));
        let json = serde_json::to_string(&exp).unwrap();
        let parsed: Exposure = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, exp);
    }

    #[test]
    fn exposure_new_const() {
        let exp = Exposure::new(
            Money::usd(13000.0),
            Money::usd(7000.0),
            Money::usd(10000.0),
            Money::usd(3000.0),
        );

        assert_eq!(exp.gross, Money::usd(13000.0));
        assert_eq!(exp.net, Money::usd(7000.0));
        assert_eq!(exp.long, Money::usd(10000.0));
        assert_eq!(exp.short, Money::usd(3000.0));
    }

    #[test]
    fn exposure_default() {
        let exp = Exposure::default();
        assert_eq!(exp.gross, Money::ZERO);
        assert_eq!(exp.net, Money::ZERO);
        assert_eq!(exp.long, Money::ZERO);
        assert_eq!(exp.short, Money::ZERO);
    }
}
