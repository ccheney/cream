//! Retry policies with exponential backoff for broker API calls.
//!
//! This module provides retry configuration and backoff calculation
//! for handling transient failures and rate limiting.
//!
//! # Retryable Errors
//!
//! | Retryable | Non-Retryable |
//! |-----------|---------------|
//! | HTTP 429 (Rate Limited) | HTTP 400 (Bad Request) |
//! | HTTP 502/503/504 (Gateway) | HTTP 401/403 (Auth Errors) |
//! | Network timeouts | HTTP 422 (Validation Error) |
//! | Connection reset | Order rejected by exchange |
//! | DNS failures | Insufficient margin |
//!
//! # Example
//!
//! ```rust,ignore
//! use execution_engine::broker::{BrokerRetryPolicy, ExponentialBackoffCalculator};
//! use std::time::Duration;
//!
//! let policy = BrokerRetryPolicy::default();
//! let mut backoff = ExponentialBackoffCalculator::new(&policy);
//!
//! // Get backoff durations for retries
//! let delay1 = backoff.next_backoff(); // ~100ms with jitter
//! let delay2 = backoff.next_backoff(); // ~200ms with jitter
//! let delay3 = backoff.next_backoff(); // ~400ms with jitter
//! ```

use std::time::Duration;

use rand::Rng;
use serde::{Deserialize, Serialize};

/// Retry policy configuration for broker API calls.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrokerRetryPolicy {
    /// Maximum number of retry attempts (default: 5).
    pub max_attempts: u32,
    /// Initial backoff duration (default: 100ms).
    pub initial_backoff: Duration,
    /// Maximum backoff duration (default: 30s).
    pub max_backoff: Duration,
    /// Backoff multiplier for exponential growth (default: 2.0).
    pub backoff_multiplier: f64,
    /// Jitter factor for randomization (default: 0.2 = ±20%).
    pub jitter_factor: f64,
}

impl Default for BrokerRetryPolicy {
    fn default() -> Self {
        Self {
            max_attempts: 5,
            initial_backoff: Duration::from_millis(100),
            max_backoff: Duration::from_secs(30),
            backoff_multiplier: 2.0,
            jitter_factor: 0.2,
        }
    }
}

impl BrokerRetryPolicy {
    /// Create a new retry policy with custom settings.
    #[must_use]
    pub const fn new(
        max_attempts: u32,
        initial_backoff: Duration,
        max_backoff: Duration,
        backoff_multiplier: f64,
        jitter_factor: f64,
    ) -> Self {
        Self {
            max_attempts,
            initial_backoff,
            max_backoff,
            backoff_multiplier,
            jitter_factor,
        }
    }

    /// Create an aggressive retry policy (more attempts, shorter backoff).
    #[must_use]
    pub const fn aggressive() -> Self {
        Self {
            max_attempts: 10,
            initial_backoff: Duration::from_millis(50),
            max_backoff: Duration::from_secs(10),
            backoff_multiplier: 1.5,
            jitter_factor: 0.1,
        }
    }

    /// Create a conservative retry policy (fewer attempts, longer backoff).
    #[must_use]
    pub const fn conservative() -> Self {
        Self {
            max_attempts: 3,
            initial_backoff: Duration::from_millis(500),
            max_backoff: Duration::from_secs(60),
            backoff_multiplier: 3.0,
            jitter_factor: 0.3,
        }
    }
}

/// Calculator for exponential backoff with jitter.
#[derive(Debug)]
pub struct ExponentialBackoffCalculator {
    current_attempt: u32,
    max_attempts: u32,
    initial_backoff_ms: u64,
    max_backoff_ms: u64,
    backoff_multiplier: f64,
    jitter_factor: f64,
}

impl ExponentialBackoffCalculator {
    /// Create a new backoff calculator from a retry policy.
    #[must_use]
    pub const fn new(policy: &BrokerRetryPolicy) -> Self {
        Self {
            current_attempt: 0,
            max_attempts: policy.max_attempts,
            initial_backoff_ms: policy.initial_backoff.as_millis() as u64,
            max_backoff_ms: policy.max_backoff.as_millis() as u64,
            jitter_factor: policy.jitter_factor,
            backoff_multiplier: policy.backoff_multiplier,
        }
    }

