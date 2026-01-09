//! Safety mechanisms for the execution engine.
//!
//! This module provides critical safety features for trading operations:
//! - Mass cancel on disconnect: Automatically cancel all open orders when
//!   broker connection is lost
//! - Heartbeat monitoring: Detect connection health and trigger recovery
//! - Grace period management: Allow transient network issues to recover
//! - Connection monitoring: Background task for broker health checks

mod mass_cancel;
mod monitor;

pub use mass_cancel::{
    DisconnectHandler, GtcOrderPolicy, MassCancelConfig, MassCancelEvent, MassCancelResult,
    SafetyError,
};
pub use monitor::ConnectionMonitor;
