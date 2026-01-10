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
use std::collections::HashMap;
use std::time::Duration;
use thiserror::Error;

use crate::broker::{
    AlpacaErrorHandler, BrokerRetryPolicy, ErrorCategory, ExponentialBackoffCalculator,
    RetryAfterExtractor,
};
use crate::models::{
    Action, Decision, Environment, ExecutionAck, ExecutionError, OrderSide, OrderState,
    OrderStatus, OrderType, SubmitOrdersRequest, TimeHorizon, TimeInForce,
};

use super::gateway::BrokerError;
use super::tactics::{
    AggressiveLimitConfig, MarketState, OrderPurpose, PassiveLimitConfig, TacticConfig,
    TacticSelectionContext, TacticSelector, TacticType, TacticUrgency,
};

/// Errors from the Alpaca adapter.
#[derive(Debug, Error)]
pub enum AlpacaError {
    /// HTTP request failed.
    #[error("HTTP error: {0}")]
    Http(String),

    /// API returned an error.
    #[error("API error: {code} - {message}")]
    Api {
        /// Error code from the API.
        code: String,
        /// Error message from the API.
        message: String,
    },

    /// Order was rejected.
    #[error("Order rejected: {0}")]
    OrderRejected(String),

    /// Authentication failed.
    #[error("Authentication failed")]
    AuthenticationFailed,

    /// Rate limited.
    #[error("Rate limited, retry after {retry_after_secs}s")]
    RateLimited {
        /// Suggested retry delay in seconds.
        retry_after_secs: u64,
    },

    /// Environment mismatch.
    #[error("Environment mismatch: expected {expected}, got {actual}")]
    EnvironmentMismatch {
        /// Expected environment.
        expected: String,
        /// Actual environment.
        actual: String,
    },

    /// Network error (retryable).
    #[error("Network error: {0}")]
    Network(String),

    /// JSON parsing error.
    #[error("JSON parsing error: {0}")]
    JsonParse(String),

