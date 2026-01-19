//! Alpaca Markets Broker Adapter
//!
//! Production-grade implementation of `BrokerPort` for Alpaca Markets API with:
//! - Full HTTP API integration
//! - Retry logic with exponential backoff
//! - Environment-aware safety checks (PAPER vs LIVE)
//! - Multi-leg options support

mod adapter;
mod api_types;
mod config;
mod error;
mod http_client;

pub use adapter::AlpacaBrokerAdapter;
pub use config::{AlpacaConfig, AlpacaEnvironment};
pub use error::AlpacaError;
