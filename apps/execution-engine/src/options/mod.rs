//! Options-specific validation and analytics.
//!
//! This module provides:
//! - Multi-leg order validation (GCD validation, atomicity)
//! - Greeks aggregation for multi-leg strategies
//! - Early exercise risk monitoring
//! - Assignment risk tracking
//! - Rolling logic for position management

mod multileg;
mod rolling;

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

pub use rolling::{
    PartialFillAction,
    PartialFillMonitor,
    PositionForRoll,
    // Configuration
    RollConfig,
    RollError,
    RollExecutionState,
    RollLeg,
    RollOrder,
    RollOrderBuilder,
    RollOrderType,
    RollReason,
    RollTimingRecommendation,
    RollTimingResult,
    RollTriggerResult,
    // Manager
    RollingManager,
    TrackedPosition,
    // Roll orders
    calculate_roll_quantity,
    // Roll timing
    check_roll_timing,
    // Roll triggers
    check_roll_trigger,
    // Partial fill monitoring
    evaluate_partial_fill,
    round_contracts_conservative,
};
