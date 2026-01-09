//! Order-related types for execution tracking.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::{DecisionPlan, Environment};

/// Order side (buy or sell).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderSide {
    /// Buy order.
    Buy,
    /// Sell order.
    Sell,
}

/// Order type (market, limit, etc.).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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

/// Time in force for orders.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TimeInForce {
    /// Valid for current trading day only.
    Day,
    /// Good-til-canceled (broker-specific limit: typically 30-90 days).
    Gtc,
    /// Immediate-or-cancel (fill immediately, cancel remainder).
    Ioc,
    /// Fill-or-kill (all or nothing, immediate execution required).
    Fok,
    /// Execute at market open only.
    Opg,
    /// Execute at market close only.
    Cls,
}

/// Order status in the lifecycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderStatus {
    /// Order created but not yet submitted.
    New,
    /// Order accepted by broker.
    Accepted,
    /// Order partially filled.
    PartiallyFilled,
    /// Order completely filled.
    Filled,
    /// Order canceled.
    Canceled,
    /// Order rejected by broker.
    Rejected,
    /// Order expired.
    Expired,
}

impl OrderStatus {
    /// Returns true if the order is in a terminal state.
    #[must_use]
    pub const fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Filled | Self::Canceled | Self::Rejected | Self::Expired
        )
    }

    /// Returns true if the order is still active (can be filled or canceled).
    #[must_use]
    pub const fn is_active(&self) -> bool {
        matches!(self, Self::New | Self::Accepted | Self::PartiallyFilled)
    }
}

/// State of a single order leg (for multi-leg orders).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderLegState {
    /// Leg index (0-based).
    pub leg_index: u32,
    /// Instrument ID for this leg.
    pub instrument_id: String,
    /// Side for this leg.
    pub side: OrderSide,
    /// Quantity for this leg.
    pub quantity: Decimal,
    /// Filled quantity.
    pub filled_quantity: Decimal,
    /// Average fill price.
    pub avg_fill_price: Decimal,
    /// Leg-specific status.
    pub status: OrderStatus,
}

/// Complete order state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderState {
    /// Cream internal order ID.
    pub order_id: String,
    /// Broker's order ID.
    pub broker_order_id: String,
    /// Whether this is a multi-leg order.
    pub is_multi_leg: bool,
    /// Instrument ID (for single-leg orders).
    pub instrument_id: String,
    /// Order status.
    pub status: OrderStatus,
    /// Order side.
    pub side: OrderSide,
    /// Order type.
    pub order_type: OrderType,
    /// Time in force.
    pub time_in_force: TimeInForce,
    /// Requested quantity.
    pub requested_quantity: Decimal,
    /// Filled quantity.
    pub filled_quantity: Decimal,
    /// Average fill price.
    pub avg_fill_price: Decimal,
    /// Limit price (if applicable).
    pub limit_price: Option<Decimal>,
    /// Stop price (if applicable).
    pub stop_price: Option<Decimal>,
    /// Submission timestamp (ISO 8601).
    pub submitted_at: String,
    /// Last update timestamp (ISO 8601).
    pub last_update_at: String,
    /// Status message from broker.
    pub status_message: String,
    /// Legs for multi-leg orders.
    pub legs: Vec<OrderLegState>,
}

/// Request to submit orders.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitOrdersRequest {
    /// Trading cycle ID.
    pub cycle_id: String,
    /// Target environment.
    pub environment: Environment,
    /// Decision plan to execute.
    pub plan: DecisionPlan,
}

/// Execution acknowledgment response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionAck {
    /// Cycle ID.
    pub cycle_id: String,
    /// Environment.
    pub environment: Environment,
    /// Acknowledgment timestamp (ISO 8601).
    pub ack_time: String,
    /// Order states.
    pub orders: Vec<OrderState>,
    /// Execution errors.
    pub errors: Vec<ExecutionError>,
}

/// Execution error details.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionError {
    /// Error code.
    pub code: String,
    /// Error message.
    pub message: String,
    /// Related instrument ID (if applicable).
    pub instrument_id: String,
    /// Related order ID (if applicable).
    pub order_id: String,
}

