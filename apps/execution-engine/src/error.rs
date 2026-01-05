//! Rich error handling for the execution engine.
//!
//! This module provides structured error types compatible with gRPC rich errors
//! using `tonic-types`. Errors include detailed context for debugging and
//! client-side handling.
//!
//! # gRPC Status Codes
//!
//! | Code | Name | Usage |
//! |------|------|-------|
//! | `OK` (0) | Success | Request completed successfully |
//! | `INVALID_ARGUMENT` (3) | Invalid Argument | Malformed request |
//! | `NOT_FOUND` (5) | Not Found | Instrument/order not found |
//! | `ALREADY_EXISTS` (6) | Already Exists | Duplicate order ID |
//! | `PERMISSION_DENIED` (7) | Permission Denied | Insufficient permissions |
//! | `RESOURCE_EXHAUSTED` (8) | Resource Exhausted | Rate limit, margin insufficient |
//! | `FAILED_PRECONDITION` (9) | Failed Precondition | Constraint violation |
//! | `ABORTED` (10) | Aborted | Order rejected by broker |
//! | `OUT_OF_RANGE` (11) | Out of Range | Price/quantity invalid |
//! | `UNAVAILABLE` (14) | Unavailable | Service temporarily unavailable |
//! | `INTERNAL` (13) | Internal Error | Unexpected server error |

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tonic::Code;
use tonic_types::{ErrorDetails, StatusExt};

/// Domain for Cream execution engine errors.
pub const ERROR_DOMAIN: &str = "cream.execution";

/// Error codes for the execution engine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    // Validation errors (INVALID_ARGUMENT)
    /// Invalid request format or missing fields.
    InvalidRequest,
    /// Invalid instrument symbol or ID.
    InvalidInstrument,
    /// Invalid order parameters (price, quantity, etc.).
    InvalidOrderParams,
    /// Invalid environment specified.
    InvalidEnvironment,

    // Constraint errors (FAILED_PRECONDITION)
    /// Per-instrument notional limit exceeded.
    NotionalLimitExceeded,
    /// Per-instrument equity percentage exceeded.
    EquityLimitExceeded,
    /// Portfolio gross exposure exceeded.
    PortfolioLimitExceeded,
    /// Missing stop loss for position.
    MissingStopLoss,
    /// Plan not approved by agents.
    PlanNotApproved,
    /// Market is closed.
    MarketClosed,

    // Order errors (ABORTED/RESOURCE_EXHAUSTED)
    /// Order rejected by broker.
    OrderRejected,
    /// Insufficient margin/buying power.
    InsufficientMargin,
    /// Rate limit exceeded.
    RateLimited,

    // Not found errors (NOT_FOUND)
    /// Order not found.
    OrderNotFound,
    /// Instrument not found.
    InstrumentNotFound,

    // Internal errors (INTERNAL)
    /// Internal server error.
    InternalError,
    /// Broker API error.
    BrokerApiError,
}

impl ErrorCode {
    /// Get the gRPC status code for this error.
    #[must_use]
    pub const fn grpc_code(&self) -> Code {
        match self {
            // Validation errors
            Self::InvalidRequest
            | Self::InvalidInstrument
            | Self::InvalidOrderParams
            | Self::InvalidEnvironment => Code::InvalidArgument,

            // Constraint errors
            Self::NotionalLimitExceeded
            | Self::EquityLimitExceeded
            | Self::PortfolioLimitExceeded
            | Self::MissingStopLoss
            | Self::PlanNotApproved
            | Self::MarketClosed => Code::FailedPrecondition,

            // Order errors
            Self::OrderRejected => Code::Aborted,
            Self::InsufficientMargin | Self::RateLimited => Code::ResourceExhausted,

            // Not found errors
            Self::OrderNotFound | Self::InstrumentNotFound => Code::NotFound,

            // Internal errors
            Self::InternalError | Self::BrokerApiError => Code::Internal,
        }
    }

    /// Get the error reason string (for gRPC ErrorInfo).
    #[must_use]
    pub const fn reason(&self) -> &'static str {
        match self {
            Self::InvalidRequest => "INVALID_REQUEST",
            Self::InvalidInstrument => "INVALID_INSTRUMENT",
            Self::InvalidOrderParams => "INVALID_ORDER_PARAMS",
            Self::InvalidEnvironment => "INVALID_ENVIRONMENT",
            Self::NotionalLimitExceeded => "NOTIONAL_LIMIT_EXCEEDED",
            Self::EquityLimitExceeded => "EQUITY_LIMIT_EXCEEDED",
            Self::PortfolioLimitExceeded => "PORTFOLIO_LIMIT_EXCEEDED",
            Self::MissingStopLoss => "MISSING_STOP_LOSS",
            Self::PlanNotApproved => "PLAN_NOT_APPROVED",
            Self::MarketClosed => "MARKET_CLOSED",
            Self::OrderRejected => "ORDER_REJECTED",
            Self::InsufficientMargin => "INSUFFICIENT_MARGIN",
            Self::RateLimited => "RATE_LIMITED",
            Self::OrderNotFound => "ORDER_NOT_FOUND",
            Self::InstrumentNotFound => "INSTRUMENT_NOT_FOUND",
            Self::InternalError => "INTERNAL_ERROR",
            Self::BrokerApiError => "BROKER_API_ERROR",
        }
    }
}

impl std::fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.reason())
    }
}

/// A rich error with context for the execution engine.
#[derive(Debug, Error)]
pub struct ExecutionError {
    /// Error code.
    code: ErrorCode,
    /// Human-readable message.
    message: String,
    /// Additional context (key-value pairs).
    context: Vec<(String, String)>,
}

