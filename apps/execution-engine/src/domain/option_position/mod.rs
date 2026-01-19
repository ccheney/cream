//! Option Position Bounded Context
//!
//! This module handles options-specific position tracking, including:
//! - Multi-leg spread tracking (verticals, butterflies, iron condors)
//! - Portfolio Greeks aggregation
//! - Options-specific order construction

pub mod errors;
pub mod value_objects;

pub use errors::OptionPositionError;
pub use value_objects::{
    Leg, LegType, OptionContract, OptionPosition, OptionRight, OptionSpread, PositionSide,
    SpreadType,
};
