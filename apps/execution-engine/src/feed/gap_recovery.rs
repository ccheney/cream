//! Market data gap recovery.
//!
//! Implements natural refresh strategy for handling data gaps and sequence
//! discontinuities. Uses configurable thresholds to determine when to force
//! a full book rebuild versus accepting self-correcting gaps.
//!
//! Reference: docs/plans/09-rust-core.md (Error Handling > Market Data Gap Recovery)

use std::time::{Duration, Instant};
use tracing::{debug, info, warn};

use crate::observability::record_feed_gap;

// ============================================================================
// Configuration
// ============================================================================

/// Configuration for gap recovery behavior.
#[derive(Debug, Clone)]
pub struct GapRecoveryConfig {
    /// Maximum gap duration before forcing refresh (default: 100ms).
    pub max_gap_duration: Duration,
    /// Sequence gap threshold for full book rebuild (default: 100 messages).
    pub sequence_gap_threshold: u64,
    /// Whether to accept self-correcting gaps (e.g., cancel for unknown order).
    pub accept_self_correcting: bool,
    /// Protection window for recent updates (don't trigger recovery too fast).
    pub protection_window: Duration,
}

impl Default for GapRecoveryConfig {
    fn default() -> Self {
        Self {
            max_gap_duration: Duration::from_millis(100),
            sequence_gap_threshold: 100,
            accept_self_correcting: true,
            protection_window: Duration::from_millis(50),
        }
    }
}

// ============================================================================
// Gap Types
// ============================================================================

/// Type of gap detected.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GapType {
    /// Time-based gap (no messages for too long).
    TimeBased,
    /// Sequence number gap (missing messages).
    SequenceBased,
    /// Self-correcting gap (e.g., cancel for unknown order).
    SelfCorrecting,
}

/// Action to take after detecting a gap.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GapRecoveryAction {
    /// Ignore the gap (self-correcting).
    Ignore,
    /// Request incremental refresh.
    IncrementalRefresh,
    /// Request full book rebuild.
    FullRebuild,
    /// Reconnect to feed.
    Reconnect,
}

/// Result of gap detection.
#[derive(Debug, Clone)]
pub struct GapDetectionResult {
    /// Whether a gap was detected.
    pub gap_detected: bool,
    /// Type of gap if detected.
    pub gap_type: Option<GapType>,
    /// Recommended action.
    pub action: GapRecoveryAction,
    /// Gap size (sequence numbers missed or milliseconds elapsed).
    pub gap_size: u64,
}

// ============================================================================
// Gap Recovery Manager
// ============================================================================

/// Manages gap detection and recovery for a market data feed.
#[derive(Debug)]
pub struct GapRecoveryManager {
    /// Configuration.
    config: GapRecoveryConfig,
    /// Provider name for metrics.
    provider: String,
    /// Last received sequence number.
    last_sequence: Option<u64>,
    /// Last message timestamp.
    last_message_time: Option<Instant>,
    /// Total gaps detected.
    gap_count: u64,
    /// Consecutive gaps (reset on successful message).
    consecutive_gaps: u64,
    /// Whether currently in recovery mode.
    in_recovery: bool,
    /// Recovery start time.
    recovery_start: Option<Instant>,
}

impl GapRecoveryManager {
    /// Create a new gap recovery manager.
    #[must_use]
    pub fn new(provider: &str) -> Self {
        Self::with_config(provider, GapRecoveryConfig::default())
    }

    /// Create with custom configuration.
    #[must_use]
    pub fn with_config(provider: &str, config: GapRecoveryConfig) -> Self {
        Self {
            config,
            provider: provider.to_string(),
            last_sequence: None,
            last_message_time: None,
            gap_count: 0,
            consecutive_gaps: 0,
            in_recovery: false,
            recovery_start: None,
        }
    }

