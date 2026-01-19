//! Stop Enforcement Bounded Context
//!
//! This module handles stop-loss and take-profit monitoring and enforcement.
//! For options positions where bracket orders aren't supported, this provides
//! real-time price monitoring to trigger exit orders.

pub mod errors;
pub mod services;
pub mod value_objects;

pub use errors::StopEnforcementError;
pub use services::PriceMonitor;
pub use value_objects::{
    MonitoredPosition, PositionDirection, RiskLevelDenomination, SameBarPriority, StopTargetLevels,
    StopsConfig, TriggerResult,
};
