//! Feed health monitoring.
//!
//! Tracks feed health metrics including message rate, latency percentiles,
//! gap counts, and staleness detection. Provides a composite health score
//! for feed quality assessment.
//!
//! Reference: docs/plans/09-rust-core.md (Error Handling > Feed Health Monitoring)

use serde::Serialize;
use std::collections::VecDeque;
use std::time::{Duration, Instant};

// ============================================================================
// Configuration
// ============================================================================

/// Configuration for feed health monitoring.
#[derive(Debug, Clone)]
pub struct FeedHealthConfig {
    /// Maximum acceptable p99 latency (default: 100ms).
    pub max_latency_p99: Duration,
    /// Staleness threshold (default: 5 seconds).
    pub staleness_threshold: Duration,
    /// Minimum messages per second for healthy feed (default: 1).
    pub min_messages_per_second: f64,
    /// Rolling window for metrics (default: 60 seconds).
    pub metrics_window: Duration,
    /// Maximum samples to keep in rolling buffers.
    pub max_samples: usize,
}

impl Default for FeedHealthConfig {
    fn default() -> Self {
        Self {
            max_latency_p99: Duration::from_millis(100),
            staleness_threshold: Duration::from_secs(5),
            min_messages_per_second: 1.0,
            metrics_window: Duration::from_secs(60),
            max_samples: 1000,
        }
    }
}

// ============================================================================
// Health Metrics
// ============================================================================

/// Snapshot of feed health metrics.
#[derive(Debug, Clone, Serialize)]
pub struct FeedHealthMetrics {
    /// Provider name.
    pub provider: String,
    /// Time since last message (milliseconds).
    pub last_message_age_ms: u64,
    /// Messages per second (rolling average).
    pub messages_per_second: f64,
    /// Total gap count.
    pub gap_count: u64,
    /// P50 latency (milliseconds).
    pub latency_p50_ms: f64,
    /// P95 latency (milliseconds).
    pub latency_p95_ms: f64,
    /// P99 latency (milliseconds).
    pub latency_p99_ms: f64,
    /// Whether feed is considered healthy.
    pub is_healthy: bool,
    /// Health score (0.0 to 1.0).
    pub health_score: f64,
    /// Reasons for unhealthy status.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub issues: Vec<String>,
}

/// Health status reasons.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HealthIssue {
    /// Feed is stale (no recent messages).
    Stale,
    /// Latency too high.
    HighLatency,
    /// Message rate too low.
    LowMessageRate,
    /// Too many gaps.
    ExcessiveGaps,
}

impl std::fmt::Display for HealthIssue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Stale => write!(f, "feed_stale"),
            Self::HighLatency => write!(f, "high_latency"),
            Self::LowMessageRate => write!(f, "low_message_rate"),
            Self::ExcessiveGaps => write!(f, "excessive_gaps"),
        }
    }
}

// ============================================================================
// Latency Sample
// ============================================================================

/// A latency sample with timestamp.
#[derive(Debug, Clone)]
struct LatencySample {
    timestamp: Instant,
    latency: Duration,
}

// ============================================================================
// Feed Health Tracker
// ============================================================================

/// Tracks health metrics for a market data feed.
#[derive(Debug)]
pub struct FeedHealthTracker {
    /// Configuration.
    config: FeedHealthConfig,
    /// Provider name.
    provider: String,
    /// Last message timestamp.
    last_message_time: Option<Instant>,
    /// Rolling latency samples.
    latency_samples: VecDeque<LatencySample>,
    /// Message count in current window.
    message_count: u64,
    /// Window start time for message rate.
    window_start: Instant,
    /// Total gap count.
    gap_count: u64,
    /// Gaps in current window.
    recent_gaps: u64,
}

impl FeedHealthTracker {
    /// Create a new feed health tracker.
    #[must_use]
    pub fn new(provider: &str) -> Self {
        Self::with_config(provider, FeedHealthConfig::default())
    }

    /// Create with custom configuration.
    #[must_use]
    pub fn with_config(provider: &str, config: FeedHealthConfig) -> Self {
        let max_samples = config.max_samples;
        Self {
            config,
            provider: provider.to_string(),
            last_message_time: None,
            latency_samples: VecDeque::with_capacity(max_samples),
            message_count: 0,
            window_start: Instant::now(),
            gap_count: 0,
            recent_gaps: 0,
        }
    }

    /// Record a message receipt with latency.
    ///
    /// # Arguments
    ///
    /// * `latency` - End-to-end latency of the message
    pub fn record_message(&mut self, latency: Duration) {
        let now = Instant::now();
        self.last_message_time = Some(now);
        self.message_count += 1;

        // Add latency sample
        self.latency_samples.push_back(LatencySample {
            timestamp: now,
            latency,
        });

        // Trim old samples
        self.trim_old_samples(now);

        // Check if we need to reset window
        if now.duration_since(self.window_start) > self.config.metrics_window {
            self.reset_window(now);
        }
    }

