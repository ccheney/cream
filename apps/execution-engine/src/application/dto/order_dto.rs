//! Order DTOs

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::domain::order_execution::value_objects::{
    OrderPurpose, OrderSide, OrderStatus, OrderType, TimeInForce,
};
use crate::domain::shared::{OrderId, Symbol, Timestamp};

/// DTO for creating an order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateOrderDto {
    /// Client order ID.
    pub client_order_id: String,
    /// Symbol.
    pub symbol: String,
    /// Side.
    pub side: OrderSide,
    /// Type.
    pub order_type: OrderType,
    /// Quantity.
    pub quantity: Decimal,
    /// Limit price.
    pub limit_price: Option<Decimal>,
    /// Time in force.
    pub time_in_force: TimeInForce,
    /// Purpose.
    pub purpose: OrderPurpose,
}

impl CreateOrderDto {
    /// Convert to domain types.
    #[must_use]
    pub fn to_domain(&self) -> (OrderId, Symbol) {
        (
            OrderId::new(&self.client_order_id),
            Symbol::new(&self.symbol),
        )
    }
}

/// DTO representing an order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderDto {
    /// Order ID.
    pub order_id: String,
    /// Broker ID.
    pub broker_id: Option<String>,
    /// Symbol.
    pub symbol: String,
    /// Side.
    pub side: OrderSide,
    /// Type.
    pub order_type: OrderType,
    /// Quantity.
    pub quantity: Decimal,
    /// Filled quantity.
    pub filled_qty: Decimal,
    /// Remaining quantity.
    pub remaining_qty: Decimal,
    /// Limit price.
    pub limit_price: Option<Decimal>,
    /// Average fill price.
    pub avg_fill_price: Option<Decimal>,
    /// Status.
    pub status: OrderStatus,
    /// Time in force.
    pub time_in_force: TimeInForce,
    /// Purpose.
    pub purpose: OrderPurpose,
    /// Created at.
    pub created_at: Timestamp,
    /// Updated at.
    pub updated_at: Timestamp,
}

impl OrderDto {
    /// Create from domain Order.
    #[must_use]
    pub fn from_order(order: &crate::domain::order_execution::aggregate::Order) -> Self {
        let partial_fill = order.partial_fill();
        Self {
            order_id: order.id().to_string(),
            broker_id: order.broker_order_id().map(|id| id.to_string()),
            symbol: order.symbol().to_string(),
            side: order.side(),
            order_type: order.order_type(),
            quantity: order.quantity().amount(),
            filled_qty: partial_fill.cum_qty().amount(),
            remaining_qty: partial_fill.leaves_qty().amount(),
            limit_price: order.limit_price().map(|m| m.amount()),
            avg_fill_price: if partial_fill.cum_qty().is_zero() {
                None
            } else {
                Some(partial_fill.avg_px().amount())
            },
            status: order.status(),
            time_in_force: order.time_in_force(),
            purpose: partial_fill.order_purpose(),
            created_at: order.created_at(),
            updated_at: order.updated_at(),
        }
    }
}

/// Response DTO for a single order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderResponseDto {
    /// The order.
    pub order: OrderDto,
    /// Any error message.
    pub error: Option<String>,
}

/// Request DTO for submitting orders.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitOrdersRequestDto {
    /// Orders to submit.
    pub orders: Vec<CreateOrderDto>,
    /// Validate risk before submitting.
    pub validate_risk: bool,
}

/// Response DTO for submitting orders.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitOrdersResponseDto {
    /// Successfully submitted orders.
    pub submitted: Vec<OrderResponseDto>,
    /// Rejected orders.
    pub rejected: Vec<OrderResponseDto>,
    /// Risk violations (if any).
    pub risk_violations: Vec<String>,
    /// Overall success.
    pub success: bool,
}

impl SubmitOrdersResponseDto {
    /// Create a successful response.
    #[must_use]
    pub fn success(submitted: Vec<OrderResponseDto>) -> Self {
        Self {
            submitted,
            rejected: vec![],
            risk_violations: vec![],
            success: true,
        }
    }

    /// Create a failed response with risk violations.
    #[must_use]
    pub fn risk_rejected(violations: Vec<String>) -> Self {
        Self {
            submitted: vec![],
            rejected: vec![],
            risk_violations: violations,
            success: false,
        }
    }

    /// Create a partial success response.
    #[must_use]
    pub fn partial(submitted: Vec<OrderResponseDto>, rejected: Vec<OrderResponseDto>) -> Self {
        let success = !submitted.is_empty() && rejected.is_empty();
        Self {
            submitted,
            rejected,
            risk_violations: vec![],
            success,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_order_dto_to_domain() {
        let dto = CreateOrderDto {
            client_order_id: "order-1".to_string(),
            symbol: "AAPL".to_string(),
            side: OrderSide::Buy,
            order_type: OrderType::Market,
            quantity: Decimal::new(100, 0),
            limit_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
        };

        let (order_id, symbol) = dto.to_domain();
        assert_eq!(order_id.as_str(), "order-1");
        assert_eq!(symbol.as_str(), "AAPL");
    }

    #[test]
    fn submit_orders_response_success() {
        let response = SubmitOrdersResponseDto::success(vec![]);
        assert!(response.success);
        assert!(response.risk_violations.is_empty());
    }

    #[test]
    fn submit_orders_response_risk_rejected() {
        let response =
            SubmitOrdersResponseDto::risk_rejected(vec!["Position limit exceeded".to_string()]);
        assert!(!response.success);
        assert_eq!(response.risk_violations.len(), 1);
    }
}
