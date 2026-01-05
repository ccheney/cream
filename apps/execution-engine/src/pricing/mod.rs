//! Options pricing and strategy construction.
//!
//! This module provides:
//! - Implied volatility computation (Newton-Raphson, bisection, hybrid)
//! - Multi-leg strategy builders (iron condors, spreads, straddles)
//!
//! # Example
//!
//! ```ignore
//! use execution_engine::pricing::{IvSolver, StrategyBuilder, OptionKind};
//!
//! // Solve for implied volatility
//! let solver = IvSolver::default();
//! let iv = solver.solve(10.5, 100.0, 100.0, 1.0, 0.05, 0.0, OptionKind::Call)?;
//!
//! // Build an iron condor
//! let builder = StrategyBuilder::default();
//! let strategy = builder.iron_condor(
//!     "SPY",
//!     "2026-01-17",
//!     Decimal::new(450, 0),
//!     Decimal::new(470, 0),
//!     Decimal::new(5, 0),
//!     (premium1, premium2, premium3, premium4),
//! )?;
//! ```

mod iv;
mod strategy;

pub use iv::{IvError, IvSolver, IvSolverConfig, OptionKind};
pub use strategy::{
    LegDirection, OptionsStrategy, StrategyBuilder, StrategyBuilderConfig, StrategyError,
    StrategyLeg, StrategyType,
};
