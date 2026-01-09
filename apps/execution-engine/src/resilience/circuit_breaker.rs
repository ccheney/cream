//! Circuit breaker implementation for external service resilience.
//!
//! Prevents cascading failures when external services (Alpaca, Databento)
//! become unavailable or unresponsive.
//!
//! # State Machine
//!
//! ```text
//! CLOSED → OPEN (failure rate >= threshold)
//! OPEN → HALF_OPEN (wait duration elapsed)
//! HALF_OPEN → CLOSED (test calls succeed)
//! HALF_OPEN → OPEN (test calls fail)
//! ```
//!
//! # Configuration
//!
//! - `failure_rate_threshold`: Open at this failure rate (default: 50%)
//! - `sliding_window_size`: Number of calls to track (default: 20)
//! - `minimum_calls`: Minimum calls before evaluating (default: 5)
//! - `wait_duration_in_open`: Time to stay open (default: 10s)
//! - `permitted_calls_in_half_open`: Test calls allowed (default: 3)
//! - `call_timeout`: Maximum call duration (default: 5s)
//!
//! # Example
//!
//! ```rust,ignore
//! use execution_engine::resilience::{CircuitBreaker, CircuitBreakerConfig};
//!
//! let config = CircuitBreakerConfig::default();
//! let breaker = CircuitBreaker::new("alpaca", config);
//!
//! // Check if call is permitted
//! if breaker.is_call_permitted() {
//!     match make_api_call().await {
//!         Ok(result) => breaker.record_success(),
//!         Err(e) => breaker.record_failure(),
//!     }
//! } else {
//!     // Circuit is open, fail fast
//! }
//! ```

use std::collections::VecDeque;
use std::sync::RwLock;
use std::sync::atomic::{AtomicU32, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

/// Circuit breaker state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum CircuitBreakerState {
    /// Circuit is closed, calls flow normally.
    Closed,
    /// Circuit is open, calls are rejected.
    Open,
    /// Circuit is testing with limited calls.
    HalfOpen,
}

impl std::fmt::Display for CircuitBreakerState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Closed => write!(f, "CLOSED"),
            Self::Open => write!(f, "OPEN"),
            Self::HalfOpen => write!(f, "HALF_OPEN"),
        }
    }
}

/// Circuit breaker configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitBreakerConfig {
    /// Failure rate threshold to open circuit (0.0-1.0).
    pub failure_rate_threshold: f64,
    /// Number of calls in the sliding window.
    pub sliding_window_size: u32,
    /// Minimum calls before evaluating failure rate.
    pub minimum_calls: u32,
    /// Duration to stay in `OPEN` state.
    pub wait_duration_in_open: Duration,
    /// Permitted test calls in `HALF_OPEN` state.
    pub permitted_calls_in_half_open: u32,
    /// Maximum call duration before timeout.
    pub call_timeout: Duration,
}

impl Default for CircuitBreakerConfig {
    fn default() -> Self {
        Self {
            failure_rate_threshold: 0.5, // 50%
            sliding_window_size: 20,
            minimum_calls: 5,
            wait_duration_in_open: Duration::from_secs(10),
            permitted_calls_in_half_open: 3,
            call_timeout: Duration::from_secs(5),
        }
    }
}

impl CircuitBreakerConfig {
    /// Configuration optimized for Alpaca API.
    #[must_use]
    pub fn alpaca() -> Self {
        Self::default()
    }

    /// Configuration optimized for Databento feed.
    ///
    /// More sensitive for market data (lower threshold, larger window, shorter open).
    #[must_use]
    pub const fn databento() -> Self {
        Self {
            failure_rate_threshold: 0.3, // 30% - more sensitive
            sliding_window_size: 50,     // Larger window
            minimum_calls: 10,
            wait_duration_in_open: Duration::from_secs(5), // Shorter open
            permitted_calls_in_half_open: 5,
            call_timeout: Duration::from_secs(3),
        }
    }

    /// Configuration optimized for IBKR.
    ///
    /// Longer timeouts for slower API.
    #[must_use]
    pub const fn ibkr() -> Self {
        Self {
            failure_rate_threshold: 0.5,
            sliding_window_size: 20,
            minimum_calls: 5,
            wait_duration_in_open: Duration::from_secs(15), // Longer open
            permitted_calls_in_half_open: 3,
            call_timeout: Duration::from_secs(10), // Longer timeout
        }
    }
}

