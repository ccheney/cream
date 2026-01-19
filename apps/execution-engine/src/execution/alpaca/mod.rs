//! Alpaca Markets broker adapter.
//!
//! Production-grade implementation with:
//! - Full HTTP API integration
//! - Retry logic with exponential backoff
//! - Multi-leg options support
//! - Environment-aware safety checks

mod account;
mod api_types;
mod error;
mod fees;
mod options;

pub use account::{AccountInfo, Position};
pub use api_types::{
    AlpacaBar, AlpacaBarsResponse, AlpacaOptionContract, AlpacaOptionSnapshotsResponse,
    AlpacaQuote, AlpacaQuotesResponse, OptionType,
};
pub use error::AlpacaError;
pub use fees::{FeeBreakdown, RegulatoryFeeCalculator};
pub use options::OptionsOrderValidator;

use reqwest::{Client, StatusCode};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::broker::{
    AlpacaErrorHandler, BrokerRetryPolicy, ErrorCategory, ExponentialBackoffCalculator,
    RetryAfterExtractor,
};
use crate::models::{
    Action, Decision, Environment, ExecutionAck, ExecutionError, OrderState, SubmitOrdersRequest,
    TimeHorizon,
};

use super::gateway::BrokerError;
use super::tactics::{
    AggressiveLimitConfig, MarketState, OrderPurpose, PassiveLimitConfig, TacticConfig,
    TacticSelectionContext, TacticSelector, TacticType, TacticUrgency,
};