// ============================================================================
// FIX Protocol Partial Fill Types
// ============================================================================

/// Individual execution fill (FIX `ExecutionReport`).
///
/// Each fill represents a single execution event from the venue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionFill {
    /// Unique fill ID from the venue.
    pub fill_id: String,
    /// Quantity filled in this execution.
    pub quantity: Decimal,
    /// Price at which this fill occurred.
    pub price: Decimal,
    /// Timestamp of the fill (ISO 8601).
    pub timestamp: String,
    /// Venue/exchange where the fill occurred.
    pub venue: String,
    /// Liquidity indicator (e.g., "MAKER", "TAKER").
    pub liquidity: Option<String>,
    /// Commission for this fill.
    pub commission: Option<Decimal>,
}

/// FIX protocol-compliant partial fill state.
///
/// Implements the fundamental FIX rule: `OrderQty` = `CumQty` + `LeavesQty`
/// - `OrderQty`: Original requested quantity
/// - `CumQty`: Cumulative quantity filled across all executions
/// - `LeavesQty`: Remaining quantity open for execution
/// - `AvgPx`: Volume-weighted average fill price
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartialFillState {
    /// Order ID this state belongs to.
    pub order_id: String,
    /// Original requested quantity (FIX tag 38: `OrderQty`).
    pub order_qty: Decimal,
    /// Cumulative quantity filled (FIX tag 14: `CumQty`).
    pub cum_qty: Decimal,
    /// Remaining quantity to fill (FIX tag 151: `LeavesQty`).
    pub leaves_qty: Decimal,
    /// Volume-weighted average fill price (FIX tag 6: `AvgPx`).
    pub avg_px: Decimal,
    /// Individual fills for this order.
    pub fills: Vec<ExecutionFill>,
    /// Timestamp of the last fill (ISO 8601).
    pub last_fill_at: Option<String>,
    /// Order purpose for timeout policy selection.
    pub order_purpose: OrderPurpose,
    /// Creation timestamp for timeout tracking.
    pub created_at: String,
}

impl PartialFillState {
    /// Create a new partial fill state for an order.
    #[must_use]
    pub fn new(order_id: String, order_qty: Decimal, purpose: OrderPurpose) -> Self {
        Self {
            order_id,
            order_qty,
            cum_qty: Decimal::ZERO,
            leaves_qty: order_qty,
            avg_px: Decimal::ZERO,
            fills: Vec::new(),
            last_fill_at: None,
            order_purpose: purpose,
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// Apply an execution fill to this state.
    ///
    /// Updates `CumQty`, `LeavesQty`, and recalculates `AvgPx` using VWAP.
    pub fn apply_fill(&mut self, fill: ExecutionFill) {
        // VWAP calculation: new_avg = (old_avg * old_cum + fill_price * fill_qty) / new_cum
        let new_cum_qty = self.cum_qty + fill.quantity;
        if new_cum_qty > Decimal::ZERO {
            self.avg_px = (self.avg_px * self.cum_qty + fill.price * fill.quantity) / new_cum_qty;
        }

        // Update FIX protocol fields
        self.cum_qty = new_cum_qty;
        self.leaves_qty = self.order_qty - self.cum_qty;
        self.last_fill_at = Some(fill.timestamp.clone());
        self.fills.push(fill);
    }

    /// Check if the order is completely filled.
    #[must_use]
    pub fn is_filled(&self) -> bool {
        self.leaves_qty <= Decimal::ZERO
    }

    /// Check if the order is partially filled.
    #[must_use]
    pub fn is_partial(&self) -> bool {
        self.cum_qty > Decimal::ZERO && self.leaves_qty > Decimal::ZERO
    }

    /// Get the fill percentage (0.0 to 1.0).
    #[must_use]
    pub fn fill_percentage(&self) -> Decimal {
        if self.order_qty > Decimal::ZERO {
            self.cum_qty / self.order_qty
        } else {
            Decimal::ZERO
        }
    }

    /// Verify FIX protocol invariant: `OrderQty` = `CumQty` + `LeavesQty`.
    #[must_use]
    pub fn verify_fix_invariant(&self) -> bool {
        self.order_qty == self.cum_qty + self.leaves_qty
    }
}

/// Order purpose for determining timeout policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OrderPurpose {
    /// Entry order (opening a position).
    Entry,
    /// Exit order (closing a position for profit/loss).
    Exit,
    /// Stop-loss order (protective exit).
    StopLoss,
    /// Take-profit order.
    TakeProfit,
    /// Bracket leg (OCO-attached order).
    BracketLeg,
    /// Scale-in order (adding to position).
    ScaleIn,
    /// Scale-out order (partial exit).
    ScaleOut,
}

/// Action to take when a partial fill timeout occurs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PartialFillTimeoutAction {
    /// Keep the partial position and adjust protective orders.
    KeepPartial,
    /// Cancel the remaining order (no position change).
    CancelRemaining,
    /// Resubmit remaining quantity as market order.
    ResubmitMarket,
    /// Aggressive resubmit with widened limit or market order.
    AggressiveResubmit,
}

