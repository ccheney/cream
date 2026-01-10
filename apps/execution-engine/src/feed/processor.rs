//! Feed message processor.
//!
//! Processes incoming market data messages from the Databento feed
//! and updates the microstructure state manager.
//!
//! # Architecture
//!
//! The processor runs as an independent async task, consuming messages
//! from a channel and updating shared state:
//!
//! ```text
//! DatabentoFeed ──> mpsc::Receiver ──> FeedProcessor ──> MicrostructureManager
//! ```

use parking_lot::Mutex;
use rust_decimal::Decimal;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, info, warn};

use super::{DatabentoMessage, MicrostructureManager, QuoteUpdate, TradeUpdate};

// ============================================================================
// Feed Processor
// ============================================================================

/// Processes Databento feed messages and updates microstructure state.
///
/// This processor runs as a background task, receiving messages from the
/// feed channel and updating the shared microstructure manager.
pub struct FeedProcessor {
    /// Receiver for feed messages.
    rx: mpsc::Receiver<DatabentoMessage>,
    /// Shared microstructure manager.
    microstructure: Arc<Mutex<MicrostructureManager>>,
    /// Whether to log each message (useful for debugging).
    verbose: bool,
}

impl FeedProcessor {
    /// Create a new feed processor.
    ///
    /// # Arguments
    ///
    /// * `rx` - Channel receiver for incoming messages
    /// * `microstructure` - Shared microstructure manager
    #[must_use]
    pub fn new(
        rx: mpsc::Receiver<DatabentoMessage>,
        microstructure: Arc<Mutex<MicrostructureManager>>,
    ) -> Self {
        Self {
            rx,
            microstructure,
            verbose: false,
        }
    }

    /// Enable verbose logging of each message.
    #[must_use]
    pub const fn with_verbose(mut self, verbose: bool) -> Self {
        self.verbose = verbose;
        self
    }

    /// Run the processor until the channel is closed.
    ///
    /// This method processes messages in a loop until either:
    /// - The channel sender is dropped (feed stopped)
    /// - An unrecoverable error occurs
    pub async fn run(mut self) {
        info!("Feed processor started");
        let mut message_count: u64 = 0;
        let mut trade_count: u64 = 0;
        let mut quote_count: u64 = 0;

        while let Some(msg) = self.rx.recv().await {
            message_count += 1;

            match msg {
                DatabentoMessage::Trade {
                    symbol,
                    price,
                    size,
                    ts_event,
                } => {
                    trade_count += 1;
                    self.handle_trade(&symbol, price, size, ts_event);
                }

                DatabentoMessage::Quote {
                    symbol,
                    bid,
                    ask,
                    bid_size,
                    ask_size,
                    ts_event,
                } => {
                    quote_count += 1;
                    self.handle_quote(&symbol, bid, ask, bid_size, ask_size, ts_event);
                }

                DatabentoMessage::Connected => {
                    info!("Feed connected notification received");
                }

                DatabentoMessage::Disconnected { reason } => {
                    warn!(reason = %reason, "Feed disconnected notification received");
                }

                DatabentoMessage::Error { message } => {
                    warn!(error = %message, "Feed error notification received");
                }
            }

            // Log progress periodically
            if message_count % 10_000 == 0 {
                info!(
                    total = message_count,
                    trades = trade_count,
                    quotes = quote_count,
                    "Feed processor progress"
                );
            }
        }

        info!(
            total = message_count,
            trades = trade_count,
            quotes = quote_count,
            "Feed processor stopped"
        );
    }

    /// Handle a trade message.
    fn handle_trade(&self, symbol: &str, price: Decimal, size: Decimal, _ts_event: i64) {
        if self.verbose {
            debug!(
                symbol = %symbol,
                price = %price,
                size = %size,
                "Processing trade"
            );
        }

        let update = TradeUpdate::new(price, size);
        let mut manager = self.microstructure.lock();
        manager.update_trade(symbol, update);
    }

