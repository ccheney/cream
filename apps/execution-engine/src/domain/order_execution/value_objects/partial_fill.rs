//! Partial fill state tracking with FIX protocol semantics.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::{FillReport, OrderPurpose};
use crate::domain::shared::{DomainError, Money, OrderId, Quantity, Timestamp};

/// FIX protocol-compliant partial fill state.
///
/// Implements the fundamental FIX rule: `OrderQty` = `CumQty` + `LeavesQty`
/// - `OrderQty`: Original requested quantity
/// - `CumQty`: Cumulative quantity filled across all executions
/// - `LeavesQty`: Remaining quantity open for execution
/// - `AvgPx`: Volume-weighted average fill price
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PartialFillState {
    order_id: OrderId,
    order_qty: Quantity,
    cum_qty: Quantity,
    leaves_qty: Quantity,
    avg_px: Money,
    fills: Vec<FillReport>,
    last_fill_at: Option<Timestamp>,
    order_purpose: OrderPurpose,
    created_at: Timestamp,
}

impl PartialFillState {
    /// Create a new partial fill state for an order.
    #[must_use]
    pub fn new(order_id: OrderId, order_qty: Quantity, purpose: OrderPurpose) -> Self {
        Self {
            order_id,
            order_qty,
            cum_qty: Quantity::ZERO,
            leaves_qty: order_qty,
            avg_px: Money::ZERO,
            fills: Vec::new(),
            last_fill_at: None,
            order_purpose: purpose,
            created_at: Timestamp::now(),
        }
    }

    /// Get the order ID.
    #[must_use]
    pub fn order_id(&self) -> &OrderId {
        &self.order_id
    }

    /// Get the original order quantity (FIX tag 38: `OrderQty`).
    #[must_use]
    pub fn order_qty(&self) -> Quantity {
        self.order_qty
    }

    /// Get the cumulative filled quantity (FIX tag 14: `CumQty`).
    #[must_use]
    pub fn cum_qty(&self) -> Quantity {
        self.cum_qty
    }

    /// Get the remaining quantity to fill (FIX tag 151: `LeavesQty`).
    #[must_use]
    pub fn leaves_qty(&self) -> Quantity {
        self.leaves_qty
    }

    /// Get the volume-weighted average fill price (FIX tag 6: `AvgPx`).
    #[must_use]
    pub fn avg_px(&self) -> Money {
        self.avg_px
    }

    /// Get the list of individual fills.
    #[must_use]
    pub fn fills(&self) -> &[FillReport] {
        &self.fills
    }

    /// Get the timestamp of the last fill.
    #[must_use]
    pub fn last_fill_at(&self) -> Option<Timestamp> {
        self.last_fill_at
    }

    /// Get the order purpose.
    #[must_use]
    pub fn order_purpose(&self) -> OrderPurpose {
        self.order_purpose
    }

    /// Get the creation timestamp.
    #[must_use]
    pub fn created_at(&self) -> Timestamp {
        self.created_at
    }

    /// Apply an execution fill to this state.
    ///
    /// Updates `CumQty`, `LeavesQty`, and recalculates `AvgPx` using VWAP.
    ///
    /// # Errors
    ///
    /// Returns error if fill would violate FIX invariant.
    pub fn apply_fill(&mut self, fill: FillReport) -> Result<(), DomainError> {
        let fill_qty = fill.quantity;
        let fill_price = fill.price;

        // Check that fill doesn't exceed remaining quantity
        if fill_qty > self.leaves_qty {
            return Err(DomainError::InvariantViolation {
                aggregate: "PartialFillState".to_string(),
                invariant: "FillQty <= LeavesQty".to_string(),
                state: format!(
                    "fill_qty={}, leaves_qty={}",
                    fill_qty.amount(),
                    self.leaves_qty.amount()
                ),
            });
        }

        // VWAP calculation: new_avg = (old_avg * old_cum + fill_price * fill_qty) / new_cum
        let new_cum_qty = self.cum_qty + fill_qty;
        if new_cum_qty.amount() > Decimal::ZERO {
            let old_value = self.avg_px.amount() * self.cum_qty.amount();
            let fill_value = fill_price.amount() * fill_qty.amount();
            let new_avg = (old_value + fill_value) / new_cum_qty.amount();
            self.avg_px = Money::new(new_avg);
        }

        // Update FIX protocol fields
        self.cum_qty = new_cum_qty;
        self.leaves_qty = Quantity::new(self.order_qty.amount() - self.cum_qty.amount());
        self.last_fill_at = Some(fill.timestamp);
        self.fills.push(fill);

        // Verify invariant
        debug_assert!(self.verify_fix_invariant());

        Ok(())
    }

