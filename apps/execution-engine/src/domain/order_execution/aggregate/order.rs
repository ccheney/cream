//! Order Aggregate Root
//!
//! The Order aggregate manages the complete lifecycle of an order,
//! following FIX protocol semantics for state transitions and partial fills.

use serde::{Deserialize, Serialize};

use super::OrderLine;
use crate::domain::order_execution::errors::OrderError;
use crate::domain::order_execution::events::{
    OrderAccepted, OrderCanceled, OrderEvent, OrderFilled, OrderPartiallyFilled, OrderRejected,
    OrderSubmitted,
};
use crate::domain::order_execution::value_objects::{
    CancelReason, FillReport, OrderPurpose, OrderSide, OrderStatus, OrderType, PartialFillState,
    RejectReason, TimeInForce,
};
use crate::domain::shared::{BrokerId, Money, OrderId, Quantity, Symbol, Timestamp};

/// Command to create a new order.
#[derive(Debug, Clone)]
pub struct CreateOrderCommand {
    /// Symbol to trade.
    pub symbol: Symbol,
    /// Order side.
    pub side: OrderSide,
    /// Order type.
    pub order_type: OrderType,
    /// Quantity to trade.
    pub quantity: Quantity,
    /// Limit price (required for Limit/StopLimit).
    pub limit_price: Option<Money>,
    /// Stop price (required for Stop/StopLimit).
    pub stop_price: Option<Money>,
    /// Time in force.
    pub time_in_force: TimeInForce,
    /// Order purpose (for timeout policies).
    pub purpose: OrderPurpose,
    /// Order legs (for multi-leg orders).
    pub legs: Vec<OrderLine>,
}

impl CreateOrderCommand {
    /// Validate the command parameters.
    ///
    /// # Errors
    ///
    /// Returns error if required parameters are missing or invalid.
    pub fn validate(&self) -> Result<(), OrderError> {
        // Validate symbol
        self.symbol
            .validate()
            .map_err(|e| OrderError::InvalidParameters {
                field: "symbol".to_string(),
                message: e.to_string(),
            })?;

        // Validate quantity
        self.quantity
            .validate_for_order()
            .map_err(|e| OrderError::InvalidParameters {
                field: "quantity".to_string(),
                message: e.to_string(),
            })?;

        // Validate limit price for limit orders
        if self.order_type.requires_limit_price() && self.limit_price.is_none() {
            return Err(OrderError::InvalidParameters {
                field: "limit_price".to_string(),
                message: "Limit price required for limit orders".to_string(),
            });
        }

        // Validate stop price for stop orders
        if self.order_type.requires_stop_price() && self.stop_price.is_none() {
            return Err(OrderError::InvalidParameters {
                field: "stop_price".to_string(),
                message: "Stop price required for stop orders".to_string(),
            });
        }

        // Validate prices are positive
        if let Some(price) = &self.limit_price {
            price
                .validate_for_order()
                .map_err(|e| OrderError::InvalidParameters {
                    field: "limit_price".to_string(),
                    message: e.to_string(),
                })?;
        }

        if let Some(price) = &self.stop_price {
            price
                .validate_for_order()
                .map_err(|e| OrderError::InvalidParameters {
                    field: "stop_price".to_string(),
                    message: e.to_string(),
                })?;
        }

        Ok(())
    }
}

/// Order Aggregate Root.
///
/// Manages the complete lifecycle of an order with FIX protocol semantics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Order {
    id: OrderId,
    symbol: Symbol,
    side: OrderSide,
    order_type: OrderType,
    quantity: Quantity,
    limit_price: Option<Money>,
    stop_price: Option<Money>,
    time_in_force: TimeInForce,
    status: OrderStatus,
    partial_fill: PartialFillState,
    broker_order_id: Option<BrokerId>,
    legs: Vec<OrderLine>,
    #[serde(skip)]
    events: Vec<OrderEvent>,
    created_at: Timestamp,
    updated_at: Timestamp,
}

