//! Risk validation context.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::{Exposure, Greeks};
use crate::domain::shared::{InstrumentId, Money, Quantity};

/// Context for risk validation.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RiskContext {
    /// Account equity.
    pub equity: Money,
    /// Available buying power.
    pub buying_power: Money,
    /// Cash available.
    pub cash: Money,
    /// Current portfolio exposure.
    pub current_exposure: Exposure,
    /// Current portfolio Greeks.
    pub current_greeks: Greeks,
    /// Current positions by instrument.
    pub positions: HashMap<String, PositionContext>,
    /// Pending orders by instrument.
    pub pending_orders: HashMap<String, PendingOrderContext>,
    /// PDT status.
    pub pdt_status: PdtStatus,
    /// Day trades remaining (if PDT restricted).
    pub day_trades_remaining: u8,
}

impl RiskContext {
    /// Create a new risk context.
    #[must_use]
    pub fn new(equity: Money, buying_power: Money) -> Self {
        Self {
            equity,
            buying_power,
            cash: Money::ZERO,
            current_exposure: Exposure::default(),
            current_greeks: Greeks::default(),
            positions: HashMap::new(),
            pending_orders: HashMap::new(),
            pdt_status: PdtStatus::NotApplicable,
            day_trades_remaining: 0,
        }
    }

    /// Add a position to the context.
    pub fn add_position(&mut self, instrument_id: impl Into<String>, position: PositionContext) {
        self.positions.insert(instrument_id.into(), position);
    }

    /// Add a pending order to the context.
    pub fn add_pending_order(
        &mut self,
        instrument_id: impl Into<String>,
        order: PendingOrderContext,
    ) {
        self.pending_orders.insert(instrument_id.into(), order);
    }

    /// Get position for an instrument.
    #[must_use]
    pub fn get_position(&self, instrument_id: &str) -> Option<&PositionContext> {
        self.positions.get(instrument_id)
    }

    /// Calculate total pending notional.
    #[must_use]
    pub fn total_pending_notional(&self) -> Money {
        self.pending_orders
            .values()
            .fold(Money::ZERO, |acc, o| acc + o.notional)
    }
}

/// Position context for a single instrument.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PositionContext {
    /// Instrument ID.
    pub instrument_id: InstrumentId,
    /// Current quantity (negative for short).
    pub quantity: Quantity,
    /// Market value.
    pub market_value: Money,
    /// Cost basis.
    pub cost_basis: Money,
    /// Unrealized P&L.
    pub unrealized_pnl: Money,
    /// Greeks (for options).
    pub greeks: Option<Greeks>,
}

impl PositionContext {
    /// Create a new position context.
    #[must_use]
    pub fn new(
        instrument_id: InstrumentId,
        quantity: Quantity,
        market_value: Money,
        cost_basis: Money,
    ) -> Self {
        let unrealized_pnl = market_value - cost_basis;
        Self {
            instrument_id,
            quantity,
            market_value,
            cost_basis,
            unrealized_pnl,
            greeks: None,
        }
    }

    /// Add Greeks to the position.
    #[must_use]
    pub const fn with_greeks(mut self, greeks: Greeks) -> Self {
        self.greeks = Some(greeks);
        self
    }

    /// Check if this is a long position.
    #[must_use]
    pub fn is_long(&self) -> bool {
        self.quantity.amount() > rust_decimal::Decimal::ZERO
    }

    /// Check if this is a short position.
    #[must_use]
    pub fn is_short(&self) -> bool {
        self.quantity.amount() < rust_decimal::Decimal::ZERO
    }
}

/// Pending order context.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PendingOrderContext {
    /// Instrument ID.
    pub instrument_id: InstrumentId,
    /// Order quantity.
    pub quantity: Quantity,
    /// Estimated notional value.
    pub notional: Money,
    /// Is this a buy order?
    pub is_buy: bool,
}