    /// Check if the order is completely filled.
    #[must_use]
    pub fn is_filled(&self) -> bool {
        self.leaves_qty.amount() <= Decimal::ZERO
    }

    /// Check if the order is partially filled (has fills but not complete).
    #[must_use]
    pub fn is_partial(&self) -> bool {
        self.cum_qty.amount() > Decimal::ZERO && self.leaves_qty.amount() > Decimal::ZERO
    }

    /// Get the fill percentage (0.0 to 1.0).
    #[must_use]
    pub fn fill_percentage(&self) -> Decimal {
        if self.order_qty.amount() > Decimal::ZERO {
            self.cum_qty.amount() / self.order_qty.amount()
        } else {
            Decimal::ZERO
        }
    }

    /// Verify FIX protocol invariant: `OrderQty` = `CumQty` + `LeavesQty`.
    #[must_use]
    pub fn verify_fix_invariant(&self) -> bool {
        self.order_qty.amount() == self.cum_qty.amount() + self.leaves_qty.amount()
    }

    /// Calculate total notional value filled.
    #[must_use]
    pub fn filled_notional(&self) -> Money {
        Money::new(self.avg_px.amount() * self.cum_qty.amount())
    }

    /// Get the total commission across all fills.
    #[must_use]
    pub fn total_commission(&self) -> Money {
        self.fills
            .iter()
            .filter_map(|f| f.commission)
            .fold(Money::ZERO, |acc, c| acc + c)
    }
}

