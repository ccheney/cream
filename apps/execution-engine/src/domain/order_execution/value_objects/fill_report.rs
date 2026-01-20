//! Fill report from broker execution.

use serde::{Deserialize, Serialize};

use crate::domain::shared::{Money, Quantity, Timestamp};

/// Individual execution fill (FIX `ExecutionReport`).
///
/// Each fill represents a single execution event from the venue.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FillReport {
    /// Unique fill ID from the venue.
    pub fill_id: String,
    /// Quantity filled in this execution.
    pub quantity: Quantity,
    /// Price at which this fill occurred.
    pub price: Money,
    /// Timestamp of the fill.
    pub timestamp: Timestamp,
    /// Venue/exchange where the fill occurred.
    pub venue: String,
    /// Liquidity indicator (e.g., "MAKER", "TAKER").
    pub liquidity: Option<LiquidityType>,
    /// Commission for this fill.
    pub commission: Option<Money>,
}

impl FillReport {
    /// Create a new fill report.
    #[must_use]
    pub fn new(
        fill_id: impl Into<String>,
        quantity: Quantity,
        price: Money,
        timestamp: Timestamp,
        venue: impl Into<String>,
    ) -> Self {
        Self {
            fill_id: fill_id.into(),
            quantity,
            price,
            timestamp,
            venue: venue.into(),
            liquidity: None,
            commission: None,
        }
    }

    /// Add liquidity type to the fill.
    #[must_use]
    pub fn with_liquidity(mut self, liquidity: LiquidityType) -> Self {
        self.liquidity = Some(liquidity);
        self
    }

    /// Add commission to the fill.
    #[must_use]
    pub fn with_commission(mut self, commission: Money) -> Self {
        self.commission = Some(commission);
        self
    }

    /// Calculate the notional value of this fill.
    #[must_use]
    pub fn notional(&self) -> Money {
        Money::new(self.price.amount() * self.quantity.amount())
    }
}

/// Liquidity type for fills.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum LiquidityType {
    /// Filled as maker (added liquidity).
    Maker,
    /// Filled as taker (removed liquidity).
    Taker,
    /// Unknown liquidity type.
    Unknown,
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;

    fn make_fill() -> FillReport {
        FillReport::new(
            "fill-123",
            Quantity::from_i64(100),
            Money::usd(150.00),
            Timestamp::now(),
            "NYSE",
        )
    }

    #[test]
    fn fill_report_new() {
        let fill = make_fill();
        assert_eq!(fill.fill_id, "fill-123");
        assert_eq!(fill.quantity, Quantity::from_i64(100));
        assert_eq!(fill.venue, "NYSE");
        assert!(fill.liquidity.is_none());
        assert!(fill.commission.is_none());
    }

    #[test]
    fn fill_report_with_liquidity() {
        let fill = make_fill().with_liquidity(LiquidityType::Taker);
        assert_eq!(fill.liquidity, Some(LiquidityType::Taker));
    }

    #[test]
    fn fill_report_with_commission() {
        let fill = make_fill().with_commission(Money::usd(1.50));
        assert_eq!(fill.commission, Some(Money::usd(1.50)));
    }

    #[test]
    fn fill_report_notional() {
        let fill = make_fill();
        let notional = fill.notional();
        // 100 shares * $150.00 = $15,000
        assert_eq!(notional.amount(), Decimal::try_from(15000.0).unwrap());
    }

    #[test]
    fn fill_report_serde() {
        let fill = make_fill().with_liquidity(LiquidityType::Maker);
        let json = serde_json::to_string(&fill).unwrap();
        let parsed: FillReport = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.fill_id, fill.fill_id);
        assert_eq!(parsed.liquidity, Some(LiquidityType::Maker));
    }

    #[test]
    fn liquidity_type_serde() {
        let json = serde_json::to_string(&LiquidityType::Taker).unwrap();
        assert_eq!(json, "\"TAKER\"");
    }
}
