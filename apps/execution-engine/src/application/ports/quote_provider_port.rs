//! Quote Provider Port
//!
//! Defines the interface for real-time quote streaming that the position monitor
//! service requires. This port can be implemented by different adapters:
//!
//! - `WebSocketManager` - Direct Alpaca WebSocket connections
//! - `ProxyQuoteManager` - gRPC streaming from the centralized stream proxy

use async_trait::async_trait;
use tokio::sync::broadcast;

use crate::infrastructure::websocket::{QuoteUpdate, WebSocketError};

/// Port for providing real-time quotes to the position monitor.
///
/// This trait defines the interface that quote providers must implement.
/// The position monitor service depends on this abstraction rather than
/// concrete implementations.
#[async_trait]
pub trait QuoteProviderPort: Send + Sync {
    /// Get a receiver for quote updates.
    ///
    /// Returns a broadcast receiver that receives real-time quote updates.
    fn quote_updates(&self) -> broadcast::Receiver<QuoteUpdate>;

    /// Subscribe to stock quotes for the given symbols.
    ///
    /// # Errors
    ///
    /// Returns error if subscription fails.
    async fn subscribe_stock_quotes(&self, symbols: &[String]) -> Result<(), WebSocketError>;

    /// Subscribe to options quotes for the given symbols.
    ///
    /// # Errors
    ///
    /// Returns error if subscription fails.
    async fn subscribe_options_quotes(&self, symbols: &[String]) -> Result<(), WebSocketError>;

    /// Unsubscribe from stock quotes.
    ///
    /// # Errors
    ///
    /// Returns error if unsubscription fails.
    async fn unsubscribe_stock_quotes(&self, symbols: &[String]) -> Result<(), WebSocketError>;

    /// Unsubscribe from options quotes.
    ///
    /// # Errors
    ///
    /// Returns error if unsubscription fails.
    async fn unsubscribe_options_quotes(&self, symbols: &[String]) -> Result<(), WebSocketError>;

    /// Check if the quote provider is connected.
    fn is_connected(&self) -> bool;
}
