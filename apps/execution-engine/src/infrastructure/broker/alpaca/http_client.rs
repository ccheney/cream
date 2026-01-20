//! HTTP client wrapper with retry logic.

use std::time::Duration;

use reqwest::{Client, StatusCode};
use serde::Serialize;
use serde::de::DeserializeOwned;

use super::api_types::AlpacaErrorResponse;
use super::config::{AlpacaConfig, RetryConfig};
use super::error::AlpacaError;

/// HTTP client for Alpaca API with retry logic.
#[derive(Debug, Clone)]
pub struct AlpacaHttpClient {
    client: Client,
    api_key: String,
    api_secret: String,
    trading_base_url: String,
    data_base_url: String,
    retry_config: RetryConfig,
}

impl AlpacaHttpClient {
    /// Create a new HTTP client from config.
    pub fn new(config: &AlpacaConfig) -> Result<Self, AlpacaError> {
        if config.api_key.is_empty() || config.api_secret.is_empty() {
            return Err(AlpacaError::AuthenticationFailed);
        }

        let client = Client::builder()
            .timeout(config.timeout)
            .build()
            .map_err(|e| AlpacaError::Network(e.to_string()))?;

        Ok(Self {
            client,
            api_key: config.api_key.clone(),
            api_secret: config.api_secret.clone(),
            trading_base_url: config.trading_base_url().to_string(),
            data_base_url: config.data_base_url().to_string(),
            retry_config: config.retry.clone(),
        })
    }

    /// Make a GET request to the trading API.
    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T, AlpacaError> {
        self.request("GET", &self.trading_base_url, path, None::<&()>)
            .await
    }

    /// Make a POST request to the trading API.
    #[allow(clippy::future_not_send)]
    pub async fn post<T: DeserializeOwned, B: Serialize>(
        &self,
        path: &str,
        body: &B,
    ) -> Result<T, AlpacaError> {
        self.request("POST", &self.trading_base_url, path, Some(body))
            .await
    }

    /// Make a DELETE request to the trading API.
    pub async fn delete(&self, path: &str) -> Result<(), AlpacaError> {
        let _: serde_json::Value = self
            .request("DELETE", &self.trading_base_url, path, None::<&()>)
            .await?;
        Ok(())
    }

    /// Make a GET request to the data API.
    ///
    /// Reserved for market data API access (quotes, bars, etc.).
    #[allow(dead_code)]
    pub async fn data_get<T: DeserializeOwned>(&self, path: &str) -> Result<T, AlpacaError> {
        self.request("GET", &self.data_base_url, path, None::<&()>)
            .await
    }

