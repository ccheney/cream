//! Multi-Leg Options Strategy Builder
//!
//! Constructs options strategies including:
//! - Iron Condor: Bear call spread + bull put spread
//! - Vertical Spreads: Bull call, bear call, bull put, bear put
//! - Straddles and Strangles
//! - Butterflies
//!
//! Reference: docs/plans/09-rust-core.md (Strategy Builder, lines 388-410)

mod builder;
mod error;
mod leg;
mod types;
mod validation;

pub use builder::{StrategyBuilder, StrategyBuilderConfig};
pub use error::StrategyError;
pub use leg::{LegDirection, StrategyLeg};
pub use types::{OptionsStrategy, StrategyType};
pub use validation::validate_balanced_spread;
