//! Market Context Value Objects for Tactic Selection

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::domain::order_execution::value_objects::OrderPurpose;

/// Urgency level for tactic selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TacticUrgency {
    /// Low urgency, optimize for best price.
    Low,
    /// Normal urgency, balance price and execution.
    Normal,
    /// High urgency, prioritize execution over price.
    High,
}

impl Default for TacticUrgency {
    fn default() -> Self {
        Self::Normal
    }
}

/// Market state for tactic selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MarketState {
    /// Normal market conditions.
    Normal,
    /// Volatile market (high price swings).
    Volatile,
    /// Wide spread (illiquid).
    WideSpread,
}

impl Default for MarketState {
    fn default() -> Self {
        Self::Normal
    }
}

/// Context for tactic selection.
#[derive(Debug, Clone)]
pub struct TacticSelectionContext {
    /// Order size as percentage of average daily volume.
    pub size_pct_adv: Decimal,
    /// Urgency level (low, normal, high).
    pub urgency: TacticUrgency,
    /// Current market state.
    pub market_state: MarketState,
    /// Is this an entry or exit order?
    pub order_purpose: OrderPurpose,
}

impl TacticSelectionContext {
    /// Create a new tactic selection context.
    #[must_use]
    pub const fn new(
        size_pct_adv: Decimal,
        urgency: TacticUrgency,
        market_state: MarketState,
        order_purpose: OrderPurpose,
    ) -> Self {
        Self {
            size_pct_adv,
            urgency,
            market_state,
            order_purpose,
        }
    }
}

/// Sub-tactic for adaptive execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubTactic {
    /// Use passive limit orders.
    PassiveLimit,
    /// Use aggressive limit orders.
    AggressiveLimit,
}

/// Market context for adaptive urgency evaluation.
#[derive(Debug, Clone)]
pub struct MarketContext {
    /// Price move since execution start (basis points).
    pub price_move_bps: Decimal,
    /// Whether price moved against our position.
    pub is_adverse_move: bool,
    /// Current volume vs expected volume ratio.
    pub volume_vs_expected: Decimal,
    /// Current spread in basis points.
    pub spread_bps: Decimal,
    /// Time remaining as percentage (0.0 to 1.0).
    pub time_remaining_pct: Decimal,
}

impl MarketContext {
    /// Create a new market context.
    #[must_use]
    pub const fn new(
        price_move_bps: Decimal,
        is_adverse_move: bool,
        volume_vs_expected: Decimal,
        spread_bps: Decimal,
        time_remaining_pct: Decimal,
    ) -> Self {
        Self {
            price_move_bps,
            is_adverse_move,
            volume_vs_expected,
            spread_bps,
            time_remaining_pct,
        }
    }

    /// Create a neutral market context (no urgency modifiers).
    #[must_use]
    pub fn neutral() -> Self {
        Self {
            price_move_bps: Decimal::ZERO,
            is_adverse_move: false,
            volume_vs_expected: Decimal::ONE,
            spread_bps: Decimal::ZERO,
            time_remaining_pct: Decimal::ONE,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tactic_urgency_default() {
        assert_eq!(TacticUrgency::default(), TacticUrgency::Normal);
    }

    #[test]
    fn market_state_default() {
        assert_eq!(MarketState::default(), MarketState::Normal);
    }

    #[test]
    fn tactic_urgency_serde() {
        let urgency = TacticUrgency::High;
        let json = serde_json::to_string(&urgency).unwrap();
        assert_eq!(json, "\"high\"");

        let parsed: TacticUrgency = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, TacticUrgency::High);
    }

    #[test]
    fn market_state_serde() {
        let state = MarketState::WideSpread;
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, "\"wide_spread\"");

        let parsed: MarketState = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, MarketState::WideSpread);
    }

    #[test]
    fn tactic_selection_context_new() {
        let ctx = TacticSelectionContext::new(
            Decimal::new(5, 2),
            TacticUrgency::High,
            MarketState::Volatile,
            OrderPurpose::Entry,
        );

        assert_eq!(ctx.size_pct_adv, Decimal::new(5, 2));
        assert_eq!(ctx.urgency, TacticUrgency::High);
        assert_eq!(ctx.market_state, MarketState::Volatile);
        assert_eq!(ctx.order_purpose, OrderPurpose::Entry);
    }

    #[test]
    fn market_context_new() {
        let ctx = MarketContext::new(
            Decimal::new(50, 0),
            true,
            Decimal::new(80, 2),
            Decimal::new(5, 0),
            Decimal::new(30, 2),
        );

        assert_eq!(ctx.price_move_bps, Decimal::new(50, 0));
        assert!(ctx.is_adverse_move);
        assert_eq!(ctx.volume_vs_expected, Decimal::new(80, 2));
        assert_eq!(ctx.spread_bps, Decimal::new(5, 0));
        assert_eq!(ctx.time_remaining_pct, Decimal::new(30, 2));
    }

    #[test]
    fn market_context_neutral() {
        let ctx = MarketContext::neutral();

        assert_eq!(ctx.price_move_bps, Decimal::ZERO);
        assert!(!ctx.is_adverse_move);
        assert_eq!(ctx.volume_vs_expected, Decimal::ONE);
        assert_eq!(ctx.spread_bps, Decimal::ZERO);
        assert_eq!(ctx.time_remaining_pct, Decimal::ONE);
    }
}
