//! Market data feed integration.
//!
//! This module handles real-time market data ingestion and microstructure tracking.

pub mod microstructure;

pub use microstructure::{
    DepthLevel, MicrostructureManager, MicrostructureState, MicrostructureTracker, QuoteUpdate,
    TradeSide, TradeUpdate,
};
