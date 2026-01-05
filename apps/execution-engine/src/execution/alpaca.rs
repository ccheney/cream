//! Alpaca Markets broker adapter.

use rust_decimal::Decimal;
use thiserror::Error;

use crate::models::{
    Decision, Environment, ExecutionAck, ExecutionError, OrderSide, OrderState, OrderStatus,
    OrderType, SubmitOrdersRequest, TimeInForce,
};

use super::gateway::{BrokerAdapter, BrokerError};

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

        Ok(Self {
            api_key,
            api_secret,
            environment,
            base_url,
        })
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
        // In a real implementation, this would make HTTP calls to Alpaca API.
        // For now, we create a simulated order state.

        let order_id = format!("cream-{}", uuid::Uuid::new_v4());
        let broker_order_id = format!("alpaca-{}", uuid::Uuid::new_v4());

        tracing::info!(
            order_id = %order_id,
            instrument = %decision.instrument_id,
            action = ?decision.action,
            "Submitting order to Alpaca"
        );

        // Simulate order creation
        let order_state = OrderState {
            order_id,
            broker_order_id,
            is_multi_leg: false,
            instrument_id: decision.instrument_id.clone(),
            status: OrderStatus::Accepted,
            side: match decision.direction {
                crate::models::Direction::Long => OrderSide::Buy,
                crate::models::Direction::Short | crate::models::Direction::Flat => OrderSide::Sell,
            },
            order_type: if decision.limit_price.is_some() {
                OrderType::Limit
            } else {
                OrderType::Market
            },
            time_in_force: TimeInForce::Day,
            requested_quantity: decision.size.quantity,
            filled_quantity: Decimal::ZERO,
            avg_fill_price: Decimal::ZERO,
            limit_price: decision.limit_price,
            stop_price: None,
            submitted_at: chrono::Utc::now().to_rfc3339(),
            last_update_at: chrono::Utc::now().to_rfc3339(),
            status_message: "Order accepted".to_string(),
            legs: vec![],
        };

        Ok(order_state)
    }

    /// Get current order status from Alpaca.
    ///
    /// # Errors
    ///
    /// Returns an error if the API call fails.
    pub async fn get_order_status(&self, broker_order_id: &str) -> Result<OrderState, AlpacaError> {
        // In a real implementation, this would query Alpaca API.
        // For now, return a not-found error.
        Err(AlpacaError::Api {
            code: "404".to_string(),
            message: format!("Order {broker_order_id} not found"),
        })
    }

    /// Cancel an order.
    ///
    /// # Errors
    ///
    /// Returns an error if the cancellation fails.
    pub async fn cancel_order(&self, broker_order_id: &str) -> Result<(), AlpacaError> {
        tracing::info!(broker_order_id = %broker_order_id, "Canceling order");
        // In a real implementation, this would call Alpaca's cancel API.
        Ok(())
    }

    /// Get account information.
    ///
    /// # Errors
    ///
    /// Returns an error if the API call fails.
    pub async fn get_account(&self) -> Result<AccountInfo, AlpacaError> {
        // Simulated account info
        Ok(AccountInfo {
            account_id: "test-account".to_string(),
            equity: Decimal::new(100000, 0),
            buying_power: Decimal::new(200000, 0),
            cash: Decimal::new(50000, 0),
        })
    }
}

// Implement BrokerAdapter trait for AlpacaAdapter
#[async_trait::async_trait]
impl BrokerAdapter for AlpacaAdapter {
    async fn submit_orders(
        &self,
        request: &SubmitOrdersRequest,
    ) -> Result<ExecutionAck, BrokerError> {
        self.submit_orders(request)
            .await
            .map_err(|e| match e {
                AlpacaError::Http(msg) => BrokerError::Http(msg),
                AlpacaError::Api { code, message } => BrokerError::Api { code, message },
                AlpacaError::OrderRejected(msg) => BrokerError::OrderRejected(msg),
                AlpacaError::AuthenticationFailed => BrokerError::AuthenticationFailed,
                AlpacaError::RateLimited { retry_after_secs } => {
                    BrokerError::RateLimited { retry_after_secs }
                }
                AlpacaError::EnvironmentMismatch { expected, actual } => {
                    BrokerError::EnvironmentMismatch { expected, actual }
                }
            })
    }

    async fn get_order_status(&self, broker_order_id: &str) -> Result<OrderState, BrokerError> {
        self.get_order_status(broker_order_id)
            .await
            .map_err(|e| match e {
                AlpacaError::Http(msg) => BrokerError::Http(msg),
                AlpacaError::Api { code, message } => BrokerError::Api { code, message },
                AlpacaError::OrderRejected(msg) => BrokerError::OrderRejected(msg),
                AlpacaError::AuthenticationFailed => BrokerError::AuthenticationFailed,
                AlpacaError::RateLimited { retry_after_secs } => {
                    BrokerError::RateLimited { retry_after_secs }
                }
                AlpacaError::EnvironmentMismatch { expected, actual } => {
                    BrokerError::EnvironmentMismatch { expected, actual }
                }
            })
    }

    async fn cancel_order(&self, broker_order_id: &str) -> Result<(), BrokerError> {
        self.cancel_order(broker_order_id)
            .await
            .map_err(|e| match e {
                AlpacaError::Http(msg) => BrokerError::Http(msg),
                AlpacaError::Api { code, message } => BrokerError::Api { code, message },
                AlpacaError::OrderRejected(msg) => BrokerError::OrderRejected(msg),
                AlpacaError::AuthenticationFailed => BrokerError::AuthenticationFailed,
                AlpacaError::RateLimited { retry_after_secs } => {
                    BrokerError::RateLimited { retry_after_secs }
                }
                AlpacaError::EnvironmentMismatch { expected, actual } => {
                    BrokerError::EnvironmentMismatch { expected, actual }
                }
            })
    }

    fn broker_name(&self) -> &str {
        "Alpaca"
    }
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
}
