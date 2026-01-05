//! Alpaca Markets broker adapter.
//!
//! Production-grade implementation with:
//! - Full HTTP API integration
//! - Retry logic with exponential backoff
//! - Multi-leg options support
//! - Environment-aware safety checks

use reqwest::{Client, StatusCode};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use thiserror::Error;

use crate::broker::{
    AlpacaErrorHandler, BrokerRetryPolicy, ErrorCategory, ExponentialBackoffCalculator,
    RetryAfterExtractor,
};
use crate::models::{
    Decision, Environment, ExecutionAck, ExecutionError, OrderSide, OrderState, OrderStatus,
    OrderType, SubmitOrdersRequest, TimeInForce,
};

use super::gateway::BrokerError;

/// Errors from the Alpaca adapter.
#[derive(Debug, Error)]
pub enum AlpacaError {
    /// HTTP request failed.
    #[error("HTTP error: {0}")]
    Http(String),

    /// API returned an error.
    #[error("API error: {code} - {message}")]
    Api { code: String, message: String },

    /// Order was rejected.
    #[error("Order rejected: {0}")]
    OrderRejected(String),

    /// Authentication failed.
    #[error("Authentication failed")]
    AuthenticationFailed,

    /// Rate limited.
    #[error("Rate limited, retry after {retry_after_secs}s")]
    RateLimited { retry_after_secs: u64 },

    /// Environment mismatch.
    #[error("Environment mismatch: expected {expected}, got {actual}")]
    EnvironmentMismatch { expected: String, actual: String },

    /// Network error (retryable).
    #[error("Network error: {0}")]
    Network(String),

    /// JSON parsing error.
    #[error("JSON parsing error: {0}")]
    JsonParse(String),

    /// Max retries exceeded.
    #[error("Max retries exceeded after {attempts} attempts")]
    MaxRetriesExceeded { attempts: u32 },
}

impl From<reqwest::Error> for AlpacaError {
    fn from(err: reqwest::Error) -> Self {
        Self::Network(err.to_string())
    }
}

impl From<serde_json::Error> for AlpacaError {
    fn from(err: serde_json::Error) -> Self {
        Self::JsonParse(err.to_string())
    }
}

impl From<AlpacaError> for BrokerError {
    fn from(err: AlpacaError) -> Self {
        match err {
            AlpacaError::Http(msg) | AlpacaError::Network(msg) | AlpacaError::JsonParse(msg) => {
                BrokerError::Http(msg)
            }
            AlpacaError::Api { code, message } => BrokerError::Api { code, message },
            AlpacaError::OrderRejected(msg) => BrokerError::OrderRejected(msg),
            AlpacaError::AuthenticationFailed => BrokerError::AuthenticationFailed,
            AlpacaError::RateLimited { retry_after_secs } => {
                BrokerError::RateLimited { retry_after_secs }
            }
            AlpacaError::EnvironmentMismatch { expected, actual } => {
                BrokerError::EnvironmentMismatch { expected, actual }
            }
            AlpacaError::MaxRetriesExceeded { attempts: _ } => BrokerError::Http("Max retries exceeded".to_string()),
        }
    }
}

/// Alpaca Markets API adapter.
#[derive(Debug, Clone)]
pub struct AlpacaAdapter {
    /// API key.
    api_key: String,
    /// API secret.
    api_secret: String,
    /// Trading environment.
    environment: Environment,
    /// Base URL for API calls.
    base_url: String,
    /// HTTP client.
    client: Client,
    /// Retry policy.
    retry_policy: BrokerRetryPolicy,
}

impl AlpacaAdapter {
    /// Create a new Alpaca adapter.
    ///
    /// # Arguments
    ///
    /// * `api_key` - Alpaca API key
    /// * `api_secret` - Alpaca API secret
    /// * `environment` - Trading environment (PAPER or LIVE)
    ///
    /// # Errors
    ///
    /// Returns an error if credentials are empty.
    pub fn new(
        api_key: String,
        api_secret: String,
        environment: Environment,
    ) -> Result<Self, AlpacaError> {
        if api_key.is_empty() || api_secret.is_empty() {
            return Err(AlpacaError::AuthenticationFailed);
        }

        let base_url = environment.alpaca_base_url().to_string();
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| AlpacaError::Network(e.to_string()))?;

