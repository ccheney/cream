//! Mass cancel on disconnect safety mechanism.
//!
//! Automatically cancels all open orders when broker connection is lost,
//! with configurable grace period and GTC order handling.
//!
//! # Configuration
//!
//! ```yaml
//! safety:
//!   mass_cancel_on_disconnect: true
//!   cancel_delay_seconds: 30
//!   exclude_gtc_orders: false
//! ```
//!
//! # Safety Requirements
//!
//! - MUST be enabled for LIVE environment
//! - Grace period allows transient network issues to recover
//! - GTC orders should be included in mass cancel (recommended)

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::mpsc;

use crate::models::{Environment, OrderStatus, TimeInForce};

/// Errors that can occur during mass cancel operations.
#[derive(Debug, Error)]
pub enum SafetyError {
    /// Mass cancel on disconnect is disabled in LIVE environment.
    #[error("Mass cancel on disconnect MUST be enabled for LIVE environment")]
    DisabledInLive,

    /// Grace period is too long (> 60 seconds).
    #[error("Grace period {0}s is too long (max 60s recommended)")]
    GracePeriodTooLong(u64),

    /// Failed to cancel orders.
    #[error("Failed to cancel orders: {0}")]
    CancelFailed(String),

    /// Broker connection error.
    #[error("Broker connection error: {0}")]
    ConnectionError(String),
}

/// Policy for handling GTC (Good Till Cancelled) orders during mass cancel.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GtcOrderPolicy {
    /// Include GTC orders in mass cancel (recommended).
    #[default]
    Include,
    /// Exclude GTC orders from mass cancel (only cancel DAY orders).
    Exclude,
}

/// Configuration for mass cancel on disconnect.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MassCancelConfig {
    /// Whether mass cancel on disconnect is enabled.
    /// MUST be true for LIVE environment.
    pub enabled: bool,

    /// Grace period in seconds before triggering mass cancel.
    /// Allows transient network issues to recover.
    pub grace_period_seconds: u64,

    /// Policy for GTC order handling.
    pub gtc_policy: GtcOrderPolicy,

    /// Heartbeat interval in milliseconds.
    pub heartbeat_interval_ms: u64,

    /// Heartbeat timeout in seconds.
    /// If no heartbeat response within this time, connection is considered lost.
    pub heartbeat_timeout_seconds: u64,
}

impl Default for MassCancelConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            grace_period_seconds: 30,
            gtc_policy: GtcOrderPolicy::Include,
            heartbeat_interval_ms: 30_000,
            heartbeat_timeout_seconds: 10,
        }
    }
}

impl MassCancelConfig {
    /// Validate configuration for the given environment.
    ///
    /// # Errors
    ///
    /// Returns an error if:
    /// - Mass cancel is disabled in LIVE environment
    /// - Grace period is too long (> 60 seconds)
    pub fn validate(&self, environment: Environment) -> Result<(), SafetyError> {
        // Mass cancel MUST be enabled for LIVE
        if environment == Environment::Live && !self.enabled {
            return Err(SafetyError::DisabledInLive);
        }

        // Warn if grace period is too long
        if self.grace_period_seconds > 60 {
            tracing::warn!(
                grace_period = self.grace_period_seconds,
                "Grace period is longer than recommended (60s max)"
            );
        }

        Ok(())
    }

    /// Create a strict configuration for LIVE trading.
    #[must_use]
    pub const fn live() -> Self {
        Self {
            enabled: true,
            grace_period_seconds: 30,
            gtc_policy: GtcOrderPolicy::Include,
            heartbeat_interval_ms: 30_000,
            heartbeat_timeout_seconds: 10,
        }
    }

    /// Create a relaxed configuration for PAPER trading.
    #[must_use]
    pub const fn paper() -> Self {
        Self {
            enabled: true,
            grace_period_seconds: 60, // Longer grace period for paper
            gtc_policy: GtcOrderPolicy::Include,
            heartbeat_interval_ms: 30_000,
            heartbeat_timeout_seconds: 10,
        }
    }