/// Outcome of a call for sliding window tracking.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CallOutcome {
    Success,
    Failure,
}

/// Circuit breaker for external service calls.
#[derive(Debug)]
pub struct CircuitBreaker {
    /// Service name for logging.
    name: String,
    /// Configuration.
    config: CircuitBreakerConfig,
    /// Current state.
    state: RwLock<CircuitBreakerState>,
    /// Sliding window of call outcomes.
    sliding_window: RwLock<VecDeque<CallOutcome>>,
    /// Timestamp when circuit opened (for wait duration).
    opened_at: RwLock<Option<Instant>>,
    /// Calls made in `HALF_OPEN` state.
    half_open_calls: AtomicU32,
    /// Successes in `HALF_OPEN` state.
    half_open_successes: AtomicU32,
    /// Total calls counter (for metrics).
    total_calls: AtomicU64,
    /// Total failures counter (for metrics).
    total_failures: AtomicU64,
    /// State transitions counter (for metrics).
    state_transitions: AtomicU64,
}

impl CircuitBreaker {
    /// Create a new circuit breaker.
    #[must_use]
    pub fn new(name: impl Into<String>, config: CircuitBreakerConfig) -> Self {
        Self {
            name: name.into(),
            config,
            state: RwLock::new(CircuitBreakerState::Closed),
            sliding_window: RwLock::new(VecDeque::new()),
            opened_at: RwLock::new(None),
            half_open_calls: AtomicU32::new(0),
            half_open_successes: AtomicU32::new(0),
            total_calls: AtomicU64::new(0),
            total_failures: AtomicU64::new(0),
            state_transitions: AtomicU64::new(0),
        }
    }