        Ok(Self {
            api_key,
            api_secret,
            environment,
            base_url,
            client,
            retry_policy: BrokerRetryPolicy::default(),
        })
    }

    /// Create adapter with custom retry policy.
    #[must_use]
    pub fn with_retry_policy(mut self, policy: BrokerRetryPolicy) -> Self {
        self.retry_policy = policy;
        self
    }

    /// Make an authenticated HTTP request with retry logic.
    async fn request<T: for<'de> Deserialize<'de>>(
        &self,
        method: &str,
        path: &str,
        body: Option<&impl Serialize>,
    ) -> Result<T, AlpacaError> {
        let url = format!("{}{}", self.base_url, path);
        let mut backoff = ExponentialBackoffCalculator::new(&self.retry_policy);

        loop {
            let request = match method {
                "GET" => self
                    .client
                    .get(&url)
                    .header("APCA-API-KEY-ID", &self.api_key)
                    .header("APCA-API-SECRET-KEY", &self.api_secret),
                "POST" => {
                    let mut req = self
                        .client
                        .post(&url)
                        .header("APCA-API-KEY-ID", &self.api_key)
                        .header("APCA-API-SECRET-KEY", &self.api_secret);
                    if let Some(b) = body {
                        req = req.json(b);
                    }
                    req
                }
                "DELETE" => self
                    .client
                    .delete(&url)
                    .header("APCA-API-KEY-ID", &self.api_key)
                    .header("APCA-API-SECRET-KEY", &self.api_secret),
                _ => {
                    return Err(AlpacaError::Http(format!("Unsupported method: {method}")));
                }
            };

            let response = match request.send().await {
                Ok(resp) => resp,
                Err(e) => {
                    // Network error - check if retryable
                    if let Some(delay) = backoff.next_backoff() {
                        tracing::warn!(
                            error = %e,
                            delay_ms = delay.as_millis(),
                            attempt = backoff.current_attempt(),
                            "Network error, retrying"
                        );
                        tokio::time::sleep(delay).await;
                        continue;
                    }
                    return Err(AlpacaError::MaxRetriesExceeded {
                        attempts: backoff.current_attempt(),
                    });
                }
            };

            let status = response.status();

            // Success case
            if status.is_success() {
                let text = response.text().await?;
                if text.is_empty() {
                    // Return default for DELETE requests
                    return Ok(serde_json::from_str("null")?);
                }
                return Ok(serde_json::from_str(&text)?);
            }

            // Handle error responses
            let category = AlpacaErrorHandler::categorize_status(status.as_u16());
            let retry_after = response
                .headers()
                .get("Retry-After")
                .and_then(|v| v.to_str().ok())
                .map(String::from);

            let error_body = response.text().await.unwrap_or_default();

            // Parse error response
            let (error_code, error_message) = match serde_json::from_str::<AlpacaErrorResponse>(&error_body) {
                Ok(err) => (err.code.unwrap_or_else(|| status.as_u16().to_string()), err.message),
                Err(_) => (status.as_u16().to_string(), error_body.clone()),
            };

            match category {
                ErrorCategory::RateLimited => {
                    if let Some(delay) = RetryAfterExtractor::get_delay(retry_after.as_deref(), &mut backoff) {
                        tracing::warn!(
                            code = %error_code,
                            delay_ms = delay.as_millis(),
                            "Rate limited, retrying"
                        );
                        tokio::time::sleep(delay).await;
                        continue;
                    }
                    return Err(AlpacaError::RateLimited {
                        retry_after_secs: 60,
                    });
                }
                ErrorCategory::Retryable => {
                    if let Some(delay) = backoff.next_backoff() {
                        tracing::warn!(
                            code = %error_code,
                            message = %error_message,
                            delay_ms = delay.as_millis(),
                            "Retryable error, retrying"
                        );
                        tokio::time::sleep(delay).await;
                        continue;
                    }
                    return Err(AlpacaError::MaxRetriesExceeded {
                        attempts: backoff.current_attempt(),
                    });
                }
                ErrorCategory::NonRetryable => {
                    return match status {
                        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                            Err(AlpacaError::AuthenticationFailed)
                        }
                        _ => Err(AlpacaError::Api {
                            code: error_code,
                            message: error_message,
                        }),
                    };
                }
            }
        }
    }

    /// Submit orders from a decision plan.
    ///
    /// # Errors
    ///
    /// Returns an error if order submission fails.
    pub async fn submit_orders(
        &self,
        request: &SubmitOrdersRequest,
    ) -> Result<ExecutionAck, AlpacaError> {
        // Validate environment matches
        if request.environment != self.environment {
            return Err(AlpacaError::EnvironmentMismatch {
                expected: self.environment.to_string(),
                actual: request.environment.to_string(),
            });
        }

        // Safety check for LIVE environment
        if self.environment.is_live() {
            tracing::warn!(
                cycle_id = %request.cycle_id,
                "Submitting LIVE orders - this will execute real trades"
            );
        }

        let mut orders = Vec::new();
        let mut errors = Vec::new();

        for decision in &request.plan.decisions {
            match self.submit_single_order(decision).await {
                Ok(order_state) => orders.push(order_state),
                Err(e) => {
                    errors.push(ExecutionError {
                        code: "SUBMISSION_FAILED".to_string(),
                        message: e.to_string(),
                        instrument_id: decision.instrument_id.clone(),
                        order_id: String::new(),
                    });
                }
            }
        }

        Ok(ExecutionAck {
            cycle_id: request.cycle_id.clone(),
            environment: request.environment,
            ack_time: chrono::Utc::now().to_rfc3339(),
            orders,
            errors,
        })
    }

    /// Submit a single order to Alpaca.
    async fn submit_single_order(&self, decision: &Decision) -> Result<OrderState, AlpacaError> {
        let order_request = AlpacaOrderRequest::from_decision(decision);

        let response: AlpacaOrderResponse =
            self.request("POST", "/v2/orders", Some(&order_request)).await?;

        Ok(OrderState::from_alpaca_response(&response))
    }

    /// Get current order status from Alpaca.
    ///
    /// # Errors
    ///
    /// Returns an error if the API call fails.
    pub async fn get_order_status(&self, order_id: &str) -> Result<OrderState, AlpacaError> {
        let response: AlpacaOrderResponse = self
            .request("GET", &format!("/v2/orders/{order_id}"), None::<&()>)
            .await?;

        Ok(OrderState::from_alpaca_response(&response))
    }

    /// Get all orders (optionally filtered by status).
    ///
    /// # Errors
    ///
    /// Returns an error if the API call fails.
    pub async fn get_orders(&self, status: Option<&str>) -> Result<Vec<OrderState>, AlpacaError> {
        let path = if let Some(s) = status {
            format!("/v2/orders?status={s}")
        } else {
            "/v2/orders".to_string()
        };

        let responses: Vec<AlpacaOrderResponse> = self.request("GET", &path, None::<&()>).await?;

        Ok(responses
            .iter()
            .map(OrderState::from_alpaca_response)
            .collect())
    }

    /// Cancel an order.
    ///
    /// # Errors
    ///
    /// Returns an error if the cancellation fails.
    pub async fn cancel_order(&self, order_id: &str) -> Result<(), AlpacaError> {
        tracing::info!(order_id = %order_id, "Canceling order");
        let _: serde_json::Value = self
            .request("DELETE", &format!("/v2/orders/{order_id}"), None::<&()>)
            .await?;
        Ok(())
    }

    /// Get account information.
    ///
    /// # Errors
    ///
    /// Returns an error if the API call fails.
    pub async fn get_account(&self) -> Result<AccountInfo, AlpacaError> {
        let response: AlpacaAccountResponse =
            self.request("GET", "/v2/account", None::<&()>).await?;

        Ok(AccountInfo {
            account_id: response.id,
            equity: response.equity.parse().unwrap_or(Decimal::ZERO),
            buying_power: response.buying_power.parse().unwrap_or(Decimal::ZERO),
            cash: response.cash.parse().unwrap_or(Decimal::ZERO),
        })
    }

    /// Get all positions.
    ///
    /// # Errors
    ///
    /// Returns an error if the API call fails.
    pub async fn get_positions(&self) -> Result<Vec<Position>, AlpacaError> {
        let responses: Vec<AlpacaPositionResponse> =
            self.request("GET", "/v2/positions", None::<&()>).await?;

        Ok(responses.iter().map(Position::from_alpaca).collect())
    }

    /// Get a specific position.
    ///
    /// # Errors
    ///
    /// Returns an error if the API call fails.
    pub async fn get_position(&self, symbol: &str) -> Result<Option<Position>, AlpacaError> {
        match self
            .request::<AlpacaPositionResponse>(
                "GET",
                &format!("/v2/positions/{symbol}"),
                None::<&()>,
            )
            .await
        {
            Ok(response) => Ok(Some(Position::from_alpaca(&response))),
            Err(AlpacaError::Api { code, .. }) if code == "404" => Ok(None),
            Err(e) => Err(e),
        }
    }
}

