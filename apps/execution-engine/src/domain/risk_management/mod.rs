//! Risk Management Bounded Context
//!
//! Validates orders against risk constraints before execution.
//!
//! # Key Concepts
//!
//! - **Risk Policy**: Configuration of exposure limits
//! - **Constraint Validation**: Checks against per-instrument, portfolio, and options limits
//! - **Buying Power**: Margin and cash requirements

pub mod aggregate;
pub mod errors;
pub mod repository;
pub mod services;
pub mod value_objects;

pub use aggregate::RiskPolicy;
pub use errors::RiskError;
pub use services::RiskValidationService;
pub use value_objects::{
    ConstraintResult, ConstraintViolation, Exposure, ExposureLimits, Greeks, OptionsLimits,
    PerInstrumentLimits, PortfolioLimits, RiskContext, SizingLimits, ViolationSeverity,
};
