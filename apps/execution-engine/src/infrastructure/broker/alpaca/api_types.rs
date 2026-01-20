//! Alpaca API request and response types.
//!
//! These types map directly to Alpaca's REST API format.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::application::ports::OrderAck;
use crate::domain::order_execution::value_objects::OrderStatus;
use crate::domain::shared::{BrokerId, OrderId};

// ============================================================================
// Order Request Types
// ============================================================================

/// Order request for Alpaca API.
#[derive(Debug, Clone, Serialize)]
pub struct AlpacaOrderRequest {
    /// Stock symbol.
    pub symbol: String,
    /// Quantity (shares).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qty: Option<String>,
    /// Notional value (dollars).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notional: Option<String>,
    /// Order side.
    pub side: String,
    /// Order type.
    #[serde(rename = "type")]
    pub order_type: String,
    /// Time in force.
    pub time_in_force: String,
    /// Limit price (for limit orders).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_price: Option<String>,
    /// Stop price (for stop orders).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_price: Option<String>,
    /// Client order ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_order_id: Option<String>,
    /// Extended hours trading.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extended_hours: Option<bool>,
}

// ============================================================================
// Order Response Types
// ============================================================================

/// Order response from Alpaca API.
///
/// Contains all fields from Alpaca's API for debugging and future use.
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct AlpacaOrderResponse {
    /// Broker order ID.
    pub id: String,
    /// Client order ID.
    pub client_order_id: String,
    /// Symbol.
    pub symbol: String,
    /// Quantity (as string).
    pub qty: String,
    /// Filled quantity (as string).
    pub filled_qty: String,
    /// Average fill price (as string).
    #[serde(default)]
    pub filled_avg_price: Option<String>,
    /// Order status.
    pub status: String,
    /// Order side.
    pub side: String,
    /// Order type.
    #[serde(rename = "type")]
    pub order_type: String,
    /// Time in force.
    pub time_in_force: String,
    /// Limit price.
    #[serde(default)]
    pub limit_price: Option<String>,
    /// Stop price.
    #[serde(default)]
    pub stop_price: Option<String>,
    /// Created timestamp.
    pub created_at: String,
    /// Updated timestamp.
    pub updated_at: String,
    /// Submitted timestamp.
    pub submitted_at: String,
    /// Filled timestamp.
    #[serde(default)]
    pub filled_at: Option<String>,
}

impl AlpacaOrderResponse {
    /// Convert to `OrderAck`.
    #[must_use]
    pub fn to_order_ack(&self) -> OrderAck {
        OrderAck {
            broker_order_id: BrokerId::new(&self.id),
            client_order_id: OrderId::new(&self.client_order_id),
            status: parse_order_status(&self.status),
            filled_qty: self.filled_qty.parse().unwrap_or(Decimal::ZERO),
            avg_fill_price: self.filled_avg_price.as_ref().and_then(|p| p.parse().ok()),
        }
    }
}

// ============================================================================
// Account Types
// ============================================================================

/// Account response from Alpaca API.
///
/// Contains all fields from Alpaca's API for debugging and future use.
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct AlpacaAccountResponse {
    /// Account ID.
    pub id: String,
    /// Account equity.
    pub equity: String,
    /// Cash balance.
    pub cash: String,
    /// Buying power.
    pub buying_power: String,
    /// Day trade count.
    #[serde(default)]
    pub daytrade_count: Option<i32>,
    /// Pattern day trader flag.
    #[serde(default)]
    pub pattern_day_trader: Option<bool>,
}

// ============================================================================
// Position Types
// ============================================================================

/// Position response from Alpaca API.
///
/// Contains all fields from Alpaca's API for debugging and future use.
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct AlpacaPositionResponse {
    /// Symbol.
    pub symbol: String,
    /// Quantity.
    pub qty: String,
    /// Side (long/short).
    pub side: String,
    /// Average entry price.
    pub avg_entry_price: String,
    /// Market value.
    pub market_value: String,
    /// Current price.
    pub current_price: String,
    /// Unrealized P&L.
    pub unrealized_pl: String,
}

// ============================================================================
// Error Types
// ============================================================================

/// Error response from Alpaca API.
#[derive(Debug, Clone, Deserialize)]
pub struct AlpacaErrorResponse {
    /// Error code.
    #[serde(default)]
    pub code: Option<String>,
    /// Error message.
    pub message: String,
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Parse Alpaca order status string to domain `OrderStatus`.
fn parse_order_status(status: &str) -> OrderStatus {
    match status.to_lowercase().as_str() {
        "accepted" | "accepted_for_bidding" | "replaced" | "pending_replace" => {
            OrderStatus::Accepted
        }
        "partially_filled" => OrderStatus::PartiallyFilled,
        "filled" => OrderStatus::Filled,
        "done_for_day" | "expired" => OrderStatus::Expired,
        "canceled" | "pending_cancel" => OrderStatus::Canceled,
        "rejected" => OrderStatus::Rejected,
        // new, pending_new, stopped, suspended, calculated, and unknown -> New
        _ => OrderStatus::New,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_order_status_new() {
        assert_eq!(parse_order_status("new"), OrderStatus::New);
        assert_eq!(parse_order_status("pending_new"), OrderStatus::New);
    }

    #[test]
    fn parse_order_status_accepted() {
        assert_eq!(parse_order_status("accepted"), OrderStatus::Accepted);
    }

    #[test]
    fn parse_order_status_filled() {
        assert_eq!(parse_order_status("filled"), OrderStatus::Filled);
        assert_eq!(
            parse_order_status("partially_filled"),
            OrderStatus::PartiallyFilled
        );
    }

    #[test]
    fn parse_order_status_canceled() {
        assert_eq!(parse_order_status("canceled"), OrderStatus::Canceled);
        assert_eq!(parse_order_status("pending_cancel"), OrderStatus::Canceled);
    }

    #[test]
    fn parse_order_status_rejected() {
        assert_eq!(parse_order_status("rejected"), OrderStatus::Rejected);
    }

    #[test]
    fn parse_order_status_expired() {
        assert_eq!(parse_order_status("expired"), OrderStatus::Expired);
        assert_eq!(parse_order_status("done_for_day"), OrderStatus::Expired);
    }

    #[test]
    fn alpaca_order_response_to_order_ack() {
        let response = AlpacaOrderResponse {
            id: "broker-123".to_string(),
            client_order_id: "client-456".to_string(),
            symbol: "AAPL".to_string(),
            qty: "100".to_string(),
            filled_qty: "50".to_string(),
            filled_avg_price: Some("150.25".to_string()),
            status: "partially_filled".to_string(),
            side: "buy".to_string(),
            order_type: "limit".to_string(),
            time_in_force: "day".to_string(),
            limit_price: Some("150.00".to_string()),
            stop_price: None,
            created_at: "2024-01-15T10:00:00Z".to_string(),
            updated_at: "2024-01-15T10:05:00Z".to_string(),
            submitted_at: "2024-01-15T10:00:00Z".to_string(),
            filled_at: None,
        };

        let ack = response.to_order_ack();
        assert_eq!(ack.broker_order_id.as_str(), "broker-123");
        assert_eq!(ack.client_order_id.as_str(), "client-456");
        assert_eq!(ack.status, OrderStatus::PartiallyFilled);
        assert_eq!(ack.filled_qty, Decimal::new(50, 0));
        assert_eq!(ack.avg_fill_price, Some(Decimal::new(15025, 2)));
    }
}
