//! Reconnection Policy
//!
//! Implements exponential backoff with jitter for WebSocket reconnection.
//! This module provides a configurable policy for handling connection failures
//! and automatic reconnection attempts.

use std::time::Duration;

use rand::Rng;

/// Configuration for reconnection behavior.
#[derive(Debug, Clone)]
pub struct ReconnectConfig {
    /// Initial delay before first reconnection attempt.
    pub initial_delay: Duration,
    /// Maximum delay between reconnection attempts.
    pub max_delay: Duration,
    /// Multiplier for exponential backoff (e.g., 2.0 doubles delay each attempt).
    pub multiplier: f64,
    /// Jitter factor as a fraction (e.g., 0.1 = ±10% randomization).
    pub jitter_factor: f64,
    /// Maximum number of reconnection attempts (0 = unlimited).
    pub max_attempts: u32,
}

impl Default for ReconnectConfig {
    fn default() -> Self {
        Self {
            initial_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(64),
            multiplier: 2.0,
            jitter_factor: 0.1,
            max_attempts: 0, // Unlimited
        }
    }
}

impl ReconnectConfig {
    /// Create a new configuration with custom values.
    #[must_use]
    pub const fn new(
        initial_delay: Duration,
        max_delay: Duration,
        multiplier: f64,
        jitter_factor: f64,
        max_attempts: u32,
    ) -> Self {
        Self {
            initial_delay,
            max_delay,
            multiplier,
            jitter_factor,
            max_attempts,
        }
    }

    /// Create configuration from `WebSocketSettings`.
    #[must_use]
    pub const fn from_websocket_settings(settings: &crate::WebSocketSettings) -> Self {
        Self {
            initial_delay: settings.reconnect_delay_initial,
            max_delay: settings.reconnect_delay_max,
            multiplier: settings.reconnect_delay_multiplier,
            jitter_factor: 0.1, // Default jitter
            max_attempts: settings.max_reconnect_attempts,
        }
    }
}

/// Reconnection policy implementing exponential backoff with jitter.
///
/// # Example
///
/// ```rust
/// use alpaca_stream_proxy::infrastructure::alpaca::reconnect::{ReconnectConfig, ReconnectPolicy};
/// use std::time::Duration;
///
/// let config = ReconnectConfig::default();
/// let mut policy = ReconnectPolicy::new(config);
///
/// // Get delay for first attempt
/// let delay1 = policy.next_delay();
/// assert!(delay1.is_some());
///
/// // Simulate successful connection
/// policy.reset();
/// ```
#[derive(Debug)]
pub struct ReconnectPolicy {
    config: ReconnectConfig,
    current_delay: Duration,
    attempt_count: u32,
}

impl ReconnectPolicy {
    /// Create a new reconnection policy.
    #[must_use]
    pub const fn new(config: ReconnectConfig) -> Self {
        let initial_delay = config.initial_delay;
        Self {
            config,
            current_delay: initial_delay,
            attempt_count: 0,
        }
    }

    /// Get the next delay duration, applying exponential backoff with jitter.
    ///
    /// Returns `None` if max attempts have been exceeded.
    #[must_use]
    pub fn next_delay(&mut self) -> Option<Duration> {
        // Check if we've exceeded max attempts
        if self.config.max_attempts > 0 && self.attempt_count >= self.config.max_attempts {
            return None;
        }

        self.attempt_count += 1;

        // Calculate delay with jitter
        let delay_with_jitter = self.apply_jitter(self.current_delay);

        // Calculate next delay (for subsequent calls)
        #[allow(clippy::cast_precision_loss)]
        let scaled = (self.current_delay.as_millis() as f64 * self.config.multiplier).round();
        let next_millis = if scaled.is_finite() && scaled > 0.0 {
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            {
                scaled as u128
            }
        } else {
            0
        };
        let max_millis = self.config.max_delay.as_millis();
        let capped = next_millis.min(max_millis);
        let capped_u64 = u64::try_from(capped).unwrap_or(u64::MAX);
        self.current_delay = Duration::from_millis(capped_u64);

        Some(delay_with_jitter)
    }

    /// Reset the policy after a successful connection.
    pub const fn reset(&mut self) {
        self.current_delay = self.config.initial_delay;
        self.attempt_count = 0;
    }

    /// Get the current attempt count.
    #[must_use]
    pub const fn attempt_count(&self) -> u32 {
        self.attempt_count
    }

    /// Check if reconnection should continue.
    #[must_use]
    pub const fn should_retry(&self) -> bool {
        self.config.max_attempts == 0 || self.attempt_count < self.config.max_attempts
    }

    /// Apply jitter to a duration.
    fn apply_jitter(&self, duration: Duration) -> Duration {
        if self.config.jitter_factor <= 0.0 {
            return duration;
        }

        #[allow(clippy::cast_precision_loss)]
        let base_millis = duration.as_millis() as f64;
        let jitter_range = base_millis * self.config.jitter_factor;
        let mut rng = rand::rng();
        let jitter: f64 = rng.random_range(-jitter_range..=jitter_range);
        let adjusted_millis = (base_millis + jitter).max(1.0);

        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let adjusted_u64 = adjusted_millis as u64;
        Duration::from_millis(adjusted_u64)
    }
}

