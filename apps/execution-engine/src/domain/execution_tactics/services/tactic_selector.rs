//! Tactic Selector Domain Service

use rust_decimal::Decimal;

use crate::domain::execution_tactics::value_objects::{
    MarketState, TacticSelectionContext, TacticType, TacticUrgency,
};
use crate::domain::order_execution::value_objects::OrderPurpose;

/// Tactic selector for choosing the best execution tactic.
#[derive(Debug, Clone)]
pub struct TacticSelector {
    /// Tactic for entries.
    entry: TacticType,
    /// Tactic for exits.
    exit: TacticType,
    /// Tactic for stop-losses.
    stop_loss: TacticType,
}

impl Default for TacticSelector {
    fn default() -> Self {
        Self {
            entry: TacticType::PassiveLimit,
            exit: TacticType::AggressiveLimit,
            stop_loss: TacticType::AggressiveLimit,
        }
    }
}

impl TacticSelector {
    /// Create a new tactic selector with custom defaults.
    #[must_use]
    pub const fn new(entry: TacticType, exit: TacticType, stop_loss: TacticType) -> Self {
        Self {
            entry,
            exit,
            stop_loss,
        }
    }

    /// Create a selector that prefers passive tactics.
    #[must_use]
    pub const fn passive() -> Self {
        Self {
            entry: TacticType::PassiveLimit,
            exit: TacticType::PassiveLimit,
            stop_loss: TacticType::AggressiveLimit,
        }
    }

    /// Create a selector that prefers aggressive tactics.
    #[must_use]
    pub const fn aggressive() -> Self {
        Self {
            entry: TacticType::AggressiveLimit,
            exit: TacticType::AggressiveLimit,
            stop_loss: TacticType::AggressiveLimit,
        }
    }

    /// Select the best tactic for the given context.
    ///
    /// Uses the tactic selection matrix from docs/plans/07-execution.md.
    #[must_use]
    pub fn select(&self, context: &TacticSelectionContext) -> TacticType {
        // Stop-loss orders always use aggressive limit
        if context.order_purpose == OrderPurpose::StopLoss {
            return self.stop_loss;
        }

        // Volatile markets always use aggressive limit
        if context.market_state == MarketState::Volatile {
            return TacticType::AggressiveLimit;
        }

        // Size-based selection (ADV = Average Daily Volume)
        let size_threshold_small = Decimal::new(1, 2); // 0.01 (1% ADV)
        let size_threshold_medium = Decimal::new(5, 2); // 0.05 (5% ADV)

        match (context.size_pct_adv, context.urgency, context.market_state) {
            // Small orders (<1% ADV)
            (size, TacticUrgency::Low, MarketState::Normal) if size < size_threshold_small => {
                TacticType::PassiveLimit
            }
            (size, TacticUrgency::High, MarketState::Normal) if size < size_threshold_small => {
                TacticType::AggressiveLimit
            }
            (size, _, MarketState::WideSpread) if size < size_threshold_small => {
                TacticType::PassiveLimit
            }

            // Medium orders (1-5% ADV)
            (size, TacticUrgency::Low, MarketState::Normal)
                if size >= size_threshold_small && size < size_threshold_medium =>
            {
                TacticType::Twap
            }
            (size, TacticUrgency::High, MarketState::Normal)
                if size >= size_threshold_small && size < size_threshold_medium =>
            {
                TacticType::Adaptive
            }

            // Large orders (>5% ADV)
            (size, TacticUrgency::Low, MarketState::Normal) if size >= size_threshold_medium => {
                TacticType::Vwap
            }
            (size, _, _) if size >= size_threshold_medium => TacticType::Iceberg,

            // Default based on order purpose
            _ => match context.order_purpose {
                OrderPurpose::Entry | OrderPurpose::ScaleIn => self.entry,
                OrderPurpose::Exit | OrderPurpose::ScaleOut | OrderPurpose::BracketLeg => self.exit,
                OrderPurpose::StopLoss | OrderPurpose::TakeProfit => self.stop_loss,
            },
        }
    }

    /// Get the entry tactic.
    #[must_use]
    pub const fn entry_tactic(&self) -> TacticType {
        self.entry
    }

    /// Get the exit tactic.
    #[must_use]
    pub const fn exit_tactic(&self) -> TacticType {
        self.exit
    }