    /// Internal request implementation with retry logic.
    #[allow(clippy::future_not_send, clippy::too_many_lines)]
    async fn request<T: DeserializeOwned, B: Serialize>(
        &self,
        method: &str,
        base_url: &str,
        path: &str,
        body: Option<&B>,
    ) -> Result<T, AlpacaError> {
        let url = format!("{base_url}{path}");
        let mut backoff = ExponentialBackoff::new(&self.retry_config);

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
                    if let Some(delay) = backoff.next_backoff() {
                        tracing::warn!(
                            error = %e,
                            delay_ms = delay.as_millis(),
                            attempt = backoff.attempt,
                            "Network error, retrying"
                        );
                        tokio::time::sleep(delay).await;
                        continue;
                    }
                    return Err(AlpacaError::MaxRetriesExceeded {
                        attempts: backoff.attempt,
                    });
                }
            };

            let status = response.status();

            if status.is_success() {
                let text = response
                    .text()
                    .await
                    .map_err(|e| AlpacaError::Network(e.to_string()))?;
                if text.is_empty() {
                    return serde_json::from_str("null")
                        .map_err(|e| AlpacaError::JsonParse(e.to_string()));
                }
                return serde_json::from_str(&text)
                    .map_err(|e| AlpacaError::JsonParse(e.to_string()));
            }

            // Handle error response
            let retry_after = response
                .headers()
                .get("Retry-After")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok());

            let error_body = response.text().await.unwrap_or_default();

            let (error_code, error_message) =
                match serde_json::from_str::<AlpacaErrorResponse>(&error_body) {
                    Ok(err) => (
                        err.code.unwrap_or_else(|| status.as_u16().to_string()),
                        err.message,
                    ),
                    Err(_) => (status.as_u16().to_string(), error_body),
                };

            // Categorize and handle error
            match categorize_status(status) {
                ErrorCategory::RateLimited => {
                    let delay = retry_after
                        .map(Duration::from_secs)
                        .or_else(|| backoff.next_backoff());
                    if let Some(delay) = delay {
                        tracing::warn!(
                            code = %error_code,
                            delay_ms = delay.as_millis(),
                            "Rate limited, retrying"
                        );
                        tokio::time::sleep(delay).await;
                        continue;
                    }
                    return Err(AlpacaError::RateLimited {
                        retry_after_secs: retry_after.unwrap_or(60),
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
                        attempts: backoff.attempt,
                    });
                }
                ErrorCategory::NonRetryable => {
                    return match status {
                        StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN => {
                            Err(AlpacaError::AuthenticationFailed)
                        }
                        StatusCode::NOT_FOUND => Err(AlpacaError::OrderNotFound {
                            order_id: path.to_string(),
                        }),
                        StatusCode::UNPROCESSABLE_ENTITY => {
                            Err(AlpacaError::OrderRejected(error_message))
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
}

/// Error category for determining retry behavior.
enum ErrorCategory {
    RateLimited,
    Retryable,
    NonRetryable,
}

/// Categorize HTTP status code for retry handling.
const fn categorize_status(status: StatusCode) -> ErrorCategory {
    match status.as_u16() {
        429 => ErrorCategory::RateLimited,
        408 | 500 | 502 | 503 | 504 => ErrorCategory::Retryable,
        _ => ErrorCategory::NonRetryable,
    }
}

/// Exponential backoff calculator.
struct ExponentialBackoff {
    attempt: u32,
    max_attempts: u32,
    current_backoff: Duration,
    max_backoff: Duration,
    multiplier: f64,
}

impl ExponentialBackoff {
    const fn new(config: &RetryConfig) -> Self {
        Self {
            attempt: 0,
            max_attempts: config.max_attempts,
            current_backoff: config.initial_backoff,
            max_backoff: config.max_backoff,
            multiplier: config.multiplier,
        }
    }

    fn next_backoff(&mut self) -> Option<Duration> {
        self.attempt += 1;
        if self.attempt >= self.max_attempts {
            return None;
        }

        let backoff = self.current_backoff;
        self.current_backoff = Duration::from_secs_f64(
            (self.current_backoff.as_secs_f64() * self.multiplier)
                .min(self.max_backoff.as_secs_f64()),
        );

        Some(backoff)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn categorize_rate_limited() {
        assert!(matches!(
            categorize_status(StatusCode::TOO_MANY_REQUESTS),
            ErrorCategory::RateLimited
        ));
    }

    #[test]
    fn categorize_retryable() {
        assert!(matches!(
            categorize_status(StatusCode::INTERNAL_SERVER_ERROR),
            ErrorCategory::Retryable
        ));
        assert!(matches!(
            categorize_status(StatusCode::BAD_GATEWAY),
            ErrorCategory::Retryable
        ));
        assert!(matches!(
            categorize_status(StatusCode::SERVICE_UNAVAILABLE),
            ErrorCategory::Retryable
        ));
    }

    #[test]
    fn categorize_non_retryable() {
        assert!(matches!(
            categorize_status(StatusCode::BAD_REQUEST),
            ErrorCategory::NonRetryable
        ));
        assert!(matches!(
            categorize_status(StatusCode::NOT_FOUND),
            ErrorCategory::NonRetryable
        ));
        assert!(matches!(
            categorize_status(StatusCode::UNAUTHORIZED),
            ErrorCategory::NonRetryable
        ));
    }

    #[test]
    fn exponential_backoff_increments() {
        let config = RetryConfig {
            max_attempts: 5,
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_secs(10),
            multiplier: 2.0,
        };

        let mut backoff = ExponentialBackoff::new(&config);

        // First backoff: 100ms
        let first = backoff.next_backoff().unwrap();
        assert_eq!(first, Duration::from_millis(100));

        // Second backoff: 200ms
        let second = backoff.next_backoff().unwrap();
        assert_eq!(second, Duration::from_millis(200));

        // Third backoff: 400ms
        let third = backoff.next_backoff().unwrap();
        assert_eq!(third, Duration::from_millis(400));

        // Fourth backoff: 800ms
        let fourth = backoff.next_backoff().unwrap();
        assert_eq!(fourth, Duration::from_millis(800));

        // Fifth attempt (attempt 5 >= max_attempts 5): None
        let fifth = backoff.next_backoff();
        assert!(fifth.is_none());
    }

    #[test]
    fn exponential_backoff_respects_max() {
        let config = RetryConfig {
            max_attempts: 10,
            initial_backoff: Duration::from_secs(1),
            max_backoff: Duration::from_secs(5),
            multiplier: 10.0,
        };

        let mut backoff = ExponentialBackoff::new(&config);

        // First: 1s
        backoff.next_backoff();
        // Second: should be capped at 5s (not 10s)
        let second = backoff.next_backoff().unwrap();
        assert_eq!(second, Duration::from_secs(5));
    }
}
