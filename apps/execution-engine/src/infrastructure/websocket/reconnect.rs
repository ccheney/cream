//! Reconnection Policy with Exponential Backoff and Jitter

use std::time::{Duration, Instant};

use rand::Rng;

use super::WebSocketConfig;

/// Reconnection policy with exponential backoff and full jitter.
///
/// Implements the "Full Jitter" algorithm recommended by AWS:
/// <https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/>
#[derive(Debug)]
pub struct ReconnectPolicy {
    /// Initial backoff duration.
    initial_backoff: Duration,
    /// Maximum backoff duration.
    max_backoff: Duration,
    /// Backoff multiplier.
    multiplier: f64,
    /// Maximum attempts before giving up.
    max_attempts: u32,
    /// Current attempt count.
    current_attempt: u32,
    /// Last attempt timestamp.
    last_attempt: Option<Instant>,
}

impl ReconnectPolicy {
    /// Create a new reconnect policy from configuration.
    #[must_use]
    #[allow(clippy::missing_const_for_fn)]
    pub fn new(config: &WebSocketConfig) -> Self {
        Self {
            initial_backoff: config.initial_backoff,
            max_backoff: config.max_backoff,
            multiplier: config.backoff_multiplier,
            max_attempts: config.max_reconnect_attempts,
            current_attempt: 0,
            last_attempt: None,
        }
    }

    /// Create with custom parameters.
    #[must_use]
    #[allow(clippy::missing_const_for_fn)]
    pub fn with_params(
        initial_backoff: Duration,
        max_backoff: Duration,
        multiplier: f64,
        max_attempts: u32,
    ) -> Self {
        Self {
            initial_backoff,
            max_backoff,
            multiplier,
            max_attempts,
            current_attempt: 0,
            last_attempt: None,
        }
    }

    /// Calculate the next backoff duration with jitter.
    ///
    /// Returns `None` if max attempts have been exceeded.
    #[must_use]
    #[allow(
        clippy::cast_precision_loss,
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss
    )]
    pub fn next_backoff(&mut self) -> Option<Duration> {
        if self.current_attempt >= self.max_attempts {
            return None;
        }

        let base_ms = self.initial_backoff.as_millis() as f64;
        let exponential = base_ms
            * self
                .multiplier
                .powi(i32::try_from(self.current_attempt).unwrap_or(i32::MAX));
        let capped = exponential.min(self.max_backoff.as_millis() as f64);

        // Full jitter: random value between 0 and capped
        let jitter = rand::rng().random_range(0.0..capped);

        self.current_attempt += 1;
        self.last_attempt = Some(Instant::now());

        Some(Duration::from_millis(jitter as u64))
    }

    /// Reset the policy after a successful connection.
    #[allow(clippy::missing_const_for_fn)]
    pub fn reset(&mut self) {
        self.current_attempt = 0;
        self.last_attempt = None;
    }

    /// Get the current attempt count.
    #[must_use]
    pub const fn current_attempt(&self) -> u32 {
        self.current_attempt
    }

    /// Get the maximum attempts allowed.
    #[must_use]
    pub const fn max_attempts(&self) -> u32 {
        self.max_attempts
    }

    /// Check if reconnection should be attempted.
    #[must_use]
    pub const fn should_reconnect(&self) -> bool {
        self.current_attempt < self.max_attempts
    }

    /// Get time since last attempt.
    #[must_use]
    pub fn time_since_last_attempt(&self) -> Option<Duration> {
        self.last_attempt.map(|t| t.elapsed())
    }
}

impl Default for ReconnectPolicy {
    fn default() -> Self {
        Self {
            initial_backoff: Duration::from_millis(500),
            max_backoff: Duration::from_secs(60),
            multiplier: 2.0,
            max_attempts: 10,
            current_attempt: 0,
            last_attempt: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconnect_policy_default() {
        let policy = ReconnectPolicy::default();
        assert_eq!(policy.current_attempt(), 0);
        assert_eq!(policy.max_attempts(), 10);
        assert!(policy.should_reconnect());
    }

    #[test]
    fn reconnect_policy_next_backoff() {
        let mut policy = ReconnectPolicy::with_params(
            Duration::from_millis(100),
            Duration::from_secs(10),
            2.0,
            5,
        );

        // First backoff should be between 0 and 100ms
        let first = policy.next_backoff().unwrap();
        assert!(first <= Duration::from_millis(100));

        // Second backoff should be between 0 and 200ms
        let second = policy.next_backoff().unwrap();
        assert!(second <= Duration::from_millis(200));

        assert_eq!(policy.current_attempt(), 2);
    }

    #[test]
    fn reconnect_policy_max_backoff_cap() {
        let mut policy =
            ReconnectPolicy::with_params(Duration::from_secs(1), Duration::from_secs(5), 10.0, 10);

        // After several attempts, backoff should be capped at max
        for _ in 0..5 {
            let backoff = policy.next_backoff().unwrap();
            assert!(backoff <= Duration::from_secs(5));
        }
    }

    #[test]
    fn reconnect_policy_exhausted() {
        let mut policy = ReconnectPolicy::with_params(
            Duration::from_millis(100),
            Duration::from_secs(1),
            2.0,
            3,
        );

        assert!(policy.next_backoff().is_some());
        assert!(policy.next_backoff().is_some());
        assert!(policy.next_backoff().is_some());
        assert!(policy.next_backoff().is_none());
        assert!(!policy.should_reconnect());
    }

    #[test]
    fn reconnect_policy_reset() {
        let mut policy = ReconnectPolicy::with_params(
            Duration::from_millis(100),
            Duration::from_secs(1),
            2.0,
            3,
        );

        let _ = policy.next_backoff();
        let _ = policy.next_backoff();
        assert_eq!(policy.current_attempt(), 2);

        policy.reset();
        assert_eq!(policy.current_attempt(), 0);
        assert!(policy.should_reconnect());
        assert!(policy.time_since_last_attempt().is_none());
    }

    #[test]
    fn reconnect_policy_time_since_last_attempt() {
        let mut policy = ReconnectPolicy::default();

        assert!(policy.time_since_last_attempt().is_none());

        let _ = policy.next_backoff();
        let elapsed = policy.time_since_last_attempt();
        assert!(elapsed.is_some());
        assert!(elapsed.unwrap() < Duration::from_secs(1));
    }
}