impl Order {
    /// Create a new order from a command.
    ///
    /// Generates an `OrderSubmitted` event.
    ///
    /// # Errors
    ///
    /// Returns error if command validation fails.
    pub fn new(cmd: CreateOrderCommand) -> Result<Self, OrderError> {
        cmd.validate()?;

        let id = OrderId::generate();
        let now = Timestamp::now();

        let mut order = Self {
            id: id.clone(),
            symbol: cmd.symbol.clone(),
            side: cmd.side,
            order_type: cmd.order_type,
            quantity: cmd.quantity,
            limit_price: cmd.limit_price,
            stop_price: cmd.stop_price,
            time_in_force: cmd.time_in_force,
            status: OrderStatus::New,
            partial_fill: PartialFillState::new(id.clone(), cmd.quantity, cmd.purpose),
            broker_order_id: None,
            legs: cmd.legs,
            events: Vec::new(),
            created_at: now,
            updated_at: now,
        };

        order.events.push(OrderEvent::Submitted(OrderSubmitted {
            order_id: id,
            symbol: cmd.symbol,
            side: cmd.side,
            quantity: cmd.quantity,
            limit_price: cmd.limit_price,
            occurred_at: now,
        }));

        Ok(order)
    }

    /// Reconstitute an order from stored state (no events generated).
    #[must_use]
    pub fn reconstitute(
        id: OrderId,
        symbol: Symbol,
        side: OrderSide,
        order_type: OrderType,
        quantity: Quantity,
        limit_price: Option<Money>,
        stop_price: Option<Money>,
        time_in_force: TimeInForce,
        status: OrderStatus,
        partial_fill: PartialFillState,
        broker_order_id: Option<BrokerId>,
        legs: Vec<OrderLine>,
        created_at: Timestamp,
        updated_at: Timestamp,
    ) -> Self {
        Self {
            id,
            symbol,
            side,
            order_type,
            quantity,
            limit_price,
            stop_price,
            time_in_force,
            status,
            partial_fill,
            broker_order_id,
            legs,
            events: Vec::new(),
            created_at,
            updated_at,
        }
    }

    // ========================================================================
    // Getters
    // ========================================================================

    /// Get the order ID.
    #[must_use]
    pub fn id(&self) -> &OrderId {
        &self.id
    }

    /// Get the symbol.
    #[must_use]
    pub fn symbol(&self) -> &Symbol {
        &self.symbol
    }

    /// Get the order side.
    #[must_use]
    pub const fn side(&self) -> OrderSide {
        self.side
    }

    /// Get the order type.
    #[must_use]
    pub const fn order_type(&self) -> OrderType {
        self.order_type
    }

    /// Get the quantity.
    #[must_use]
    pub fn quantity(&self) -> Quantity {
        self.quantity
    }

    /// Get the limit price.
    #[must_use]
    pub fn limit_price(&self) -> Option<Money> {
        self.limit_price
    }

    /// Get the stop price.
    #[must_use]
    pub fn stop_price(&self) -> Option<Money> {
        self.stop_price
    }

    /// Get the time in force.
    #[must_use]
    pub const fn time_in_force(&self) -> TimeInForce {
        self.time_in_force
    }

    /// Get the current status.
    #[must_use]
    pub const fn status(&self) -> OrderStatus {
        self.status
    }

    /// Get the partial fill state.
    #[must_use]
    pub fn partial_fill(&self) -> &PartialFillState {
        &self.partial_fill
    }

    /// Get the broker order ID.
    #[must_use]
    pub fn broker_order_id(&self) -> Option<&BrokerId> {
        self.broker_order_id.as_ref()
    }

    /// Get the order legs.
    #[must_use]
    pub fn legs(&self) -> &[OrderLine] {
        &self.legs
    }

    /// Check if this is a multi-leg order.
    #[must_use]
    pub fn is_multi_leg(&self) -> bool {
        !self.legs.is_empty()
    }

    /// Get the creation timestamp.
    #[must_use]
    pub const fn created_at(&self) -> Timestamp {
        self.created_at
    }

    /// Get the last update timestamp.
    #[must_use]
    pub const fn updated_at(&self) -> Timestamp {
        self.updated_at
    }

    // ========================================================================
    // State Transitions
    // ========================================================================

    /// Mark order as accepted by broker.
    ///
    /// Generates an `OrderAccepted` event.
    ///
    /// # Errors
    ///
    /// Returns error if order is not in `New` or `PendingNew` status.
    pub fn accept(&mut self, broker_id: BrokerId) -> Result<(), OrderError> {
        self.ensure_can_transition_to(OrderStatus::Accepted)?;

        self.broker_order_id = Some(broker_id.clone());
        self.status = OrderStatus::Accepted;
        self.updated_at = Timestamp::now();

        for leg in &mut self.legs {
            leg.accept();
        }

        self.events.push(OrderEvent::Accepted(OrderAccepted {
            order_id: self.id.clone(),
            broker_order_id: broker_id,
            occurred_at: self.updated_at,
        }));

        Ok(())
    }

