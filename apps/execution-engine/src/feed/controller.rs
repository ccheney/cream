//! Feed Controller
//!
//! Manages the Databento feed lifecycle and provides an interface for
//! dynamic symbol subscription from gRPC services.
//!
//! The controller allows TypeScript services to:
//! - Start the feed with a set of symbols from runtime config
//! - Update subscriptions dynamically
//! - Access microstructure state for streaming

use parking_lot::Mutex;
use std::collections::HashSet;
use std::sync::Arc;
use tokio::sync::{broadcast, watch};
use tracing::{info, warn};

use super::{
    DatabentoFeed, DatabentoFeedConfig, FeedProcessor, MicrostructureManager, create_feed_channel,
};
use crate::config::DatabentoConfig;

// ============================================================================
// Feed Controller
// ============================================================================

/// Controller for managing the Databento feed lifecycle.
///
/// Provides an interface for gRPC services to start, stop, and update
/// feed subscriptions dynamically based on runtime config.
pub struct FeedController {
    /// Shared microstructure manager.
    microstructure: Arc<Mutex<MicrostructureManager>>,
    /// Feed configuration.
    config: DatabentoConfig,
    /// Currently subscribed symbols.
    subscribed_symbols: Arc<Mutex<HashSet<String>>>,
    /// Channel to signal feed restart with new symbols.
    symbol_update_tx: watch::Sender<Vec<String>>,
    /// Whether the feed is currently running.
    is_running: Arc<Mutex<bool>>,
}

impl FeedController {
    /// Create a new feed controller.
    ///
    /// # Arguments
    ///
    /// * `config` - Databento configuration
    #[must_use]
    pub fn new(config: DatabentoConfig) -> Self {
        let (symbol_update_tx, _) = watch::channel(Vec::new());

        Self {
            microstructure: Arc::new(Mutex::new(MicrostructureManager::new())),
            config,
            subscribed_symbols: Arc::new(Mutex::new(HashSet::new())),
            symbol_update_tx,
            is_running: Arc::new(Mutex::new(false)),
        }
    }

    /// Get a reference to the microstructure manager.
    #[must_use]
    pub fn microstructure(&self) -> Arc<Mutex<MicrostructureManager>> {
        Arc::clone(&self.microstructure)
    }

    /// Get currently subscribed symbols.
    #[must_use]
    pub fn subscribed_symbols(&self) -> Vec<String> {
        self.subscribed_symbols.lock().iter().cloned().collect()
    }

    /// Check if the feed is running.
    #[must_use]
    pub fn is_running(&self) -> bool {
        *self.is_running.lock()
    }

    /// Start the feed with the given symbols.
    ///
    /// If the feed is already running, this will update the subscribed symbols.
    /// The feed processor runs in the background, updating the microstructure manager.
    ///
    /// # Arguments
    ///
    /// * `symbols` - Symbols to subscribe to
    /// * `shutdown_rx` - Receiver for shutdown signal
    ///
    /// # Returns
    ///
    /// `true` if the feed was started, `false` if already running (symbols updated).
    pub fn start(&self, symbols: Vec<String>, shutdown_rx: broadcast::Receiver<()>) -> bool {
        // Check if API key is configured
        if self.config.api_key.is_empty() {
            warn!(
                "DATABENTO_KEY not set - feed cannot start. \
                 Set the environment variable and restart."
            );
            return false;
        }

        // Update subscribed symbols
        {
            let mut subs = self.subscribed_symbols.lock();
            subs.clear();
            subs.extend(symbols.iter().cloned());
        }

        // Check if already running
        let mut is_running = self.is_running.lock();
        if *is_running {
            info!(
                symbol_count = symbols.len(),
                "Feed already running, updating symbols"
            );
            // Send update signal
            let _ = self.symbol_update_tx.send(symbols);
            return false;
        }

        *is_running = true;
        drop(is_running);

        // Start the feed
        self.spawn_feed(symbols, shutdown_rx);

        true
    }

    /// Stop the feed.
    ///
    /// Note: This doesn't actually stop the feed - it relies on the shutdown signal.
    /// The feed will stop when the shutdown broadcast is sent.
    pub fn stop(&self) {
        let mut is_running = self.is_running.lock();
        *is_running = false;

        let mut subs = self.subscribed_symbols.lock();
        subs.clear();
    }

    /// Spawn the feed and processor tasks.
    fn spawn_feed(&self, symbols: Vec<String>, shutdown_rx: broadcast::Receiver<()>) {
        let feed_config = DatabentoFeedConfig::from(&self.config);
        let microstructure = Arc::clone(&self.microstructure);
        let is_running = Arc::clone(&self.is_running);

        // Create feed channel
        let (tx, rx) = create_feed_channel(Some(10_000));

        // Spawn feed processor
        let processor = FeedProcessor::new(rx, microstructure);
        tokio::spawn(async move {
            processor.run().await;
        });

        // Spawn feed consumer
        let feed = DatabentoFeed::new(feed_config, tx);
        let mut shutdown = shutdown_rx;

        tokio::spawn(async move {
            tokio::select! {
                result = feed.start(symbols) => {
                    if let Err(e) = result {
                        tracing::error!(error = %e, "Databento feed error");
                    }
                    // Mark as not running when feed exits
                    *is_running.lock() = false;
                }
                _ = shutdown.recv() => {
                    tracing::info!("Databento feed shutting down");
                    *is_running.lock() = false;
                }
            }
        });

        info!("Databento feed started");
    }
}

impl std::fmt::Debug for FeedController {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("FeedController")
            .field("is_running", &self.is_running())
            .field("subscribed_symbols", &self.subscribed_symbols())
            .finish()
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_config() -> DatabentoConfig {
        DatabentoConfig {
            api_key: String::new(), // Empty key for testing
            dataset: "XNAS.ITCH".to_string(),
            reconnect_delay_ms: 1000,
            max_reconnect_attempts: 3,
            symbols: vec![],
        }
    }

    #[test]
    fn test_new_controller() {
        let config = create_test_config();
        let controller = FeedController::new(config);

        assert!(!controller.is_running());
        assert!(controller.subscribed_symbols().is_empty());
    }

    #[test]
    fn test_microstructure_access() {
        let config = create_test_config();
        let controller = FeedController::new(config);

        let manager = controller.microstructure();
        // Should be able to lock and access
        let _ = manager.lock();
    }

    #[tokio::test]
    async fn test_start_without_api_key() {
        let config = create_test_config();
        let controller = FeedController::new(config);

        let (shutdown_tx, _) = broadcast::channel(1);
        let shutdown_rx = shutdown_tx.subscribe();

        // Should return false when API key is missing
        let started = controller.start(vec!["AAPL".to_string()], shutdown_rx);
        assert!(!started);
        assert!(!controller.is_running());
    }

    #[test]
    fn test_stop_clears_symbols() {
        let config = create_test_config();
        let controller = FeedController::new(config);

        // Manually set some symbols
        {
            let mut subs = controller.subscribed_symbols.lock();
            subs.insert("AAPL".to_string());
        }

        controller.stop();

        assert!(controller.subscribed_symbols().is_empty());
        assert!(!controller.is_running());
    }
}
