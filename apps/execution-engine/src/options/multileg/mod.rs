//! Multi-leg options validation and analytics.
//!
//! Implements Alpaca-specific multi-leg options constraints including:
//! - Leg ratio GCD validation (ratios must be in simplest form)
//! - Greeks aggregation for portfolio-level risk
//! - Early exercise risk monitoring
//! - Assignment risk tracking
//! - Position limits enforcement

mod assignment_risk;
mod early_exercise;
mod greeks;
mod leg;
mod position_tracker;
mod types;
mod validation;

// Re-export all public types and functions for backwards compatibility

// Core types
pub use types::{OptionContract, OptionStyle, OptionType};

// Greeks
pub use greeks::{Greeks, aggregate_greeks, calculate_portfolio_greeks};

// Leg types
pub use leg::{MultiLegOrder, OptionLeg};

// Validation
pub use validation::{MultiLegValidationResult, validate_leg_ratios, validate_multi_leg_order};

// Early exercise risk
pub use early_exercise::{EarlyExerciseAlert, EarlyExerciseRisk, assess_early_exercise_risk};

// Assignment risk
pub use assignment_risk::{AssignmentRisk, AssignmentRiskLevel, calculate_assignment_risk};

// Position tracking
pub use position_tracker::{MultiLegPosition, PositionLimits, PositionTracker};