    /// Apply a fill to the order.
    ///
    /// Generates `OrderPartiallyFilled` and/or `OrderFilled` events.
    ///
    /// # Errors
    ///
    /// Returns error if order cannot receive fills or fill violates FIX invariant.
    pub fn apply_fill(&mut self, fill: FillReport) -> Result<(), OrderError> {
        if !self.status.can_fill() {
            return Err(OrderError::CannotFill {
                status: self.status,
            });
        }

        let fill_qty = fill.quantity;
        let fill_price = fill.price;

        self.partial_fill
            .apply_fill(fill)
            .map_err(|e| OrderError::FixInvariantViolation {
                invariant: "FillQty <= LeavesQty".to_string(),
                state: e.to_string(),
            })?;

        self.status = if self.partial_fill.is_filled() {
            OrderStatus::Filled
        } else {
            OrderStatus::PartiallyFilled
        };
        self.updated_at = Timestamp::now();

        self.events
            .push(OrderEvent::PartiallyFilled(OrderPartiallyFilled {
                order_id: self.id.clone(),
                fill_quantity: fill_qty,
                fill_price,
                cumulative_quantity: self.partial_fill.cum_qty(),
                leaves_quantity: self.partial_fill.leaves_qty(),
                vwap: self.partial_fill.avg_px(),
                occurred_at: self.updated_at,
            }));

        if self.status == OrderStatus::Filled {
            self.events.push(OrderEvent::Filled(OrderFilled {
                order_id: self.id.clone(),
                total_quantity: self.quantity,
                average_price: self.partial_fill.avg_px(),
                occurred_at: self.updated_at,
            }));
        }

        Ok(())
    }

    /// Cancel the order.
    ///
    /// Generates an `OrderCanceled` event.
    ///
    /// # Errors
    ///
    /// Returns error if order cannot be canceled.
    pub fn cancel(&mut self, reason: CancelReason) -> Result<(), OrderError> {
        if !self.status.is_cancelable() {
            return Err(OrderError::CannotCancel {
                status: self.status,
            });
        }

        let filled_qty = self.partial_fill.cum_qty();
        self.status = OrderStatus::Canceled;
        self.updated_at = Timestamp::now();

        for leg in &mut self.legs {
            leg.cancel();
        }

        self.events.push(OrderEvent::Canceled(OrderCanceled {
            order_id: self.id.clone(),
            reason,
            filled_quantity: filled_qty,
            occurred_at: self.updated_at,
        }));

        Ok(())
    }

    /// Reject the order.
    ///
    /// Generates an `OrderRejected` event.
    ///
    /// # Errors
    ///
    /// Returns error if order is not in a rejectable state.
    pub fn reject(&mut self, reason: RejectReason) -> Result<(), OrderError> {
        if !matches!(self.status, OrderStatus::New | OrderStatus::PendingNew) {
            return Err(OrderError::InvalidStateTransition {
                from: self.status,
                to: OrderStatus::Rejected,
                reason: "Can only reject new orders".to_string(),
            });
        }

        self.status = OrderStatus::Rejected;
        self.updated_at = Timestamp::now();

        for leg in &mut self.legs {
            leg.reject();
        }

        self.events.push(OrderEvent::Rejected(OrderRejected {
            order_id: self.id.clone(),
            reason,
            occurred_at: self.updated_at,
        }));

        Ok(())
    }

    /// Mark order as expired.
    ///
    /// # Errors
    ///
    /// Returns error if order is in a terminal state.
    pub fn expire(&mut self) -> Result<(), OrderError> {
        if self.status.is_terminal() {
            return Err(OrderError::InvalidStateTransition {
                from: self.status,
                to: OrderStatus::Expired,
                reason: "Cannot expire a terminal order".to_string(),
            });
        }

        self.status = OrderStatus::Expired;
        self.updated_at = Timestamp::now();

        // Expiration uses the canceled event with special reason
        self.events.push(OrderEvent::Canceled(OrderCanceled {
            order_id: self.id.clone(),
            reason: CancelReason::end_of_day(),
            filled_quantity: self.partial_fill.cum_qty(),
            occurred_at: self.updated_at,
        }));

        Ok(())
    }

    // ========================================================================
    // Events
    // ========================================================================

    /// Drain accumulated domain events.
    pub fn drain_events(&mut self) -> Vec<OrderEvent> {
        std::mem::take(&mut self.events)
    }

