//! Options-specific validation and analytics.
//!
//! This module provides:
//! - Multi-leg order validation (GCD validation, atomicity)
//! - Greeks aggregation for multi-leg strategies
//! - Early exercise risk monitoring
//! - Assignment risk tracking

mod multileg;

pub use multileg::{
    // Assignment risk
    AssignmentRisk,
    AssignmentRiskLevel,
    // Early exercise
    EarlyExerciseAlert,
    EarlyExerciseRisk,
    // Core types
    Greeks,
    MultiLegOrder,
    // Position tracking
    MultiLegPosition,
    MultiLegValidationResult,
    OptionContract,
    OptionLeg,
    OptionStyle,
    OptionType,
    PositionLimits,
    PositionTracker,
    // Greeks aggregation
    aggregate_greeks,
    assess_early_exercise_risk,
    calculate_assignment_risk,
    calculate_portfolio_greeks,
    // Validation
    validate_leg_ratios,
    validate_multi_leg_order,
};