    /// Get the service name.
    #[must_use]
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Get the current state.
    #[must_use]
    pub fn state(&self) -> CircuitBreakerState {
        self.check_state_transition();
        *self
            .state
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// Check if a call is permitted.
    #[must_use]
    pub fn is_call_permitted(&self) -> bool {
        self.check_state_transition();

        let state = self
            .state
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        match *state {
            CircuitBreakerState::Closed => true,
            CircuitBreakerState::Open => false,
            CircuitBreakerState::HalfOpen => {
                let calls = self.half_open_calls.load(Ordering::Relaxed);
                calls < self.config.permitted_calls_in_half_open
            }
        }
    }

    /// Record a successful call.
    pub fn record_success(&self) {
        self.total_calls.fetch_add(1, Ordering::Relaxed);
        self.record_outcome(CallOutcome::Success);
    }

    /// Record a failed call.
    pub fn record_failure(&self) {
        self.total_calls.fetch_add(1, Ordering::Relaxed);
        self.total_failures.fetch_add(1, Ordering::Relaxed);
        self.record_outcome(CallOutcome::Failure);
    }

    /// Record call outcome and update state.
    fn record_outcome(&self, outcome: CallOutcome) {
        let current_state = *self
            .state
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        match current_state {
            CircuitBreakerState::Closed => {
                self.update_sliding_window(outcome);
                self.evaluate_closed_state();
            }
            CircuitBreakerState::HalfOpen => {
                self.half_open_calls.fetch_add(1, Ordering::Relaxed);
                if outcome == CallOutcome::Success {
                    self.half_open_successes.fetch_add(1, Ordering::Relaxed);
                }
                self.evaluate_half_open_state(outcome);
            }
            CircuitBreakerState::Open => {
                // Should not happen - calls should be rejected in OPEN state
                tracing::warn!(
                    name = %self.name,
                    "Call recorded while circuit is OPEN"
                );
            }
        }
    }

    /// Update the sliding window with a new outcome.
    fn update_sliding_window(&self, outcome: CallOutcome) {
        let mut window = self
            .sliding_window
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        window.push_back(outcome);

        // Trim to window size
        while window.len() > self.config.sliding_window_size as usize {
            window.pop_front();
        }
        drop(window);
    }

    /// Evaluate CLOSED state and potentially transition to OPEN.
    fn evaluate_closed_state(&self) {
        let window = self
            .sliding_window
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        // Don't evaluate until minimum calls
        if window.len() < self.config.minimum_calls as usize {
            return;
        }

        // Calculate failure rate
        let failures = window
            .iter()
            .filter(|o| **o == CallOutcome::Failure)
            .count();
        // Precision loss acceptable for rate calculation (approximate metric)
        #[allow(clippy::cast_precision_loss)]
        let failure_rate = failures as f64 / window.len() as f64;

        if failure_rate >= self.config.failure_rate_threshold {
            drop(window); // Release read lock
            self.transition_to_open();
        }
    }

    /// Evaluate `HALF_OPEN` state and transition accordingly.
    fn evaluate_half_open_state(&self, outcome: CallOutcome) {
        if outcome == CallOutcome::Failure {
            // Any failure in HALF_OPEN → OPEN
            self.transition_to_open();
            return;
        }

        let successes = self.half_open_successes.load(Ordering::Relaxed);

        // All permitted calls succeeded → CLOSED
        if successes >= self.config.permitted_calls_in_half_open {
            self.transition_to_closed();
        }
    }

    /// Check for time-based state transitions (`OPEN` -> `HALF_OPEN`).
    fn check_state_transition(&self) {
        let state = *self
            .state
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        if state == CircuitBreakerState::Open
            && let Some(opened) = *self
                .opened_at
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
            && opened.elapsed() >= self.config.wait_duration_in_open
        {
            self.transition_to_half_open();
        }
    }

    /// Transition to `OPEN` state.
    fn transition_to_open(&self) {
        let mut state = self
            .state
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let previous = *state;

        if previous != CircuitBreakerState::Open {
            *state = CircuitBreakerState::Open;
            drop(state);

            // Record when circuit opened
            let mut opened_at = self
                .opened_at
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            *opened_at = Some(Instant::now());
            drop(opened_at);

            self.state_transitions.fetch_add(1, Ordering::Relaxed);

            tracing::warn!(
                name = %self.name,
                from = %previous,
                to = "OPEN",
                "Circuit breaker opened"
            );
        }
    }

    /// Transition to `HALF_OPEN` state.
    fn transition_to_half_open(&self) {
        let mut state = self
            .state
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let previous = *state;

        if previous == CircuitBreakerState::Open {
            *state = CircuitBreakerState::HalfOpen;
            drop(state);

            // Reset half-open counters
            self.half_open_calls.store(0, Ordering::Relaxed);
            self.half_open_successes.store(0, Ordering::Relaxed);

            self.state_transitions.fetch_add(1, Ordering::Relaxed);

            tracing::info!(
                name = %self.name,
                from = %previous,
                to = "HALF_OPEN",
                "Circuit breaker testing"
            );
        }
    }

    /// Transition to CLOSED state.
    fn transition_to_closed(&self) {
        let mut state = self
            .state
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let previous = *state;

        if previous != CircuitBreakerState::Closed {
            *state = CircuitBreakerState::Closed;
            drop(state);

            // Clear sliding window
            let mut window = self
                .sliding_window
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            window.clear();
            drop(window);

            // Clear opened_at
            let mut opened_at = self
                .opened_at
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            *opened_at = None;
            drop(opened_at);

            self.state_transitions.fetch_add(1, Ordering::Relaxed);

            tracing::info!(
                name = %self.name,
                from = %previous,
                to = "CLOSED",
                "Circuit breaker closed"
            );
        }
    }

    /// Get the call timeout for this circuit breaker.
    #[must_use]
    pub const fn call_timeout(&self) -> Duration {
        self.config.call_timeout
    }

    /// Get metrics for this circuit breaker.
    #[must_use]
    pub fn metrics(&self) -> CircuitBreakerMetrics {
        CircuitBreakerMetrics {
            name: self.name.clone(),
            state: self.state(),
            total_calls: self.total_calls.load(Ordering::Relaxed),
            total_failures: self.total_failures.load(Ordering::Relaxed),
            state_transitions: self.state_transitions.load(Ordering::Relaxed),
            failure_rate: self.current_failure_rate(),
        }
    }

    /// Calculate current failure rate from sliding window.
    #[allow(clippy::cast_precision_loss)]
    fn current_failure_rate(&self) -> f64 {
        let window = self
            .sliding_window
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);

        if window.is_empty() {
            return 0.0;
        }

        let failures = window
            .iter()
            .filter(|o| **o == CallOutcome::Failure)
            .count();

        // Precision loss acceptable for rate calculation (approximate metric)
        failures as f64 / window.len() as f64
    }