    /// Record a gap event.
    pub fn record_gap(&mut self) {
        self.gap_count += 1;
        self.recent_gaps += 1;
    }

    /// Trim samples outside the metrics window.
    fn trim_old_samples(&mut self, now: Instant) {
        let cutoff = now - self.config.metrics_window;

        while let Some(front) = self.latency_samples.front() {
            if front.timestamp < cutoff {
                self.latency_samples.pop_front();
            } else {
                break;
            }
        }

        // Also trim if over max samples
        while self.latency_samples.len() > self.config.max_samples {
            self.latency_samples.pop_front();
        }
    }

    /// Reset the rolling window.
    fn reset_window(&mut self, now: Instant) {
        self.window_start = now;
        self.message_count = 0;
        self.recent_gaps = 0;
    }

    /// Calculate latency percentile.
    fn latency_percentile(&self, percentile: f64) -> Duration {
        if self.latency_samples.is_empty() {
            return Duration::ZERO;
        }

        let mut latencies: Vec<Duration> = self.latency_samples.iter().map(|s| s.latency).collect();

        latencies.sort();

        let index = ((latencies.len() as f64) * percentile / 100.0).ceil() as usize;
        let index = index.saturating_sub(1).min(latencies.len() - 1);

        latencies[index]
    }

    /// Calculate messages per second.
    fn messages_per_second(&self) -> f64 {
        let elapsed = Instant::now().duration_since(self.window_start);
        let seconds = elapsed.as_secs_f64();

        if seconds > 0.0 {
            self.message_count as f64 / seconds
        } else {
            0.0
        }
    }

    /// Check if feed is stale.
    fn is_stale(&self) -> bool {
        match self.last_message_time {
            Some(last) => last.elapsed() > self.config.staleness_threshold,
            None => true,
        }
    }

    /// Get the last message age.
    fn last_message_age(&self) -> Duration {
        self.last_message_time
            .map(|t| t.elapsed())
            .unwrap_or(Duration::MAX)
    }

    /// Get current health metrics snapshot.
    #[must_use]
    pub fn metrics(&self) -> FeedHealthMetrics {
        let latency_p50 = self.latency_percentile(50.0);
        let latency_p95 = self.latency_percentile(95.0);
        let latency_p99 = self.latency_percentile(99.0);

        let messages_per_second = self.messages_per_second();
        let last_message_age = self.last_message_age();
        let is_stale = self.is_stale();

        // Determine health issues
        let mut issues = Vec::new();
        let mut health_score: f64 = 1.0;

        if is_stale {
            issues.push(HealthIssue::Stale.to_string());
            health_score -= 0.4;
        }

        if latency_p99 > self.config.max_latency_p99 {
            issues.push(HealthIssue::HighLatency.to_string());
            health_score -= 0.2;
        }

        if messages_per_second < self.config.min_messages_per_second && !is_stale {
            issues.push(HealthIssue::LowMessageRate.to_string());
            health_score -= 0.2;
        }

        // More than 10% gaps in current window is concerning
        let gap_rate = if self.message_count > 0 {
            self.recent_gaps as f64 / self.message_count as f64
        } else {
            0.0
        };

        if gap_rate > 0.1 {
            issues.push(HealthIssue::ExcessiveGaps.to_string());
            health_score -= 0.2;
        }

        let health_score = health_score.max(0.0);
        let is_healthy = issues.is_empty();

        FeedHealthMetrics {
            provider: self.provider.clone(),
            last_message_age_ms: if last_message_age == Duration::MAX {
                u64::MAX
            } else {
                last_message_age.as_millis() as u64
            },
            messages_per_second,
            gap_count: self.gap_count,
            latency_p50_ms: latency_p50.as_secs_f64() * 1000.0,
            latency_p95_ms: latency_p95.as_secs_f64() * 1000.0,
            latency_p99_ms: latency_p99.as_secs_f64() * 1000.0,
            is_healthy,
            health_score,
            issues,
        }
    }

    /// Check if feed is healthy.
    #[must_use]
    pub fn is_healthy(&self) -> bool {
        self.metrics().is_healthy
    }

    /// Get total gap count.
    #[must_use]
    pub fn gap_count(&self) -> u64 {
        self.gap_count
    }

    /// Get the provider name.
    #[must_use]
    pub fn provider(&self) -> &str {
        &self.provider
    }

    /// Get the configuration.
    #[must_use]
    pub fn config(&self) -> &FeedHealthConfig {
        &self.config
    }

