//! Options rolling logic and edge case handling.
//!
//! Provides comprehensive rolling support for options positions:
//! - Time-based, profit-based, and loss-based triggers
//! - Atomic vs sequential roll mechanics
//! - Fractional contract rounding (conservative floor)
//! - Partial fill monitoring and recovery
//! - Assignment risk monitoring during rolls
//!
//! Reference: docs/plans/08-options.md (Rolling Logic section)

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::{AssignmentRiskLevel, OptionType};

// ============================================================================
// Configuration
// ============================================================================

/// Rolling configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollConfig {
    // Time-based triggers
    /// Roll credit positions when DTE <= this value.
    pub credit_dte_trigger: u32,
    /// Roll all positions when DTE <= this value (urgent).
    pub urgent_dte_trigger: u32,
    /// Roll when DTE <= this AND profitable.
    pub profitable_dte_trigger: u32,

    // Profit/loss triggers
    /// Roll credit spreads at this percentage of max profit (0.50 = 50%).
    pub profit_target_pct: Decimal,
    /// Roll credit spreads when loss reaches this multiple of credit (2.0 = 2x).
    pub loss_trigger_multiple: Decimal,

    // Roll timing
    /// Preferred roll hour (ET, 24-hour).
    pub preferred_roll_hour: u8,
    /// Avoid overnight exposure for ITM options.
    pub avoid_itm_overnight: bool,

    // Partial fill handling
    /// Timeout for partial fills before cancellation (seconds).
    pub partial_fill_timeout_secs: u64,
    /// Assignment risk check interval during roll (seconds).
    pub assignment_check_interval_secs: u64,

    // New position parameters
    /// DTE for new position (standard roll).
    pub roll_target_dte_min: u32,
    /// DTE for new position (max).
    pub roll_target_dte_max: u32,
}

impl Default for RollConfig {
    fn default() -> Self {
        Self {
            // Time-based
            credit_dte_trigger: 7,
            urgent_dte_trigger: 3,
            profitable_dte_trigger: 21,

            // Profit/loss
            profit_target_pct: Decimal::new(50, 2),    // 50%
            loss_trigger_multiple: Decimal::new(2, 0), // 2x

            // Timing
            preferred_roll_hour: 14, // 2 PM ET
            avoid_itm_overnight: true,

            // Partial fills
            partial_fill_timeout_secs: 30,
            assignment_check_interval_secs: 5,

            // New position
            roll_target_dte_min: 7,
            roll_target_dte_max: 14,
        }
    }
}

// ============================================================================
// Roll Triggers
// ============================================================================

/// Reason for rolling a position.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RollReason {
    /// DTE is too low for credit positions.
    CreditDteThreshold,
    /// DTE is critically low for any position.
    UrgentDte,
    /// Position is profitable and DTE is low.
    ProfitableEarlyRoll,
    /// Profit target reached.
    ProfitTarget,
    /// Loss threshold exceeded.
    LossThreshold,
    /// High assignment risk.
    AssignmentRisk,
    /// Earnings or dividend approaching.
    EventRisk,
}

/// Result of checking if a position should be rolled.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollTriggerResult {
    /// Whether a roll is triggered.
    pub should_roll: bool,
    /// Reason for the roll (if triggered).
    pub reason: Option<RollReason>,
    /// Urgency level (0 = low, 10 = critical).
    pub urgency: u8,
    /// Additional context.
    pub context: String,
}

/// Position state for roll evaluation.
#[derive(Debug, Clone)]
pub struct PositionForRoll {
    /// Position ID.
    pub position_id: String,
    /// Days to expiration.
    pub dte: u32,
    /// Whether this is a credit position.
    pub is_credit: bool,
    /// Credit received (for credit positions).
    pub credit_received: Decimal,
    /// Current position value.
    pub current_value: Decimal,
    /// Maximum profit possible.
    pub max_profit: Decimal,
    /// Whether any leg is in-the-money.
    pub has_itm_leg: bool,
    /// Current assignment risk.
    pub assignment_risk: AssignmentRiskLevel,
    /// Whether earnings are approaching.
    pub earnings_approaching: bool,
    /// Whether ex-dividend date is approaching.
    pub dividend_approaching: bool,
}