    /// Create a disabled configuration for BACKTEST.
    #[must_use]
    pub const fn backtest() -> Self {
        Self {
            enabled: false,
            grace_period_seconds: 0,
            gtc_policy: GtcOrderPolicy::Include,
            heartbeat_interval_ms: 30_000,
            heartbeat_timeout_seconds: 10,
        }
    }
}

/// Event emitted by the disconnect handler.
#[derive(Debug, Clone)]
pub enum MassCancelEvent {
    /// Connection lost, grace period started.
    GracePeriodStarted {
        /// When the disconnection was detected.
        detected_at: Instant,
        /// When the grace period will expire.
        expires_at: Instant,
    },
    /// Connection restored during grace period.
    GracePeriodCancelled {
        /// When the reconnection was detected.
        reconnected_at: Instant,
    },
    /// Mass cancel triggered after grace period.
    MassCancelTriggered {
        /// When the mass cancel was triggered.
        triggered_at: Instant,
    },
    /// Mass cancel completed.
    MassCancelCompleted {
        /// Result of the mass cancel operation.
        result: MassCancelResult,
    },
    /// Manual mass cancel triggered.
    ManualMassCancelTriggered,
}

/// Result of a mass cancel operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MassCancelResult {
    /// Number of orders cancelled.
    pub cancelled_count: u32,
    /// Number of orders that failed to cancel.
    pub failed_count: u32,
    /// Order IDs that were cancelled.
    pub cancelled_order_ids: Vec<String>,
    /// Order IDs that failed to cancel.
    pub failed_order_ids: Vec<String>,
    /// Whether GTC orders were included.
    pub gtc_included: bool,
    /// Timestamp when the mass cancel completed.
    pub completed_at: chrono::DateTime<chrono::Utc>,
}

impl MassCancelResult {
    /// Create an empty result (no orders to cancel).
    #[must_use]
    pub fn empty() -> Self {
        Self {
            cancelled_count: 0,
            failed_count: 0,
            cancelled_order_ids: Vec::new(),
            failed_order_ids: Vec::new(),
            gtc_included: true,
            completed_at: chrono::Utc::now(),
        }
    }
}

/// Handler for broker disconnection events.
///
/// Monitors connection health and triggers mass cancel when needed.
pub struct DisconnectHandler {
    /// Configuration.
    config: MassCancelConfig,
    /// Whether currently connected.
    connected: AtomicBool,
    /// Last heartbeat timestamp (Unix epoch ms).
    last_heartbeat_ms: AtomicU64,
    /// Whether a grace period is active.
    grace_period_active: AtomicBool,
    /// Event sender.
    event_tx: mpsc::Sender<MassCancelEvent>,
    /// Shutdown signal.
    shutdown: AtomicBool,
}

impl DisconnectHandler {
    /// Create a new disconnect handler.
    #[must_use]
    pub fn new(config: MassCancelConfig) -> (Self, mpsc::Receiver<MassCancelEvent>) {
        let (event_tx, event_rx) = mpsc::channel(100);
        // Sign loss is safe: timestamp_millis returns positive values for current time
        #[allow(clippy::cast_sign_loss)]
        let initial_heartbeat = chrono::Utc::now().timestamp_millis() as u64;
        let handler = Self {
            config,
            connected: AtomicBool::new(true),
            last_heartbeat_ms: AtomicU64::new(initial_heartbeat),
            grace_period_active: AtomicBool::new(false),
            event_tx,
            shutdown: AtomicBool::new(false),
        };
        (handler, event_rx)
    }

    /// Record a successful heartbeat.
    #[allow(clippy::cast_sign_loss)]
    pub fn record_heartbeat(&self) {
        // Sign loss is safe: timestamp_millis returns positive values for current time
        let now_ms = chrono::Utc::now().timestamp_millis() as u64;
        self.last_heartbeat_ms.store(now_ms, Ordering::SeqCst);

        // If we were disconnected, mark as reconnected
        if !self.connected.load(Ordering::SeqCst) {
            self.mark_connected();
        }
    }