/// Timeout configuration for partial fills.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartialFillTimeoutConfig {
    /// Timeout for entry orders (seconds).
    pub entry_timeout_seconds: u64,
    /// Timeout for exit orders (seconds).
    pub exit_timeout_seconds: u64,
    /// Timeout for stop-loss orders (seconds).
    pub stop_loss_timeout_seconds: u64,
    /// Timeout for take-profit orders (seconds).
    pub take_profit_timeout_seconds: u64,
    /// Action on entry timeout.
    pub on_entry_timeout: PartialFillTimeoutAction,
    /// Action on exit timeout.
    pub on_exit_timeout: PartialFillTimeoutAction,
    /// Action on stop-loss timeout.
    pub on_stop_loss_timeout: PartialFillTimeoutAction,
}

impl Default for PartialFillTimeoutConfig {
    fn default() -> Self {
        Self {
            entry_timeout_seconds: 300,       // 5 minutes
            exit_timeout_seconds: 60,         // 1 minute
            stop_loss_timeout_seconds: 10,    // 10 seconds (urgent)
            take_profit_timeout_seconds: 120, // 2 minutes
            on_entry_timeout: PartialFillTimeoutAction::KeepPartial,
            on_exit_timeout: PartialFillTimeoutAction::ResubmitMarket,
            on_stop_loss_timeout: PartialFillTimeoutAction::AggressiveResubmit,
        }
    }
}

impl PartialFillTimeoutConfig {
    /// Get the timeout duration for a given order purpose.
    #[must_use]
    pub const fn timeout_for_purpose(&self, purpose: OrderPurpose) -> u64 {
        match purpose {
            OrderPurpose::Entry | OrderPurpose::ScaleIn => self.entry_timeout_seconds,
            OrderPurpose::Exit | OrderPurpose::ScaleOut | OrderPurpose::BracketLeg => {
                self.exit_timeout_seconds
            }
            OrderPurpose::StopLoss => self.stop_loss_timeout_seconds,
            OrderPurpose::TakeProfit => self.take_profit_timeout_seconds,
        }
    }