/// Action to take when a partial fill timeout occurs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
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
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
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

    fn make_fill(fill_id: &str, qty: i64, price: f64) -> FillReport {
        FillReport::new(
            fill_id,
            Quantity::from_i64(qty),
            Money::usd(price),
            Timestamp::now(),
            "NYSE",
        )
    }

    #[test]
    fn partial_fill_state_new() {
        let state = PartialFillState::new(
            OrderId::new("ord-1"),
            Quantity::from_i64(100),
            OrderPurpose::Entry,
        );

        assert_eq!(state.order_id().as_str(), "ord-1");
        assert_eq!(state.order_qty(), Quantity::from_i64(100));
        assert_eq!(state.cum_qty(), Quantity::ZERO);
        assert_eq!(state.leaves_qty(), Quantity::from_i64(100));
        assert_eq!(state.avg_px(), Money::ZERO);
        assert!(state.fills().is_empty());
        assert!(state.verify_fix_invariant());
    }

    #[test]
    fn fix_invariant_maintained_through_fills() {
        let mut state = PartialFillState::new(
            OrderId::new("ord-1"),
            Quantity::from_i64(100),
            OrderPurpose::Entry,
        );

        // Initial: 100 = 0 + 100
        assert!(state.verify_fix_invariant());

        // After first fill: 100 = 30 + 70
        state.apply_fill(make_fill("f1", 30, 150.00)).unwrap();
        assert_eq!(state.cum_qty(), Quantity::from_i64(30));
        assert_eq!(state.leaves_qty(), Quantity::from_i64(70));
        assert!(state.verify_fix_invariant());

        // After second fill: 100 = 80 + 20
        state.apply_fill(make_fill("f2", 50, 151.00)).unwrap();
        assert_eq!(state.cum_qty(), Quantity::from_i64(80));
        assert_eq!(state.leaves_qty(), Quantity::from_i64(20));
        assert!(state.verify_fix_invariant());

        // After final fill: 100 = 100 + 0
        state.apply_fill(make_fill("f3", 20, 150.50)).unwrap();
        assert_eq!(state.cum_qty(), Quantity::from_i64(100));
        assert_eq!(state.leaves_qty(), Quantity::ZERO);
        assert!(state.verify_fix_invariant());
    }

    #[test]
    fn vwap_calculation_single_fill() {
        let mut state = PartialFillState::new(
            OrderId::new("ord-1"),
            Quantity::from_i64(100),
            OrderPurpose::Entry,
        );

        state.apply_fill(make_fill("f1", 100, 150.00)).unwrap();
        assert_eq!(state.avg_px(), Money::usd(150.00));
    }

    #[test]
    fn vwap_calculation_multiple_fills() {
        let mut state = PartialFillState::new(
            OrderId::new("ord-1"),
            Quantity::from_i64(100),
            OrderPurpose::Entry,
        );

        // Fill 1: 40 shares @ $150.00
        state.apply_fill(make_fill("f1", 40, 150.00)).unwrap();
        assert_eq!(state.avg_px(), Money::usd(150.00));

        // Fill 2: 60 shares @ $151.00
        // VWAP = (150.00 * 40 + 151.00 * 60) / 100 = 150.60
        state.apply_fill(make_fill("f2", 60, 151.00)).unwrap();
        assert_eq!(state.avg_px(), Money::usd(150.60));
    }

    #[test]
    fn fill_exceeds_leaves_qty_error() {
        let mut state = PartialFillState::new(
            OrderId::new("ord-1"),
            Quantity::from_i64(100),
            OrderPurpose::Entry,
        );

        let result = state.apply_fill(make_fill("f1", 150, 150.00));
        assert!(result.is_err());
    }

    #[test]
    fn is_filled_and_partial() {
        let mut state = PartialFillState::new(
            OrderId::new("ord-1"),
            Quantity::from_i64(100),
            OrderPurpose::Entry,
        );

        assert!(!state.is_filled());
        assert!(!state.is_partial());

        state.apply_fill(make_fill("f1", 50, 150.00)).unwrap();
        assert!(!state.is_filled());
        assert!(state.is_partial());

        state.apply_fill(make_fill("f2", 50, 150.00)).unwrap();
        assert!(state.is_filled());
        assert!(!state.is_partial());
    }

    #[test]
    fn fill_percentage() {
        let mut state = PartialFillState::new(
            OrderId::new("ord-1"),
            Quantity::from_i64(100),
            OrderPurpose::Entry,
        );

        assert_eq!(state.fill_percentage(), Decimal::ZERO);

        state.apply_fill(make_fill("f1", 25, 150.00)).unwrap();
        assert_eq!(state.fill_percentage(), Decimal::new(25, 2)); // 0.25

        state.apply_fill(make_fill("f2", 75, 150.00)).unwrap();
        assert_eq!(state.fill_percentage(), Decimal::ONE); // 1.00
    }

    #[test]
    fn filled_notional() {
        let mut state = PartialFillState::new(
            OrderId::new("ord-1"),
            Quantity::from_i64(100),
            OrderPurpose::Entry,
        );

        state.apply_fill(make_fill("f1", 100, 150.00)).unwrap();
        let notional = state.filled_notional();
        assert_eq!(notional.amount(), Decimal::try_from(15000.0).unwrap());
    }

    #[test]
    fn total_commission() {
        let mut state = PartialFillState::new(
            OrderId::new("ord-1"),
            Quantity::from_i64(100),
            OrderPurpose::Entry,
        );

        state
            .apply_fill(make_fill("f1", 50, 150.00).with_commission(Money::usd(1.00)))
            .unwrap();
        state
            .apply_fill(make_fill("f2", 50, 150.00).with_commission(Money::usd(1.50)))
            .unwrap();

        assert_eq!(state.total_commission(), Money::usd(2.50));
    }

    #[test]
    fn timeout_config_default() {
        let config = PartialFillTimeoutConfig::default();

        assert_eq!(config.entry_timeout_seconds, 300);
        assert_eq!(config.stop_loss_timeout_seconds, 10);
        assert_eq!(
            config.on_entry_timeout,
            PartialFillTimeoutAction::KeepPartial
        );
        assert_eq!(
            config.on_stop_loss_timeout,
            PartialFillTimeoutAction::AggressiveResubmit
        );
    }

    #[test]
    fn timeout_config_for_purpose() {
        let config = PartialFillTimeoutConfig::default();

        assert_eq!(config.timeout_for_purpose(OrderPurpose::Entry), 300);
        assert_eq!(config.timeout_for_purpose(OrderPurpose::StopLoss), 10);
        assert_eq!(config.timeout_for_purpose(OrderPurpose::Exit), 60);
    }

    #[test]
    fn action_for_purpose() {
        let config = PartialFillTimeoutConfig::default();

        assert_eq!(
            config.action_for_purpose(OrderPurpose::Entry),
            PartialFillTimeoutAction::KeepPartial
        );
        assert_eq!(
            config.action_for_purpose(OrderPurpose::StopLoss),
            PartialFillTimeoutAction::AggressiveResubmit
        );
    }

    #[test]
    fn partial_fill_state_serde() {
        let state = PartialFillState::new(
            OrderId::new("ord-1"),
            Quantity::from_i64(100),
            OrderPurpose::Entry,
        );

        let json = serde_json::to_string(&state).unwrap();
        let parsed: PartialFillState = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.order_id(), state.order_id());
        assert_eq!(parsed.order_qty(), state.order_qty());
    }

    #[test]
    fn timeout_config_scale_in_purpose() {
        let config = PartialFillTimeoutConfig::default();
        // ScaleIn should have same timeout as Entry
        assert_eq!(config.timeout_for_purpose(OrderPurpose::ScaleIn), 300);
        assert_eq!(
            config.action_for_purpose(OrderPurpose::ScaleIn),
            PartialFillTimeoutAction::KeepPartial
        );
    }

    #[test]
    fn timeout_config_scale_out_purpose() {
        let config = PartialFillTimeoutConfig::default();
        // ScaleOut should have same timeout as Exit
        assert_eq!(config.timeout_for_purpose(OrderPurpose::ScaleOut), 60);
        assert_eq!(
            config.action_for_purpose(OrderPurpose::ScaleOut),
            PartialFillTimeoutAction::ResubmitMarket
        );
    }

    #[test]
    fn timeout_config_bracket_leg_purpose() {
        let config = PartialFillTimeoutConfig::default();
        // BracketLeg should have same timeout as Exit
        assert_eq!(config.timeout_for_purpose(OrderPurpose::BracketLeg), 60);
        assert_eq!(
            config.action_for_purpose(OrderPurpose::BracketLeg),
            PartialFillTimeoutAction::ResubmitMarket
        );
    }

    #[test]
    fn timeout_config_take_profit_purpose() {
        let config = PartialFillTimeoutConfig::default();
        assert_eq!(config.timeout_for_purpose(OrderPurpose::TakeProfit), 120);
        assert_eq!(
            config.action_for_purpose(OrderPurpose::TakeProfit),
            PartialFillTimeoutAction::ResubmitMarket // Uses on_exit_timeout
        );
    }

    #[test]
    fn partial_fill_state_last_fill_at() {
        let mut state = PartialFillState::new(
            OrderId::new("ord-1"),
            Quantity::from_i64(100),
            OrderPurpose::Entry,
        );

        assert!(state.last_fill_at().is_none());

        state.apply_fill(make_fill("f1", 50, 150.00)).unwrap();
        assert!(state.last_fill_at().is_some());
    }

    #[test]
    fn partial_fill_state_created_at() {
        let state = PartialFillState::new(
            OrderId::new("ord-1"),
            Quantity::from_i64(100),
            OrderPurpose::Entry,
        );

        assert!(state.created_at().unix_seconds() > 0);
    }

    #[test]
    fn fill_percentage_zero_order_qty() {
        let state = PartialFillState::new(
            OrderId::new("ord-1"),
            Quantity::ZERO, // Zero order quantity
            OrderPurpose::Entry,
        );

        assert_eq!(state.fill_percentage(), Decimal::ZERO);
    }
}