/// PDT (Pattern Day Trader) status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PdtStatus {
    /// Not applicable (account equity >= $25,000 or cash account).
    #[default]
    NotApplicable,
    /// PDT restricted (under $25,000 equity).
    Restricted,
    /// PDT flagged (exceeded day trade limit).
    Flagged,
}

impl PdtStatus {
    /// Check if PDT restricted.
    #[must_use]
    pub const fn is_restricted(&self) -> bool {
        matches!(self, Self::Restricted | Self::Flagged)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn risk_context_new() {
        let ctx = RiskContext::new(Money::usd(100_000.0), Money::usd(200_000.0));
        assert_eq!(ctx.equity, Money::usd(100_000.0));
        assert_eq!(ctx.buying_power, Money::usd(200_000.0));
    }

    #[test]
    fn risk_context_add_position() {
        let mut ctx = RiskContext::new(Money::usd(100_000.0), Money::usd(200_000.0));
        ctx.add_position(
            "AAPL",
            PositionContext::new(
                InstrumentId::new("AAPL"),
                Quantity::from_i64(100),
                Money::usd(15_000.0),
                Money::usd(14_000.0),
            ),
        );

        assert!(ctx.get_position("AAPL").is_some());
        assert_eq!(ctx.positions.len(), 1);
    }

    #[test]
    fn position_context_unrealized_pnl() {
        let pos = PositionContext::new(
            InstrumentId::new("AAPL"),
            Quantity::from_i64(100),
            Money::usd(15_000.0),
            Money::usd(14_000.0),
        );

        assert_eq!(pos.unrealized_pnl, Money::usd(1000.0));
    }

    #[test]
    fn position_context_long_short() {
        let long = PositionContext::new(
            InstrumentId::new("AAPL"),
            Quantity::from_i64(100),
            Money::usd(15_000.0),
            Money::usd(14_000.0),
        );
        assert!(long.is_long());
        assert!(!long.is_short());

        let short = PositionContext::new(
            InstrumentId::new("AAPL"),
            Quantity::from_i64(-100),
            Money::usd(15_000.0),
            Money::usd(16000.0),
        );
        assert!(!short.is_long());
        assert!(short.is_short());
    }

    #[test]
    fn pdt_status_restricted() {
        assert!(!PdtStatus::NotApplicable.is_restricted());
        assert!(PdtStatus::Restricted.is_restricted());
        assert!(PdtStatus::Flagged.is_restricted());
    }

    #[test]
    fn risk_context_total_pending_notional() {
        let mut ctx = RiskContext::new(Money::usd(100_000.0), Money::usd(200_000.0));
        ctx.add_pending_order(
            "AAPL",
            PendingOrderContext {
                instrument_id: InstrumentId::new("AAPL"),
                quantity: Quantity::from_i64(100),
                notional: Money::usd(15_000.0),
                is_buy: true,
            },
        );
        ctx.add_pending_order(
            "MSFT",
            PendingOrderContext {
                instrument_id: InstrumentId::new("MSFT"),
                quantity: Quantity::from_i64(50),
                notional: Money::usd(10000.0),
                is_buy: true,
            },
        );

        assert_eq!(ctx.total_pending_notional(), Money::usd(25000.0));
    }

    #[test]
    fn risk_context_serde() {
        let ctx = RiskContext::new(Money::usd(100_000.0), Money::usd(200_000.0));
        let json = serde_json::to_string(&ctx).unwrap();
        let parsed: RiskContext = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.equity, ctx.equity);
    }

    #[test]
    fn position_context_with_greeks() {
        let pos = PositionContext::new(
            InstrumentId::new("AAPL250117C00200000"),
            Quantity::from_i64(10),
            Money::usd(500.0),
            Money::usd(400.0),
        )
        .with_greeks(Greeks::default());

        assert!(pos.greeks.is_some());
    }

    #[test]
    fn risk_context_default() {
        let ctx = RiskContext::default();
        assert_eq!(ctx.equity, Money::ZERO);
        assert_eq!(ctx.buying_power, Money::ZERO);
        assert!(ctx.positions.is_empty());
    }
}