    /// Handle a quote message.
    fn handle_quote(
        &self,
        symbol: &str,
        bid: Decimal,
        ask: Decimal,
        bid_size: Decimal,
        ask_size: Decimal,
        _ts_event: i64,
    ) {
        if self.verbose {
            debug!(
                symbol = %symbol,
                bid = %bid,
                ask = %ask,
                "Processing quote"
            );
        }

        let update = QuoteUpdate::new(bid, ask, bid_size, ask_size);
        let mut manager = self.microstructure.lock();
        manager.update_quote(symbol, update);
    }
}

// ============================================================================
// Builder
// ============================================================================

/// Builder for creating a feed processor with shared state.
pub struct FeedProcessorBuilder {
    microstructure: Arc<Mutex<MicrostructureManager>>,
    verbose: bool,
}

impl FeedProcessorBuilder {
    /// Create a new builder with a microstructure manager.
    #[must_use]
    pub fn new(microstructure: Arc<Mutex<MicrostructureManager>>) -> Self {
        Self {
            microstructure,
            verbose: false,
        }
    }

    /// Enable verbose logging.
    #[must_use]
    pub const fn verbose(mut self, verbose: bool) -> Self {
        self.verbose = verbose;
        self
    }

    /// Build the processor with the given receiver.
    #[must_use]
    pub fn build(self, rx: mpsc::Receiver<DatabentoMessage>) -> FeedProcessor {
        FeedProcessor::new(rx, self.microstructure).with_verbose(self.verbose)
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;
    use tokio::sync::mpsc;

    fn create_test_manager() -> Arc<Mutex<MicrostructureManager>> {
        Arc::new(Mutex::new(MicrostructureManager::new()))
    }

    #[tokio::test]
    async fn test_processor_handles_trade() {
        let (tx, rx) = mpsc::channel(100);
        let manager = create_test_manager();
        let processor = FeedProcessor::new(rx, Arc::clone(&manager));

        // Spawn processor
        let handle = tokio::spawn(async move {
            processor.run().await;
        });

        // Send a trade
        tx.send(DatabentoMessage::Trade {
            symbol: "AAPL".to_string(),
            price: dec!(150.50),
            size: dec!(100),
            ts_event: 0,
        })
        .await
        .unwrap();

        // Close channel to stop processor
        drop(tx);
        handle.await.unwrap();

        // Verify state was updated
        let mut state = manager.lock();
        let aapl_state = state.snapshot("AAPL");
        assert!(aapl_state.is_some());
        assert_eq!(aapl_state.unwrap().last_trade, dec!(150.50));
    }

    #[tokio::test]
    async fn test_processor_handles_quote() {
        let (tx, rx) = mpsc::channel(100);
        let manager = create_test_manager();
        let processor = FeedProcessor::new(rx, Arc::clone(&manager));

        let handle = tokio::spawn(async move {
            processor.run().await;
        });

        tx.send(DatabentoMessage::Quote {
            symbol: "MSFT".to_string(),
            bid: dec!(380.00),
            ask: dec!(380.10),
            bid_size: dec!(100),
            ask_size: dec!(150),
            ts_event: 0,
        })
        .await
        .unwrap();

        drop(tx);
        handle.await.unwrap();

        let mut state = manager.lock();
        let msft_state = state.snapshot("MSFT");
        assert!(msft_state.is_some());
        let ms = msft_state.unwrap();
        assert_eq!(ms.bid, dec!(380.00));
        assert_eq!(ms.ask, dec!(380.10));
    }

    #[tokio::test]
    async fn test_processor_handles_connection_events() {
        let (tx, rx) = mpsc::channel(100);
        let manager = create_test_manager();
        let processor = FeedProcessor::new(rx, Arc::clone(&manager));

        let handle = tokio::spawn(async move {
            processor.run().await;
        });

        // These should not crash
        tx.send(DatabentoMessage::Connected).await.unwrap();
        tx.send(DatabentoMessage::Disconnected {
            reason: "test".to_string(),
        })
        .await
        .unwrap();
        tx.send(DatabentoMessage::Error {
            message: "test error".to_string(),
        })
        .await
        .unwrap();

        drop(tx);
        handle.await.unwrap();
    }

    #[test]
    fn test_builder() {
        let manager = create_test_manager();
        let (_tx, rx) = mpsc::channel(100);

        let processor = FeedProcessorBuilder::new(manager).verbose(true).build(rx);

        assert!(processor.verbose);
    }
}
