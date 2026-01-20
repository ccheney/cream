//! Reasons for order rejection and cancellation.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Reason for order rejection from broker.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct RejectReason {
    /// Rejection code from broker.
    pub code: String,
    /// Human-readable message.
    pub message: String,
}

impl RejectReason {
    /// Create a new reject reason.
    #[must_use]
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    /// Insufficient buying power.
    #[must_use]
    pub fn insufficient_buying_power() -> Self {
        Self::new(
            "INSUFFICIENT_BUYING_POWER",
            "Insufficient buying power for order",
        )
    }

    /// Invalid symbol.
    #[must_use]
    pub fn invalid_symbol(symbol: &str) -> Self {
        Self::new("INVALID_SYMBOL", format!("Invalid symbol: {symbol}"))
    }

    /// Invalid quantity.
    #[must_use]
    pub fn invalid_quantity(reason: &str) -> Self {
        Self::new("INVALID_QUANTITY", format!("Invalid quantity: {reason}"))
    }

    /// Invalid price.
    #[must_use]
    pub fn invalid_price(reason: &str) -> Self {
        Self::new("INVALID_PRICE", format!("Invalid price: {reason}"))
    }

    /// Market closed.
    #[must_use]
    pub fn market_closed() -> Self {
        Self::new("MARKET_CLOSED", "Market is closed")
    }

    /// Rate limited.
    #[must_use]
    pub fn rate_limited() -> Self {
        Self::new("RATE_LIMITED", "Rate limit exceeded")
    }

    /// Unknown broker error.
    #[must_use]
    pub fn broker_error(message: impl Into<String>) -> Self {
        Self::new("BROKER_ERROR", message)
    }
}

impl fmt::Display for RejectReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

/// Reason for order cancellation.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CancelReason {
    /// Cancellation code.
    pub code: String,
    /// Human-readable message.
    pub message: String,
}

impl CancelReason {
    /// Create a new cancel reason.
    #[must_use]
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    /// User requested cancellation.
    #[must_use]
    pub fn user_requested() -> Self {
        Self::new("USER_REQUESTED", "Canceled by user request")
    }

    /// System timeout.
    #[must_use]
    pub fn timeout() -> Self {
        Self::new("TIMEOUT", "Order timed out waiting for fill")
    }

    /// Partial fill timeout.
    #[must_use]
    pub fn partial_fill_timeout() -> Self {
        Self::new(
            "PARTIAL_FILL_TIMEOUT",
            "Partial fill timeout - canceling remainder",
        )
    }

    /// Risk limit triggered.
    #[must_use]
    pub fn risk_limit(limit: &str) -> Self {
        Self::new("RISK_LIMIT", format!("Risk limit triggered: {limit}"))
    }

    /// Stop triggered.
    #[must_use]
    pub fn stop_triggered() -> Self {
        Self::new("STOP_TRIGGERED", "Stop level triggered")
    }

    /// End of day.
    #[must_use]
    pub fn end_of_day() -> Self {
        Self::new("END_OF_DAY", "Day order canceled at end of trading day")
    }

    /// Disconnect safety.
    #[must_use]
    pub fn disconnect_safety() -> Self {
        Self::new("DISCONNECT_SAFETY", "Canceled due to broker disconnect")
    }

    /// Replaced by new order.
    #[must_use]
    pub fn replaced() -> Self {
        Self::new("REPLACED", "Order replaced with new order")
    }
}

impl fmt::Display for CancelReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reject_reason_new() {
        let reason = RejectReason::new("TEST", "Test message");
        assert_eq!(reason.code, "TEST");
        assert_eq!(reason.message, "Test message");
    }

    #[test]
    fn reject_reason_insufficient_buying_power() {
        let reason = RejectReason::insufficient_buying_power();
        assert_eq!(reason.code, "INSUFFICIENT_BUYING_POWER");
    }

    #[test]
    fn reject_reason_invalid_symbol() {
        let reason = RejectReason::invalid_symbol("INVALID");
        assert!(reason.message.contains("INVALID"));
    }

    #[test]
    fn reject_reason_display() {
        let reason = RejectReason::market_closed();
        let display = format!("{reason}");
        assert!(display.contains("MARKET_CLOSED"));
    }

    #[test]
    fn cancel_reason_new() {
        let reason = CancelReason::new("TEST", "Test message");
        assert_eq!(reason.code, "TEST");
        assert_eq!(reason.message, "Test message");
    }

    #[test]
    fn cancel_reason_user_requested() {
        let reason = CancelReason::user_requested();
        assert_eq!(reason.code, "USER_REQUESTED");
    }

    #[test]
    fn cancel_reason_timeout() {
        let reason = CancelReason::timeout();
        assert_eq!(reason.code, "TIMEOUT");
    }

    #[test]
    fn cancel_reason_risk_limit() {
        let reason = CancelReason::risk_limit("MAX_NOTIONAL");
        assert!(reason.message.contains("MAX_NOTIONAL"));
    }

    #[test]
    fn cancel_reason_display() {
        let reason = CancelReason::end_of_day();
        let display = format!("{reason}");
        assert!(display.contains("END_OF_DAY"));
    }

    #[test]
    fn reject_reason_serde() {
        let reason = RejectReason::market_closed();
        let json = serde_json::to_string(&reason).unwrap();
        let parsed: RejectReason = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, reason);
    }

    #[test]
    fn cancel_reason_serde() {
        let reason = CancelReason::user_requested();
        let json = serde_json::to_string(&reason).unwrap();
        let parsed: CancelReason = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, reason);
    }

    #[test]
    fn reject_reason_invalid_quantity() {
        let reason = RejectReason::invalid_quantity("zero quantity");
        assert_eq!(reason.code, "INVALID_QUANTITY");
        assert!(reason.message.contains("zero quantity"));
    }

    #[test]
    fn reject_reason_invalid_price() {
        let reason = RejectReason::invalid_price("negative");
        assert_eq!(reason.code, "INVALID_PRICE");
        assert!(reason.message.contains("negative"));
    }

    #[test]
    fn reject_reason_rate_limited() {
        let reason = RejectReason::rate_limited();
        assert_eq!(reason.code, "RATE_LIMITED");
    }

    #[test]
    fn reject_reason_broker_error() {
        let reason = RejectReason::broker_error("Connection timeout");
        assert_eq!(reason.code, "BROKER_ERROR");
        assert_eq!(reason.message, "Connection timeout");
    }

    #[test]
    fn cancel_reason_partial_fill_timeout() {
        let reason = CancelReason::partial_fill_timeout();
        assert_eq!(reason.code, "PARTIAL_FILL_TIMEOUT");
    }

    #[test]
    fn cancel_reason_stop_triggered() {
        let reason = CancelReason::stop_triggered();
        assert_eq!(reason.code, "STOP_TRIGGERED");
    }

    #[test]
    fn cancel_reason_disconnect_safety() {
        let reason = CancelReason::disconnect_safety();
        assert_eq!(reason.code, "DISCONNECT_SAFETY");
    }

    #[test]
    fn cancel_reason_replaced() {
        let reason = CancelReason::replaced();
        assert_eq!(reason.code, "REPLACED");
    }
}