    /// Force the circuit breaker to open (for testing or emergency).
    pub fn force_open(&self) {
        self.transition_to_open();
    }

    /// Force the circuit breaker to close (for testing or recovery).
    pub fn force_close(&self) {
        self.transition_to_closed();
    }
}

/// Metrics for a circuit breaker.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitBreakerMetrics {
    /// Service name.
    pub name: String,
    /// Current state.
    pub state: CircuitBreakerState,
    /// Total calls.
    pub total_calls: u64,
    /// Total failures.
    pub total_failures: u64,
    /// Number of state transitions.
    pub state_transitions: u64,
    /// Current failure rate (0.0-1.0).
    pub failure_rate: f64,
}

/// Collection of circuit breakers for different services.
#[derive(Debug, Default)]
pub struct ServiceCircuitBreakers {
    /// Circuit breaker for Alpaca API.
    pub alpaca: Option<CircuitBreaker>,
    /// Circuit breaker for Databento feed.
    pub databento: Option<CircuitBreaker>,
    /// Circuit breaker for IBKR.
    pub ibkr: Option<CircuitBreaker>,
}

impl ServiceCircuitBreakers {
    /// Create circuit breakers with default configurations.
    #[must_use]
    pub fn with_defaults() -> Self {
        Self {
            alpaca: Some(CircuitBreaker::new(
                "alpaca",
                CircuitBreakerConfig::alpaca(),
            )),
            databento: Some(CircuitBreaker::new(
                "databento",
                CircuitBreakerConfig::databento(),
            )),
            ibkr: Some(CircuitBreaker::new("ibkr", CircuitBreakerConfig::ibkr())),
        }
    }

    /// Get all metrics.
    #[must_use]
    pub fn all_metrics(&self) -> Vec<CircuitBreakerMetrics> {
        let mut metrics = Vec::new();

        if let Some(ref breaker) = self.alpaca {
            metrics.push(breaker.metrics());
        }
        if let Some(ref breaker) = self.databento {
            metrics.push(breaker.metrics());
        }
        if let Some(ref breaker) = self.ibkr {
            metrics.push(breaker.metrics());
        }

        metrics
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = CircuitBreakerConfig::default();
        assert!((config.failure_rate_threshold - 0.5).abs() < f64::EPSILON);
        assert_eq!(config.sliding_window_size, 20);
        assert_eq!(config.minimum_calls, 5);
    }

    #[test]
    fn test_initial_state_is_closed() {
        let breaker = CircuitBreaker::new("test", CircuitBreakerConfig::default());
        assert_eq!(breaker.state(), CircuitBreakerState::Closed);
        assert!(breaker.is_call_permitted());
    }