    /// Process a new message and check for gaps.
    ///
    /// # Arguments
    ///
    /// * `sequence` - Optional sequence number of the message
    ///
    /// # Returns
    ///
    /// Gap detection result with recommended action.
    pub fn process_message(&mut self, sequence: Option<u64>) -> GapDetectionResult {
        let now = Instant::now();
        let mut result = GapDetectionResult {
            gap_detected: false,
            gap_type: None,
            action: GapRecoveryAction::Ignore,
            gap_size: 0,
        };

        // Check for time-based gap
        if let Some(last_time) = self.last_message_time {
            let elapsed = now.duration_since(last_time);
            if elapsed > self.config.max_gap_duration {
                result.gap_detected = true;
                result.gap_type = Some(GapType::TimeBased);
                // Truncation acceptable: gap duration in ms fits in u64 for practical gaps
                #[allow(clippy::cast_possible_truncation)]
                {
                    result.gap_size = elapsed.as_millis() as u64;
                }

                warn!(
                    provider = %self.provider,
                    elapsed_ms = result.gap_size,
                    threshold_ms = self.config.max_gap_duration.as_millis(),
                    "Time-based gap detected"
                );
            }
        }

        // Check for sequence-based gap
        if let (Some(current_seq), Some(last_seq)) = (sequence, self.last_sequence)
            && current_seq > last_seq + 1
        {
            let gap = current_seq - last_seq - 1;
            result.gap_detected = true;
            result.gap_type = Some(GapType::SequenceBased);
            result.gap_size = gap;

            warn!(
                provider = %self.provider,
                last_seq = last_seq,
                current_seq = current_seq,
                missed = gap,
                "Sequence gap detected"
            );
        }

        // Determine action
        if result.gap_detected {
            self.gap_count += 1;
            self.consecutive_gaps += 1;
            record_feed_gap(&self.provider);

            result.action = self.determine_action(&result);
        } else {
            self.consecutive_gaps = 0;
            if self.in_recovery {
                self.complete_recovery();
            }
        }

        // Update state
        if let Some(seq) = sequence {
            self.last_sequence = Some(seq);
        }
        self.last_message_time = Some(now);

        result
    }

    /// Process a self-correcting event (e.g., cancel for unknown order).
    ///
    /// Returns true if the event should be ignored.
    pub fn process_self_correcting(&mut self, event_type: &str) -> bool {
        if self.config.accept_self_correcting {
            debug!(
                provider = %self.provider,
                event_type = event_type,
                "Accepting self-correcting gap"
            );
            true
        } else {
            warn!(
                provider = %self.provider,
                event_type = event_type,
                "Self-correcting gap rejected by config"
            );
            false
        }
    }

    /// Determine the appropriate recovery action.
    fn determine_action(&mut self, result: &GapDetectionResult) -> GapRecoveryAction {
        match result.gap_type {
            Some(GapType::SelfCorrecting) => {
                if self.config.accept_self_correcting {
                    GapRecoveryAction::Ignore
                } else {
                    GapRecoveryAction::IncrementalRefresh
                }
            }
            Some(GapType::SequenceBased) => {
                if result.gap_size >= self.config.sequence_gap_threshold {
                    self.start_recovery();
                    GapRecoveryAction::FullRebuild
                } else {
                    GapRecoveryAction::IncrementalRefresh
                }
            }
            Some(GapType::TimeBased) => {
                if self.consecutive_gaps > 3 {
                    self.start_recovery();
                    GapRecoveryAction::Reconnect
                } else {
                    GapRecoveryAction::IncrementalRefresh
                }
            }
            None => GapRecoveryAction::Ignore,
        }
    }

    /// Start recovery mode.
    fn start_recovery(&mut self) {
        if !self.in_recovery {
            self.in_recovery = true;
            self.recovery_start = Some(Instant::now());
            info!(
                provider = %self.provider,
                "Entering gap recovery mode"
            );
        }
    }

    /// Complete recovery mode.
    fn complete_recovery(&mut self) {
        if self.in_recovery {
            let duration = self.recovery_start.map(|t| t.elapsed()).unwrap_or_default();

            info!(
                provider = %self.provider,
                recovery_ms = duration.as_millis(),
                "Gap recovery completed"
            );

            self.in_recovery = false;
            self.recovery_start = None;
        }
    }

    /// Get total gap count.
    #[must_use]
    pub const fn gap_count(&self) -> u64 {
        self.gap_count
    }

    /// Check if currently in recovery mode.
    #[must_use]
    pub const fn in_recovery(&self) -> bool {
        self.in_recovery
    }

