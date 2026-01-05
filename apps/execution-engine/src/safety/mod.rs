//! Safety mechanisms for the execution engine.
//!
//! This module provides critical safety features for trading operations:
//! - Mass cancel on disconnect: Automatically cancel all open orders when
//!   broker connection is lost
//! - Heartbeat monitoring: Detect connection health and trigger recovery
//! - Grace period management: Allow transient network issues to recover

mod mass_cancel;

pub use mass_cancel::{
    DisconnectHandler, GtcOrderPolicy, MassCancelConfig, MassCancelEvent, MassCancelResult,
    SafetyError,
};
