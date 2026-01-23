//! Stream Proxy Client (Driven Adapter)
//!
//! This module provides a gRPC client for connecting to the stream proxy service,
//! which multiplexes real-time market data and order updates from Alpaca WebSocket
//! connections through a single gRPC interface.
//!
//! # Architecture
//!
//! The stream proxy client is a **driven adapter** (outbound) that implements
//! the hexagonal architecture pattern. It consumes real-time data from an
//! external service (the stream proxy) and provides it to the application layer.
//!
//! # Usage
//!
//! ```ignore
//! use cream_execution_engine::infrastructure::stream_proxy::{
//!     StreamProxyClient, StreamProxyConfig,
//! };
//!
//! // Connect to the proxy
//! let config = StreamProxyConfig::new("http://localhost:50051");
//! let client = StreamProxyClient::connect(&config).await?;
//!
//! // Stream stock quotes
//! let mut quotes = client.stream_quotes(&["AAPL", "GOOGL"]).await?;
//! while let Some(response) = quotes.message().await? {
//!     if let Some(quote) = response.quote {
//!         println!("{}: bid={} ask={}", quote.symbol, quote.bid_price, quote.ask_price);
//!     }
//! }
//!
//! // Stream order updates for position monitoring
//! let mut updates = client.stream_order_updates(&[], &[]).await?;
//! while let Some(response) = updates.message().await? {
//!     if let Some(update) = response.update {
//!         println!("Order {}: {:?}", update.event_id, update.event);
//!     }
//! }
//! ```

mod client;
mod config;
mod error;

pub use client::StreamProxyClient;
pub use config::StreamProxyConfig;
pub use error::StreamProxyError;
