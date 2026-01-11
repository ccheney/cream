//! Circuit breaker configuration for resilience.

use std::time::Duration;

use serde::{Deserialize, Serialize};

/// Circuit breaker configuration.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CircuitBreakerConfig {
    /// Default circuit breaker settings.
    #[serde(default)]
    pub default: CircuitBreakerSettings,
    /// Alpaca-specific settings.
    #[serde(default)]
    pub alpaca: Option<CircuitBreakerSettings>,
}

/// Circuit breaker settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitBreakerSettings {
    /// Failure rate threshold to open circuit.
    #[serde(default = "default_failure_rate_threshold")]
    pub failure_rate_threshold: f64,
    /// Minimum calls before evaluating.
    #[serde(default = "default_minimum_calls")]
    pub minimum_calls: u32,
    /// Duration in open state (seconds).
    #[serde(default = "default_wait_duration")]
    pub wait_duration_secs: u64,
    /// Calls permitted in half-open state.
    #[serde(default = "default_permitted_calls")]
    pub permitted_calls_in_half_open: u32,
    /// Sliding window type.
    #[serde(default = "default_sliding_window_type")]
    pub sliding_window_type: String,
    /// Sliding window size.
    #[serde(default = "default_sliding_window_size")]
    pub sliding_window_size: u32,
}

impl Default for CircuitBreakerSettings {
    fn default() -> Self {
        Self {
            failure_rate_threshold: default_failure_rate_threshold(),
            minimum_calls: default_minimum_calls(),
            wait_duration_secs: default_wait_duration(),
            permitted_calls_in_half_open: default_permitted_calls(),
            sliding_window_type: default_sliding_window_type(),
            sliding_window_size: default_sliding_window_size(),
        }
    }
}

impl CircuitBreakerSettings {
    /// Convert config settings to resilience module's `CircuitBreakerConfig`.
    #[must_use]
    pub fn to_resilience_config(&self) -> crate::resilience::CircuitBreakerConfig {
        crate::resilience::CircuitBreakerConfig {
            failure_rate_threshold: self.failure_rate_threshold,
            sliding_window_size: self.sliding_window_size,
            minimum_calls: self.minimum_calls,
            wait_duration_in_open: Duration::from_secs(self.wait_duration_secs),
            permitted_calls_in_half_open: self.permitted_calls_in_half_open,
            call_timeout: Duration::from_secs(5), // Default timeout
        }
    }
}

impl CircuitBreakerConfig {
    /// Get the circuit breaker config for Alpaca, falling back to defaults.
    #[must_use]
    pub fn alpaca_config(&self) -> crate::resilience::CircuitBreakerConfig {
        self.alpaca.as_ref().map_or_else(
            || self.default.to_resilience_config(),
            CircuitBreakerSettings::to_resilience_config,
        )
    }
}

pub(crate) const fn default_failure_rate_threshold() -> f64 {
    0.5
}

const fn default_minimum_calls() -> u32 {
    5
}

const fn default_wait_duration() -> u64 {
    30
}

const fn default_permitted_calls() -> u32 {
    3
}

fn default_sliding_window_type() -> String {
    "count".to_string()
}

const fn default_sliding_window_size() -> u32 {
    10
}
