//! Execution Tactics Bounded Context
//!
//! This module implements various execution tactics (PASSIVE_LIMIT, TWAP, VWAP, etc.)
//! to optimize order fills while minimizing market impact.

pub mod errors;
pub mod services;
pub mod value_objects;

pub use errors::TacticError;
pub use services::{AdaptiveExecutor, IcebergExecutor, TacticSelector, TwapExecutor, VwapExecutor};
pub use value_objects::{
    AdaptiveConfig, AggressiveLimitConfig, IcebergConfig, IcebergPeak, MarketContext, MarketState,
    PassiveLimitConfig, SliceType, SubTactic, TacticConfig, TacticSelectionContext, TacticType,
    TacticUrgency, TwapConfig, TwapSlice, Urgency, VwapConfig, VwapSlice,
};