use api_types::{
    AlpacaAccountResponse, AlpacaErrorResponse, AlpacaMultiLegOrderRequest, AlpacaOrderRequest,
    AlpacaOrderResponse, AlpacaPositionResponse,
};

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
            // Route to appropriate submission method based on order type
            let result = if Self::is_multi_leg_order(decision) {
                self.submit_multi_leg_order(decision).await
            } else {
                self.submit_single_order(decision).await
            };

            match result {
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

    /// Wide spread threshold in basis points (0.5% = 50 bps).
    const WIDE_SPREAD_THRESHOLD_BPS: u32 = 50;

    /// Build tactic selection context from a decision with market data.
    ///
    /// Fetches ADV and quote data to determine optimal execution tactic.
    async fn build_tactic_context(&self, decision: &Decision) -> TacticSelectionContext {
        // Map time horizon to urgency
        let urgency = match decision.time_horizon {
            TimeHorizon::Intraday => TacticUrgency::High,
            TimeHorizon::Swing => TacticUrgency::Normal,
            TimeHorizon::Position | TimeHorizon::LongTerm => TacticUrgency::Low,
        };

        // Map action to order purpose
        let order_purpose = match decision.action {
            Action::Sell | Action::Close => OrderPurpose::Exit,
            Action::Buy | Action::Hold | Action::NoTrade => OrderPurpose::Entry,
        };

        // Calculate order size as percentage of ADV
        let size_pct_adv = self.calculate_size_pct_adv(decision).await;

        // Determine market state from bid/ask spread
        let market_state = self.determine_market_state(decision).await;

        TacticSelectionContext {
            size_pct_adv,
            urgency,
            market_state,
            order_purpose,
        }
    }

    /// Calculate order size as a percentage of average daily volume.
    async fn calculate_size_pct_adv(&self, decision: &Decision) -> Decimal {
        let default_size_pct = Decimal::new(5, 3); // 0.5% default

        // Get order quantity in shares
        let order_qty = match decision.size.unit {
            crate::models::SizeUnit::Shares | crate::models::SizeUnit::Contracts => {
                decision.size.quantity
            }
            // For dollar-based or percentage-based sizing, we can't easily compute ADV %
            // without knowing the current price and account equity
            _ => return default_size_pct,
        };

        // Calculate start date for ADV lookback (20 trading days ≈ 30 calendar days)
        let end = chrono::Utc::now();
        let start = end - chrono::Duration::days(30);
        let start_str = start.format("%Y-%m-%dT%H:%M:%SZ").to_string();
        let end_str = end.format("%Y-%m-%dT%H:%M:%SZ").to_string();

        // Fetch daily bars for ADV calculation
        let symbols = vec![decision.instrument_id.clone()];
        let bars_result = self
            .get_bars(&symbols, "1Day", Some(&start_str), Some(&end_str), None)
            .await;

        let adv = match bars_result {
            Ok(response) => {
                if let Some(bars) = response.bars.get(&decision.instrument_id) {
                    if bars.is_empty() {
                        tracing::warn!(
                            instrument = %decision.instrument_id,
                            "No bars returned for ADV calculation, using default"
                        );
                        return default_size_pct;
                    }
                    // Calculate average daily volume
                    let total_volume: i64 = bars.iter().map(|b| b.v).sum();
                    #[allow(clippy::cast_precision_loss)]
                    let avg_volume = total_volume as f64 / bars.len() as f64;
                    Decimal::from_f64_retain(avg_volume).unwrap_or(Decimal::ZERO)
                } else {
                    tracing::warn!(
                        instrument = %decision.instrument_id,
                        "No bars found for instrument, using default ADV"
                    );
                    return default_size_pct;
                }
            }
            Err(e) => {
                tracing::warn!(
                    instrument = %decision.instrument_id,
                    error = %e,
                    "Failed to fetch bars for ADV calculation, using default"
                );
                return default_size_pct;
            }
        };

        if adv.is_zero() {
            return default_size_pct;
        }

        // Calculate size as percentage of ADV
        let size_pct = order_qty / adv;

        tracing::debug!(
            instrument = %decision.instrument_id,
            order_qty = %order_qty,
            adv = %adv,
            size_pct_adv = %size_pct,
            "Calculated order size as percentage of ADV"
        );

        size_pct
    }

    /// Determine market state from current bid/ask spread.
    async fn determine_market_state(&self, decision: &Decision) -> MarketState {
        let symbols = vec![decision.instrument_id.clone()];
        let quotes_result = self.get_quotes(&symbols).await;

        match quotes_result {
            Ok(response) => {
                if let Some(quote) = response.quotes.get(&decision.instrument_id) {
                    let bid = quote.bp;
                    let ask = quote.ap;

                    if bid <= 0.0 || ask <= 0.0 || ask < bid {
                        tracing::warn!(
                            instrument = %decision.instrument_id,
                            bid = bid,
                            ask = ask,
                            "Invalid quote data, assuming normal market"
                        );
                        return MarketState::Normal;
                    }

                    let mid = f64::midpoint(bid, ask);
                    let spread = ask - bid;
                    let spread_bps = (spread / mid) * 10_000.0;

                    let threshold = f64::from(Self::WIDE_SPREAD_THRESHOLD_BPS);

                    let state = if spread_bps >= threshold {
                        MarketState::WideSpread
                    } else {
                        MarketState::Normal
                    };

                    tracing::debug!(
                        instrument = %decision.instrument_id,
                        bid = bid,
                        ask = ask,
                        spread_bps = spread_bps,
                        market_state = ?state,
                        "Determined market state from bid/ask spread"
                    );

                    state
                } else {
                    tracing::warn!(
                        instrument = %decision.instrument_id,
                        "No quote found for instrument, assuming normal market"
                    );
                    MarketState::Normal
                }
            }
            Err(e) => {
                tracing::warn!(
                    instrument = %decision.instrument_id,
                    error = %e,
                    "Failed to fetch quote for market state, assuming normal"
                );
                MarketState::Normal
            }
        }
    }

    /// Select and log the execution tactic for a decision.
    async fn select_tactic(&self, decision: &Decision) -> (TacticType, TacticConfig) {
        let context = self.build_tactic_context(decision).await;
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
        let (tactic, _config) = self.select_tactic(decision).await;

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

    /// Submit a multi-leg options order to Alpaca.
    ///
    /// Multi-leg orders (Level 3 Options) support strategies like vertical spreads,
    /// iron condors, straddles, and strangles.
    ///
    /// # Alpaca API Constraints
    ///
    /// - Max 4 legs per order
    /// - ratio_qty GCD must be 1
    /// - Order type: only `limit` for multi-leg
    /// - Time in force: `day` only for options
    ///
    /// # Errors
    ///
    /// Returns an error if the decision doesn't have valid multi-leg data or if
    /// the API call fails.
    async fn submit_multi_leg_order(&self, decision: &Decision) -> Result<OrderState, AlpacaError> {
        let order_request = AlpacaMultiLegOrderRequest::from_decision(decision).ok_or_else(|| {
            AlpacaError::InvalidOrder(
                "Decision missing required multi-leg order data (legs or net_limit_price)"
                    .to_string(),
            )
        })?;

        tracing::info!(
            decision_id = %decision.decision_id,
            strategy_family = ?decision.strategy_family,
            leg_count = order_request.legs.len(),
            limit_price = %order_request.limit_price,
            "Submitting multi-leg order to Alpaca"
        );

        let response: AlpacaOrderResponse = self
            .request("POST", "/v2/orders", Some(&order_request))
            .await?;

        Ok(OrderState::from_alpaca_response(&response))
    }

    /// Determine if a decision should be routed as a multi-leg order.
    fn is_multi_leg_order(decision: &Decision) -> bool {
        !decision.legs.is_empty()
            && matches!(
                decision.strategy_family,
                crate::models::StrategyFamily::VerticalSpread
                    | crate::models::StrategyFamily::IronCondor
                    | crate::models::StrategyFamily::Straddle
                    | crate::models::StrategyFamily::Strangle
                    | crate::models::StrategyFamily::CalendarSpread
            )
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
        use std::fmt::Write;
        if symbols.is_empty() {
            return Ok(AlpacaBarsResponse {
                bars: std::collections::HashMap::new(),
                next_page_token: None,
            });
        }

        // Build query parameters
        let symbols_param = symbols.join(",");
        let mut query = format!("/v2/stocks/bars?symbols={symbols_param}&timeframe={timeframe}");

        if let Some(s) = start {
            let _ = write!(query, "&start={s}");
        }
        if let Some(e) = end {
            let _ = write!(query, "&end={e}");
        }
        if let Some(l) = limit {
            let _ = write!(query, "&limit={l}");
        }

        tracing::debug!(
            symbols = ?symbols,
            timeframe = %timeframe,
            "Fetching bars from Alpaca data API"
        );

        self.data_request(&query).await
    }

    /// Get latest quotes for symbols from the Alpaca Market Data API.
    ///
    /// Fetches real-time quotes from the `/v2/stocks/quotes/latest` endpoint.
    ///
    /// # Arguments
    ///
    /// * `symbols` - List of stock symbols to fetch quotes for
    ///
    /// # Errors
    ///
    /// Returns an error if the API call fails.
    pub async fn get_quotes(
        &self,
        symbols: &[String],
    ) -> Result<AlpacaQuotesResponse, AlpacaError> {
        if symbols.is_empty() {
            return Ok(AlpacaQuotesResponse {
                quotes: std::collections::HashMap::new(),
            });
        }

        let symbols_param = symbols.join(",");
        let query = format!("/v2/stocks/quotes/latest?symbols={symbols_param}");

        tracing::debug!(
            symbols = ?symbols,
            "Fetching latest quotes from Alpaca data API"
        );

        self.data_request(&query).await
    }

    /// Get option snapshots for an underlying symbol from the Alpaca Options Data API.
    ///
    /// Fetches option chain snapshots from the `/v1beta1/options/snapshots/{underlying}` endpoint.
    ///
    /// # Arguments
    ///
    /// * `underlying` - The underlying symbol (e.g., "SPY", "AAPL")
    ///
    /// # Errors
    ///
    /// Returns an error if the API call fails.
    pub async fn get_option_snapshots(
        &self,
        underlying: &str,
    ) -> Result<AlpacaOptionSnapshotsResponse, AlpacaError> {
        let query = format!("/v1beta1/options/snapshots/{underlying}?feed=indicative");

        tracing::debug!(
            underlying = %underlying,
            "Fetching option snapshots from Alpaca data API"
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

#[cfg(test)]
#[allow(clippy::expect_used)]
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
}
