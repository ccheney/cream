//! Application Services
//!
//! Application services coordinate domain logic and infrastructure adapters.
//! They differ from use cases in that they typically run as background tasks
//! or provide long-running functionality.

mod position_monitor;

pub use position_monitor::{
    CircuitBreaker, CircuitBreakerState, ExitResult, PositionMonitorConfig, PositionMonitorError,
    PositionMonitorService, SyncResult,
};
