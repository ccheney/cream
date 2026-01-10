//! Market data feed integration.
//!
//! This module handles real-time market data ingestion, microstructure tracking,
//! gap recovery, and feed health monitoring.

pub mod controller;
pub mod databento;
pub mod gap_recovery;
pub mod health;
pub mod microstructure;
pub mod processor;

pub use controller::FeedController;
pub use databento::{
    DatabentoError, DatabentoFeed, DatabentoFeedConfig, DatabentoMessage, create_feed_channel,
};
pub use gap_recovery::{
    GapDetectionResult, GapRecoveryAction, GapRecoveryConfig, GapRecoveryManager, GapType,
};
pub use health::{FeedHealthConfig, FeedHealthMetrics, FeedHealthTracker, HealthIssue};
pub use microstructure::{
    DepthLevel, MicrostructureManager, MicrostructureState, MicrostructureTracker, QuoteUpdate,
    TradeSide, TradeUpdate,
};
pub use processor::{FeedProcessor, FeedProcessorBuilder};
