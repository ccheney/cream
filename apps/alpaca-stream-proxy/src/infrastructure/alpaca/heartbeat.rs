//! Heartbeat Manager
//!
//! Manages WebSocket connection health through periodic ping/pong messages.
//! Triggers reconnection when heartbeat timeouts occur.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use parking_lot::RwLock;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

/// Configuration for heartbeat behavior.
#[derive(Debug, Clone)]
pub struct HeartbeatConfig {
    /// Interval between ping messages.
    pub ping_interval: Duration,
    /// Timeout for pong response before connection is considered dead.
    pub pong_timeout: Duration,
}

impl Default for HeartbeatConfig {
    fn default() -> Self {
        Self {
            ping_interval: Duration::from_secs(20),
            pong_timeout: Duration::from_secs(20),
        }
    }
}

impl HeartbeatConfig {
    /// Create a new configuration with custom values.
    #[must_use]
    pub const fn new(ping_interval: Duration, pong_timeout: Duration) -> Self {
        Self {
            ping_interval,
            pong_timeout,
        }
    }

    /// Create configuration from `WebSocketSettings`.
    #[must_use]
    pub const fn from_websocket_settings(settings: &crate::WebSocketSettings) -> Self {
        Self {
            ping_interval: settings.heartbeat_interval,
            pong_timeout: settings.heartbeat_timeout,
        }
    }
}

/// Events emitted by the heartbeat manager.
#[derive(Debug, Clone)]
pub enum HeartbeatEvent {
    /// Request to send a ping message.
    SendPing,
    /// Heartbeat timeout occurred, connection should be restarted.
    Timeout,
}

/// State shared between heartbeat manager and WebSocket handlers.
#[derive(Debug)]
pub struct HeartbeatState {
    last_pong: RwLock<Instant>,
    waiting_for_pong: AtomicBool,
}

impl Default for HeartbeatState {
    fn default() -> Self {
        Self::new()
    }
}

impl HeartbeatState {
    /// Create new heartbeat state.
    #[must_use]
    pub fn new() -> Self {
        Self {
            last_pong: RwLock::new(Instant::now()),
            waiting_for_pong: AtomicBool::new(false),
        }
    }

    /// Record that a pong was received.
    pub fn record_pong(&self) {
        *self.last_pong.write() = Instant::now();
        self.waiting_for_pong.store(false, Ordering::SeqCst);
    }

    /// Mark that we're waiting for a pong.
    pub fn mark_ping_sent(&self) {
        self.waiting_for_pong.store(true, Ordering::SeqCst);
    }

    /// Check if we're currently waiting for a pong.
    #[must_use]
    pub fn is_waiting_for_pong(&self) -> bool {
        self.waiting_for_pong.load(Ordering::SeqCst)
    }

    /// Get the time since last pong.
    #[must_use]
    pub fn time_since_pong(&self) -> Duration {
        self.last_pong.read().elapsed()
    }

    /// Reset state for new connection.
    pub fn reset(&self) {
        *self.last_pong.write() = Instant::now();
        self.waiting_for_pong.store(false, Ordering::SeqCst);
    }
}

/// Heartbeat manager that monitors connection health.
///
/// # Example
///
/// ```rust,no_run
/// use alpaca_stream_proxy::infrastructure::alpaca::heartbeat::{
///     HeartbeatConfig, HeartbeatManager, HeartbeatState, HeartbeatEvent,
/// };
/// use std::sync::Arc;
/// use tokio::sync::mpsc;
/// use tokio_util::sync::CancellationToken;
///
/// async fn example() {
///     let config = HeartbeatConfig::default();
///     let state = Arc::new(HeartbeatState::new());
///     let (event_tx, mut event_rx) = mpsc::channel(10);
///     let cancel = CancellationToken::new();
///
///     let manager = HeartbeatManager::new(config, state.clone(), event_tx, cancel.clone());
///
///     // Spawn the manager
///     tokio::spawn(manager.run());
///
///     // Handle events
///     while let Some(event) = event_rx.recv().await {
///         match event {
///             HeartbeatEvent::SendPing => {
///                 // Send ping over WebSocket
///                 state.mark_ping_sent();
///             }
///             HeartbeatEvent::Timeout => {
///                 // Trigger reconnection
///                 break;
///             }
///         }
///     }
/// }
/// ```
pub struct HeartbeatManager {
    config: HeartbeatConfig,
    state: Arc<HeartbeatState>,
    event_tx: mpsc::Sender<HeartbeatEvent>,
    cancel: CancellationToken,
}

impl HeartbeatManager {
    /// Create a new heartbeat manager.
    #[must_use]
    pub const fn new(
        config: HeartbeatConfig,
        state: Arc<HeartbeatState>,
        event_tx: mpsc::Sender<HeartbeatEvent>,
        cancel: CancellationToken,
    ) -> Self {
        Self {
            config,
            state,
            event_tx,
            cancel,
        }
    }

