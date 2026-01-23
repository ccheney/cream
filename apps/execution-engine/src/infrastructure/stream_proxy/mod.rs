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
//! ## Direct Client Usage
//!
//! ```ignore
//! use cream_execution_engine::infrastructure::stream_proxy::{
//!     StreamProxyClient, StreamProxyConfig,
//! };
//!
//! // Connect to the proxy
//! let config = StreamProxyConfig::new("http://localhost:50052");
//! let client = StreamProxyClient::connect(&config).await?;
//!
//! // Stream stock quotes
//! let mut quotes = client.stream_quotes(&["AAPL", "GOOGL"]).await?;
//! while let Some(response) = quotes.message().await? {
//!     if let Some(quote) = response.quote {
//!         println!("{}: bid={} ask={}", quote.symbol, quote.bid_price, quote.ask_price);
//!     }
//! }
//! ```
//!
//! ## Quote Manager (WebSocketManager-compatible)
//!
//! ```ignore
//! use cream_execution_engine::infrastructure::stream_proxy::{
//!     ProxyQuoteManager, ProxyQuoteManagerConfig,
//! };
//!
//! let config = ProxyQuoteManagerConfig::from_env();
//! let mut manager = ProxyQuoteManager::new(config, shutdown_token);
//! manager.connect().await?;
//! manager.start_stock_stream();
//!
//! // Subscribe and receive quotes via broadcast channel
//! manager.subscribe_stock_quotes(&["AAPL".to_string()]).await?;
//! let mut rx = manager.quote_updates();
//! while let Ok(quote) = rx.recv().await {
//!     println!("{}: {}", quote.symbol, quote.mid_price());
//! }
//! ```

mod client;
mod config;
mod error;
mod quote_manager;

pub use client::StreamProxyClient;
pub use config::StreamProxyConfig;
pub use error::StreamProxyError;
pub use quote_manager::{ProxyQuoteManager, ProxyQuoteManagerConfig};