/// Check if a position should be rolled.
#[must_use]
pub fn check_roll_trigger(position: &PositionForRoll, config: &RollConfig) -> RollTriggerResult {
    // Check assignment risk first (highest priority)
    if position.assignment_risk == AssignmentRiskLevel::Critical {
        return RollTriggerResult {
            should_roll: true,
            reason: Some(RollReason::AssignmentRisk),
            urgency: 10,
            context: "Critical assignment risk detected".to_string(),
        };
    }

    // Check event risk
    if position.earnings_approaching || position.dividend_approaching {
        let event = if position.earnings_approaching {
            "earnings"
        } else {
            "ex-dividend date"
        };
        return RollTriggerResult {
            should_roll: true,
            reason: Some(RollReason::EventRisk),
            urgency: 8,
            context: format!("Upcoming {event} may affect position"),
        };
    }

    // Check urgent DTE (applies to all positions)
    if position.dte <= config.urgent_dte_trigger {
        return RollTriggerResult {
            should_roll: true,
            reason: Some(RollReason::UrgentDte),
            urgency: 9,
            context: format!(
                "DTE ({}) is at or below urgent threshold ({})",
                position.dte, config.urgent_dte_trigger
            ),
        };
    }

    // For credit positions
    if position.is_credit {
        // Check credit DTE threshold
        if position.dte <= config.credit_dte_trigger {
            return RollTriggerResult {
                should_roll: true,
                reason: Some(RollReason::CreditDteThreshold),
                urgency: 7,
                context: format!(
                    "Credit position DTE ({}) at threshold ({})",
                    position.dte, config.credit_dte_trigger
                ),
            };
        }

        // Check profit target
        let current_profit = position.credit_received - position.current_value;
        let profit_pct = if position.max_profit > Decimal::ZERO {
            current_profit / position.max_profit
        } else {
            Decimal::ZERO
        };

        if profit_pct >= config.profit_target_pct {
            return RollTriggerResult {
                should_roll: true,
                reason: Some(RollReason::ProfitTarget),
                urgency: 5,
                context: format!(
                    "Profit target reached ({:.1}% of max)",
                    profit_pct * Decimal::new(100, 0)
                ),
            };
        }

        // Check loss threshold
        let current_loss = position.current_value - position.credit_received;
        if current_loss > Decimal::ZERO {
            let loss_multiple = current_loss / position.credit_received;
            if loss_multiple >= config.loss_trigger_multiple {
                return RollTriggerResult {
                    should_roll: true,
                    reason: Some(RollReason::LossThreshold),
                    urgency: 8,
                    context: format!("Loss threshold exceeded ({loss_multiple:.1}x credit)"),
                };
            }
        }

        // Check profitable early roll
        if position.dte <= config.profitable_dte_trigger && current_profit > Decimal::ZERO {
            return RollTriggerResult {
                should_roll: true,
                reason: Some(RollReason::ProfitableEarlyRoll),
                urgency: 4,
                context: format!(
                    "Profitable position with DTE {} <= {}",
                    position.dte, config.profitable_dte_trigger
                ),
            };
        }
    }

    RollTriggerResult {
        should_roll: false,
        reason: None,
        urgency: 0,
        context: "No roll trigger met".to_string(),
    }
}

// ============================================================================
// Roll Order Building
// ============================================================================

/// Type of roll order.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RollOrderType {
    /// Single atomic order with close and open legs.
    Atomic,
    /// Sequential close then open.
    Sequential,
}

/// A roll order specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollOrder {
    /// Order type.
    pub order_type: RollOrderType,
    /// Position ID being rolled.
    pub position_id: String,
    /// Legs to close (existing position).
    pub close_legs: Vec<RollLeg>,
    /// Legs to open (new position).
    pub open_legs: Vec<RollLeg>,
    /// Net credit/debit for the roll.
    pub net_premium: Decimal,
    /// Whether the roll is for a credit (positive) or debit (negative).
    pub is_net_credit: bool,
    /// Roll reason.
    pub reason: RollReason,
}

/// A leg in a roll order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollLeg {
    /// Option ticker.
    pub ticker: String,
    /// Underlying ticker.
    pub underlying: String,
    /// Option type (call/put).
    pub option_type: OptionType,
    /// Strike price.
    pub strike: Decimal,
    /// Expiration date (YYYY-MM-DD).
    pub expiration: String,
    /// Quantity (positive = buy, negative = sell).
    pub quantity: i32,
    /// Side for order (buy or sell).
    pub side: String,
    /// Limit price.
    pub limit_price: Option<Decimal>,
}

