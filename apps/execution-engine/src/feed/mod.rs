//! Market data feed integration.
//!
//! This module handles real-time market data ingestion, microstructure tracking,
//! gap recovery, and feed health monitoring.
//!
//! # Feed Provider
//!
//! **Alpaca**: WebSocket-first, unified market data provider (Algo Trader Plus)

pub mod alpaca;
pub mod alpaca_controller;
pub mod alpaca_processor;
pub mod gap_recovery;
pub mod health;
pub mod microstructure;

// Alpaca feed exports (primary provider)
pub use alpaca::{
    AlpacaError, AlpacaFeed, AlpacaFeedConfig, AlpacaMessage, create_alpaca_feed_channel,
};
pub use alpaca_controller::AlpacaController;
pub use alpaca_processor::{AlpacaProcessor, AlpacaProcessorBuilder};

// Infrastructure
pub use gap_recovery::{
    GapDetectionResult, GapRecoveryAction, GapRecoveryConfig, GapRecoveryManager, GapType,
};
pub use health::{FeedHealthConfig, FeedHealthMetrics, FeedHealthTracker, HealthIssue};
pub use microstructure::{
    DepthLevel, MicrostructureManager, MicrostructureState, MicrostructureTracker, QuoteUpdate,
    TradeSide, TradeUpdate,
};
