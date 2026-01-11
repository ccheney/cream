//! Options rolling logic and edge case handling.
//!
//! Provides comprehensive rolling support for options positions:
//! - Time-based, profit-based, and loss-based triggers
//! - Atomic vs sequential roll mechanics
//! - Fractional contract rounding (conservative floor)
//! - Partial fill monitoring and recovery
//! - Assignment risk monitoring during rolls
//!
//! Reference: docs/plans/08-options.md (Rolling Logic section)

mod config;
mod error;
mod orders;
mod partial_fills;
mod quantity;
mod timing;
mod triggers;

// Configuration
pub use config::RollConfig;

// Errors
pub use error::RollError;

// Roll orders
pub use orders::{RollLeg, RollOrder, RollOrderBuilder, RollOrderType};

// Partial fill monitoring
pub use partial_fills::{
    PartialFillAction, PartialFillMonitor, RollExecutionState, evaluate_partial_fill,
};

// Quantity calculations
pub use quantity::{calculate_roll_quantity, round_contracts_conservative};

// Roll timing
pub use timing::{RollTimingRecommendation, RollTimingResult, check_roll_timing};

// Roll triggers
pub use triggers::{PositionForRoll, RollReason, RollTriggerResult, check_roll_trigger};