/// Builder for roll orders.
#[derive(Debug, Default)]
pub struct RollOrderBuilder {
    position_id: Option<String>,
    close_legs: Vec<RollLeg>,
    open_legs: Vec<RollLeg>,
    reason: Option<RollReason>,
    prefer_atomic: bool,
    broker_supports_atomic: bool,
}

impl RollOrderBuilder {
    /// Create a new roll order builder.
    #[must_use]
    pub fn new() -> Self {
        Self {
            prefer_atomic: true,
            broker_supports_atomic: true,
            ..Default::default()
        }
    }

    /// Set the position ID.
    #[must_use]
    pub fn position_id(mut self, id: &str) -> Self {
        self.position_id = Some(id.to_string());
        self
    }

    /// Add a close leg.
    #[must_use]
    pub fn close_leg(mut self, leg: RollLeg) -> Self {
        self.close_legs.push(leg);
        self
    }

    /// Add an open leg.
    #[must_use]
    pub fn open_leg(mut self, leg: RollLeg) -> Self {
        self.open_legs.push(leg);
        self
    }

    /// Set the roll reason.
    #[must_use]
    pub fn reason(mut self, reason: RollReason) -> Self {
        self.reason = Some(reason);
        self
    }

    /// Set whether to prefer atomic orders.
    #[must_use]
    pub fn prefer_atomic(mut self, prefer: bool) -> Self {
        self.prefer_atomic = prefer;
        self
    }

    /// Set whether broker supports atomic orders.
    #[must_use]
    pub fn broker_supports_atomic(mut self, supports: bool) -> Self {
        self.broker_supports_atomic = supports;
        self
    }

    /// Build the roll order.
    pub fn build(self) -> Result<RollOrder, RollError> {
        let position_id = self
            .position_id
            .ok_or_else(|| RollError::InvalidOrder("Position ID required".to_string()))?;

        if self.close_legs.is_empty() {
            return Err(RollError::InvalidOrder(
                "No close legs specified".to_string(),
            ));
        }

        if self.open_legs.is_empty() {
            return Err(RollError::InvalidOrder(
                "No open legs specified".to_string(),
            ));
        }

        let reason = self
            .reason
            .ok_or_else(|| RollError::InvalidOrder("Roll reason required".to_string()))?;

        // Calculate net premium
        let close_premium: Decimal = self
            .close_legs
            .iter()
            .filter_map(|l| l.limit_price.map(|p| p * Decimal::from(l.quantity.abs())))
            .sum();
        let open_premium: Decimal = self
            .open_legs
            .iter()
            .filter_map(|l| l.limit_price.map(|p| p * Decimal::from(l.quantity.abs())))
            .sum();
        let net_premium = close_premium - open_premium;

        // Determine order type
        let order_type = if self.prefer_atomic && self.broker_supports_atomic {
            RollOrderType::Atomic
        } else {
            RollOrderType::Sequential
        };

        Ok(RollOrder {
            order_type,
            position_id,
            close_legs: self.close_legs,
            open_legs: self.open_legs,
            net_premium,
            is_net_credit: net_premium > Decimal::ZERO,
            reason,
        })
    }
}

// ============================================================================
// Fractional Contract Rounding
// ============================================================================

/// Round contract quantity conservatively (always floor).
///
/// For rolling, we always round down to avoid overexposure.
#[must_use]
pub fn round_contracts_conservative(quantity: Decimal) -> i32 {
    // Use floor for conservative rounding
    quantity.floor().try_into().unwrap_or(0)
}

/// Calculate new contract quantity for a roll.
///
/// Takes into account delta targeting and conservative rounding.
#[must_use]
pub fn calculate_roll_quantity(
    original_quantity: i32,
    original_delta_per_contract: Decimal,
    new_delta_per_contract: Decimal,
    maintain_delta_exposure: bool,
) -> i32 {
    if !maintain_delta_exposure {
        return original_quantity;
    }

    if new_delta_per_contract.abs() < Decimal::new(1, 3) {
        // New option has near-zero delta, can't maintain exposure
        return original_quantity;
    }

    let total_delta = Decimal::from(original_quantity) * original_delta_per_contract;
    let new_quantity = total_delta / new_delta_per_contract;

    round_contracts_conservative(new_quantity.abs()) * original_quantity.signum()
}