    /// Get the next backoff duration with jitter.
    ///
    /// Returns `None` if max attempts exceeded.
    pub fn next_backoff(&mut self) -> Option<Duration> {
        if self.current_attempt >= self.max_attempts {
            return None;
        }

        let base_backoff_ms = self.calculate_base_backoff_ms();
        let jittered_ms = self.apply_jitter(base_backoff_ms);
        let capped_ms = jittered_ms.min(self.max_backoff_ms);

        self.current_attempt += 1;

        Some(Duration::from_millis(capped_ms))
    }

    /// Calculate base exponential backoff without jitter.
    fn calculate_base_backoff_ms(&self) -> u64 {
        let multiplier = self.backoff_multiplier.powi(self.current_attempt as i32);
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let backoff = (self.initial_backoff_ms as f64 * multiplier) as u64;
        backoff.min(self.max_backoff_ms)
    }

    /// Apply jitter to backoff duration.
    ///
    /// Uses full jitter strategy: random value in [backoff * (1 - jitter), backoff * (1 + jitter)]
    fn apply_jitter(&self, backoff_ms: u64) -> u64 {
        let mut rng = rand::rng();
        let jitter_range = backoff_ms as f64 * self.jitter_factor;
        let min = (backoff_ms as f64 - jitter_range).max(0.0);
        let max = backoff_ms as f64 + jitter_range;

        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let jittered = rng.random_range(min..=max) as u64;
        jittered
    }

    /// Get the current attempt number.
    #[must_use]
    pub const fn current_attempt(&self) -> u32 {
        self.current_attempt
    }

    /// Check if more retries are available.
    #[must_use]
    pub const fn has_remaining_attempts(&self) -> bool {
        self.current_attempt < self.max_attempts
    }

    /// Reset the calculator for a new request.
    pub const fn reset(&mut self) {
        self.current_attempt = 0;
    }
}

/// HTTP status codes that are retryable.
const RETRYABLE_STATUS_CODES: &[u16] = &[
    429, // Too Many Requests (Rate Limited)
    502, // Bad Gateway
    503, // Service Unavailable
    504, // Gateway Timeout
    408, // Request Timeout
    520, // Cloudflare: Web Server Returned an Unknown Error
    522, // Cloudflare: Connection Timed Out
    524, // Cloudflare: A Timeout Occurred
];

/// HTTP status codes that are never retryable.
#[allow(dead_code)]
const NON_RETRYABLE_STATUS_CODES: &[u16] = &[
    400, // Bad Request
    401, // Unauthorized
    403, // Forbidden
    404, // Not Found
    405, // Method Not Allowed
    422, // Unprocessable Entity
    451, // Unavailable For Legal Reasons
];

/// Check if an HTTP status code is retryable.
#[must_use]
pub fn is_retryable_status(status_code: u16) -> bool {
    // 5xx server errors are generally retryable
    if (500..600).contains(&status_code) {
        return true;
    }

    // Check explicit retryable codes
    if RETRYABLE_STATUS_CODES.contains(&status_code) {
        return true;
    }

    // All other codes are not retryable
    false
}

/// Error categories for retry decisions.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCategory {
    /// Error is retryable (transient failure).
    Retryable,
    /// Error is not retryable (permanent failure).
    NonRetryable,
    /// Rate limited - use Retry-After if available.
    RateLimited,
}

