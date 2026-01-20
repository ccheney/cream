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

/// Parameters for reconstituting an Order from storage.
///
/// Used by repositories to rebuild aggregates from persisted state.
/// No domain events are generated during reconstitution.
#[derive(Debug, Clone)]
pub struct ReconstitutedOrderParams {
    /// Order identifier.
    pub id: OrderId,
    /// Symbol being traded.
    pub symbol: Symbol,
    /// Order side (buy/sell).
    pub side: OrderSide,
    /// Order type.
    pub order_type: OrderType,
    /// Total quantity.
    pub quantity: Quantity,
    /// Limit price (for limit orders).
    pub limit_price: Option<Money>,
    /// Stop price (for stop orders).
    pub stop_price: Option<Money>,
    /// Time in force policy.
    pub time_in_force: TimeInForce,
    /// Current order status.
    pub status: OrderStatus,
    /// Partial fill state tracking FIX protocol invariants.
    pub partial_fill: PartialFillState,
    /// Broker-assigned order ID.
    pub broker_order_id: Option<BrokerId>,
    /// Order legs for multi-leg orders.
    pub legs: Vec<OrderLine>,
    /// Creation timestamp.
    pub created_at: Timestamp,
    /// Last update timestamp.
    pub updated_at: Timestamp,
}

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
// Allow `order_type` field name: follows FIX protocol terminology (tag 40 OrdType).
// Using `kind` or `type` would diverge from the industry standard naming convention
// that traders and developers expect when working with order management systems.
#[allow(clippy::struct_field_names)]
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
    ///
    /// This is a factory method for rebuilding aggregates from persistence.
    /// It bypasses normal creation logic and does not emit domain events,
    /// as the aggregate is being restored to a known valid state.
    #[must_use]
    pub fn reconstitute(params: ReconstitutedOrderParams) -> Self {
        Self {
            id: params.id,
            symbol: params.symbol,
            side: params.side,
            order_type: params.order_type,
            quantity: params.quantity,
            limit_price: params.limit_price,
            stop_price: params.stop_price,
            time_in_force: params.time_in_force,
            status: params.status,
            partial_fill: params.partial_fill,
            broker_order_id: params.broker_order_id,
            legs: params.legs,
            events: Vec::new(),
            created_at: params.created_at,
            updated_at: params.updated_at,
        }
    }

    // ========================================================================
    // Getters
    // ========================================================================

    /// Get the order ID.
    #[must_use]
    pub const fn id(&self) -> &OrderId {
        &self.id
    }

    /// Get the symbol.
    #[must_use]
    pub const fn symbol(&self) -> &Symbol {
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
    pub const fn quantity(&self) -> Quantity {
        self.quantity
    }

    /// Get the limit price.
    #[must_use]
    pub const fn limit_price(&self) -> Option<Money> {
        self.limit_price
    }

    /// Get the stop price.
    #[must_use]
    pub const fn stop_price(&self) -> Option<Money> {
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
    pub const fn partial_fill(&self) -> &PartialFillState {
        &self.partial_fill
    }

    /// Get the broker order ID.
    #[must_use]
    pub const fn broker_order_id(&self) -> Option<&BrokerId> {
        self.broker_order_id.as_ref()
    }

    /// Get the order legs.
    #[must_use]
    pub fn legs(&self) -> &[OrderLine] {
        &self.legs
    }

    /// Check if this is a multi-leg order.
    #[must_use]
    pub const fn is_multi_leg(&self) -> bool {
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
        let valid = matches!(
            (self.status, target),
            (
                OrderStatus::New,
                OrderStatus::Accepted | OrderStatus::Rejected | OrderStatus::Canceled
            ) | (
                OrderStatus::PendingNew,
                OrderStatus::Accepted | OrderStatus::Rejected
            ) | (
                OrderStatus::Accepted | OrderStatus::PartiallyFilled,
                OrderStatus::PartiallyFilled | OrderStatus::Filled | OrderStatus::Canceled
            )
        );

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

    #[test]
    fn order_purpose_is_correct() {
        let mut cmd = make_create_command();
        cmd.purpose = OrderPurpose::StopLoss;
        let order = Order::new(cmd).unwrap();
        assert_eq!(order.partial_fill().order_purpose(), OrderPurpose::StopLoss);
    }

    #[test]
    fn order_stop_limit_requires_both_prices() {
        let cmd = CreateOrderCommand {
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Sell,
            order_type: OrderType::StopLimit,
            quantity: Quantity::from_i64(100),
            limit_price: Some(Money::usd(140.0)),
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::StopLoss,
            legs: vec![],
        };

        let result = Order::new(cmd);
        assert!(result.is_err());
    }

    #[test]
    fn order_stop_price_accessor() {
        let cmd = CreateOrderCommand {
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Sell,
            order_type: OrderType::Stop,
            quantity: Quantity::from_i64(100),
            limit_price: None,
            stop_price: Some(Money::usd(140.0)),
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::StopLoss,
            legs: vec![],
        };

        let order = Order::new(cmd).unwrap();
        assert_eq!(
            order.stop_price().unwrap().amount(),
            rust_decimal::Decimal::new(140, 0)
        );
    }

    #[test]
    fn order_timestamps() {
        let order = Order::new(make_create_command()).unwrap();
        assert!(order.created_at().unix_seconds() > 0);
        assert!(order.updated_at().unix_seconds() > 0);
    }

    #[test]
    fn order_apply_fill_fails_for_new_order() {
        let mut order = Order::new(make_create_command()).unwrap();
        let result = order.apply_fill(make_fill(50, 150.0));
        assert!(result.is_err());
    }

    #[test]
    fn order_apply_fill_exceeds_remaining() {
        let mut order = Order::new(make_create_command()).unwrap();
        order.accept(BrokerId::new("broker-123")).unwrap();

        let result = order.apply_fill(make_fill(150, 150.0)); // More than 100 quantity
        assert!(result.is_err());
    }

    #[test]
    fn order_reject_fails_for_accepted_order() {
        let mut order = Order::new(make_create_command()).unwrap();
        order.accept(BrokerId::new("broker-123")).unwrap();

        let result = order.reject(RejectReason::insufficient_buying_power());
        assert!(result.is_err());
    }

    #[test]
    fn order_expire_fails_for_filled_order() {
        let mut order = Order::new(make_create_command()).unwrap();
        order.accept(BrokerId::new("broker-123")).unwrap();
        order.apply_fill(make_fill(100, 150.0)).unwrap();

        let result = order.expire();
        assert!(result.is_err());
    }

    #[test]
    fn order_reconstitute() {
        let id = OrderId::new("ord-recon");
        let symbol = Symbol::new("AAPL");
        let quantity = Quantity::from_i64(100);
        let partial_fill = PartialFillState::new(id.clone(), quantity, OrderPurpose::Entry);
        let created_at = Timestamp::now();
        let updated_at = Timestamp::now();

        let order = Order::reconstitute(ReconstitutedOrderParams {
            id,
            symbol,
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            quantity,
            limit_price: Some(Money::usd(150.0)),
            stop_price: None,
            time_in_force: TimeInForce::Day,
            status: OrderStatus::Accepted,
            partial_fill,
            broker_order_id: Some(BrokerId::new("broker-recon")),
            legs: vec![],
            created_at,
            updated_at,
        });

        assert_eq!(order.id().as_str(), "ord-recon");
        assert_eq!(order.symbol().as_str(), "AAPL");
        assert_eq!(order.status(), OrderStatus::Accepted);
        assert_eq!(order.broker_order_id().unwrap().as_str(), "broker-recon");
        assert!(order.pending_events().is_empty()); // Reconstituted orders have no events
    }

    #[test]
    fn order_multi_leg_accept_updates_legs() {
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

        let mut order = Order::new(cmd).unwrap();
        assert!(order.is_multi_leg());

        order.accept(BrokerId::new("broker-123")).unwrap();

        // Check that legs are updated
        for leg in order.legs() {
            assert_eq!(leg.status(), OrderStatus::Accepted);
        }
    }

    #[test]
    fn order_cancel_from_pending_cancel() {
        let mut order = Order::new(make_create_command()).unwrap();
        order.accept(BrokerId::new("broker-123")).unwrap();
        // PendingCancel status would typically be set by transition
        // Test cancel from accepted which is also cancelable
        order.cancel(CancelReason::user_requested()).unwrap();
        assert_eq!(order.status(), OrderStatus::Canceled);
    }

    #[test]
    fn order_apply_fill_from_partially_filled() {
        let mut order = Order::new(make_create_command()).unwrap();
        order.accept(BrokerId::new("broker-123")).unwrap();

        // First partial fill
        order.apply_fill(make_fill(30, 149.0)).unwrap();
        assert_eq!(order.status(), OrderStatus::PartiallyFilled);

        // Second fill from PartiallyFilled status
        order.apply_fill(make_fill(30, 150.0)).unwrap();
        assert_eq!(order.status(), OrderStatus::PartiallyFilled);
        assert_eq!(order.partial_fill().cum_qty(), Quantity::from_i64(60));
    }

    #[test]
    fn order_invalid_stop_price_validation() {
        let cmd = CreateOrderCommand {
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Sell,
            order_type: OrderType::Stop,
            quantity: Quantity::from_i64(100),
            limit_price: None,
            stop_price: Some(Money::usd(-10.0)), // Invalid negative price
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::StopLoss,
            legs: vec![],
        };

        let result = Order::new(cmd);
        assert!(result.is_err());
    }

    #[test]
    fn order_invalid_limit_price_validation() {
        let cmd = CreateOrderCommand {
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            quantity: Quantity::from_i64(100),
            limit_price: Some(Money::usd(-5.0)), // Invalid negative price
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
            legs: vec![],
        };

        let result = Order::new(cmd);
        assert!(result.is_err());
    }

    #[test]
    fn order_invalid_symbol_validation() {
        let cmd = CreateOrderCommand {
            symbol: Symbol::new(""), // Invalid empty symbol
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            quantity: Quantity::from_i64(100),
            limit_price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
            legs: vec![],
        };

        let result = Order::new(cmd);
        assert!(result.is_err());
        let err = result.unwrap_err();
        match err {
            OrderError::InvalidParameters { field, .. } => {
                assert_eq!(field, "symbol");
            }
            _ => panic!("Expected InvalidParameters error"),
        }
    }

    #[test]
    fn order_invalid_quantity_validation() {
        let cmd = CreateOrderCommand {
            symbol: Symbol::new("AAPL"),
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            quantity: Quantity::ZERO, // Invalid zero quantity
            limit_price: None,
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
            legs: vec![],
        };

        let result = Order::new(cmd);
        assert!(result.is_err());
        let err = result.unwrap_err();
        match err {
            OrderError::InvalidParameters { field, .. } => {
                assert_eq!(field, "quantity");
            }
            _ => panic!("Expected InvalidParameters error"),
        }
    }

    #[test]
    fn order_cancel_with_legs() {
        use crate::domain::shared::InstrumentId;

        let leg = OrderLine::new(
            0,
            InstrumentId::new("AAPL250117C00200000"),
            OrderSide::Buy,
            Quantity::from_i64(1),
        );

        let cmd = CreateOrderCommand {
            symbol: Symbol::new("AAPL250117C00200000"),
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            quantity: Quantity::from_i64(1),
            limit_price: Some(Money::usd(5.0)),
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
            legs: vec![leg],
        };

        let mut order = Order::new(cmd).unwrap();
        assert!(order.accept(BrokerId::new("broker-123")).is_ok());

        // Cancel the order with legs
        assert!(order.cancel(CancelReason::user_requested()).is_ok());
        assert_eq!(order.status(), OrderStatus::Canceled);
    }

    #[test]
    fn order_reject_with_legs() {
        use crate::domain::shared::InstrumentId;

        let leg = OrderLine::new(
            0,
            InstrumentId::new("AAPL250117C00200000"),
            OrderSide::Buy,
            Quantity::from_i64(1),
        );

        let cmd = CreateOrderCommand {
            symbol: Symbol::new("AAPL250117C00200000"),
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            quantity: Quantity::from_i64(1),
            limit_price: Some(Money::usd(5.0)),
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
            legs: vec![leg],
        };

        let mut order = Order::new(cmd).unwrap();

        // Reject the order with legs
        assert!(
            order
                .reject(RejectReason::insufficient_buying_power())
                .is_ok()
        );
        assert_eq!(order.status(), OrderStatus::Rejected);
    }

    #[test]
    fn order_state_transition_coverage() {
        let cmd = make_create_command();
        let mut order = Order::new(cmd).unwrap();

        // Test New -> Accepted -> PartiallyFilled -> Filled sequence
        assert!(order.accept(BrokerId::new("broker-123")).is_ok());
        assert!(order.apply_fill(make_fill(50, 150.0)).is_ok());
        assert_eq!(order.status(), OrderStatus::PartiallyFilled);
        assert!(order.apply_fill(make_fill(50, 150.0)).is_ok());
        assert_eq!(order.status(), OrderStatus::Filled);
    }
}
