//! Decision plan types from the agent network.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

/// Trading action type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Action {
    /// Enter a new position.
    Buy,
    /// Exit a position.
    Sell,
    /// Maintain current position.
    Hold,
    /// Close an existing position.
    Close,
    /// No trade for this cycle.
    NoTrade,
}

/// Position direction.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Direction {
    /// Long position.
    Long,
    /// Short position.
    Short,
    /// Flat (no position).
    Flat,
}

/// Size unit for position sizing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SizeUnit {
    /// Number of shares.
    Shares,
    /// Number of option contracts.
    Contracts,
    /// Dollar amount.
    Dollars,
    /// Percentage of equity.
    PctEquity,
}

/// Position size specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Size {
    /// Size quantity.
    pub quantity: Decimal,
    /// Size unit.
    pub unit: SizeUnit,
}

/// Strategy family - position type classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum StrategyFamily {
    /// Long equity position.
    EquityLong,
    /// Short equity position.
    EquityShort,
    /// Long option position.
    OptionLong,
    /// Short option position.
    OptionShort,
    /// Vertical spread (bull/bear spread).
    VerticalSpread,
    /// Iron condor strategy.
    IronCondor,
    /// Straddle (same strike call + put).
    Straddle,
    /// Strangle (different strike call + put).
    Strangle,
    /// Calendar spread (different expiration).
    CalendarSpread,
}

/// Time horizon for the trade.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TimeHorizon {
    /// Intraday (same day).
    Intraday,
    /// Swing (1-5 days).
    Swing,
    /// Position (5-20 days).
    Position,
    /// Long-term (20+ days).
    LongTerm,
}

/// Thesis lifecycle state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ThesisState {
    /// Watching the opportunity.
    Watching,
    /// Position entered.
    Entered,
    /// Adding to position.
    Adding,
    /// Managing existing position.
    Managing,
    /// Exiting position.
    Exiting,
    /// Position closed.
    Closed,
}

/// Position intent for options orders.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PositionIntent {
    /// Buy to open a new position.
    BuyToOpen,
    /// Buy to close an existing position.
    BuyToClose,
    /// Sell to open a new position.
    SellToOpen,
    /// Sell to close an existing position.
    SellToClose,
}

/// Option leg for multi-leg strategies.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionLeg {
    /// OCC option symbol (e.g., "AAPL250117P00190000").
    pub symbol: String,
    /// Quantity ratio - positive for buy, negative for sell.
    pub ratio_qty: i32,
    /// Position intent for the leg.
    pub position_intent: PositionIntent,
}

/// A single trading decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Decision {
    /// Unique decision ID.
    pub decision_id: String,
    /// Instrument ID (ticker or option symbol).
    pub instrument_id: String,
    /// Trading action.
    pub action: Action,
    /// Position direction.
    pub direction: Direction,
    /// Position size.
    pub size: Size,
    /// Stop loss price level.
    pub stop_loss_level: Decimal,
    /// Take profit price level.
    pub take_profit_level: Decimal,
    /// Limit price for entry (if applicable).
    pub limit_price: Option<Decimal>,
    /// Strategy family.
    pub strategy_family: StrategyFamily,
    /// Time horizon.
    pub time_horizon: TimeHorizon,
    /// Thesis lifecycle state.
    pub thesis_state: ThesisState,
    /// Bullish factors supporting the decision.
    pub bullish_factors: Vec<String>,
    /// Bearish factors considered.
    pub bearish_factors: Vec<String>,
    /// Short rationale for the decision.
    pub rationale: String,
    /// Confidence score (0.0 to 1.0).
    pub confidence: Decimal,
    /// Option legs for multi-leg strategies (empty for single-leg orders).
    pub legs: Vec<OptionLeg>,
    /// Net limit price for multi-leg orders (debit positive, credit negative).
    pub net_limit_price: Option<Decimal>,
}

/// Complete decision plan from the agent network.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecisionPlan {
    /// Plan ID.
    pub plan_id: String,
    /// Cycle ID.
    pub cycle_id: String,
    /// Timestamp (ISO 8601).
    pub timestamp: String,
    /// Individual decisions.
    pub decisions: Vec<Decision>,
    /// Whether Risk Manager approved.
    pub risk_manager_approved: bool,
    /// Whether Critic approved.
    pub critic_approved: bool,
    /// Overall plan rationale.
    pub plan_rationale: String,
}

impl DecisionPlan {
    /// Returns true if the plan is approved (both Risk Manager and Critic).
    #[must_use]
    pub const fn is_approved(&self) -> bool {
        self.risk_manager_approved && self.critic_approved
    }

    /// Returns the number of tradeable decisions (not `HOLD` or `NO_TRADE`).
    #[must_use]
    pub fn tradeable_count(&self) -> usize {
        self.decisions
            .iter()
            .filter(|d| !matches!(d.action, Action::Hold | Action::NoTrade))
            .count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decision_plan_approved() {
        let plan = DecisionPlan {
            plan_id: "test".to_string(),
            cycle_id: "cycle-1".to_string(),
            timestamp: "2026-01-04T12:00:00Z".to_string(),
            decisions: vec![],
            risk_manager_approved: true,
            critic_approved: true,
            plan_rationale: "Test".to_string(),
        };
        assert!(plan.is_approved());
    }

    #[test]
    fn test_decision_plan_not_approved() {
        let plan = DecisionPlan {
            plan_id: "test".to_string(),
            cycle_id: "cycle-1".to_string(),
            timestamp: "2026-01-04T12:00:00Z".to_string(),
            decisions: vec![],
            risk_manager_approved: true,
            critic_approved: false,
            plan_rationale: "Test".to_string(),
        };
        assert!(!plan.is_approved());
    }
}