    /// Max retries exceeded.
    #[error("Max retries exceeded after {attempts} attempts")]
    MaxRetriesExceeded {
        /// Number of attempts made before giving up.
        attempts: u32,
    },
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
                Self::Http(msg)
            }
            AlpacaError::Api { code, message } => Self::Api { code, message },
            AlpacaError::OrderRejected(msg) => Self::OrderRejected(msg),
            AlpacaError::AuthenticationFailed => Self::AuthenticationFailed,
            AlpacaError::RateLimited { retry_after_secs } => Self::RateLimited { retry_after_secs },
            AlpacaError::EnvironmentMismatch { expected, actual } => {
                Self::EnvironmentMismatch { expected, actual }
            }
            AlpacaError::MaxRetriesExceeded { attempts: _ } => {
                Self::Http("Max retries exceeded".to_string())
            }
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
    /// Base URL for trading API calls.
    base_url: String,
    /// Base URL for market data API calls.
    data_url: String,
    /// HTTP client.
    client: Client,
    /// Retry policy.
    retry_policy: BrokerRetryPolicy,
    /// Tactic selector for execution strategy.
    tactic_selector: TacticSelector,
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
        let data_url = environment.alpaca_data_url().to_string();
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| AlpacaError::Network(e.to_string()))?;

        Ok(Self {
            api_key,
            api_secret,
            environment,
            base_url,
            data_url,
            client,
            retry_policy: BrokerRetryPolicy::default(),
            tactic_selector: TacticSelector::default(),
        })
    }

    /// Create adapter with custom retry policy.
    #[must_use]
    pub const fn with_retry_policy(mut self, policy: BrokerRetryPolicy) -> Self {
        self.retry_policy = policy;
        self
    }

    /// Make an authenticated HTTP request with retry logic.
    #[allow(clippy::too_many_lines)] // Complex retry logic with error handling is inherently verbose
    #[allow(clippy::future_not_send)] // Body reference not Send is acceptable for single-threaded executor
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
            let (error_code, error_message) =
                match serde_json::from_str::<AlpacaErrorResponse>(&error_body) {
                    Ok(err) => (
                        err.code.unwrap_or_else(|| status.as_u16().to_string()),
                        err.message,
                    ),
                    Err(_) => (status.as_u16().to_string(), error_body.clone()),
                };

            match category {
                ErrorCategory::RateLimited => {
                    if let Some(delay) =
                        RetryAfterExtractor::get_delay(retry_after.as_deref(), &mut backoff)
                    {
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

    /// Make an authenticated HTTP GET request to the data API with retry logic.
    ///
    /// Similar to `request()` but uses `data_url` for market data endpoints.
    #[allow(clippy::too_many_lines)]
    async fn data_request<T: for<'de> Deserialize<'de>>(
        &self,
        path: &str,
    ) -> Result<T, AlpacaError> {
        let url = format!("{}{}", self.data_url, path);
        let mut backoff = ExponentialBackoffCalculator::new(&self.retry_policy);

        loop {
            let request = self
                .client
                .get(&url)
                .header("APCA-API-KEY-ID", &self.api_key)
                .header("APCA-API-SECRET-KEY", &self.api_secret);

            let response = match request.send().await {
                Ok(resp) => resp,
                Err(e) => {
                    if let Some(delay) = backoff.next_backoff() {
                        tracing::warn!(
                            error = %e,
                            delay_ms = delay.as_millis(),
                            attempt = backoff.current_attempt(),
                            "Data API network error, retrying"
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

            if status.is_success() {
                let text = response.text().await?;
                return Ok(serde_json::from_str(&text)?);
            }

            let category = AlpacaErrorHandler::categorize_status(status.as_u16());
            let retry_after = response
                .headers()
                .get("Retry-After")
                .and_then(|v| v.to_str().ok())
                .map(String::from);

            let error_body = response.text().await.unwrap_or_default();
            let (error_code, error_message) =
                match serde_json::from_str::<AlpacaErrorResponse>(&error_body) {
                    Ok(err) => (
                        err.code.unwrap_or_else(|| status.as_u16().to_string()),
                        err.message,
                    ),
                    Err(_) => (status.as_u16().to_string(), error_body.clone()),
                };

            match category {
                ErrorCategory::RateLimited => {
                    if let Some(delay) =
                        RetryAfterExtractor::get_delay(retry_after.as_deref(), &mut backoff)
                    {
                        tracing::warn!(
                            code = %error_code,
                            delay_ms = delay.as_millis(),
                            "Data API rate limited, retrying"
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
                            "Data API retryable error, retrying"
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

    /// Build tactic selection context from a decision.
    ///
    /// Maps decision attributes to tactic selection criteria.
    fn build_tactic_context(decision: &Decision) -> TacticSelectionContext {
        // Map time horizon to urgency
        let urgency = match decision.time_horizon {
            TimeHorizon::Intraday => TacticUrgency::High,
            TimeHorizon::Swing => TacticUrgency::Normal,
            TimeHorizon::Position | TimeHorizon::LongTerm => TacticUrgency::Low,
        };

        // Map action to order purpose
        let order_purpose = match decision.action {
            Action::Sell | Action::Close => OrderPurpose::Exit,
            // Buy, Hold, NoTrade default to Entry (Hold/NoTrade shouldn't be called)
            Action::Buy | Action::Hold | Action::NoTrade => OrderPurpose::Entry,
        };

        // TODO: Get actual ADV from market data
        // For now, default to small order (<1% ADV)
        let size_pct_adv = Decimal::new(5, 3); // 0.5%

        // TODO: Get actual market state from bid/ask spread
        // For now, default to normal market
        let market_state = MarketState::Normal;

        TacticSelectionContext {
            size_pct_adv,
            urgency,
            market_state,
            order_purpose,
        }
    }

    /// Select and log the execution tactic for a decision.
    fn select_tactic(&self, decision: &Decision) -> (TacticType, TacticConfig) {
        let context = Self::build_tactic_context(decision);
        let tactic = self.tactic_selector.select(&context);

        tracing::info!(
            decision_id = %decision.decision_id,
            instrument = %decision.instrument_id,
            tactic = ?tactic,
            urgency = ?context.urgency,
            purpose = ?context.order_purpose,
            "Selected execution tactic"
        );

        // Build tactic config with defaults
        let config = match tactic {
            TacticType::PassiveLimit => TacticConfig::passive_limit(PassiveLimitConfig::default()),
            TacticType::AggressiveLimit => {
                TacticConfig::aggressive_limit(AggressiveLimitConfig::default())
            }
            TacticType::Iceberg => {
                tracing::warn!("Iceberg tactic not fully implemented, using aggressive limit");
                TacticConfig::aggressive_limit(AggressiveLimitConfig::default())
            }
            TacticType::Twap => {
                tracing::warn!("TWAP tactic not fully implemented, using aggressive limit");
                TacticConfig::aggressive_limit(AggressiveLimitConfig::default())
            }
            TacticType::Vwap => {
                tracing::warn!("VWAP tactic not fully implemented, using aggressive limit");
                TacticConfig::aggressive_limit(AggressiveLimitConfig::default())
            }
            TacticType::Adaptive => {
                tracing::warn!("Adaptive tactic not fully implemented, using aggressive limit");
                TacticConfig::aggressive_limit(AggressiveLimitConfig::default())
            }
        };

        (tactic, config)
    }

    /// Submit a single order to Alpaca with tactic-aware execution.
    async fn submit_single_order(&self, decision: &Decision) -> Result<OrderState, AlpacaError> {
        // Select execution tactic
        let (tactic, _config) = self.select_tactic(decision);

        // Build base order request
        let mut order_request = AlpacaOrderRequest::from_decision(decision);

        // Apply tactic-specific modifications
        // Note: For PassiveLimit/AggressiveLimit, we need current bid/ask prices
        // which we don't have in this context. For now, we'll use the decision's
        // limit_price if provided, or let Alpaca default to market order.
        //
        // Full implementation would:
        // 1. Query current quote via get_quote()
        // 2. Apply tactic pricing logic (PassiveLimitConfig::calculate_buy_price etc)
        // 3. Set time_in_force based on tactic requirements
        match tactic {
            TacticType::PassiveLimit => {
                // Passive orders should be day orders with limit price
                if order_request.limit_price.is_some() {
                    order_request.time_in_force = "day".to_string();
                }
                tracing::debug!(
                    decision_id = %decision.decision_id,
                    "Submitting passive limit order"
                );
            }
            TacticType::AggressiveLimit => {
                // Aggressive orders should be IOC (immediate-or-cancel) if limit
                // or just market orders
                if order_request.limit_price.is_some() {
                    order_request.time_in_force = "ioc".to_string();
                }
                tracing::debug!(
                    decision_id = %decision.decision_id,
                    "Submitting aggressive order"
                );
            }
            _ => {
                // Other tactics fall back to default behavior
                tracing::debug!(
                    decision_id = %decision.decision_id,
                    tactic = ?tactic,
                    "Using default order parameters for tactic"
                );
            }
        }

        // Store tactic info for tracking (would be in order metadata in full impl)
        tracing::info!(
            decision_id = %decision.decision_id,
            tactic = ?tactic,
            order_type = %order_request.order_type,
            time_in_force = %order_request.time_in_force,
            "Submitting order to Alpaca"
        );

        let response: AlpacaOrderResponse = self
            .request("POST", "/v2/orders", Some(&order_request))
            .await?;

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
        let path = status.map_or_else(
            || "/v2/orders".to_string(),
            |s| format!("/v2/orders?status={s}"),
        );

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
            margin_used: response
                .maintenance_margin
                .as_ref()
                .and_then(|m| m.parse().ok())
                .unwrap_or(Decimal::ZERO),
            daytrade_count: response.daytrade_count.unwrap_or(0),
            pattern_day_trader: response.pattern_day_trader.unwrap_or(false),
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

    /// Get historical bars for symbols from the Alpaca Market Data API.
    ///
    /// Fetches OHLCV bars from the `/v2/stocks/bars` endpoint.
    ///
    /// # Arguments
    ///
    /// * `symbols` - List of stock symbols to fetch bars for
    /// * `timeframe` - Bar timeframe: "1Min", "5Min", "15Min", "1Hour", "1Day"
    /// * `start` - Start time in RFC3339 format (optional, defaults to market open)
    /// * `end` - End time in RFC3339 format (optional, defaults to now)
    /// * `limit` - Maximum number of bars per symbol (optional, max 10000)
    ///
    /// # Errors
    ///
    /// Returns an error if the API call fails.
    pub async fn get_bars(
        &self,
        symbols: &[String],
        timeframe: &str,
        start: Option<&str>,
        end: Option<&str>,
        limit: Option<u32>,
    ) -> Result<AlpacaBarsResponse, AlpacaError> {
        if symbols.is_empty() {
            return Ok(AlpacaBarsResponse {
                bars: HashMap::new(),
                next_page_token: None,
            });
        }

        // Build query parameters
        let symbols_param = symbols.join(",");
        let mut query = format!(
            "/v2/stocks/bars?symbols={}&timeframe={}",
            symbols_param, timeframe
        );

        if let Some(s) = start {
            query.push_str(&format!("&start={s}"));
        }
        if let Some(e) = end {
            query.push_str(&format!("&end={e}"));
        }
        if let Some(l) = limit {
            query.push_str(&format!("&limit={l}"));
        }

        tracing::debug!(
            symbols = ?symbols,
            timeframe = %timeframe,
            "Fetching bars from Alpaca data API"
        );

        self.data_request(&query).await
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

    fn broker_name(&self) -> &'static str {
        "Alpaca"
    }

    async fn health_check(&self) -> Result<(), BrokerError> {
        // Use get_account as a lightweight health check
        // It validates authentication and connectivity
        self.get_account().await.map(|_| ()).map_err(Into::into)
    }
}

// ============================================================================
// Alpaca API Request/Response Types
// ============================================================================

// ----- Market Data Types -----

/// Response from GET /v2/stocks/bars endpoint.
#[derive(Debug, Deserialize)]
pub struct AlpacaBarsResponse {
    /// Map of symbol to bars.
    pub bars: HashMap<String, Vec<AlpacaBar>>,
    /// Token for pagination (if more results available).
    pub next_page_token: Option<String>,
}

/// Single OHLCV bar from Alpaca market data API.
#[derive(Debug, Deserialize, Clone)]
pub struct AlpacaBar {
    /// Timestamp in RFC3339 format.
    pub t: String,
    /// Open price.
    pub o: f64,
    /// High price.
    pub h: f64,
    /// Low price.
    pub l: f64,
    /// Close price.
    pub c: f64,
    /// Volume.
    pub v: i64,
    /// Volume-weighted average price.
    #[serde(default)]
    pub vw: Option<f64>,
    /// Number of trades.
    #[serde(default)]
    pub n: Option<i32>,
}

// ----- Trading API Types -----

#[derive(Debug, Serialize, Deserialize)]
struct AlpacaErrorResponse {
    code: Option<String>,
    message: String,
}

/// Take profit leg for bracket orders
#[derive(Debug, Clone, Serialize, Deserialize)]
struct TakeProfitLeg {
    limit_price: String,
}

/// Stop loss leg for bracket orders
#[derive(Debug, Clone, Serialize, Deserialize)]
struct StopLossLeg {
    stop_price: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    limit_price: Option<String>,
}

/// Order class for advanced order types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum OrderClass {
    /// Simple order (no bracket)
    Simple,
    /// Bracket order with stop-loss and take-profit
    Bracket,
    /// One-triggers-other (entry + single exit)
    Oto,
    /// One-cancels-other (two exits)
    Oco,
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
    /// Order class for bracket/OTO/OCO orders
    #[serde(skip_serializing_if = "is_simple_order")]
    order_class: OrderClass,
    /// Take profit leg for bracket orders
    #[serde(skip_serializing_if = "Option::is_none")]
    take_profit: Option<TakeProfitLeg>,
    /// Stop loss leg for bracket orders
    #[serde(skip_serializing_if = "Option::is_none")]
    stop_loss: Option<StopLossLeg>,
}

/// Helper to skip serializing `order_class` when it's simple.
/// Note: Takes reference due to serde `skip_serializing_if` signature requirement.
#[allow(clippy::trivially_copy_pass_by_ref)]
fn is_simple_order(class: &OrderClass) -> bool {
    *class == OrderClass::Simple
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
            crate::models::SizeUnit::Dollars => (None, Some(decision.size.quantity.to_string())),
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

        // Determine order class and legs based on stop/target levels
        let has_stop = decision.stop_loss_level > Decimal::ZERO;
        let has_target = decision.take_profit_level > Decimal::ZERO;

        let (order_class, take_profit, stop_loss) = match (has_stop, has_target) {
            // Both stop and target: bracket order
            (true, true) => (
                OrderClass::Bracket,
                Some(TakeProfitLeg {
                    limit_price: decision.take_profit_level.to_string(),
                }),
                Some(StopLossLeg {
                    stop_price: decision.stop_loss_level.to_string(),
                    limit_price: None, // Use stop market order for stop loss
                }),
            ),
            // Only stop loss: OTO (one-triggers-other)
            (true, false) => (
                OrderClass::Oto,
                None,
                Some(StopLossLeg {
                    stop_price: decision.stop_loss_level.to_string(),
                    limit_price: None,
                }),
            ),
            // Only take profit: OTO with take profit
            (false, true) => (
                OrderClass::Oto,
                Some(TakeProfitLeg {
                    limit_price: decision.take_profit_level.to_string(),
                }),
                None,
            ),
            // No stop or target: simple order
            (false, false) => (OrderClass::Simple, None, None),
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
            order_class,
            take_profit,
            stop_loss,
        }
    }
}

/// Bracket order leg from Alpaca API response
#[derive(Debug, Serialize, Deserialize, Clone)]
struct AlpacaOrderLeg {
    id: String,
    #[serde(default)]
    client_order_id: Option<String>,
    status: String,
    #[serde(rename = "type")]
    order_type: String,
    side: String,
    #[serde(default)]
    limit_price: Option<String>,
    #[serde(default)]
    stop_price: Option<String>,
    qty: String,
    filled_qty: String,
    #[serde(default)]
    filled_avg_price: Option<String>,
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
    /// Order class (simple, bracket, oto, oco)
    #[serde(default)]
    order_class: Option<String>,
    /// Bracket order legs (stop loss and take profit)
    #[serde(default)]
    legs: Option<Vec<AlpacaOrderLeg>>,
}

use crate::models::OrderLegState;

impl OrderState {
    fn from_alpaca_response(response: &AlpacaOrderResponse) -> Self {
        // Determine if this is a multi-leg order (bracket/OTO/OCO)
        let is_multi_leg = response
            .order_class
            .as_ref()
            .is_some_and(|c| c != "simple" && !c.is_empty());

        // Convert bracket legs to our OrderLegState format
        let legs: Vec<OrderLegState> = response
            .legs
            .as_ref()
            .map(|alpaca_legs| {
                alpaca_legs
                    .iter()
                    .enumerate()
                    .map(|(idx, leg)| {
                        // Truncation acceptable: leg index is bounded by order legs count (typically < 10)
                        #[allow(clippy::cast_possible_truncation)]
                        let leg_index = idx as u32;
                        OrderLegState {
                            leg_index,
                            instrument_id: response.symbol.clone(),
                            side: if leg.side == "buy" {
                                OrderSide::Buy
                            } else {
                                OrderSide::Sell
                            },
                            quantity: leg.qty.parse().unwrap_or(Decimal::ZERO),
                            filled_quantity: leg.filled_qty.parse().unwrap_or(Decimal::ZERO),
                            avg_fill_price: leg
                                .filled_avg_price
                                .as_ref()
                                .and_then(|p| p.parse().ok())
                                .unwrap_or(Decimal::ZERO),
                            status: parse_order_status(&leg.status),
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        Self {
            order_id: response.client_order_id.clone(),
            broker_order_id: response.id.clone(),
            is_multi_leg,
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
            legs,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct AlpacaAccountResponse {
    id: String,
    equity: String,
    cash: String,
    buying_power: String,
    #[serde(default)]
    maintenance_margin: Option<String>,
    #[serde(default)]
    daytrade_count: Option<i32>,
    #[serde(default)]
    pattern_day_trader: Option<bool>,
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
    /// Maintenance margin used.
    pub margin_used: Decimal,
    /// Day trade count (for PDT rule).
    pub daytrade_count: i32,
    /// Whether account is flagged as pattern day trader.
    pub pattern_day_trader: bool,
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
    #[serde(default)]
    unrealized_plpc: Option<String>,
    #[serde(default)]
    cost_basis: Option<String>,
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
    /// Unrealized P&L percentage.
    pub unrealized_pl_pct: Decimal,
    /// Cost basis.
    pub cost_basis: Decimal,
}

impl Position {
    fn from_alpaca(response: &AlpacaPositionResponse) -> Self {
        let qty: Decimal = response.qty.parse().unwrap_or(Decimal::ZERO);
        let avg_entry_price: Decimal = response.avg_entry_price.parse().unwrap_or(Decimal::ZERO);

        // Calculate cost basis if not provided (qty * avg_entry_price)
        let cost_basis = response
            .cost_basis
            .as_ref()
            .and_then(|c| c.parse().ok())
            .unwrap_or_else(|| qty.abs() * avg_entry_price);

        Self {
            symbol: response.symbol.clone(),
            qty,
            avg_entry_price,
            market_value: response.market_value.parse().unwrap_or(Decimal::ZERO),
            current_price: response.current_price.parse().unwrap_or(Decimal::ZERO),
            unrealized_pl: response.unrealized_pl.parse().unwrap_or(Decimal::ZERO),
            unrealized_pl_pct: response
                .unrealized_plpc
                .as_ref()
                .and_then(|p| p.parse().ok())
                .unwrap_or(Decimal::ZERO),
            cost_basis,
        }
    }
}

// Helper functions for parsing Alpaca enums

fn parse_order_status(status: &str) -> OrderStatus {
    match status {
        "accepted" => OrderStatus::Accepted,
        "partially_filled" => OrderStatus::PartiallyFilled,
        "filled" => OrderStatus::Filled,
        "canceled" | "pending_cancel" => OrderStatus::Canceled,
        "rejected" => OrderStatus::Rejected,
        "expired" => OrderStatus::Expired,
        // "new", "pending_new", and unknown statuses default to New
        _ => OrderStatus::New,
    }
}

fn parse_order_type(order_type: &str) -> OrderType {
    match order_type {
        "limit" => OrderType::Limit,
        "stop" => OrderType::Stop,
        "stop_limit" => OrderType::StopLimit,
        // "market" and unknown types default to Market
        _ => OrderType::Market,
    }
}

fn parse_time_in_force(tif: &str) -> TimeInForce {
    match tif {
        "gtc" => TimeInForce::Gtc,
        "ioc" => TimeInForce::Ioc,
        "fok" => TimeInForce::Fok,
        "opg" => TimeInForce::Opg,
        "cls" => TimeInForce::Cls,
        // "day" and unknown values default to Day
        _ => TimeInForce::Day,
    }
}

// ============================================================================
// Options Order Validation
// ============================================================================

/// Alpaca-specific options order constraints.
#[derive(Debug, Clone)]
pub struct OptionsOrderValidator;

impl OptionsOrderValidator {
    /// Validate time-in-force for options orders.
    ///
    /// Alpaca only supports DAY time-in-force for options orders.
    /// GTC, IOC, FOK are not allowed for options.
    ///
    /// # Errors
    ///
    /// Returns an error if the time-in-force is not DAY.
    pub fn validate_time_in_force(tif: TimeInForce) -> Result<(), AlpacaError> {
        if tif != TimeInForce::Day {
            return Err(AlpacaError::Api {
                code: "INVALID_TIF_FOR_OPTIONS".to_string(),
                message: format!(
                    "Options orders only support DAY time-in-force. Got: {tif:?}. \
                     GTC, IOC, FOK are not allowed for options on Alpaca."
                ),
            });
        }
        Ok(())
    }

    /// Validate that bracket/OCO orders are not used for options.
    ///
    /// Alpaca only supports bracket/OCO orders for stocks and ETFs.
    ///
    /// # Errors
    ///
    /// Returns an error if trying to use bracket/OCO with options.
    pub fn validate_no_bracket_oco(
        is_options: bool,
        is_bracket_or_oco: bool,
    ) -> Result<(), AlpacaError> {
        if is_options && is_bracket_or_oco {
            return Err(AlpacaError::Api {
                code: "BRACKET_NOT_SUPPORTED_FOR_OPTIONS".to_string(),
                message: "Bracket and OCO orders are only supported for stocks and ETFs. \
                         Options orders cannot use bracket/OCO order types on Alpaca."
                    .to_string(),
            });
        }
        Ok(())
    }

    /// Check if an instrument is an options contract based on symbol format.
    ///
    /// Alpaca options symbols follow OCC format: AAPL240119C00150000
    /// - 1-6 char underlying symbol
    /// - 6 digit date (YYMMDD)
    /// - C or P (call/put)
    /// - 8 digit strike (price * 1000)
    #[must_use]
    pub fn is_options_symbol(symbol: &str) -> bool {
        // Options symbols are typically 15-21 characters
        if symbol.len() < 15 || symbol.len() > 21 {
            return false;
        }

        // Check for C or P indicator in the expected position
        let len = symbol.len();
        let indicator_pos = len - 9;
        let indicator = symbol.chars().nth(indicator_pos);
        matches!(indicator, Some('C' | 'P'))
    }
}

// ============================================================================
// Regulatory Fee Calculations
// ============================================================================

/// Regulatory fee calculator for US markets (as of January 2026).
///
/// Fee schedule:
/// - SEC Section 31 Fee: $0.0000278 per dollar on equity sells
/// - FINRA TAF (equities): $0.000195 per share, cap $9.79/transaction
/// - FINRA TAF (options): $0.00329 per contract, cap $9.79/transaction
/// - Options ORF: $0.0026 per contract (varies by exchange)
/// - Alpaca commission: $0.00 (commission-free)
#[derive(Debug, Clone, Default)]
pub struct RegulatoryFeeCalculator;

/// Breakdown of regulatory fees for a trade.
#[derive(Debug, Clone, Default)]
pub struct FeeBreakdown {
    /// SEC Section 31 fee (equity sells only).
    pub sec_fee: Decimal,
    /// FINRA Trading Activity Fee.
    pub finra_taf: Decimal,
    /// Options Regulatory Fee (options only).
    pub options_orf: Decimal,
    /// Broker commission (always $0.00 for Alpaca).
    pub commission: Decimal,
    /// Total fees.
    pub total: Decimal,
}

impl RegulatoryFeeCalculator {
    /// SEC Section 31 fee rate: $0.0000278 per dollar
    const SEC_FEE_RATE: Decimal = Decimal::from_parts(278, 0, 0, false, 8);

    /// FINRA TAF for equities: $0.000195 per share
    const FINRA_TAF_EQUITY_RATE: Decimal = Decimal::from_parts(195, 0, 0, false, 6);

    /// FINRA TAF for options: $0.00329 per contract
    const FINRA_TAF_OPTIONS_RATE: Decimal = Decimal::from_parts(329, 0, 0, false, 5);

    /// FINRA TAF cap per transaction
    const FINRA_TAF_CAP: Decimal = Decimal::from_parts(979, 0, 0, false, 2);

    /// Options ORF: $0.0026 per contract
    const OPTIONS_ORF_RATE: Decimal = Decimal::from_parts(26, 0, 0, false, 4);

    /// Calculate fees for an equity trade.
    #[must_use]
    pub fn calculate_equity_fees(
        is_sell: bool,
        shares: Decimal,
        notional_value: Decimal,
    ) -> FeeBreakdown {
        let mut breakdown = FeeBreakdown::default();

        // SEC fee only applies to sells
        if is_sell {
            breakdown.sec_fee = (notional_value * Self::SEC_FEE_RATE).round_dp(2);
        }

        // FINRA TAF applies to all trades, capped at $9.79
        let taf = shares * Self::FINRA_TAF_EQUITY_RATE;
        breakdown.finra_taf = taf.min(Self::FINRA_TAF_CAP).round_dp(2);

        // Commission is always $0.00
        breakdown.commission = Decimal::ZERO;

        breakdown.total = breakdown.sec_fee + breakdown.finra_taf + breakdown.commission;
        breakdown
    }

    /// Calculate fees for an options trade.
    #[must_use]
    pub fn calculate_options_fees(is_sell: bool, contracts: Decimal) -> FeeBreakdown {
        let mut breakdown = FeeBreakdown::default();

        // FINRA TAF for options, capped at $9.79
        let taf = contracts * Self::FINRA_TAF_OPTIONS_RATE;
        breakdown.finra_taf = taf.min(Self::FINRA_TAF_CAP).round_dp(2);

        // Options ORF applies to all trades
        breakdown.options_orf = (contracts * Self::OPTIONS_ORF_RATE).round_dp(2);

        // SEC fee applies to options sells (on premium value)
        // Note: This is often waived but including for completeness
        if is_sell {
            // For options, SEC fee would be on premium value, but we don't
            // have that here. Setting to zero as it's typically negligible.
            breakdown.sec_fee = Decimal::ZERO;
        }

        // Commission is always $0.00
        breakdown.commission = Decimal::ZERO;

        breakdown.total =
            breakdown.sec_fee + breakdown.finra_taf + breakdown.options_orf + breakdown.commission;
        breakdown
    }

    /// Calculate total fees for a trade (auto-detecting instrument type).
    #[must_use]
    pub fn calculate_fees(
        symbol: &str,
        is_sell: bool,
        quantity: Decimal,
        notional_value: Decimal,
    ) -> FeeBreakdown {
        if OptionsOrderValidator::is_options_symbol(symbol) {
            Self::calculate_options_fees(is_sell, quantity)
        } else {
            Self::calculate_equity_fees(is_sell, quantity, notional_value)
        }
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
        let adapter = match AlpacaAdapter::new(
            "test-key".to_string(),
            "test-secret".to_string(),
            Environment::Paper,
        ) {
            Ok(a) => a,
            Err(e) => panic!("should create paper adapter: {e}"),
        };
        assert!(adapter.base_url.contains("paper"));

        let live_adapter = match AlpacaAdapter::new(
            "test-key".to_string(),
            "test-secret".to_string(),
            Environment::Live,
        ) {
            Ok(a) => a,
            Err(e) => panic!("should create live adapter: {e}"),
        };
        assert!(!live_adapter.base_url.contains("paper"));
    }

    #[test]
    fn test_data_url() {
        let adapter = match AlpacaAdapter::new(
            "test-key".to_string(),
            "test-secret".to_string(),
            Environment::Paper,
        ) {
            Ok(a) => a,
            Err(e) => panic!("should create adapter: {e}"),
        };
        assert_eq!(adapter.data_url, "https://data.alpaca.markets");

        let live_adapter = match AlpacaAdapter::new(
            "test-key".to_string(),
            "test-secret".to_string(),
            Environment::Live,
        ) {
            Ok(a) => a,
            Err(e) => panic!("should create live adapter: {e}"),
        };
        assert_eq!(live_adapter.data_url, "https://data.alpaca.markets");
    }

    #[tokio::test]
    async fn test_get_bars_empty_symbols() {
        let adapter = match AlpacaAdapter::new(
            "test-key".to_string(),
            "test-secret".to_string(),
            Environment::Paper,
        ) {
            Ok(a) => a,
            Err(e) => panic!("should create adapter: {e}"),
        };

        // Empty symbols should return empty response without API call
        let result = adapter.get_bars(&[], "1Hour", None, None, None).await;
        assert!(result.is_ok());
        let response = result.expect("should succeed");
        assert!(response.bars.is_empty());
        assert!(response.next_page_token.is_none());
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

    // ============================================================================
    // Options Validation Tests
    // ============================================================================

    #[test]
    fn test_options_tif_day_allowed() {
        let result = OptionsOrderValidator::validate_time_in_force(TimeInForce::Day);
        assert!(result.is_ok());
    }

    #[test]
    fn test_options_tif_gtc_rejected() {
        let result = OptionsOrderValidator::validate_time_in_force(TimeInForce::Gtc);
        let Err(err) = result else {
            panic!("expected error for GTC on options");
        };
        if let AlpacaError::Api { code, .. } = err {
            assert_eq!(code, "INVALID_TIF_FOR_OPTIONS");
        } else {
            panic!("Expected Api error");
        }
    }

    #[test]
    fn test_options_tif_ioc_rejected() {
        let result = OptionsOrderValidator::validate_time_in_force(TimeInForce::Ioc);
        assert!(result.is_err());
    }

    #[test]
    fn test_options_tif_fok_rejected() {
        let result = OptionsOrderValidator::validate_time_in_force(TimeInForce::Fok);
        assert!(result.is_err());
    }

    #[test]
    fn test_bracket_allowed_for_equities() {
        let result = OptionsOrderValidator::validate_no_bracket_oco(false, true);
        assert!(result.is_ok());
    }

    #[test]
    fn test_bracket_rejected_for_options() {
        let result = OptionsOrderValidator::validate_no_bracket_oco(true, true);
        let Err(err) = result else {
            panic!("expected error for bracket order on options");
        };
        if let AlpacaError::Api { code, .. } = err {
            assert_eq!(code, "BRACKET_NOT_SUPPORTED_FOR_OPTIONS");
        } else {
            panic!("Expected Api error");
        }
    }

    #[test]
    fn test_is_options_symbol() {
        // Valid options symbols (OCC format)
        assert!(OptionsOrderValidator::is_options_symbol(
            "AAPL240119C00150000"
        ));
        assert!(OptionsOrderValidator::is_options_symbol(
            "AAPL240119P00150000"
        ));
        assert!(OptionsOrderValidator::is_options_symbol(
            "SPY240119C00500000"
        ));
        assert!(OptionsOrderValidator::is_options_symbol(
            "GOOGL240119P02800000"
        ));

        // Invalid - too short (equities)
        assert!(!OptionsOrderValidator::is_options_symbol("AAPL"));
        assert!(!OptionsOrderValidator::is_options_symbol("SPY"));
        assert!(!OptionsOrderValidator::is_options_symbol("GOOGL"));

        // Invalid - no C or P indicator
        assert!(!OptionsOrderValidator::is_options_symbol(
            "AAPL240119X00150000"
        ));
    }

    // ============================================================================
    // Regulatory Fee Tests
    // ============================================================================

    #[test]
    fn test_equity_sell_fees() {
        // Selling 100 shares at $150/share = $15,000 notional
        let fees = RegulatoryFeeCalculator::calculate_equity_fees(
            true,
            Decimal::new(100, 0),
            Decimal::new(15000, 0),
        );

        // SEC fee: $15,000 * 0.0000278 = $0.417 -> $0.42
        assert!(fees.sec_fee > Decimal::ZERO);

        // FINRA TAF: 100 * 0.000195 = $0.0195 -> $0.02
        assert!(fees.finra_taf > Decimal::ZERO);

        // Commission should always be $0.00
        assert_eq!(fees.commission, Decimal::ZERO);

        // Total should be sum of all fees
        assert_eq!(fees.total, fees.sec_fee + fees.finra_taf + fees.commission);
    }

    #[test]
    fn test_equity_buy_no_sec_fee() {
        // Buying has no SEC fee
        let fees = RegulatoryFeeCalculator::calculate_equity_fees(
            false,
            Decimal::new(100, 0),
            Decimal::new(15000, 0),
        );

        // SEC fee should be zero on buys
        assert_eq!(fees.sec_fee, Decimal::ZERO);

        // FINRA TAF still applies
        assert!(fees.finra_taf > Decimal::ZERO);
    }

    #[test]
    fn test_finra_taf_cap() {
        // Trading 100,000 shares should hit the $9.79 cap
        // 100,000 * 0.000195 = $19.50, capped at $9.79
        let fees = RegulatoryFeeCalculator::calculate_equity_fees(
            false,
            Decimal::new(100_000, 0),
            Decimal::new(10_000_000, 0),
        );

        assert_eq!(fees.finra_taf, Decimal::new(979, 2));
    }

    #[test]
    fn test_options_fees() {
        // Trading 10 option contracts
        let fees = RegulatoryFeeCalculator::calculate_options_fees(true, Decimal::new(10, 0));

        // FINRA TAF: 10 * 0.00329 = $0.0329 -> $0.03
        assert!(fees.finra_taf > Decimal::ZERO);

        // Options ORF: 10 * 0.0026 = $0.026 -> $0.03
        assert!(fees.options_orf > Decimal::ZERO);

        // Commission should be $0.00
        assert_eq!(fees.commission, Decimal::ZERO);

        // Total should be sum
        assert_eq!(
            fees.total,
            fees.sec_fee + fees.finra_taf + fees.options_orf + fees.commission
        );
    }

    #[test]
    fn test_options_finra_taf_cap() {
        // Trading 10,000 contracts should hit the cap
        // 10,000 * 0.00329 = $32.90, capped at $9.79
        let fees = RegulatoryFeeCalculator::calculate_options_fees(true, Decimal::new(10000, 0));

        assert_eq!(fees.finra_taf, Decimal::new(979, 2));
    }

    #[test]
    fn test_calculate_fees_auto_detect_equity() {
        let fees = RegulatoryFeeCalculator::calculate_fees(
            "AAPL",
            true,
            Decimal::new(100, 0),
            Decimal::new(15000, 0),
        );

        // Should detect as equity and apply SEC fee for sell
        assert!(fees.sec_fee > Decimal::ZERO);
        assert_eq!(fees.options_orf, Decimal::ZERO);
    }

    #[test]
    fn test_calculate_fees_auto_detect_options() {
        let fees = RegulatoryFeeCalculator::calculate_fees(
            "AAPL240119C00150000",
            true,
            Decimal::new(10, 0),
            Decimal::ZERO, // notional not used for options
        );

        // Should detect as options and apply ORF
        assert!(fees.options_orf > Decimal::ZERO);
    }
}