    /// Get pending events without draining.
    #[must_use]
    pub fn pending_events(&self) -> &[OrderEvent] {
        &self.events
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    fn ensure_can_transition_to(&self, target: OrderStatus) -> Result<(), OrderError> {
        let valid = match (self.status, target) {
            (OrderStatus::New, OrderStatus::Accepted) => true,
            (OrderStatus::New, OrderStatus::Rejected) => true,
            (OrderStatus::New, OrderStatus::Canceled) => true,
            (OrderStatus::PendingNew, OrderStatus::Accepted) => true,
            (OrderStatus::PendingNew, OrderStatus::Rejected) => true,
            (OrderStatus::Accepted, OrderStatus::PartiallyFilled) => true,
            (OrderStatus::Accepted, OrderStatus::Filled) => true,
            (OrderStatus::Accepted, OrderStatus::Canceled) => true,
            (OrderStatus::PartiallyFilled, OrderStatus::PartiallyFilled) => true,
            (OrderStatus::PartiallyFilled, OrderStatus::Filled) => true,
            (OrderStatus::PartiallyFilled, OrderStatus::Canceled) => true,
            _ => false,
        };

        if valid {
            Ok(())
        } else {
            Err(OrderError::InvalidStateTransition {
                from: self.status,
                to: target,
                reason: "Invalid state transition".to_string(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_create_command() -> CreateOrderCommand {
        CreateOrderCommand {
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            quantity: Quantity::from_i64(100),
            limit_price: Some(Money::usd(150.00)),
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
            legs: vec![],
        }
    }

    fn make_fill(qty: i64, price: f64) -> FillReport {
        FillReport::new(
            format!("fill-{qty}"),
            Quantity::from_i64(qty),
            Money::usd(price),
            Timestamp::now(),
            "NYSE",
        )
    }

    #[test]
    fn order_new_generates_submitted_event() {
        let order = Order::new(make_create_command()).unwrap();

        assert_eq!(order.status(), OrderStatus::New);
        assert_eq!(order.pending_events().len(), 1);
        assert!(matches!(
            order.pending_events()[0],
            OrderEvent::Submitted(_)
        ));
    }

    #[test]
    fn order_validation_fails_for_missing_limit_price() {
        let mut cmd = make_create_command();
        cmd.limit_price = None;

        let result = Order::new(cmd);
        assert!(result.is_err());
    }

    #[test]
    fn order_accept_transitions_to_accepted() {
        let mut order = Order::new(make_create_command()).unwrap();
        order.drain_events();

        order.accept(BrokerId::new("broker-123")).unwrap();

        assert_eq!(order.status(), OrderStatus::Accepted);
        assert_eq!(order.broker_order_id().unwrap().as_str(), "broker-123");
        assert_eq!(order.pending_events().len(), 1);
        assert!(matches!(order.pending_events()[0], OrderEvent::Accepted(_)));
    }

    #[test]
    fn order_accept_fails_for_filled_order() {
        let mut order = Order::new(make_create_command()).unwrap();
        order.accept(BrokerId::new("broker-123")).unwrap();
        order.apply_fill(make_fill(100, 150.00)).unwrap();
        order.drain_events();

        let result = order.accept(BrokerId::new("another-id"));
        assert!(result.is_err());
    }

    #[test]
    fn order_apply_fill_partial() {
        let mut order = Order::new(make_create_command()).unwrap();
        order.accept(BrokerId::new("broker-123")).unwrap();
        order.drain_events();

        order.apply_fill(make_fill(50, 150.00)).unwrap();

        assert_eq!(order.status(), OrderStatus::PartiallyFilled);
        assert_eq!(order.partial_fill().cum_qty(), Quantity::from_i64(50));
        assert_eq!(order.partial_fill().leaves_qty(), Quantity::from_i64(50));
        assert!(order.partial_fill().verify_fix_invariant());
    }

    #[test]
    fn order_apply_fill_complete() {
        let mut order = Order::new(make_create_command()).unwrap();
        order.accept(BrokerId::new("broker-123")).unwrap();
        order.drain_events();

        order.apply_fill(make_fill(100, 150.00)).unwrap();

        assert_eq!(order.status(), OrderStatus::Filled);
        assert!(order.partial_fill().is_filled());
        // Should have both PartiallyFilled and Filled events
        assert_eq!(order.pending_events().len(), 2);
    }

    #[test]
    fn order_apply_multiple_fills_maintains_invariant() {
        let mut order = Order::new(make_create_command()).unwrap();
        order.accept(BrokerId::new("broker-123")).unwrap();

        order.apply_fill(make_fill(30, 149.00)).unwrap();
        assert!(order.partial_fill().verify_fix_invariant());

        order.apply_fill(make_fill(50, 150.00)).unwrap();
        assert!(order.partial_fill().verify_fix_invariant());

        order.apply_fill(make_fill(20, 151.00)).unwrap();
        assert!(order.partial_fill().verify_fix_invariant());

        assert_eq!(order.status(), OrderStatus::Filled);
    }

    #[test]
    fn order_cancel_from_new() {
        let mut order = Order::new(make_create_command()).unwrap();
        order.drain_events();

        order.cancel(CancelReason::user_requested()).unwrap();

        assert_eq!(order.status(), OrderStatus::Canceled);
        assert_eq!(order.pending_events().len(), 1);
        assert!(matches!(order.pending_events()[0], OrderEvent::Canceled(_)));
    }

    #[test]
    fn order_cancel_preserves_partial_fill() {
        let mut order = Order::new(make_create_command()).unwrap();
        order.accept(BrokerId::new("broker-123")).unwrap();
        order.apply_fill(make_fill(50, 150.00)).unwrap();
        order.drain_events();

        order.cancel(CancelReason::timeout()).unwrap();

        assert_eq!(order.status(), OrderStatus::Canceled);
        assert_eq!(order.partial_fill().cum_qty(), Quantity::from_i64(50));

        if let OrderEvent::Canceled(e) = &order.pending_events()[0] {
            assert_eq!(e.filled_quantity, Quantity::from_i64(50));
        } else {
            panic!("Expected Canceled event");
        }
    }

    #[test]
    fn order_cancel_fails_for_filled_order() {
        let mut order = Order::new(make_create_command()).unwrap();
        order.accept(BrokerId::new("broker-123")).unwrap();
        order.apply_fill(make_fill(100, 150.00)).unwrap();

        let result = order.cancel(CancelReason::user_requested());
        assert!(result.is_err());
    }

    #[test]
    fn order_reject() {
        let mut order = Order::new(make_create_command()).unwrap();
        order.drain_events();

        order
            .reject(RejectReason::insufficient_buying_power())
            .unwrap();

        assert_eq!(order.status(), OrderStatus::Rejected);
        assert!(matches!(order.pending_events()[0], OrderEvent::Rejected(_)));
    }

    #[test]
    fn order_expire() {
        let mut order = Order::new(make_create_command()).unwrap();
        order.accept(BrokerId::new("broker-123")).unwrap();
        order.drain_events();

        order.expire().unwrap();

        assert_eq!(order.status(), OrderStatus::Expired);
    }

    #[test]
    fn order_market_order_no_limit_price_required() {
        let cmd = CreateOrderCommand {
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            quantity: Quantity::from_i64(100),
            limit_price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
            legs: vec![],
        };

        let order = Order::new(cmd).unwrap();
        assert_eq!(order.order_type(), OrderType::Market);
    }

    #[test]
    fn order_stop_order_requires_stop_price() {
        let cmd = CreateOrderCommand {
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Sell,
            order_type: OrderType::Stop,
            quantity: Quantity::from_i64(100),
            limit_price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::StopLoss,
            legs: vec![],
        };

        let result = Order::new(cmd);
        assert!(result.is_err());
    }

    #[test]
    fn order_serde_roundtrip() {
        let order = Order::new(make_create_command()).unwrap();

        let json = serde_json::to_string(&order).unwrap();
        let parsed: Order = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.id(), order.id());
        assert_eq!(parsed.symbol(), order.symbol());
        assert_eq!(parsed.status(), order.status());
    }

    #[test]
    fn order_is_multi_leg() {
        let order = Order::new(make_create_command()).unwrap();
        assert!(!order.is_multi_leg());

        let mut cmd = make_create_command();
        cmd.legs = vec![
            OrderLine::new(
                0,
                "AAPL250117P00190000".into(),
                OrderSide::Buy,
                Quantity::from_i64(10),
            ),
            OrderLine::new(
                1,
                "AAPL250117P00185000".into(),
                OrderSide::Sell,
                Quantity::from_i64(10),
            ),
        ];

        let multi_leg_order = Order::new(cmd).unwrap();
        assert!(multi_leg_order.is_multi_leg());
        assert_eq!(multi_leg_order.legs().len(), 2);
    }
}
