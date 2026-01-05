//! Options-specific validation and analytics.
//!
//! This module provides:
//! - Multi-leg order validation (GCD validation, atomicity)
//! - Greeks aggregation for multi-leg strategies
//! - Early exercise risk monitoring
//! - Assignment risk tracking

mod multileg;

pub use multileg::{
    // Core types
    Greeks, MultiLegOrder, MultiLegValidationResult, OptionContract, OptionLeg, OptionStyle,
    OptionType,
    // Validation
    validate_leg_ratios, validate_multi_leg_order,
    // Greeks aggregation
    aggregate_greeks, calculate_portfolio_greeks,
    // Early exercise
    EarlyExerciseAlert, EarlyExerciseRisk, assess_early_exercise_risk,
    // Assignment risk
    AssignmentRisk, AssignmentRiskLevel, calculate_assignment_risk,
    // Position tracking
    MultiLegPosition, PositionLimits, PositionTracker,
};