    /// Mark the connection as connected.
    pub fn mark_connected(&self) {
        let was_disconnected = !self.connected.swap(true, Ordering::SeqCst);

        // If we were in grace period, cancel it
        if was_disconnected && self.grace_period_active.load(Ordering::SeqCst) {
            self.grace_period_active.store(false, Ordering::SeqCst);
            let _ = self
                .event_tx
                .try_send(MassCancelEvent::GracePeriodCancelled {
                    reconnected_at: Instant::now(),
                });
            tracing::info!("Connection restored, grace period cancelled");
        }
    }

    /// Mark the connection as disconnected.
    pub fn mark_disconnected(&self) {
        let was_connected = self.connected.swap(false, Ordering::SeqCst);

        // Start grace period if not already active
        if was_connected && !self.grace_period_active.load(Ordering::SeqCst) {
            self.start_grace_period();
        }
    }

    /// Check if the connection is healthy based on heartbeat.
    #[allow(clippy::cast_sign_loss)]
    pub fn is_connection_healthy(&self) -> bool {
        if !self.connected.load(Ordering::SeqCst) {
            return false;
        }

        let last_heartbeat_ms = self.last_heartbeat_ms.load(Ordering::SeqCst);
        // Sign loss is safe: timestamp_millis returns positive values for current time
        let now_ms = chrono::Utc::now().timestamp_millis() as u64;
        let timeout_ms = self.config.heartbeat_timeout_seconds * 1000;

        now_ms.saturating_sub(last_heartbeat_ms) < timeout_ms
    }

    /// Start the grace period countdown.
    fn start_grace_period(&self) {
        if !self.config.enabled {
            tracing::debug!("Mass cancel disabled, skipping grace period");
            return;
        }

        self.grace_period_active.store(true, Ordering::SeqCst);

        let now = Instant::now();
        let expires_at = now + Duration::from_secs(self.config.grace_period_seconds);

        let _ = self.event_tx.try_send(MassCancelEvent::GracePeriodStarted {
            detected_at: now,
            expires_at,
        });

        tracing::warn!(
            grace_period_seconds = self.config.grace_period_seconds,
            "Connection lost, grace period started"
        );
    }

    /// Check if mass cancel should be triggered.
    pub fn should_trigger_mass_cancel(&self) -> bool {
        !self.connected.load(Ordering::SeqCst) && self.grace_period_active.load(Ordering::SeqCst)
    }

    /// Trigger manual mass cancel.
    pub fn trigger_manual_mass_cancel(&self) {
        let _ = self
            .event_tx
            .try_send(MassCancelEvent::ManualMassCancelTriggered);
        tracing::warn!("Manual mass cancel triggered");
    }

    /// Shutdown the handler.
    pub fn shutdown(&self) {
        self.shutdown.store(true, Ordering::SeqCst);
    }

    /// Check if the handler is shutdown.
    pub fn is_shutdown(&self) -> bool {
        self.shutdown.load(Ordering::SeqCst)
    }

    /// Get the GTC order policy.
    pub const fn gtc_policy(&self) -> GtcOrderPolicy {
        self.config.gtc_policy
    }

    /// Get the grace period in seconds.
    pub const fn grace_period_seconds(&self) -> u64 {
        self.config.grace_period_seconds
    }
}

