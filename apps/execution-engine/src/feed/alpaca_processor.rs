//! Alpaca feed message processor.
//!
//! Processes incoming market data messages from the Alpaca feed
//! and updates the microstructure state manager.
//!
//! # Architecture
//!
//! The processor runs as an independent async task, consuming messages
//! from a channel and updating shared state:
//!
//! ```text
//! AlpacaFeed ──> mpsc::Receiver ──> AlpacaProcessor ──> MicrostructureManager
//! ```

use parking_lot::Mutex;
use rust_decimal::Decimal;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{debug, info, warn};

use super::alpaca::AlpacaMessage;
use super::{MicrostructureManager, QuoteUpdate, TradeUpdate};

// ============================================================================
// Alpaca Processor
// ============================================================================

/// Processes Alpaca feed messages and updates microstructure state.
///
/// This processor runs as a background task, receiving messages from the
/// feed channel and updating the shared microstructure manager.
pub struct AlpacaProcessor {
    /// Receiver for feed messages.
    rx: mpsc::Receiver<AlpacaMessage>,
    /// Shared microstructure manager.
    microstructure: Arc<Mutex<MicrostructureManager>>,
    /// Whether to log each message (useful for debugging).
    verbose: bool,
}

impl AlpacaProcessor {
    /// Create a new Alpaca processor.
    ///
    /// # Arguments
    ///
    /// * `rx` - Channel receiver for incoming messages
    /// * `microstructure` - Shared microstructure manager
    #[must_use]
    #[allow(clippy::missing_const_for_fn)] // mpsc::Receiver is not const-constructible
    pub fn new(
        rx: mpsc::Receiver<AlpacaMessage>,
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
        info!("Alpaca processor started");
        let mut message_count: u64 = 0;
        let mut trade_count: u64 = 0;
        let mut quote_count: u64 = 0;
        let mut bar_count: u64 = 0;

        while let Some(msg) = self.rx.recv().await {
            message_count += 1;

            match msg {
                AlpacaMessage::Trade {
                    symbol,
                    price,
                    size,
                    ts_event: _,
                } => {
                    trade_count += 1;
                    self.handle_trade(&symbol, price, size);
                }

                AlpacaMessage::Quote {
                    symbol,
                    bid,
                    ask,
                    bid_size,
                    ask_size,
                    ts_event: _,
                } => {
                    quote_count += 1;
                    self.handle_quote(&symbol, bid, ask, bid_size, ask_size);
                }

                AlpacaMessage::Bar {
                    symbol,
                    close,
                    volume: _,
                    ts_event: _,
                    ..
                } => {
                    bar_count += 1;
                    if self.verbose {
                        debug!(symbol = %symbol, close = %close, "Received bar");
                    }
                    // Bars are informational - we don't update microstructure
                    // since we're using real-time quotes/trades
                }

                AlpacaMessage::Connected => {
                    info!("Alpaca feed connected notification received");
                }

                AlpacaMessage::Disconnected { reason } => {
                    warn!(reason = %reason, "Alpaca feed disconnected notification received");
                }

                AlpacaMessage::Error { message } => {
                    warn!(error = %message, "Alpaca feed error notification received");
                }
            }

            // Log progress periodically
            if message_count.is_multiple_of(10_000) {
                info!(
                    total = message_count,
                    trades = trade_count,
                    quotes = quote_count,
                    bars = bar_count,
                    "Alpaca processor progress"
                );
            }
        }

        info!(
            total = message_count,
            trades = trade_count,
            quotes = quote_count,
            bars = bar_count,
            "Alpaca processor stopped"
        );
    }

    /// Handle a trade message.
    fn handle_trade(&self, symbol: &str, price: Decimal, size: Decimal) {
        if self.verbose {
            debug!(
                symbol = %symbol,
                price = %price,
                size = %size,
                "Processing Alpaca trade"
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
    ) {
        if self.verbose {
            debug!(
                symbol = %symbol,
                bid = %bid,
                ask = %ask,
                "Processing Alpaca quote"
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

/// Builder for creating an Alpaca processor with shared state.
pub struct AlpacaProcessorBuilder {
    microstructure: Arc<Mutex<MicrostructureManager>>,
    verbose: bool,
}

impl AlpacaProcessorBuilder {
    /// Create a new builder with a microstructure manager.
    #[must_use]
    #[allow(clippy::missing_const_for_fn)] // Arc is not const-constructible
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
    pub fn build(self, rx: mpsc::Receiver<AlpacaMessage>) -> AlpacaProcessor {
        AlpacaProcessor::new(rx, self.microstructure).with_verbose(self.verbose)
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
#[allow(clippy::expect_used, clippy::significant_drop_tightening)]
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
        let processor = AlpacaProcessor::new(rx, Arc::clone(&manager));

        // Spawn processor
        let handle = tokio::spawn(async move {
            processor.run().await;
        });

        // Send a trade
        tx.send(AlpacaMessage::Trade {
            symbol: "AAPL".to_string(),
            price: dec!(150.50),
            size: dec!(100),
            ts_event: 0,
        })
        .await
        .expect("send failed");

        // Close channel to stop processor
        drop(tx);
        handle.await.expect("task panicked");

        // Verify state was updated
        let mut state = manager.lock();
        let aapl_state = state.snapshot("AAPL");
        assert!(aapl_state.is_some());
        assert_eq!(aapl_state.expect("should exist").last_trade, dec!(150.50));
    }

    #[tokio::test]
    async fn test_processor_handles_quote() {
        let (tx, rx) = mpsc::channel(100);
        let manager = create_test_manager();
        let processor = AlpacaProcessor::new(rx, Arc::clone(&manager));

        let handle = tokio::spawn(async move {
            processor.run().await;
        });

        tx.send(AlpacaMessage::Quote {
            symbol: "MSFT".to_string(),
            bid: dec!(380.00),
            ask: dec!(380.10),
            bid_size: dec!(100),
            ask_size: dec!(150),
            ts_event: 0,
        })
        .await
        .expect("send failed");

        drop(tx);
        handle.await.expect("task panicked");

        let mut state = manager.lock();
        let msft_state = state.snapshot("MSFT");
        assert!(msft_state.is_some());
        let ms = msft_state.expect("should exist");
        assert_eq!(ms.bid, dec!(380.00));
        assert_eq!(ms.ask, dec!(380.10));
    }

    #[tokio::test]
    async fn test_processor_handles_connection_events() {
        let (tx, rx) = mpsc::channel(100);
        let manager = create_test_manager();
        let processor = AlpacaProcessor::new(rx, Arc::clone(&manager));

        let handle = tokio::spawn(async move {
            processor.run().await;
        });

        // These should not crash
        tx.send(AlpacaMessage::Connected)
            .await
            .expect("send failed");
        tx.send(AlpacaMessage::Disconnected {
            reason: "test".to_string(),
        })
        .await
        .expect("send failed");
        tx.send(AlpacaMessage::Error {
            message: "test error".to_string(),
        })
        .await
        .expect("send failed");

        drop(tx);
        handle.await.expect("task panicked");
    }

    #[test]
    fn test_builder() {
        let manager = create_test_manager();
        let (_tx, rx) = mpsc::channel(100);

        let processor = AlpacaProcessorBuilder::new(manager).verbose(true).build(rx);

        assert!(processor.verbose);
    }
}
