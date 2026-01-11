//! Position sizing calculations for `DecisionPlan` execution.
//!
//! Implements deterministic sizing logic supporting 4 units:
//! - `SHARES`: Fixed number of shares
//! - `CONTRACTS`: Fixed number of option contracts
//! - `DOLLARS`: Dollar amount to allocate (convert to shares)
//! - `PCT_EQUITY`: Percentage of total equity (convert to shares)
//!
//! # Example
//!
//! ```rust,ignore
//! use execution_engine::risk::sizing::{PositionSizer, SizingInput, SizingUnit};
//! use rust_decimal_macros::dec;
//!
//! let sizer = PositionSizer::default();
//!
//! // Size by percentage of equity
//! let input = SizingInput {
//!     sizing_value: dec!(5),     // 5% of equity
//!     sizing_unit: SizingUnit::PctEquity,
//!     current_price: dec!(100),
//!     total_equity: dec!(100000),
//!     ..Default::default()
//! };
//!
//! let result = sizer.calculate(&input)?;
//! assert_eq!(result.shares, 50); // 5% of 100k = 5000 / 100 = 50 shares
//! ```

mod adjustments;
mod error;
mod sizer;
mod types;

pub use adjustments::{
    apply_combined_sizing_adjustment, apply_dte_sizing_adjustment, apply_iv_sizing_adjustment,
    calculate_max_loss_long_option,
};
pub use error::SizingError;
pub use sizer::{PositionSizer, PositionSizerConfig};
pub use types::{SizingInput, SizingResult, SizingUnit};
