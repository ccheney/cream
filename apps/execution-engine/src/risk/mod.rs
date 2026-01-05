//! Risk management and constraint validation.
//!
//! This module provides deterministic constraint checking for decision plans
//! before execution. It enforces position limits, exposure constraints, and
//! sizing sanity checks.

mod constraints;

pub use constraints::ConstraintValidator;