impl ExecutionError {
    /// Create a new execution error.
    #[must_use]
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            context: Vec::new(),
        }
    }

    /// Add context to the error.
    #[must_use]
    pub fn with_context(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.context.push((key.into(), value.into()));
        self
    }

    /// Get the error code.
    #[must_use]
    pub const fn code(&self) -> ErrorCode {
        self.code
    }

    /// Get the message.
    #[must_use]
    pub fn message(&self) -> &str {
        &self.message
    }

    /// Get the context.
    #[must_use]
    pub fn context(&self) -> &[(String, String)] {
        &self.context
    }

    /// Convert to a tonic Status with rich error details.
    #[must_use]
    pub fn to_status(&self) -> tonic::Status {
        let mut details = ErrorDetails::new();

        // Add error info
        let metadata: HashMap<String, String> = self.context.iter().cloned().collect();
        details.set_error_info(self.code.reason(), ERROR_DOMAIN, metadata);

        // Add bad request violation if this is a validation error
        if matches!(
            self.code,
            ErrorCode::InvalidRequest
                | ErrorCode::InvalidInstrument
                | ErrorCode::InvalidOrderParams
                | ErrorCode::InvalidEnvironment
        ) {
            details.add_bad_request_violation("request", &self.message);
        }

        // Add precondition failure if this is a constraint error
        if matches!(
            self.code,
            ErrorCode::NotionalLimitExceeded
                | ErrorCode::EquityLimitExceeded
                | ErrorCode::PortfolioLimitExceeded
                | ErrorCode::MissingStopLoss
                | ErrorCode::PlanNotApproved
        ) {
            details.add_precondition_failure_violation(
                "constraint",
                self.code.reason(),
                &self.message,
            );
        }

        tonic::Status::with_error_details(self.code.grpc_code(), &self.message, details)
    }

    /// Convert to an HTTP-compatible error response.
    #[must_use]
    pub fn to_http_response(&self) -> HttpErrorResponse {
        HttpErrorResponse {
            code: self.code.reason().to_string(),
            message: self.message.clone(),
            grpc_code: self.code.grpc_code() as i32,
            details: self.context.iter().cloned().collect(),
        }
    }
}

impl std::fmt::Display for ExecutionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code.reason(), self.message)
    }
}

/// HTTP-compatible error response body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpErrorResponse {
    /// Error code string.
    pub code: String,
    /// Human-readable message.
    pub message: String,
    /// gRPC status code (for compatibility).
    pub grpc_code: i32,
    /// Additional details.
    pub details: std::collections::HashMap<String, String>,
}

/// Extract error details from a tonic Status.
///
/// Returns the error details if present.
#[must_use]
pub fn extract_error_details(status: &tonic::Status) -> ErrorDetails {
    status.get_error_details()
}

/// Convenience constructors for common errors.
impl ExecutionError {
    /// Invalid request format.
    #[must_use]
    pub fn invalid_request(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidRequest, message)
    }

    /// Constraint violation.
    #[must_use]
    pub fn constraint_violation(
        code: ErrorCode,
        message: impl Into<String>,
        instrument_id: Option<&str>,
    ) -> Self {
        let mut error = Self::new(code, message);
        if let Some(id) = instrument_id {
            error = error.with_context("instrument_id", id);
        }
        error
    }

    /// Order rejected by broker.
    #[must_use]
    pub fn order_rejected(order_id: &str, reason: impl Into<String>) -> Self {
        Self::new(ErrorCode::OrderRejected, reason).with_context("order_id", order_id)
    }

    /// Order not found.
    #[must_use]
    pub fn order_not_found(order_id: &str) -> Self {
        Self::new(
            ErrorCode::OrderNotFound,
            format!("Order {order_id} not found"),
        )
        .with_context("order_id", order_id)
    }

    /// Internal error.
    #[must_use]
    pub fn internal(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InternalError, message)
    }

    /// Broker API error.
    #[must_use]
    pub fn broker_error(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::BrokerApiError, message)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_code_grpc_mapping() {
        assert_eq!(ErrorCode::InvalidRequest.grpc_code(), Code::InvalidArgument);
        assert_eq!(
            ErrorCode::NotionalLimitExceeded.grpc_code(),
            Code::FailedPrecondition
        );
        assert_eq!(ErrorCode::OrderRejected.grpc_code(), Code::Aborted);
        assert_eq!(ErrorCode::OrderNotFound.grpc_code(), Code::NotFound);
        assert_eq!(ErrorCode::InternalError.grpc_code(), Code::Internal);
    }

    #[test]
    fn test_execution_error_creation() {
        let error = ExecutionError::new(ErrorCode::InvalidRequest, "Bad request")
            .with_context("field", "account_equity")
            .with_context("value", "invalid");

        assert_eq!(error.code(), ErrorCode::InvalidRequest);
        assert_eq!(error.message(), "Bad request");
        assert_eq!(error.context().len(), 2);
    }

    #[test]
    fn test_to_status() {
        let error = ExecutionError::order_rejected("ord-123", "Insufficient margin");
        let status = error.to_status();

        assert_eq!(status.code(), Code::Aborted);
        assert!(status.message().contains("Insufficient margin"));
    }

    #[test]
    fn test_to_http_response() {
        let error =
            ExecutionError::constraint_violation(ErrorCode::NotionalLimitExceeded, "Over limit", Some("AAPL"));
        let response = error.to_http_response();

        assert_eq!(response.code, "NOTIONAL_LIMIT_EXCEEDED");
        assert_eq!(response.grpc_code, Code::FailedPrecondition as i32);
        assert!(response.details.contains_key("instrument_id"));
    }

    #[test]
    fn test_error_display() {
        let error = ExecutionError::invalid_request("Missing field");
        assert_eq!(error.to_string(), "[INVALID_REQUEST] Missing field");
    }
}