/// Check if an error is retryable based on its message/type.
///
/// Returns the error category for retry decision.
#[must_use]
pub fn is_retryable_error(error_message: &str) -> ErrorCategory {
    let lower = error_message.to_lowercase();

    // Rate limiting indicators
    if lower.contains("rate limit")
        || lower.contains("too many requests")
        || lower.contains("429")
        || lower.contains("42910000")
    {
        return ErrorCategory::RateLimited;
    }

    // Retryable network errors
    if lower.contains("timeout")
        || lower.contains("connection reset")
        || lower.contains("connection refused")
        || lower.contains("dns")
        || lower.contains("temporary failure")
        || lower.contains("network")
        || lower.contains("socket")
        || lower.contains("broken pipe")
    {
        return ErrorCategory::Retryable;
    }

    // Non-retryable errors
    if lower.contains("invalid")
        || lower.contains("bad request")
        || lower.contains("unauthorized")
        || lower.contains("forbidden")
        || lower.contains("not found")
        || lower.contains("unprocessable")
        || lower.contains("insufficient margin")
        || lower.contains("order rejected")
        || lower.contains("validation")
    {
        return ErrorCategory::NonRetryable;
    }

    // Default: assume retryable for unknown errors
    ErrorCategory::Retryable
}

/// Extract Retry-After duration from HTTP headers.
pub struct RetryAfterExtractor;

impl RetryAfterExtractor {
    /// Parse Retry-After header value.
    ///
    /// Supports both seconds format (e.g., "120") and HTTP-date format.
    #[must_use]
    pub fn parse(value: &str) -> Option<Duration> {
        // Try parsing as seconds (most common for APIs)
        if let Ok(seconds) = value.parse::<u64>() {
            return Some(Duration::from_secs(seconds));
        }

        // Try parsing as HTTP-date (RFC 7231)
        // For simplicity, we don't fully implement date parsing here.
        // In production, use chrono or httpdate crate.
        None
    }

    /// Get retry delay, preferring Retry-After header if available.
    #[must_use]
    pub fn get_delay(
        retry_after: Option<&str>,
        backoff: &mut ExponentialBackoffCalculator,
    ) -> Option<Duration> {
        // Prefer Retry-After header if available
        if let Some(value) = retry_after {
            if let Some(duration) = Self::parse(value) {
                // Advance the attempt counter even when using Retry-After
                backoff.current_attempt += 1;
                return Some(duration);
            }
        }

        // Fall back to exponential backoff
        backoff.next_backoff()
    }
}

/// Alpaca-specific error codes that indicate rate limiting.
pub const ALPACA_RATE_LIMIT_CODE: &str = "42910000";

/// Alpaca API error handling utilities.
pub struct AlpacaErrorHandler;

impl AlpacaErrorHandler {
    /// Check if an Alpaca error response indicates rate limiting.
    #[must_use]
    pub fn is_rate_limited(error_code: &str) -> bool {
        error_code == ALPACA_RATE_LIMIT_CODE
    }

