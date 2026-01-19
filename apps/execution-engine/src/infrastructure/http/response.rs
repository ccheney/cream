//! HTTP response DTOs.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::domain::order_execution::value_objects::{
    OrderSide, OrderStatus, OrderType, TimeInForce,
};

/// Response from constraint check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckConstraintsResponse {
    /// Whether all constraints passed.
    pub ok: bool,
    /// List of violations (empty if ok).
    pub violations: Vec<ViolationResponse>,
    /// Per-order results (if requested).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub per_order: Option<std::collections::HashMap<String, OrderConstraintResult>>,
}

/// A constraint violation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViolationResponse {
    /// Violation code.
    pub code: String,
    /// Severity level.
    pub severity: String,
    /// Human-readable message.
    pub message: String,
    /// Affected instrument (if any).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instrument_id: Option<String>,
    /// The observed value that violated the constraint.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observed: Option<String>,
    /// The limit that was exceeded.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<String>,
}

/// Constraint result for a single order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderConstraintResult {
    /// Whether constraints passed for this order.
    pub passed: bool,
    /// Violations for this order.
    pub violations: Vec<ViolationResponse>,
}

/// Response from order submission.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmitOrdersResponse {
    /// Whether all orders were submitted successfully.
    pub ok: bool,
    /// List of submitted orders.
    pub orders: Vec<OrderResponse>,
    /// Error message if failed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// Risk violations if risk check failed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risk_violations: Option<Vec<ViolationResponse>>,
}

/// A submitted order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderResponse {
    /// Internal order ID.
    pub order_id: String,
    /// Broker order ID (if accepted).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub broker_id: Option<String>,
    /// Symbol.
    pub symbol: String,
    /// Side.
    pub side: OrderSide,
    /// Order type.
    pub order_type: OrderType,
    /// Quantity.
    pub quantity: Decimal,
    /// Limit price.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_price: Option<Decimal>,
    /// Status.
    pub status: OrderStatus,
    /// Time in force.
    pub time_in_force: TimeInForce,
    /// Filled quantity.
    pub filled_qty: Decimal,
    /// Average fill price.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_fill_price: Option<Decimal>,
    /// Error message if rejected.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Response from get order state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GetOrderStateResponse {
    /// Orders found.
    pub orders: Vec<OrderResponse>,
    /// Order IDs that were not found.
    pub not_found: Vec<String>,
}

/// Response from cancel orders.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelOrdersResponse {
    /// Results for each order.
    pub results: Vec<CancelResult>,
}

/// Result of canceling a single order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CancelResult {
    /// Order ID.
    pub order_id: String,
    /// Whether cancel was successful.
    pub success: bool,
    /// Error message if failed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Health check response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    /// Status.
    pub status: String,
    /// Version.
    pub version: String,
}

/// API error response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiErrorResponse {
    /// Error code.
    pub code: String,
    /// Error message.
    pub message: String,
    /// Additional details.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_constraints_response_ok() {
        let resp = CheckConstraintsResponse {
            ok: true,
            violations: vec![],
            per_order: None,
        };

        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains(r#""ok":true"#));
        assert!(!json.contains("per_order")); // Skipped when None
    }

    #[test]
    fn violation_response_serde() {
        let violation = ViolationResponse {
            code: "POSITION_LIMIT".to_string(),
            severity: "Error".to_string(),
            message: "Position limit exceeded".to_string(),
            instrument_id: Some("AAPL".to_string()),
            observed: Some("1500".to_string()),
            limit: Some("1000".to_string()),
        };

        let json = serde_json::to_string(&violation).unwrap();
        let parsed: ViolationResponse = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.code, "POSITION_LIMIT");
    }

    #[test]
    fn submit_orders_response_success() {
        let resp = SubmitOrdersResponse {
            ok: true,
            orders: vec![OrderResponse {
                order_id: "ord-123".to_string(),
                broker_id: Some("broker-456".to_string()),
                symbol: "AAPL".to_string(),
                side: OrderSide::Buy,
                order_type: OrderType::Limit,
                quantity: Decimal::new(100, 0),
                limit_price: Some(Decimal::new(150, 0)),
                status: OrderStatus::Accepted,
                time_in_force: TimeInForce::Day,
                filled_qty: Decimal::ZERO,
                avg_fill_price: None,
                error: None,
            }],
            error: None,
            risk_violations: None,
        };

        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains(r#""ok":true"#));
        assert!(!json.contains("error")); // Skipped when None
    }
}
