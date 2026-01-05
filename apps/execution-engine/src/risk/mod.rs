//! Risk management and constraint validation.
//!
//! This module provides deterministic constraint checking for decision plans
//! before execution. It enforces position limits, exposure constraints, and
//! sizing sanity checks.
//!
//! # Features
//!
//! - Per-instrument limits (notional, units, equity %)
//! - Portfolio-level limits (gross/net exposure)
//! - Options Greeks validation (delta, gamma, vega, theta)
//! - Buying power / margin checks
//! - Conflicting order detection
//!
//! # Example
//!
//! ```rust,ignore
//! use execution_engine::risk::{ConstraintValidator, ExtendedConstraintContext, GreeksSnapshot};
//!
//! let validator = ConstraintValidator::with_defaults();
//! let response = validator.validate(&request);
//!
//! if !response.ok {
//!     for violation in &response.violations {
//!         println!("Violation: {} - {}", violation.code, violation.message);
//!     }
//! }
//! ```

mod constraints;

pub use constraints::{
    check_sizing_sanity, BuyingPowerInfo, ConstraintValidator, ExtendedConstraintContext,
    GreeksSnapshot, SizingSanityWarning,
};