// ============================================================================
// Roll Timing
// ============================================================================

/// Check if now is a good time to roll.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollTimingResult {
    /// Whether now is a good time to roll.
    pub is_good_time: bool,
    /// Reasons for the timing recommendation.
    pub reasons: Vec<String>,
    /// Recommended action.
    pub recommendation: RollTimingRecommendation,
}

/// Timing recommendation for rolls.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RollTimingRecommendation {
    /// Roll now.
    RollNow,
    /// Wait for better timing.
    Wait,
    /// Roll immediately regardless of timing.
    Urgent,
}

/// Check if timing is good for rolling.
#[must_use]
pub fn check_roll_timing(
    current_hour: u8, // ET
    is_market_hours: bool,
    has_itm_leg: bool,
    is_friday: bool,
    config: &RollConfig,
) -> RollTimingResult {
    let mut reasons = Vec::new();
    let mut is_good_time = true;

    // Check market hours
    if !is_market_hours {
        reasons.push("Market is closed".to_string());
        is_good_time = false;
    }

    // Check preferred hour
    if current_hour != config.preferred_roll_hour {
        reasons.push(format!(
            "Current hour ({}) differs from preferred ({})",
            current_hour, config.preferred_roll_hour
        ));
    }

    // Check overnight risk for ITM legs
    if config.avoid_itm_overnight && has_itm_leg && current_hour >= 15 {
        reasons.push("ITM leg approaching overnight - recommend rolling now".to_string());
        // This actually makes it more urgent, so it's a good time
    }

    // Check Friday expiration risk
    if is_friday && has_itm_leg {
        reasons.push("Friday with ITM leg - high assignment risk".to_string());
    }

    let recommendation = if !is_market_hours {
        RollTimingRecommendation::Wait
    } else if has_itm_leg && (current_hour >= 15 || is_friday) {
        RollTimingRecommendation::Urgent
    } else if current_hour >= config.preferred_roll_hour.saturating_sub(1)
        && current_hour <= config.preferred_roll_hour + 1
    {
        RollTimingRecommendation::RollNow
    } else {
        RollTimingRecommendation::Wait
    };

    RollTimingResult {
        is_good_time: is_good_time && recommendation != RollTimingRecommendation::Wait,
        reasons,
        recommendation,
    }
}

// ============================================================================
// Partial Fill Monitoring
// ============================================================================

/// State of a roll order execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RollExecutionState {
    /// Order submitted, awaiting fill.
    Pending,
    /// Close legs filled, awaiting open legs.
    CloseComplete,
    /// Partially filled.
    PartialFill,
    /// Completely filled.
    Filled,
    /// Cancelled.
    Cancelled,
    /// Failed with error.
    Failed,
}

/// Partial fill monitoring result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartialFillMonitor {
    /// Order ID being monitored.
    pub order_id: String,
    /// Current state.
    pub state: RollExecutionState,
    /// Close legs fill percentage.
    pub close_fill_pct: Decimal,
    /// Open legs fill percentage.
    pub open_fill_pct: Decimal,
    /// Time elapsed since submission (seconds).
    pub elapsed_secs: u64,
    /// Whether timeout exceeded.
    pub timeout_exceeded: bool,
    /// Recommended action.
    pub recommended_action: PartialFillAction,
}

/// Action to take for partial fill.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PartialFillAction {
    /// Continue waiting.
    Wait,
    /// Cancel the order.
    Cancel,
    /// Retry with different parameters.
    Retry,
    /// Manual intervention required.
    ManualIntervention,
}