    /// Run the heartbeat monitoring loop.
    ///
    /// This method runs until cancelled or a timeout is detected.
    pub async fn run(self) {
        let mut interval = tokio::time::interval(self.config.ping_interval);
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

        loop {
            tokio::select! {
                () = self.cancel.cancelled() => {
                    tracing::debug!("Heartbeat manager cancelled");
                    break;
                }
                _ = interval.tick() => {
                    if self.check_and_ping().await.is_err() {
                        break;
                    }
                }
            }
        }
    }

    /// Check heartbeat state and send ping if needed.
    ///
    /// Returns `Err(())` if a timeout occurred and the loop should exit.
    async fn check_and_ping(&self) -> Result<(), ()> {
        // Check for timeout
        if self.state.is_waiting_for_pong() {
            let elapsed = self.state.time_since_pong();
            if elapsed > self.config.pong_timeout {
                tracing::warn!(
                    elapsed_secs = elapsed.as_secs(),
                    timeout_secs = self.config.pong_timeout.as_secs(),
                    "Heartbeat timeout detected"
                );
                let _ = self.event_tx.send(HeartbeatEvent::Timeout).await;
                return Err(());
            }
        }

        // Send ping request
        if self.event_tx.send(HeartbeatEvent::SendPing).await.is_err() {
            tracing::debug!("Event channel closed, stopping heartbeat");
            return Err(());
        }

        Ok(())
    }
}

/// Error type for heartbeat operations.
#[derive(Debug, thiserror::Error)]
pub enum HeartbeatError {
    /// Heartbeat timeout occurred.
    #[error("heartbeat timeout after {0:?}")]
    Timeout(Duration),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_values() {
        let config = HeartbeatConfig::default();
        assert_eq!(config.ping_interval, Duration::from_secs(20));
        assert_eq!(config.pong_timeout, Duration::from_secs(20));
    }

    #[test]
    fn state_initial_values() {
        let state = HeartbeatState::new();
        assert!(!state.is_waiting_for_pong());
        assert!(state.time_since_pong() < Duration::from_millis(100));
    }

    #[test]
    fn state_record_pong() {
        let state = HeartbeatState::new();
        state.mark_ping_sent();
        assert!(state.is_waiting_for_pong());

        state.record_pong();
        assert!(!state.is_waiting_for_pong());
    }

    #[test]
    fn state_reset() {
        let state = HeartbeatState::new();
        state.mark_ping_sent();
        assert!(state.is_waiting_for_pong());

        state.reset();
        assert!(!state.is_waiting_for_pong());
    }

    #[tokio::test]
    async fn manager_sends_ping_events() {
        let config = HeartbeatConfig::new(Duration::from_millis(50), Duration::from_secs(1));
        let state = Arc::new(HeartbeatState::new());
        let (event_tx, mut event_rx) = mpsc::channel(10);
        let cancel = CancellationToken::new();

        let manager = HeartbeatManager::new(config, state.clone(), event_tx, cancel.clone());

        // Spawn manager
        let handle = tokio::spawn(manager.run());

        // Wait for first ping
        let event = tokio::time::timeout(Duration::from_millis(200), event_rx.recv())
            .await
            .expect("should receive event")
            .expect("channel should not close");

        assert!(matches!(event, HeartbeatEvent::SendPing));

        // Cancel and wait for shutdown
        cancel.cancel();
        handle.await.expect("task should complete");
    }

    #[tokio::test]
    async fn manager_detects_timeout() {
        let config = HeartbeatConfig::new(Duration::from_millis(50), Duration::from_millis(100));
        let state = Arc::new(HeartbeatState::new());
        let (event_tx, mut event_rx) = mpsc::channel(10);
        let cancel = CancellationToken::new();

        let manager = HeartbeatManager::new(config, state.clone(), event_tx, cancel.clone());

        // Mark as waiting for pong (simulating sent ping)
        state.mark_ping_sent();

        // Set last pong to be in the past
        {
            *state.last_pong.write() = Instant::now()
                .checked_sub(Duration::from_millis(200))
                .unwrap();
        }

        // Spawn manager
        let handle = tokio::spawn(manager.run());

        // Should receive timeout event
        let mut received_timeout = false;
        while let Ok(Some(event)) =
            tokio::time::timeout(Duration::from_millis(500), event_rx.recv()).await
        {
            if matches!(event, HeartbeatEvent::Timeout) {
                received_timeout = true;
                break;
            }
        }

        assert!(received_timeout, "should receive timeout event");

        // Manager should have exited
        cancel.cancel();
        let _ = tokio::time::timeout(Duration::from_millis(100), handle).await;
    }

    #[tokio::test]
    async fn manager_cancellation() {
        let config = HeartbeatConfig::new(Duration::from_secs(10), Duration::from_secs(10));
        let state = Arc::new(HeartbeatState::new());
        let (event_tx, _event_rx) = mpsc::channel(10);
        let cancel = CancellationToken::new();

        let manager = HeartbeatManager::new(config, state, event_tx, cancel.clone());

        let handle = tokio::spawn(manager.run());

        // Cancel immediately
        cancel.cancel();

        // Should complete quickly
        let result = tokio::time::timeout(Duration::from_millis(100), handle).await;
        assert!(result.is_ok(), "manager should shut down on cancellation");
    }
}