    #[test]
    fn test_closed_to_open_transition() {
        let config = CircuitBreakerConfig {
            failure_rate_threshold: 0.5,
            sliding_window_size: 10,
            minimum_calls: 5,
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("test", config);

        // Record 3 successes, 3 failures (50% failure rate at minimum calls)
        breaker.record_success();
        breaker.record_success();
        breaker.record_success();
        breaker.record_failure();
        breaker.record_failure();
        breaker.record_failure();

        assert_eq!(breaker.state(), CircuitBreakerState::Open);
        assert!(!breaker.is_call_permitted());
    }

    #[test]
    fn test_minimum_calls_required() {
        let config = CircuitBreakerConfig {
            failure_rate_threshold: 0.5,
            sliding_window_size: 10,
            minimum_calls: 5,
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("test", config);

        // Record 4 failures (less than minimum_calls)
        breaker.record_failure();
        breaker.record_failure();
        breaker.record_failure();
        breaker.record_failure();

        // Should still be closed (minimum calls not reached)
        assert_eq!(breaker.state(), CircuitBreakerState::Closed);
    }

    #[test]
    fn test_open_to_half_open_transition() {
        let config = CircuitBreakerConfig {
            failure_rate_threshold: 0.5,
            sliding_window_size: 10,
            minimum_calls: 5,
            wait_duration_in_open: Duration::from_millis(10), // Short for testing
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("test", config);

        // Trigger OPEN state
        for _ in 0..5 {
            breaker.record_failure();
        }
        assert_eq!(breaker.state(), CircuitBreakerState::Open);

        // Wait for transition
        std::thread::sleep(Duration::from_millis(20));

        // Should transition to HALF_OPEN
        assert_eq!(breaker.state(), CircuitBreakerState::HalfOpen);
        assert!(breaker.is_call_permitted());
    }

    #[test]
    fn test_half_open_to_closed_on_success() {
        let config = CircuitBreakerConfig {
            failure_rate_threshold: 0.5,
            sliding_window_size: 10,
            minimum_calls: 5,
            wait_duration_in_open: Duration::from_millis(1),
            permitted_calls_in_half_open: 3,
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("test", config);

        // Force to HALF_OPEN via OPEN
        for _ in 0..5 {
            breaker.record_failure();
        }
        std::thread::sleep(Duration::from_millis(5));
        assert_eq!(breaker.state(), CircuitBreakerState::HalfOpen);

        // Record successful test calls
        breaker.record_success();
        breaker.record_success();
        breaker.record_success();

        assert_eq!(breaker.state(), CircuitBreakerState::Closed);
    }

    #[test]
    fn test_half_open_to_open_on_failure() {
        let config = CircuitBreakerConfig {
            failure_rate_threshold: 0.5,
            sliding_window_size: 10,
            minimum_calls: 5,
            wait_duration_in_open: Duration::from_millis(1),
            permitted_calls_in_half_open: 3,
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("test", config);

        // Force to HALF_OPEN
        for _ in 0..5 {
            breaker.record_failure();
        }
        std::thread::sleep(Duration::from_millis(5));
        assert_eq!(breaker.state(), CircuitBreakerState::HalfOpen);

        // Record a failure in HALF_OPEN
        breaker.record_failure();

        // Should go back to OPEN
        assert_eq!(breaker.state(), CircuitBreakerState::Open);
    }

    #[test]
    fn test_half_open_permits_limited_calls() {
        let config = CircuitBreakerConfig {
            failure_rate_threshold: 0.5,
            sliding_window_size: 10,
            minimum_calls: 5,
            wait_duration_in_open: Duration::from_millis(1),
            permitted_calls_in_half_open: 2,
            ..Default::default()
        };
        let breaker = CircuitBreaker::new("test", config);

        // Force to HALF_OPEN
        for _ in 0..5 {
            breaker.record_failure();
        }
        std::thread::sleep(Duration::from_millis(5));

        // First two calls permitted
        assert!(breaker.is_call_permitted());
        breaker.record_success();
        assert!(breaker.is_call_permitted());
        breaker.record_success();

        // Now closed
        assert_eq!(breaker.state(), CircuitBreakerState::Closed);
    }

    #[test]
    fn test_metrics() {
        let breaker = CircuitBreaker::new("test", CircuitBreakerConfig::default());

        breaker.record_success();
        breaker.record_success();
        breaker.record_failure();

        let metrics = breaker.metrics();
        assert_eq!(metrics.name, "test");
        assert_eq!(metrics.total_calls, 3);
        assert_eq!(metrics.total_failures, 1);
        assert!((metrics.failure_rate - 0.333_333).abs() < 0.001);
    }

    #[test]
    fn test_force_open_and_close() {
        let breaker = CircuitBreaker::new("test", CircuitBreakerConfig::default());

        assert_eq!(breaker.state(), CircuitBreakerState::Closed);

        breaker.force_open();
        assert_eq!(breaker.state(), CircuitBreakerState::Open);

        breaker.force_close();
        assert_eq!(breaker.state(), CircuitBreakerState::Closed);
    }

    #[test]
    fn test_service_circuit_breakers() {
        let breakers = ServiceCircuitBreakers::with_defaults();

        assert!(breakers.alpaca.is_some());
        assert!(breakers.databento.is_some());
        assert!(breakers.ibkr.is_some());

        let metrics = breakers.all_metrics();
        assert_eq!(metrics.len(), 3);
    }

    #[test]
    fn test_databento_config() {
        let config = CircuitBreakerConfig::databento();
        assert!((config.failure_rate_threshold - 0.3).abs() < f64::EPSILON); // 30%
        assert_eq!(config.sliding_window_size, 50);
    }

    #[test]
    fn test_ibkr_config() {
        let config = CircuitBreakerConfig::ibkr();
        assert_eq!(config.wait_duration_in_open, Duration::from_secs(15));
        assert_eq!(config.call_timeout, Duration::from_secs(10));
    }
}