/// Evaluate partial fill state and recommend action.
#[must_use]
pub fn evaluate_partial_fill(
    order_id: &str,
    close_fill_pct: Decimal,
    open_fill_pct: Decimal,
    elapsed_secs: u64,
    assignment_risk: AssignmentRiskLevel,
    config: &RollConfig,
) -> PartialFillMonitor {
    let timeout_exceeded = elapsed_secs >= config.partial_fill_timeout_secs;

    // Determine state
    let state = if close_fill_pct >= Decimal::ONE && open_fill_pct >= Decimal::ONE {
        RollExecutionState::Filled
    } else if close_fill_pct >= Decimal::ONE {
        RollExecutionState::CloseComplete
    } else if close_fill_pct > Decimal::ZERO || open_fill_pct > Decimal::ZERO {
        RollExecutionState::PartialFill
    } else {
        RollExecutionState::Pending
    };

    // Determine action
    let recommended_action = match (state, timeout_exceeded, assignment_risk) {
        // Filled - no action needed
        (RollExecutionState::Filled, _, _) => PartialFillAction::Wait,

        // Critical assignment risk - cancel immediately
        (_, _, AssignmentRiskLevel::Critical) => PartialFillAction::Cancel,

        // Timeout exceeded
        (RollExecutionState::Pending, true, _) => PartialFillAction::Cancel,
        (RollExecutionState::PartialFill, true, _) => PartialFillAction::Cancel,

        // Close complete but open stalled
        (RollExecutionState::CloseComplete, true, _) => PartialFillAction::ManualIntervention,

        // Still within timeout
        _ => PartialFillAction::Wait,
    };

    PartialFillMonitor {
        order_id: order_id.to_string(),
        state,
        close_fill_pct,
        open_fill_pct,
        elapsed_secs,
        timeout_exceeded,
        recommended_action,
    }
}

// ============================================================================
// Errors
// ============================================================================

/// Errors during rolling operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RollError {
    /// Invalid order specification.
    InvalidOrder(String),
    /// Partial fill not recoverable.
    PartialFillUnrecoverable(String),
    /// Assignment occurred during roll.
    AssignmentDuringRoll(String),
    /// Broker rejected order.
    BrokerRejection(String),
    /// Timeout exceeded.
    Timeout(String),
}

impl std::fmt::Display for RollError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidOrder(msg) => write!(f, "Invalid order: {msg}"),
            Self::PartialFillUnrecoverable(msg) => write!(f, "Partial fill unrecoverable: {msg}"),
            Self::AssignmentDuringRoll(msg) => write!(f, "Assignment during roll: {msg}"),
            Self::BrokerRejection(msg) => write!(f, "Broker rejected: {msg}"),
            Self::Timeout(msg) => write!(f, "Timeout: {msg}"),
        }
    }
}

impl std::error::Error for RollError {}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn make_position(dte: u32, is_credit: bool, profit_pct: i64) -> PositionForRoll {
        let credit = Decimal::new(200, 0);
        let current_value = if profit_pct >= 0 {
            credit - (credit * Decimal::new(profit_pct, 2))
        } else {
            credit + (credit * Decimal::new(-profit_pct, 2))
        };