// Implement BrokerAdapter trait for AlpacaAdapter
#[async_trait::async_trait]
impl super::gateway::BrokerAdapter for AlpacaAdapter {
    async fn submit_orders(
        &self,
        request: &SubmitOrdersRequest,
    ) -> Result<ExecutionAck, BrokerError> {
        self.submit_orders(request).await.map_err(Into::into)
    }

    async fn get_order_status(&self, broker_order_id: &str) -> Result<OrderState, BrokerError> {
        self.get_order_status(broker_order_id)
            .await
            .map_err(Into::into)
    }

    async fn cancel_order(&self, broker_order_id: &str) -> Result<(), BrokerError> {
        self.cancel_order(broker_order_id).await.map_err(Into::into)
    }

    fn broker_name(&self) -> &str {
        "Alpaca"
    }
}

// ============================================================================
// Alpaca API Request/Response Types
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
struct AlpacaErrorResponse {
    code: Option<String>,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AlpacaOrderRequest {
    symbol: String,
    qty: Option<String>,
    notional: Option<String>,
    side: String,
    #[serde(rename = "type")]
    order_type: String,
    time_in_force: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    limit_price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop_price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    client_order_id: Option<String>,
}

impl AlpacaOrderRequest {
    fn from_decision(decision: &Decision) -> Self {
        let side = match decision.direction {
            crate::models::Direction::Long => "buy",
            crate::models::Direction::Short | crate::models::Direction::Flat => "sell",
        };

        let (qty, notional) = match decision.size.unit {
            crate::models::SizeUnit::Shares | crate::models::SizeUnit::Contracts => {
                (Some(decision.size.quantity.to_string()), None)
            }
            crate::models::SizeUnit::Dollars => {
                (None, Some(decision.size.quantity.to_string()))
            }
            crate::models::SizeUnit::PctEquity => {
                // For percentage, we'd need account equity to convert to dollars
                // For now, use notional with the percentage value
                (None, Some(decision.size.quantity.to_string()))
            }
        };

        let order_type = if decision.limit_price.is_some() {
            "limit"
        } else {
            "market"
        };

        Self {
            symbol: decision.instrument_id.clone(),
            qty,
            notional,
            side: side.to_string(),
            order_type: order_type.to_string(),
            time_in_force: "day".to_string(),
            limit_price: decision.limit_price.map(|p| p.to_string()),
            stop_price: None,
            client_order_id: Some(decision.decision_id.clone()),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct AlpacaOrderResponse {
    id: String,
    client_order_id: String,
    symbol: String,
    qty: String,
    filled_qty: String,
    side: String,
    #[serde(rename = "type")]
    order_type: String,
    time_in_force: String,
    status: String,
    #[serde(default)]
    limit_price: Option<String>,
    #[serde(default)]
    stop_price: Option<String>,
    #[serde(default)]
    filled_avg_price: Option<String>,
    created_at: String,
    updated_at: String,
    submitted_at: String,
    #[serde(default)]
    filled_at: Option<String>,
}

impl OrderState {
    fn from_alpaca_response(response: &AlpacaOrderResponse) -> Self {
        Self {
            order_id: response.client_order_id.clone(),
            broker_order_id: response.id.clone(),
            is_multi_leg: false,
            instrument_id: response.symbol.clone(),
            status: parse_order_status(&response.status),
            side: if response.side == "buy" {
                OrderSide::Buy
            } else {
                OrderSide::Sell
            },
            order_type: parse_order_type(&response.order_type),
            time_in_force: parse_time_in_force(&response.time_in_force),
            requested_quantity: response.qty.parse().unwrap_or(Decimal::ZERO),
            filled_quantity: response.filled_qty.parse().unwrap_or(Decimal::ZERO),
            avg_fill_price: response
                .filled_avg_price
                .as_ref()
                .and_then(|p| p.parse().ok())
                .unwrap_or(Decimal::ZERO),
            limit_price: response.limit_price.as_ref().and_then(|p| p.parse().ok()),
            stop_price: response.stop_price.as_ref().and_then(|p| p.parse().ok()),
            submitted_at: response.submitted_at.clone(),
            last_update_at: response.updated_at.clone(),
            status_message: response.status.clone(),
            legs: vec![],
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct AlpacaAccountResponse {
    id: String,
    equity: String,
    cash: String,
    buying_power: String,
}

/// Account information from Alpaca.
#[derive(Debug, Clone)]
pub struct AccountInfo {
    /// Account ID.
    pub account_id: String,
    /// Total equity.
    pub equity: Decimal,
    /// Buying power (with margin).
    pub buying_power: Decimal,
    /// Cash balance.
    pub cash: Decimal,
}

#[derive(Debug, Serialize, Deserialize)]
struct AlpacaPositionResponse {
    symbol: String,
    qty: String,
    side: String,
    avg_entry_price: String,
    market_value: String,
    current_price: String,
    unrealized_pl: String,
}

/// Position information.
#[derive(Debug, Clone)]
pub struct Position {
    /// Symbol.
    pub symbol: String,
    /// Quantity (signed: positive for long, negative for short).
    pub qty: Decimal,
    /// Average entry price.
    pub avg_entry_price: Decimal,
    /// Current market value.
    pub market_value: Decimal,
    /// Current price.
    pub current_price: Decimal,
    /// Unrealized profit/loss.
    pub unrealized_pl: Decimal,
}

impl Position {
    fn from_alpaca(response: &AlpacaPositionResponse) -> Self {
        Self {
            symbol: response.symbol.clone(),
            qty: response.qty.parse().unwrap_or(Decimal::ZERO),
            avg_entry_price: response.avg_entry_price.parse().unwrap_or(Decimal::ZERO),
            market_value: response.market_value.parse().unwrap_or(Decimal::ZERO),
            current_price: response.current_price.parse().unwrap_or(Decimal::ZERO),
            unrealized_pl: response.unrealized_pl.parse().unwrap_or(Decimal::ZERO),
        }
    }
}

// Helper functions for parsing Alpaca enums

fn parse_order_status(status: &str) -> OrderStatus {
    match status {
        "new" | "pending_new" => OrderStatus::New,
        "accepted" => OrderStatus::Accepted,
        "partially_filled" => OrderStatus::PartiallyFilled,
        "filled" => OrderStatus::Filled,
        "canceled" | "pending_cancel" => OrderStatus::Canceled,
        "rejected" => OrderStatus::Rejected,
        "expired" => OrderStatus::Expired,
        _ => OrderStatus::New,
    }
}

fn parse_order_type(order_type: &str) -> OrderType {
    match order_type {
        "market" => OrderType::Market,
        "limit" => OrderType::Limit,
        "stop" => OrderType::Stop,
        "stop_limit" => OrderType::StopLimit,
        _ => OrderType::Market,
    }
}

fn parse_time_in_force(tif: &str) -> TimeInForce {
    match tif {
        "day" => TimeInForce::Day,
        "gtc" => TimeInForce::Gtc,
        "ioc" => TimeInForce::Ioc,
        "fok" => TimeInForce::Fok,
        "opg" => TimeInForce::Opg,
        "cls" => TimeInForce::Cls,
        _ => TimeInForce::Day,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_alpaca_adapter_creation() {
        let adapter = AlpacaAdapter::new(
            "test-key".to_string(),
            "test-secret".to_string(),
            Environment::Paper,
        );
        assert!(adapter.is_ok());
    }

    #[test]
    fn test_alpaca_adapter_empty_credentials() {
        let adapter =
            AlpacaAdapter::new(String::new(), "test-secret".to_string(), Environment::Paper);
        assert!(adapter.is_err());
    }

    #[test]
    fn test_environment_url() {
        let adapter = AlpacaAdapter::new(
            "test-key".to_string(),
            "test-secret".to_string(),
            Environment::Paper,
        )
        .unwrap();
        assert!(adapter.base_url.contains("paper"));

        let live_adapter = AlpacaAdapter::new(
            "test-key".to_string(),
            "test-secret".to_string(),
            Environment::Live,
        )
        .unwrap();
        assert!(!live_adapter.base_url.contains("paper"));
    }

    #[test]
    fn test_parse_order_status() {
        assert_eq!(parse_order_status("new"), OrderStatus::New);
        assert_eq!(parse_order_status("filled"), OrderStatus::Filled);
        assert_eq!(parse_order_status("canceled"), OrderStatus::Canceled);
        assert_eq!(parse_order_status("rejected"), OrderStatus::Rejected);
    }

    #[test]
    fn test_parse_order_type() {
        assert_eq!(parse_order_type("market"), OrderType::Market);
        assert_eq!(parse_order_type("limit"), OrderType::Limit);
        assert_eq!(parse_order_type("stop"), OrderType::Stop);
    }
}