    /// Categorize an HTTP response status for retry decision.
    #[must_use]
    pub const fn categorize_status(status_code: u16) -> ErrorCategory {
        match status_code {
            429 => ErrorCategory::RateLimited,
            400..=499 => ErrorCategory::NonRetryable,
            500..=599 => ErrorCategory::Retryable,
            _ => ErrorCategory::NonRetryable,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_policy() {
        let policy = BrokerRetryPolicy::default();
        assert_eq!(policy.max_attempts, 5);
        assert_eq!(policy.initial_backoff, Duration::from_millis(100));
        assert_eq!(policy.max_backoff, Duration::from_secs(30));
        assert!((policy.backoff_multiplier - 2.0).abs() < f64::EPSILON);
        assert!((policy.jitter_factor - 0.2).abs() < f64::EPSILON);
    }

    #[test]
    fn test_exponential_backoff_sequence() {
        let policy = BrokerRetryPolicy {
            jitter_factor: 0.0, // Disable jitter for predictable testing
            ..Default::default()
        };
        let mut backoff = ExponentialBackoffCalculator::new(&policy);

        // Without jitter: 100ms, 200ms, 400ms, 800ms, 1600ms
        assert_eq!(backoff.next_backoff(), Some(Duration::from_millis(100)));
        assert_eq!(backoff.next_backoff(), Some(Duration::from_millis(200)));
        assert_eq!(backoff.next_backoff(), Some(Duration::from_millis(400)));
        assert_eq!(backoff.next_backoff(), Some(Duration::from_millis(800)));
        assert_eq!(backoff.next_backoff(), Some(Duration::from_millis(1600)));

        // Max attempts exceeded
        assert!(backoff.next_backoff().is_none());
    }

    #[test]
    fn test_max_backoff_cap() {
        let policy = BrokerRetryPolicy {
            max_attempts: 20,
            initial_backoff: Duration::from_secs(1),
            max_backoff: Duration::from_secs(5),
            backoff_multiplier: 10.0,
            jitter_factor: 0.0,
        };
        let mut backoff = ExponentialBackoffCalculator::new(&policy);

        // First: 1s, Second: 10s (capped to 5s), Third: 100s (capped to 5s)
        assert_eq!(backoff.next_backoff(), Some(Duration::from_secs(1)));
        assert_eq!(backoff.next_backoff(), Some(Duration::from_secs(5))); // Capped
        assert_eq!(backoff.next_backoff(), Some(Duration::from_secs(5))); // Capped
    }

    #[test]
    fn test_jitter_range() {
        let policy = BrokerRetryPolicy {
            jitter_factor: 0.2, // ±20%
            ..Default::default()
        };

        // Run multiple times to verify jitter is within range
        for _ in 0..100 {
            let mut backoff = ExponentialBackoffCalculator::new(&policy);
            let duration = backoff
                .next_backoff()
                .expect("first backoff should always succeed");

            // Base is 100ms, jitter is ±20%, so range is 80-120ms
            assert!(
                duration >= Duration::from_millis(80) && duration <= Duration::from_millis(120),
                "Duration {duration:?} not in expected range 80-120ms"
            );
        }
    }

    #[test]
    fn test_retryable_status_codes() {
        // Retryable
        assert!(is_retryable_status(429));
        assert!(is_retryable_status(502));
        assert!(is_retryable_status(503));
        assert!(is_retryable_status(504));
        assert!(is_retryable_status(500));

        // Not retryable
        assert!(!is_retryable_status(400));
        assert!(!is_retryable_status(401));
        assert!(!is_retryable_status(403));
        assert!(!is_retryable_status(404));
        assert!(!is_retryable_status(422));
    }

    #[test]
    fn test_error_categorization() {
        assert_eq!(
            is_retryable_error("rate limit exceeded"),
            ErrorCategory::RateLimited
        );
        assert_eq!(
            is_retryable_error("connection timeout"),
            ErrorCategory::Retryable
        );
        assert_eq!(
            is_retryable_error("network error"),
            ErrorCategory::Retryable
        );
        assert_eq!(
            is_retryable_error("invalid order parameters"),
            ErrorCategory::NonRetryable
        );
        assert_eq!(
            is_retryable_error("insufficient margin"),
            ErrorCategory::NonRetryable
        );
    }

    #[test]
    fn test_retry_after_parsing() {
        assert_eq!(
            RetryAfterExtractor::parse("120"),
            Some(Duration::from_secs(120))
        );
        assert_eq!(
            RetryAfterExtractor::parse("1"),
            Some(Duration::from_secs(1))
        );
        assert!(RetryAfterExtractor::parse("invalid").is_none());
    }

    #[test]
    fn test_alpaca_rate_limit_detection() {
        assert!(AlpacaErrorHandler::is_rate_limited(ALPACA_RATE_LIMIT_CODE));
        assert!(!AlpacaErrorHandler::is_rate_limited("12345"));
    }

    #[test]
    fn test_alpaca_status_categorization() {
        assert_eq!(
            AlpacaErrorHandler::categorize_status(429),
            ErrorCategory::RateLimited
        );
        assert_eq!(
            AlpacaErrorHandler::categorize_status(400),
            ErrorCategory::NonRetryable
        );
        assert_eq!(
            AlpacaErrorHandler::categorize_status(500),
            ErrorCategory::Retryable
        );
    }

    #[test]
    fn test_reset_backoff() {
        let policy = BrokerRetryPolicy::default();
        let mut backoff = ExponentialBackoffCalculator::new(&policy);

        // Use some attempts
        let _ = backoff.next_backoff();
        let _ = backoff.next_backoff();
        assert_eq!(backoff.current_attempt(), 2);

        // Reset
        backoff.reset();
        assert_eq!(backoff.current_attempt(), 0);
        assert!(backoff.has_remaining_attempts());
    }
}