    /// Reset the manager state.
    pub const fn reset(&mut self) {
        self.last_sequence = None;
        self.last_message_time = None;
        self.consecutive_gaps = 0;
        self.in_recovery = false;
        self.recovery_start = None;
    }

    /// Get the configuration.
    #[must_use]
    pub const fn config(&self) -> &GapRecoveryConfig {
        &self.config
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = GapRecoveryConfig::default();
        assert_eq!(config.max_gap_duration, Duration::from_millis(100));
        assert_eq!(config.sequence_gap_threshold, 100);
        assert!(config.accept_self_correcting);
    }

    #[test]
    fn test_no_gap_on_first_message() {
        let mut manager = GapRecoveryManager::new("test");
        let result = manager.process_message(Some(1));

        assert!(!result.gap_detected);
        assert_eq!(result.action, GapRecoveryAction::Ignore);
    }

    #[test]
    fn test_consecutive_sequence() {
        let mut manager = GapRecoveryManager::new("test");

        manager.process_message(Some(1));
        let result = manager.process_message(Some(2));

        assert!(!result.gap_detected);
        assert_eq!(result.action, GapRecoveryAction::Ignore);
    }

    #[test]
    fn test_sequence_gap_small() {
        let mut manager = GapRecoveryManager::new("test");

        manager.process_message(Some(1));
        let result = manager.process_message(Some(5)); // Missing 2, 3, 4

        assert!(result.gap_detected);
        assert_eq!(result.gap_type, Some(GapType::SequenceBased));
        assert_eq!(result.gap_size, 3);
        assert_eq!(result.action, GapRecoveryAction::IncrementalRefresh);
    }

    #[test]
    fn test_sequence_gap_large() {
        let mut manager = GapRecoveryManager::new("test");

        manager.process_message(Some(1));
        let result = manager.process_message(Some(150)); // Missing 100+ messages

        assert!(result.gap_detected);
        assert_eq!(result.gap_type, Some(GapType::SequenceBased));
        assert_eq!(result.gap_size, 148);
        assert_eq!(result.action, GapRecoveryAction::FullRebuild);
    }

    #[test]
    fn test_gap_count() {
        let mut manager = GapRecoveryManager::new("test");

        assert_eq!(manager.gap_count(), 0);

        manager.process_message(Some(1));
        manager.process_message(Some(5)); // Gap

        assert_eq!(manager.gap_count(), 1);

        manager.process_message(Some(10)); // Another gap

        assert_eq!(manager.gap_count(), 2);
    }

    #[test]
    fn test_self_correcting_accepted() {
        let mut manager = GapRecoveryManager::new("test");
        assert!(manager.process_self_correcting("cancel_unknown_order"));
    }

    #[test]
    fn test_self_correcting_rejected() {
        let config = GapRecoveryConfig {
            accept_self_correcting: false,
            ..Default::default()
        };
        let mut manager = GapRecoveryManager::with_config("test", config);
        assert!(!manager.process_self_correcting("cancel_unknown_order"));
    }

    #[test]
    fn test_recovery_mode() {
        let mut manager = GapRecoveryManager::new("test");

        assert!(!manager.in_recovery());

        // Large gap triggers recovery
        manager.process_message(Some(1));
        manager.process_message(Some(200));

        assert!(manager.in_recovery());

        // Successful message completes recovery
        manager.process_message(Some(201));

        assert!(!manager.in_recovery());
    }

    #[test]
    fn test_reset() {
        let mut manager = GapRecoveryManager::new("test");

        manager.process_message(Some(1));
        manager.process_message(Some(200)); // Trigger recovery

        assert!(manager.in_recovery());
        assert_eq!(manager.gap_count(), 1);

        manager.reset();

        assert!(!manager.in_recovery());
        assert_eq!(manager.gap_count(), 1); // Gap count not reset
    }

    #[test]
    fn test_none_sequence() {
        let mut manager = GapRecoveryManager::new("test");

        // Messages without sequence numbers should still update time
        let result = manager.process_message(None);
        assert!(!result.gap_detected);

        let result = manager.process_message(None);
        assert!(!result.gap_detected);
    }
}
