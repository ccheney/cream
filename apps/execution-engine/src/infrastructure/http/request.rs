//! HTTP request DTOs.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::domain::order_execution::value_objects::{
    OrderPurpose, OrderSide, OrderType, TimeInForce,
};

/// Request to check constraints before order submission.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckConstraintsRequest {
    /// Request ID for correlation.
    pub request_id: String,
    /// Cycle ID.
    pub cycle_id: String,
    /// Risk policy ID.
    pub risk_policy_id: String,
    /// Account equity.
    pub account_equity: Decimal,
    /// Decisions to validate.
    pub decisions: Vec<DecisionRequest>,
    /// Whether to include portfolio context in response.
    #[serde(default)]
    pub include_portfolio_context: bool,
}

/// A single decision/order in a request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecisionRequest {
    /// Symbol to trade.
    pub symbol: String,
    /// Order side.
    pub side: OrderSide,
    /// Order type.
    #[serde(default = "default_order_type")]
    pub order_type: OrderType,
    /// Quantity.
    pub quantity: Decimal,
    /// Limit price (required for limit orders).
    pub limit_price: Option<Decimal>,
    /// Stop price (for stop orders).
    pub stop_price: Option<Decimal>,
    /// Time in force.
    #[serde(default = "default_tif")]
    pub time_in_force: TimeInForce,
    /// Order purpose.
    #[serde(default = "default_purpose")]
    pub purpose: OrderPurpose,
}

const fn default_order_type() -> OrderType {
    OrderType::Market
}

const fn default_tif() -> TimeInForce {
    TimeInForce::Day
}

const fn default_purpose() -> OrderPurpose {
    OrderPurpose::Entry
}

/// Request to submit orders.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitOrdersRequest {
    /// Request ID for correlation.
    pub request_id: String,
    /// Cycle ID.
    pub cycle_id: String,
    /// Risk policy ID.
    pub risk_policy_id: String,
    /// Account equity for risk validation.
    pub account_equity: Decimal,
    /// Decisions/orders to submit.
    pub decisions: Vec<DecisionRequest>,
}

/// Request to get order state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetOrderStateRequest {
    /// Order IDs to query.
    pub order_ids: Vec<String>,
}

/// Request to cancel orders.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelOrdersRequest {
    /// Order IDs to cancel.
    pub order_ids: Vec<String>,
    /// Optional reason for cancellation.
    pub reason: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decision_request_defaults() {
        let json = r#"{
            "symbol": "AAPL",
            "side": "BUY",
            "quantity": "100"
        }"#;

        let req: DecisionRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.symbol, "AAPL");
        assert_eq!(req.order_type, OrderType::Market);
        assert_eq!(req.time_in_force, TimeInForce::Day);
        assert_eq!(req.purpose, OrderPurpose::Entry);
    }

    #[test]
    fn check_constraints_request_serde() {
        let req = CheckConstraintsRequest {
            request_id: "req-123".to_string(),
            cycle_id: "cycle-456".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(100_000, 0),
            decisions: vec![DecisionRequest {
                symbol: "AAPL".to_string(),
                side: OrderSide::Buy,
                order_type: OrderType::Limit,
                quantity: Decimal::new(100, 0),
                limit_price: Some(Decimal::new(150, 0)),
                stop_price: None,
                time_in_force: TimeInForce::Day,
                purpose: OrderPurpose::Entry,
            }],
            include_portfolio_context: false,
        };

        let json = serde_json::to_string(&req).unwrap();
        let parsed: CheckConstraintsRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.request_id, req.request_id);
    }
}