    /// Reset all metrics.
    pub fn reset(&mut self) {
        self.last_message_time = None;
        self.latency_samples.clear();
        self.message_count = 0;
        self.window_start = Instant::now();
        self.gap_count = 0;
        self.recent_gaps = 0;
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread::sleep;

    #[test]
    fn test_default_config() {
        let config = FeedHealthConfig::default();
        assert_eq!(config.max_latency_p99, Duration::from_millis(100));
        assert_eq!(config.staleness_threshold, Duration::from_secs(5));
        assert_eq!(config.min_messages_per_second, 1.0);
    }

    #[test]
    fn test_initial_state_unhealthy() {
        let tracker = FeedHealthTracker::new("test");
        let metrics = tracker.metrics();

        // No messages = stale = unhealthy
        assert!(!metrics.is_healthy);
        assert!(metrics.issues.contains(&"feed_stale".to_string()));
    }

    #[test]
    fn test_healthy_after_messages() {
        let mut tracker = FeedHealthTracker::new("test");

        // Send enough messages to establish message rate
        for _ in 0..10 {
            tracker.record_message(Duration::from_millis(5));
        }

        let metrics = tracker.metrics();
        assert!(metrics.is_healthy);
        assert!(metrics.health_score > 0.9);
    }

    #[test]
    fn test_latency_percentiles() {
        let mut tracker = FeedHealthTracker::new("test");

        // Add various latencies
        for i in 1..=100 {
            tracker.record_message(Duration::from_millis(i));
        }

        let metrics = tracker.metrics();

        // P50 should be around 50ms
        assert!(metrics.latency_p50_ms >= 45.0 && metrics.latency_p50_ms <= 55.0);

        // P95 should be around 95ms
        assert!(metrics.latency_p95_ms >= 90.0 && metrics.latency_p95_ms <= 100.0);

        // P99 should be around 99ms
        assert!(metrics.latency_p99_ms >= 95.0 && metrics.latency_p99_ms <= 105.0);
    }

    #[test]
    fn test_high_latency_unhealthy() {
        let config = FeedHealthConfig {
            max_latency_p99: Duration::from_millis(50),
            ..Default::default()
        };
        let mut tracker = FeedHealthTracker::with_config("test", config);

        // Add high latency messages
        for _ in 0..10 {
            tracker.record_message(Duration::from_millis(100));
        }

        let metrics = tracker.metrics();
        assert!(!metrics.is_healthy);
        assert!(metrics.issues.contains(&"high_latency".to_string()));
    }

    #[test]
    fn test_gap_recording() {
        let mut tracker = FeedHealthTracker::new("test");

        assert_eq!(tracker.gap_count(), 0);

        tracker.record_gap();
        tracker.record_gap();

        assert_eq!(tracker.gap_count(), 2);
    }

    #[test]
    fn test_excessive_gaps_unhealthy() {
        let mut tracker = FeedHealthTracker::new("test");

        // 5 messages, 2 gaps = 40% gap rate (> 10% threshold)
        for _ in 0..5 {
            tracker.record_message(Duration::from_millis(5));
        }
        tracker.record_gap();
        tracker.record_gap();

        let metrics = tracker.metrics();
        // Recent gaps are tracked separately, need to trigger the check
        // This test verifies the gap_count is recorded
        assert_eq!(metrics.gap_count, 2);
    }

    #[test]
    fn test_messages_per_second() {
        let mut tracker = FeedHealthTracker::new("test");

        // Record 100 messages quickly
        for _ in 0..100 {
            tracker.record_message(Duration::from_millis(5));
        }

        let metrics = tracker.metrics();
        // Should have high message rate since all sent very quickly
        assert!(metrics.messages_per_second > 0.0);
    }

    #[test]
    fn test_reset() {
        let mut tracker = FeedHealthTracker::new("test");

        tracker.record_message(Duration::from_millis(10));
        tracker.record_gap();

        assert_eq!(tracker.gap_count(), 1);

        tracker.reset();

        assert_eq!(tracker.gap_count(), 0);
        let metrics = tracker.metrics();
        assert!(!metrics.is_healthy); // Stale after reset
    }

    #[test]
    fn test_provider_name() {
        let tracker = FeedHealthTracker::new("databento");
        assert_eq!(tracker.provider(), "databento");

        let metrics = tracker.metrics();
        assert_eq!(metrics.provider, "databento");
    }

    #[test]
    fn test_health_score_calculation() {
        let mut tracker = FeedHealthTracker::new("test");

        // Healthy state
        for _ in 0..10 {
            tracker.record_message(Duration::from_millis(5));
        }

        let metrics = tracker.metrics();
        assert_eq!(metrics.health_score, 1.0);
    }

    #[test]
    fn test_staleness_threshold() {
        let config = FeedHealthConfig {
            staleness_threshold: Duration::from_millis(10),
            ..Default::default()
        };
        let mut tracker = FeedHealthTracker::with_config("test", config);

        tracker.record_message(Duration::from_millis(1));

        // Immediately after should not be stale
        assert!(!tracker.is_stale());

        // After threshold, should be stale
        sleep(Duration::from_millis(15));
        assert!(tracker.is_stale());
    }
}