/// Error type for reconnection failures.
#[derive(Debug, thiserror::Error)]
pub enum ReconnectError {
    /// Maximum reconnection attempts exceeded.
    #[error("maximum reconnection attempts ({0}) exceeded")]
    MaxAttemptsExceeded(u32),
    /// Connection failed with reason.
    #[error("connection failed: {0}")]
    ConnectionFailed(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_values() {
        let config = ReconnectConfig::default();
        assert_eq!(config.initial_delay, Duration::from_secs(1));
        assert_eq!(config.max_delay, Duration::from_secs(64));
        assert!((config.multiplier - 2.0).abs() < f64::EPSILON);
        assert!((config.jitter_factor - 0.1).abs() < f64::EPSILON);
        assert_eq!(config.max_attempts, 0);
    }

    #[test]
    fn policy_exponential_backoff() {
        let config = ReconnectConfig {
            initial_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(10),
            multiplier: 2.0,
            jitter_factor: 0.0, // No jitter for predictable testing
            max_attempts: 0,
        };
        let mut policy = ReconnectPolicy::new(config);

        // First delay should be initial_delay
        let d1 = policy.next_delay().unwrap();
        assert_eq!(d1, Duration::from_millis(100));

        // Second delay should be 200ms (100 * 2)
        let d2 = policy.next_delay().unwrap();
        assert_eq!(d2, Duration::from_millis(200));

        // Third delay should be 400ms (200 * 2)
        let d3 = policy.next_delay().unwrap();
        assert_eq!(d3, Duration::from_millis(400));

        // Fourth delay should be 800ms (400 * 2)
        let d4 = policy.next_delay().unwrap();
        assert_eq!(d4, Duration::from_millis(800));
    }

    #[test]
    fn policy_max_delay_cap() {
        let config = ReconnectConfig {
            initial_delay: Duration::from_millis(1000),
            max_delay: Duration::from_millis(2000),
            multiplier: 4.0,
            jitter_factor: 0.0,
            max_attempts: 0,
        };
        let mut policy = ReconnectPolicy::new(config);

        // First delay: 1000ms
        let _ = policy.next_delay();

        // Second delay should be capped at 2000ms (not 4000ms)
        let d2 = policy.next_delay().unwrap();
        assert_eq!(d2, Duration::from_millis(2000));

        // Third delay should still be capped
        let d3 = policy.next_delay().unwrap();
        assert_eq!(d3, Duration::from_millis(2000));
    }

    #[test]
    fn policy_max_attempts() {
        let config = ReconnectConfig {
            initial_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(1),
            multiplier: 2.0,
            jitter_factor: 0.0,
            max_attempts: 3,
        };
        let mut policy = ReconnectPolicy::new(config);

        // Should allow 3 attempts
        assert!(policy.next_delay().is_some());
        assert_eq!(policy.attempt_count(), 1);

        assert!(policy.next_delay().is_some());
        assert_eq!(policy.attempt_count(), 2);

        assert!(policy.next_delay().is_some());
        assert_eq!(policy.attempt_count(), 3);

        // Fourth attempt should fail
        assert!(policy.next_delay().is_none());
        assert!(!policy.should_retry());
    }

    #[test]
    fn policy_reset() {
        let config = ReconnectConfig {
            initial_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(10),
            multiplier: 2.0,
            jitter_factor: 0.0,
            max_attempts: 3,
        };
        let mut policy = ReconnectPolicy::new(config);

        // Make some attempts
        let _ = policy.next_delay();
        let _ = policy.next_delay();
        assert_eq!(policy.attempt_count(), 2);

        // Reset
        policy.reset();

        // Should be back to initial state
        assert_eq!(policy.attempt_count(), 0);
        assert!(policy.should_retry());

        // Next delay should be initial_delay again
        let d = policy.next_delay().unwrap();
        assert_eq!(d, Duration::from_millis(100));
    }

    #[test]
    fn policy_jitter_bounds() {
        // Run multiple times to test jitter distribution
        for _ in 0..100 {
            let mut test_policy = ReconnectPolicy::new(ReconnectConfig {
                initial_delay: Duration::from_millis(1000),
                max_delay: Duration::from_secs(10),
                multiplier: 2.0,
                jitter_factor: 0.1,
                max_attempts: 0,
            });

            let delay = test_policy.next_delay().unwrap();
            let millis = delay.as_millis();

            // Should be within ±10% of 1000ms
            assert!(millis >= 900, "delay {millis}ms is below minimum 900ms");
            assert!(millis <= 1100, "delay {millis}ms is above maximum 1100ms");
        }
    }

    #[test]
    fn unlimited_attempts() {
        let config = ReconnectConfig {
            max_attempts: 0, // Unlimited
            ..Default::default()
        };
        let mut policy = ReconnectPolicy::new(config);

        // Should always retry
        for _ in 0..1000 {
            assert!(policy.should_retry());
            assert!(policy.next_delay().is_some());
        }
    }
}