        PositionForRoll {
            position_id: "pos-1".to_string(),
            dte,
            is_credit,
            credit_received: credit,
            current_value,
            max_profit: credit,
            has_itm_leg: false,
            assignment_risk: AssignmentRiskLevel::Low,
            earnings_approaching: false,
            dividend_approaching: false,
        }
    }

    // ========================================================================
    // Roll Trigger Tests
    // ========================================================================

    #[test]
    fn test_urgent_dte_trigger() {
        let config = RollConfig::default();
        let position = make_position(2, true, 0);

        let result = check_roll_trigger(&position, &config);
        assert!(result.should_roll);
        assert_eq!(result.reason, Some(RollReason::UrgentDte));
        assert!(result.urgency >= 9);
    }

    #[test]
    fn test_credit_dte_trigger() {
        let config = RollConfig::default();
        let position = make_position(5, true, 0);

        let result = check_roll_trigger(&position, &config);
        assert!(result.should_roll);
        assert_eq!(result.reason, Some(RollReason::CreditDteThreshold));
    }

    #[test]
    fn test_profit_target_trigger() {
        let config = RollConfig::default();
        let position = make_position(30, true, 55); // 55% profit

        let result = check_roll_trigger(&position, &config);
        assert!(result.should_roll);
        assert_eq!(result.reason, Some(RollReason::ProfitTarget));
    }

    #[test]
    fn test_loss_threshold_trigger() {
        let config = RollConfig::default();
        let position = make_position(30, true, -210); // 210% loss (> 2x credit)

        let result = check_roll_trigger(&position, &config);
        assert!(result.should_roll);
        assert_eq!(result.reason, Some(RollReason::LossThreshold));
    }

    #[test]
    fn test_no_trigger() {
        let config = RollConfig::default();
        let position = make_position(30, true, 20); // 20% profit, DTE 30

        let result = check_roll_trigger(&position, &config);
        assert!(!result.should_roll);
        assert!(result.reason.is_none());
    }

    #[test]
    fn test_assignment_risk_trigger() {
        let config = RollConfig::default();
        let mut position = make_position(30, true, 0);
        position.assignment_risk = AssignmentRiskLevel::Critical;

        let result = check_roll_trigger(&position, &config);
        assert!(result.should_roll);
        assert_eq!(result.reason, Some(RollReason::AssignmentRisk));
        assert_eq!(result.urgency, 10);
    }

    #[test]
    fn test_event_risk_trigger() {
        let config = RollConfig::default();
        let mut position = make_position(30, true, 0);
        position.earnings_approaching = true;

        let result = check_roll_trigger(&position, &config);
        assert!(result.should_roll);
        assert_eq!(result.reason, Some(RollReason::EventRisk));
    }

    // ========================================================================
    // Fractional Rounding Tests
    // ========================================================================

    #[test]
    fn test_round_contracts_floor() {
        assert_eq!(round_contracts_conservative(Decimal::new(35, 1)), 3); // 3.5 -> 3
        assert_eq!(round_contracts_conservative(Decimal::new(39, 1)), 3); // 3.9 -> 3
        assert_eq!(round_contracts_conservative(Decimal::new(30, 1)), 3); // 3.0 -> 3
    }

    #[test]
    fn test_calculate_roll_quantity_same_delta() {
        let qty = calculate_roll_quantity(
            10,
            Decimal::new(30, 2), // 0.30 delta
            Decimal::new(30, 2), // 0.30 delta (same)
            true,
        );
        assert_eq!(qty, 10);
    }

    #[test]
    fn test_calculate_roll_quantity_different_delta() {
        // Original: 10 contracts @ 0.30 delta = 3.0 total delta
        // New: 0.25 delta -> 3.0 / 0.25 = 12 contracts
        let qty = calculate_roll_quantity(
            10,
            Decimal::new(30, 2), // 0.30 delta
            Decimal::new(25, 2), // 0.25 delta
            true,
        );
        assert_eq!(qty, 12);
    }

    // ========================================================================
    // Roll Order Builder Tests
    // ========================================================================

    #[test]
    fn test_roll_order_builder() {
        let order = RollOrderBuilder::new()
            .position_id("pos-1")
            .close_leg(RollLeg {
                ticker: "AAPL260130C00150000".to_string(),
                underlying: "AAPL".to_string(),
                option_type: OptionType::Call,
                strike: Decimal::new(150, 0),
                expiration: "2026-01-30".to_string(),
                quantity: -1,
                side: "buy".to_string(), // Buy to close
                limit_price: Some(Decimal::new(100, 2)),
            })
            .open_leg(RollLeg {
                ticker: "AAPL260220C00155000".to_string(),
                underlying: "AAPL".to_string(),
                option_type: OptionType::Call,
                strike: Decimal::new(155, 0),
                expiration: "2026-02-20".to_string(),
                quantity: -1,
                side: "sell".to_string(), // Sell to open
                limit_price: Some(Decimal::new(150, 2)),
            })
            .reason(RollReason::CreditDteThreshold)
            .build()
            .expect("should build roll order");

        assert_eq!(order.position_id, "pos-1");
        assert_eq!(order.close_legs.len(), 1);
        assert_eq!(order.open_legs.len(), 1);
        assert_eq!(order.order_type, RollOrderType::Atomic);
    }

    #[test]
    fn test_roll_order_builder_sequential() {
        let order = RollOrderBuilder::new()
            .position_id("pos-1")
            .close_leg(RollLeg {
                ticker: "AAPL260130C00150000".to_string(),
                underlying: "AAPL".to_string(),
                option_type: OptionType::Call,
                strike: Decimal::new(150, 0),
                expiration: "2026-01-30".to_string(),
                quantity: -1,
                side: "buy".to_string(),
                limit_price: None,
            })
            .open_leg(RollLeg {
                ticker: "AAPL260220C00155000".to_string(),
                underlying: "AAPL".to_string(),
                option_type: OptionType::Call,
                strike: Decimal::new(155, 0),
                expiration: "2026-02-20".to_string(),
                quantity: -1,
                side: "sell".to_string(),
                limit_price: None,
            })
            .reason(RollReason::UrgentDte)
            .broker_supports_atomic(false)
            .build()
            .unwrap();

        assert_eq!(order.order_type, RollOrderType::Sequential);
    }

    #[test]
    fn test_roll_order_builder_missing_position() {
        let result = RollOrderBuilder::new()
            .close_leg(RollLeg {
                ticker: "AAPL260130C00150000".to_string(),
                underlying: "AAPL".to_string(),
                option_type: OptionType::Call,
                strike: Decimal::new(150, 0),
                expiration: "2026-01-30".to_string(),
                quantity: -1,
                side: "buy".to_string(),
                limit_price: None,
            })
            .open_leg(RollLeg {
                ticker: "AAPL260220C00155000".to_string(),
                underlying: "AAPL".to_string(),
                option_type: OptionType::Call,
                strike: Decimal::new(155, 0),
                expiration: "2026-02-20".to_string(),
                quantity: -1,
                side: "sell".to_string(),
                limit_price: None,
            })
            .reason(RollReason::UrgentDte)
            .build();

        assert!(result.is_err());
    }

    // ========================================================================
    // Roll Timing Tests
    // ========================================================================

    #[test]
    fn test_roll_timing_preferred_hour() {
        let config = RollConfig::default();
        let result = check_roll_timing(14, true, false, false, &config);
        assert_eq!(result.recommendation, RollTimingRecommendation::RollNow);
    }

    #[test]
    fn test_roll_timing_market_closed() {
        let config = RollConfig::default();
        let result = check_roll_timing(14, false, false, false, &config);
        assert_eq!(result.recommendation, RollTimingRecommendation::Wait);
    }

    #[test]
    fn test_roll_timing_itm_late_day() {
        let config = RollConfig::default();
        let result = check_roll_timing(15, true, true, false, &config);
        assert_eq!(result.recommendation, RollTimingRecommendation::Urgent);
    }

    #[test]
    fn test_roll_timing_friday_itm() {
        let config = RollConfig::default();
        let result = check_roll_timing(10, true, true, true, &config);
        assert_eq!(result.recommendation, RollTimingRecommendation::Urgent);
    }

    // ========================================================================
    // Partial Fill Tests
    // ========================================================================

    #[test]
    fn test_partial_fill_completed() {
        let config = RollConfig::default();
        let result = evaluate_partial_fill(
            "ord-1",
            Decimal::ONE,
            Decimal::ONE,
            10,
            AssignmentRiskLevel::Low,
            &config,
        );
        assert_eq!(result.state, RollExecutionState::Filled);
        assert_eq!(result.recommended_action, PartialFillAction::Wait);
    }

    #[test]
    fn test_partial_fill_timeout() {
        let config = RollConfig::default();
        let result = evaluate_partial_fill(
            "ord-1",
            Decimal::new(50, 2), // 50%
            Decimal::ZERO,
            35, // > 30 second timeout
            AssignmentRiskLevel::Low,
            &config,
        );
        assert!(result.timeout_exceeded);
        assert_eq!(result.recommended_action, PartialFillAction::Cancel);
    }

    #[test]
    fn test_partial_fill_assignment_risk() {
        let config = RollConfig::default();
        let result = evaluate_partial_fill(
            "ord-1",
            Decimal::new(50, 2),
            Decimal::ZERO,
            5,
            AssignmentRiskLevel::Critical,
            &config,
        );
        assert_eq!(result.recommended_action, PartialFillAction::Cancel);
    }

    #[test]
    fn test_partial_fill_close_complete() {
        let config = RollConfig::default();
        let result = evaluate_partial_fill(
            "ord-1",
            Decimal::ONE,        // Close complete
            Decimal::new(50, 2), // Open 50%
            35,                  // Timeout
            AssignmentRiskLevel::Low,
            &config,
        );
        assert_eq!(result.state, RollExecutionState::CloseComplete);
        assert_eq!(
            result.recommended_action,
            PartialFillAction::ManualIntervention
        );
    }
}
