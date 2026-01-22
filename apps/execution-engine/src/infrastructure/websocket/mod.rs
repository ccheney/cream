//! WebSocket Infrastructure for Real-Time Market Data
//!
//! This module provides WebSocket connectivity for streaming real-time quotes
//! from Alpaca Markets. It supports:
//!
//! - Stock quotes via `wss://stream.data.alpaca.markets/v2/sip`
//! - Options quotes via `wss://stream.data.alpaca.markets/v1beta1/opra`
//! - Trade updates via `wss://paper-api.alpaca.markets/stream` (paper) or
//!   `wss://api.alpaca.markets/stream` (live)
//!
//! # Architecture
//!
//! - [`WebSocketManager`]: Manages connections to multiple streams
//! - [`ReconnectPolicy`]: Handles exponential backoff with jitter
//! - [`QuoteUpdate`]: Normalized quote data from either stock or options streams
//! - [`TradeUpdate`]: Order fill and status notifications

mod codec;
mod manager;
mod reconnect;
mod types;

pub use codec::{parse_options_quote, parse_stock_quote, parse_trade_update};
pub use manager::WebSocketManager;
pub use reconnect::ReconnectPolicy;
pub use types::{
    QuoteUpdate, TradeEvent, TradeUpdate, WebSocketConfig, WebSocketError, WebSocketState,
};
