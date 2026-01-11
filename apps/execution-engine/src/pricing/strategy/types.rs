//! Strategy type definitions.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::options::Greeks;

use super::leg::{LegDirection, StrategyLeg};

/// Type of options strategy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StrategyType {
    /// Iron Condor (neutral strategy).
    IronCondor,
    /// Bull Call Spread (bullish).
    BullCallSpread,
    /// Bear Call Spread (bearish).
    BearCallSpread,
    /// Bull Put Spread (bullish).
    BullPutSpread,
    /// Bear Put Spread (bearish).
    BearPutSpread,
    /// Straddle (volatility play).
    Straddle,
    /// Strangle (volatility play).
    Strangle,
    /// Iron Butterfly (neutral).
    IronButterfly,
    /// Call Butterfly.
    CallButterfly,
    /// Put Butterfly.
    PutButterfly,
    /// Calendar Spread (time spread, same strike different expirations).
    CalendarSpread,
    /// Diagonal Spread (different strikes AND expirations).
    DiagonalSpread,
    /// Custom strategy (any combination of legs).
    Custom,
}

/// A complete options strategy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionsStrategy {
    /// Strategy type.
    pub strategy_type: StrategyType,
    /// Underlying symbol.
    pub underlying: String,
    /// Expiration date (YYYY-MM-DD).
    pub expiration: String,
    /// All legs of the strategy.
    pub legs: Vec<StrategyLeg>,
    /// Net credit/debit (positive = credit).
    pub net_premium: Decimal,
    /// Maximum profit.
    pub max_profit: Decimal,
    /// Maximum loss.
    pub max_loss: Decimal,
    /// Breakeven points.
    pub breakevens: Vec<Decimal>,
    /// Aggregate Greeks.
    pub greeks: Option<Greeks>,
}

impl OptionsStrategy {
    /// Calculate aggregate Greeks from legs.
    #[must_use]
    pub fn aggregate_greeks(&self) -> Option<Greeks> {
        let mut agg = Greeks::default();
        let mut has_greeks = false;

        for leg in &self.legs {
            if let Some(ref g) = leg.greeks {
                has_greeks = true;
                let multiplier = match leg.direction {
                    LegDirection::Long => Decimal::from(leg.quantity),
                    LegDirection::Short => -Decimal::from(leg.quantity),
                };
                agg = agg.add(&g.scale(multiplier));
            }
        }

        if has_greeks { Some(agg) } else { None }
    }
}