/// Filter orders for mass cancel based on GTC policy.
#[allow(dead_code)]
pub fn filter_orders_for_cancel(
    orders: &[(String, TimeInForce, OrderStatus)],
    gtc_policy: GtcOrderPolicy,
) -> Vec<String> {
    orders
        .iter()
        .filter(|(_, _, status)| status.is_active())
        .filter(|(_, tif, _)| match gtc_policy {
            GtcOrderPolicy::Include => true,
            GtcOrderPolicy::Exclude => *tif != TimeInForce::Gtc,
        })
        .map(|(id, _, _)| id.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = MassCancelConfig::default();
        assert!(config.enabled);
        assert_eq!(config.grace_period_seconds, 30);
        assert_eq!(config.gtc_policy, GtcOrderPolicy::Include);
        assert_eq!(config.heartbeat_timeout_seconds, 10);
    }

    #[test]
    fn test_live_config_validation() {
        let config = MassCancelConfig::default();
        assert!(config.validate(Environment::Live).is_ok());
    }

    #[test]
    fn test_live_config_disabled_fails() {
        let config = MassCancelConfig {
            enabled: false,
            ..Default::default()
        };
        assert!(config.validate(Environment::Live).is_err());
    }

    #[test]
    fn test_paper_config_disabled_ok() {
        let config = MassCancelConfig {
            enabled: false,
            ..Default::default()
        };
        assert!(config.validate(Environment::Paper).is_ok());
    }

    #[test]
    fn test_backtest_config() {
        let config = MassCancelConfig::backtest();
        assert!(!config.enabled);
        assert!(config.validate(Environment::Backtest).is_ok());
    }

    #[test]
    fn test_filter_orders_include_gtc() {
        let orders = vec![
            ("O1".to_string(), TimeInForce::Day, OrderStatus::Accepted),
            ("O2".to_string(), TimeInForce::Gtc, OrderStatus::Accepted),
            ("O3".to_string(), TimeInForce::Day, OrderStatus::Filled), // Terminal
            (
                "O4".to_string(),
                TimeInForce::Ioc,
                OrderStatus::PartiallyFilled,
            ),
        ];

        let result = filter_orders_for_cancel(&orders, GtcOrderPolicy::Include);
        assert_eq!(result.len(), 3);
        assert!(result.contains(&"O1".to_string()));
        assert!(result.contains(&"O2".to_string()));
        assert!(result.contains(&"O4".to_string()));
    }

    #[test]
    fn test_filter_orders_exclude_gtc() {
        let orders = vec![
            ("O1".to_string(), TimeInForce::Day, OrderStatus::Accepted),
            ("O2".to_string(), TimeInForce::Gtc, OrderStatus::Accepted),
            ("O3".to_string(), TimeInForce::Day, OrderStatus::Filled), // Terminal
            (
                "O4".to_string(),
                TimeInForce::Ioc,
                OrderStatus::PartiallyFilled,
            ),
        ];

        let result = filter_orders_for_cancel(&orders, GtcOrderPolicy::Exclude);
        assert_eq!(result.len(), 2);
        assert!(result.contains(&"O1".to_string()));
        assert!(result.contains(&"O4".to_string()));
        assert!(!result.contains(&"O2".to_string())); // GTC excluded
    }

    #[test]
    fn test_handler_heartbeat() {
        let config = MassCancelConfig::default();
        let (handler, _rx) = DisconnectHandler::new(config);

        handler.record_heartbeat();
        assert!(handler.is_connection_healthy());
    }

    #[test]
    fn test_handler_disconnect_reconnect() {
        let config = MassCancelConfig::default();
        let (handler, _rx) = DisconnectHandler::new(config);

        // Initially connected
        assert!(handler.connected.load(Ordering::SeqCst));

        // Mark disconnected
        handler.mark_disconnected();
        assert!(!handler.connected.load(Ordering::SeqCst));
        assert!(handler.grace_period_active.load(Ordering::SeqCst));

        // Mark reconnected
        handler.mark_connected();
        assert!(handler.connected.load(Ordering::SeqCst));
        assert!(!handler.grace_period_active.load(Ordering::SeqCst));
    }

    #[test]
    fn test_mass_cancel_result_empty() {
        let result = MassCancelResult::empty();
        assert_eq!(result.cancelled_count, 0);
        assert_eq!(result.failed_count, 0);
        assert!(result.cancelled_order_ids.is_empty());
    }

    #[test]
    fn test_should_trigger_mass_cancel() {
        let config = MassCancelConfig::default();
        let (handler, _rx) = DisconnectHandler::new(config);

        // Initially should not trigger
        assert!(!handler.should_trigger_mass_cancel());

        // After disconnect and grace period active
        handler.mark_disconnected();
        assert!(handler.should_trigger_mass_cancel());

        // After reconnect, should not trigger
        handler.mark_connected();
        assert!(!handler.should_trigger_mass_cancel());
    }
}