    /// Get the timeout action for a given order purpose.
    #[must_use]
    pub const fn action_for_purpose(&self, purpose: OrderPurpose) -> PartialFillTimeoutAction {
        match purpose {
            OrderPurpose::Entry | OrderPurpose::ScaleIn => self.on_entry_timeout,
            OrderPurpose::Exit | OrderPurpose::ScaleOut | OrderPurpose::BracketLeg => {
                self.on_exit_timeout
            }
            OrderPurpose::StopLoss => self.on_stop_loss_timeout,
            OrderPurpose::TakeProfit => self.on_exit_timeout,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_order_status_terminal() {
        assert!(OrderStatus::Filled.is_terminal());
        assert!(OrderStatus::Canceled.is_terminal());
        assert!(OrderStatus::Rejected.is_terminal());
        assert!(!OrderStatus::New.is_terminal());
        assert!(!OrderStatus::Accepted.is_terminal());
    }

    #[test]
    fn test_order_status_active() {
        assert!(OrderStatus::New.is_active());
        assert!(OrderStatus::Accepted.is_active());
        assert!(OrderStatus::PartiallyFilled.is_active());
        assert!(!OrderStatus::Filled.is_active());
    }

    // ========================================================================
    // Partial Fill State Tests
    // ========================================================================

    fn make_fill(fill_id: &str, qty: i64, price: i64) -> ExecutionFill {
        ExecutionFill {
            fill_id: fill_id.to_string(),
            quantity: Decimal::new(qty, 0),
            price: Decimal::new(price, 2),
            timestamp: "2026-01-05T12:00:00Z".to_string(),
            venue: "NYSE".to_string(),
            liquidity: Some("TAKER".to_string()),
            commission: Some(Decimal::new(1, 2)),
        }
    }

    #[test]
    fn test_partial_fill_state_new() {
        let state = PartialFillState::new(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        assert_eq!(state.order_id, "ord-1");
        assert_eq!(state.order_qty, Decimal::new(100, 0));
        assert_eq!(state.cum_qty, Decimal::ZERO);
        assert_eq!(state.leaves_qty, Decimal::new(100, 0));
        assert_eq!(state.avg_px, Decimal::ZERO);
        assert!(state.fills.is_empty());
        assert!(state.verify_fix_invariant());
    }

    #[test]
    fn test_fix_invariant_order_qty_equals_cum_plus_leaves() {
        let mut state = PartialFillState::new(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        // Initial: 100 = 0 + 100
        assert!(state.verify_fix_invariant());

        // After first fill: 100 = 30 + 70
        state.apply_fill(make_fill("f1", 30, 15000));
        assert_eq!(state.cum_qty, Decimal::new(30, 0));
        assert_eq!(state.leaves_qty, Decimal::new(70, 0));
        assert!(state.verify_fix_invariant());

        // After second fill: 100 = 80 + 20
        state.apply_fill(make_fill("f2", 50, 15100));
        assert_eq!(state.cum_qty, Decimal::new(80, 0));
        assert_eq!(state.leaves_qty, Decimal::new(20, 0));
        assert!(state.verify_fix_invariant());

        // After final fill: 100 = 100 + 0
        state.apply_fill(make_fill("f3", 20, 15050));
        assert_eq!(state.cum_qty, Decimal::new(100, 0));
        assert_eq!(state.leaves_qty, Decimal::ZERO);
        assert!(state.verify_fix_invariant());
    }

    #[test]
    fn test_vwap_calculation_single_fill() {
        let mut state = PartialFillState::new(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        state.apply_fill(make_fill("f1", 100, 15000));

        // Single fill: avg_px = fill price
        assert_eq!(state.avg_px, Decimal::new(15000, 2));
    }

    #[test]
    fn test_vwap_calculation_multiple_fills() {
        let mut state = PartialFillState::new(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        // Fill 1: 40 shares @ $150.00
        state.apply_fill(make_fill("f1", 40, 15000));
        assert_eq!(state.avg_px, Decimal::new(15000, 2));

        // Fill 2: 60 shares @ $151.00
        // VWAP = (150.00 * 40 + 151.00 * 60) / 100 = (6000 + 9060) / 100 = 150.60
        state.apply_fill(make_fill("f2", 60, 15100));
        assert_eq!(state.avg_px, Decimal::new(15060, 2));
    }

    #[test]
    fn test_vwap_calculation_three_fills() {
        let mut state = PartialFillState::new(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        // Fill 1: 25 shares @ $100.00 -> avg = 100.00
        state.apply_fill(make_fill("f1", 25, 10000));
        assert_eq!(state.avg_px, Decimal::new(10000, 2));

        // Fill 2: 25 shares @ $102.00 -> avg = (25*100 + 25*102) / 50 = 101.00
        state.apply_fill(make_fill("f2", 25, 10200));
        assert_eq!(state.avg_px, Decimal::new(10100, 2));

        // Fill 3: 50 shares @ $104.00 -> avg = (50*101 + 50*104) / 100 = 102.50
        state.apply_fill(make_fill("f3", 50, 10400));
        assert_eq!(state.avg_px, Decimal::new(10250, 2));
    }

    #[test]
    fn test_is_filled() {
        let mut state = PartialFillState::new(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        assert!(!state.is_filled());

        state.apply_fill(make_fill("f1", 50, 15000));
        assert!(!state.is_filled());

        state.apply_fill(make_fill("f2", 50, 15000));
        assert!(state.is_filled());
    }

    #[test]
    fn test_is_partial() {
        let mut state = PartialFillState::new(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        // No fills yet
        assert!(!state.is_partial());

        // Partial fill
        state.apply_fill(make_fill("f1", 50, 15000));
        assert!(state.is_partial());

        // Completely filled
        state.apply_fill(make_fill("f2", 50, 15000));
        assert!(!state.is_partial());
    }

    #[test]
    fn test_fill_percentage() {
        let mut state = PartialFillState::new(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        assert_eq!(state.fill_percentage(), Decimal::ZERO);

        state.apply_fill(make_fill("f1", 25, 15000));
        assert_eq!(state.fill_percentage(), Decimal::new(25, 2)); // 0.25

        state.apply_fill(make_fill("f2", 25, 15000));
        assert_eq!(state.fill_percentage(), Decimal::new(50, 2)); // 0.50

        state.apply_fill(make_fill("f3", 50, 15000));
        assert_eq!(state.fill_percentage(), Decimal::ONE); // 1.00
    }

    #[test]
    fn test_fills_are_recorded() {
        let mut state = PartialFillState::new(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        state.apply_fill(make_fill("f1", 30, 15000));
        state.apply_fill(make_fill("f2", 70, 15100));

        assert_eq!(state.fills.len(), 2);
        assert_eq!(state.fills[0].fill_id, "f1");
        assert_eq!(state.fills[1].fill_id, "f2");
    }

    #[test]
    fn test_last_fill_at_updated() {
        let mut state = PartialFillState::new(
            "ord-1".to_string(),
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        assert!(state.last_fill_at.is_none());

        state.apply_fill(make_fill("f1", 50, 15000));
        assert!(state.last_fill_at.is_some());
    }

    // ========================================================================
    // Timeout Configuration Tests
    // ========================================================================

    #[test]
    fn test_default_timeout_config() {
        let config = PartialFillTimeoutConfig::default();

        assert_eq!(config.entry_timeout_seconds, 300);
        assert_eq!(config.exit_timeout_seconds, 60);
        assert_eq!(config.stop_loss_timeout_seconds, 10);
        assert_eq!(config.take_profit_timeout_seconds, 120);
        assert_eq!(
            config.on_entry_timeout,
            PartialFillTimeoutAction::KeepPartial
        );
        assert_eq!(
            config.on_exit_timeout,
            PartialFillTimeoutAction::ResubmitMarket
        );
        assert_eq!(
            config.on_stop_loss_timeout,
            PartialFillTimeoutAction::AggressiveResubmit
        );
    }

    #[test]
    fn test_timeout_for_purpose() {
        let config = PartialFillTimeoutConfig::default();

        assert_eq!(config.timeout_for_purpose(OrderPurpose::Entry), 300);
        assert_eq!(config.timeout_for_purpose(OrderPurpose::ScaleIn), 300);
        assert_eq!(config.timeout_for_purpose(OrderPurpose::Exit), 60);
        assert_eq!(config.timeout_for_purpose(OrderPurpose::ScaleOut), 60);
        assert_eq!(config.timeout_for_purpose(OrderPurpose::StopLoss), 10);
        assert_eq!(config.timeout_for_purpose(OrderPurpose::TakeProfit), 120);
        assert_eq!(config.timeout_for_purpose(OrderPurpose::BracketLeg), 60);
    }

    #[test]
    fn test_action_for_purpose() {
        let config = PartialFillTimeoutConfig::default();

        assert_eq!(
            config.action_for_purpose(OrderPurpose::Entry),
            PartialFillTimeoutAction::KeepPartial
        );
        assert_eq!(
            config.action_for_purpose(OrderPurpose::Exit),
            PartialFillTimeoutAction::ResubmitMarket
        );
        assert_eq!(
            config.action_for_purpose(OrderPurpose::StopLoss),
            PartialFillTimeoutAction::AggressiveResubmit
        );
    }
}