    /// Get the stop-loss tactic.
    #[must_use]
    pub const fn stop_loss_tactic(&self) -> TacticType {
        self.stop_loss
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context(
        size_pct_adv: Decimal,
        urgency: TacticUrgency,
        market_state: MarketState,
        order_purpose: OrderPurpose,
    ) -> TacticSelectionContext {
        TacticSelectionContext::new(size_pct_adv, urgency, market_state, order_purpose)
    }

    #[test]
    fn tactic_selector_default() {
        let selector = TacticSelector::default();
        assert_eq!(selector.entry_tactic(), TacticType::PassiveLimit);
        assert_eq!(selector.exit_tactic(), TacticType::AggressiveLimit);
        assert_eq!(selector.stop_loss_tactic(), TacticType::AggressiveLimit);
    }

    #[test]
    fn tactic_selector_passive() {
        let selector = TacticSelector::passive();
        assert_eq!(selector.entry_tactic(), TacticType::PassiveLimit);
        assert_eq!(selector.exit_tactic(), TacticType::PassiveLimit);
        assert_eq!(selector.stop_loss_tactic(), TacticType::AggressiveLimit);
    }

    #[test]
    fn tactic_selector_aggressive() {
        let selector = TacticSelector::aggressive();
        assert_eq!(selector.entry_tactic(), TacticType::AggressiveLimit);
        assert_eq!(selector.exit_tactic(), TacticType::AggressiveLimit);
        assert_eq!(selector.stop_loss_tactic(), TacticType::AggressiveLimit);
    }

    #[test]
    fn select_stop_loss_always_aggressive() {
        let selector = TacticSelector::default();
        let ctx = context(
            Decimal::new(1, 2),
            TacticUrgency::Low,
            MarketState::Normal,
            OrderPurpose::StopLoss,
        );

        let tactic = selector.select(&ctx);
        assert_eq!(tactic, TacticType::AggressiveLimit);
    }

    #[test]
    fn select_volatile_market_aggressive() {
        let selector = TacticSelector::default();
        let ctx = context(
            Decimal::new(1, 2),
            TacticUrgency::Low,
            MarketState::Volatile,
            OrderPurpose::Entry,
        );

        let tactic = selector.select(&ctx);
        assert_eq!(tactic, TacticType::AggressiveLimit);
    }

    #[test]
    fn select_small_order_low_urgency_passive() {
        let selector = TacticSelector::default();
        let ctx = context(
            Decimal::new(5, 3), // 0.005 (0.5%)
            TacticUrgency::Low,
            MarketState::Normal,
            OrderPurpose::Entry,
        );

        let tactic = selector.select(&ctx);
        assert_eq!(tactic, TacticType::PassiveLimit);
    }

    #[test]
    fn select_small_order_high_urgency_aggressive() {
        let selector = TacticSelector::default();
        let ctx = context(
            Decimal::new(5, 3), // 0.005 (0.5%)
            TacticUrgency::High,
            MarketState::Normal,
            OrderPurpose::Entry,
        );

        let tactic = selector.select(&ctx);
        assert_eq!(tactic, TacticType::AggressiveLimit);
    }

    #[test]
    fn select_small_order_wide_spread_passive() {
        let selector = TacticSelector::default();
        let ctx = context(
            Decimal::new(5, 3), // 0.005 (0.5%)
            TacticUrgency::High,
            MarketState::WideSpread,
            OrderPurpose::Entry,
        );

        let tactic = selector.select(&ctx);
        assert_eq!(tactic, TacticType::PassiveLimit);
    }

    #[test]
    fn select_medium_order_low_urgency_twap() {
        let selector = TacticSelector::default();
        let ctx = context(
            Decimal::new(3, 2), // 0.03 (3%)
            TacticUrgency::Low,
            MarketState::Normal,
            OrderPurpose::Entry,
        );

        let tactic = selector.select(&ctx);
        assert_eq!(tactic, TacticType::Twap);
    }

    #[test]
    fn select_medium_order_high_urgency_adaptive() {
        let selector = TacticSelector::default();
        let ctx = context(
            Decimal::new(3, 2), // 0.03 (3%)
            TacticUrgency::High,
            MarketState::Normal,
            OrderPurpose::Entry,
        );

        let tactic = selector.select(&ctx);
        assert_eq!(tactic, TacticType::Adaptive);
    }

    #[test]
    fn select_large_order_low_urgency_vwap() {
        let selector = TacticSelector::default();
        let ctx = context(
            Decimal::new(10, 2), // 0.10 (10%)
            TacticUrgency::Low,
            MarketState::Normal,
            OrderPurpose::Entry,
        );

        let tactic = selector.select(&ctx);
        assert_eq!(tactic, TacticType::Vwap);
    }

    #[test]
    fn select_large_order_high_urgency_iceberg() {
        let selector = TacticSelector::default();
        let ctx = context(
            Decimal::new(10, 2), // 0.10 (10%)
            TacticUrgency::High,
            MarketState::Normal,
            OrderPurpose::Entry,
        );

        let tactic = selector.select(&ctx);
        assert_eq!(tactic, TacticType::Iceberg);
    }

    #[test]
    fn select_default_entry() {
        let selector = TacticSelector::default();
        let ctx = context(
            Decimal::new(1, 2), // 0.01 (1%) - exactly at threshold
            TacticUrgency::Normal,
            MarketState::Normal,
            OrderPurpose::Entry,
        );

        let tactic = selector.select(&ctx);
        assert_eq!(tactic, TacticType::PassiveLimit);
    }

    #[test]
    fn select_default_exit() {
        let selector = TacticSelector::default();
        let ctx = context(
            Decimal::new(1, 2), // 0.01 (1%)
            TacticUrgency::Normal,
            MarketState::Normal,
            OrderPurpose::Exit,
        );

        let tactic = selector.select(&ctx);
        assert_eq!(tactic, TacticType::AggressiveLimit);
    }

    #[test]
    fn select_custom_selector() {
        let selector = TacticSelector::new(TacticType::Twap, TacticType::Vwap, TacticType::Iceberg);

        let ctx = context(
            Decimal::new(1, 2),
            TacticUrgency::Normal,
            MarketState::Normal,
            OrderPurpose::Entry,
        );

        let tactic = selector.select(&ctx);
        assert_eq!(tactic, TacticType::Twap);
    }
}
