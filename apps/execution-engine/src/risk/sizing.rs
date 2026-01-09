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

use rust_decimal::Decimal;
use rust_decimal::prelude::*;
use serde::{Deserialize, Serialize};
use std::fmt;

// ============================================================================
// Sizing Unit
// ============================================================================

/// Unit of measurement for position sizing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SizingUnit {
    /// Fixed number of shares.
    Shares,
    /// Fixed number of option contracts.
    Contracts,
    /// Dollar amount to allocate (converted to shares based on price).
    Dollars,
    /// Percentage of total equity (converted to shares).
    PctEquity,
}

impl fmt::Display for SizingUnit {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Shares => write!(f, "SHARES"),
            Self::Contracts => write!(f, "CONTRACTS"),
            Self::Dollars => write!(f, "DOLLARS"),
            Self::PctEquity => write!(f, "PCT_EQUITY"),
        }
    }
}

// ============================================================================
// Input and Output
// ============================================================================

/// Input parameters for position sizing calculation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SizingInput {
    /// The sizing value (shares, contracts, dollars, or percentage).
    pub sizing_value: Decimal,
    /// The unit of the sizing value.
    pub sizing_unit: SizingUnit,
    /// Current price of the instrument.
    pub current_price: Decimal,
    /// Total portfolio equity (required for `PCT_EQUITY`).
    pub total_equity: Decimal,
    /// Available cash for new positions.
    pub available_cash: Decimal,
    /// Maximum position size in shares/contracts (0 = unlimited).
    pub max_position_size: u64,
    /// Minimum order size in shares/contracts.
    pub min_order_size: u64,
    /// Option contract multiplier (default: 100 for equity options).
    pub contract_multiplier: u32,
    /// Whether this is an options position.
    pub is_options: bool,
}

impl Default for SizingInput {
    fn default() -> Self {
        Self {
            sizing_value: Decimal::ZERO,
            sizing_unit: SizingUnit::Shares,
            current_price: Decimal::ZERO,
            total_equity: Decimal::ZERO,
            available_cash: Decimal::ZERO,
            max_position_size: 0,
            min_order_size: 1,
            contract_multiplier: 100,
            is_options: false,
        }
    }
}

/// Result of position sizing calculation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SizingResult {
    /// Calculated number of shares (or contracts if `is_options`).
    pub quantity: u64,
    /// Total notional value of the position.
    pub notional_value: Decimal,
    /// Percentage of equity this represents.
    pub equity_percentage: Decimal,
    /// Whether the result was constrained (reduced from requested).
    pub was_constrained: bool,
    /// Reason for constraint if any.
    pub constraint_reason: Option<String>,
}

// ============================================================================
// Errors
// ============================================================================

/// Error during position sizing calculation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SizingError {
    /// Invalid input (zero or negative price, etc.).
    InvalidInput(String),
    /// Position would exceed maximum allowed size.
    ExceedsMaxPosition { requested: u64, max: u64 },
    /// Position is below minimum order size.
    BelowMinimum { calculated: u64, min: u64 },
    /// Insufficient cash for the position.
    InsufficientCash {
        required: Decimal,
        available: Decimal,
    },
    /// Zero equity for percentage-based sizing.
    ZeroEquity,
}

impl fmt::Display for SizingError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInput(msg) => write!(f, "Invalid input: {msg}"),
            Self::ExceedsMaxPosition { requested, max } => {
                write!(f, "Position size {requested} exceeds maximum {max}")
            }
            Self::BelowMinimum { calculated, min } => {
                write!(f, "Calculated size {calculated} is below minimum {min}")
            }
            Self::InsufficientCash {
                required,
                available,
            } => {
                write!(
                    f,
                    "Insufficient cash: required {required}, available {available}"
                )
            }
            Self::ZeroEquity => write!(f, "Cannot calculate percentage of zero equity"),
        }
    }
}

impl std::error::Error for SizingError {}

// ============================================================================
// Position Sizer
// ============================================================================

/// Configuration for position sizing behavior.
#[derive(Debug, Clone)]
pub struct PositionSizerConfig {
    /// Round shares down (conservative) or to nearest.
    pub round_down: bool,
    /// Enforce minimum order size (reject if below).
    pub enforce_minimum: bool,
    /// Enforce maximum position size (cap if above).
    pub enforce_maximum: bool,
    /// Check cash availability.
    pub check_cash: bool,
}

impl Default for PositionSizerConfig {
    fn default() -> Self {
        Self {
            round_down: true,
            enforce_minimum: true,
            enforce_maximum: true,
            check_cash: true,
        }
    }
}

/// Position sizer implementing deterministic sizing logic.
#[derive(Debug, Clone)]
pub struct PositionSizer {
    config: PositionSizerConfig,
}

impl Default for PositionSizer {
    fn default() -> Self {
        Self {
            config: PositionSizerConfig::default(),
        }
    }
}

impl PositionSizer {
    /// Create a new position sizer with custom configuration.
    #[must_use]
    pub const fn with_config(config: PositionSizerConfig) -> Self {
        Self { config }
    }

    /// Calculate position size based on input parameters.
    ///
    /// # Errors
    ///
    /// Returns error if:
    /// - Input is invalid (zero price, negative values)
    /// - Calculated size is below minimum
    /// - Insufficient cash (if `check_cash` is enabled)
    pub fn calculate(&self, input: &SizingInput) -> Result<SizingResult, SizingError> {
        // Validate input
        self.validate_input(input)?;

        // Calculate raw quantity based on sizing unit
        let raw_quantity = self.calculate_raw_quantity(input)?;

        // Round to integer
        let mut quantity = self.round_quantity(raw_quantity);

        // Track if we constrained the result
        let mut was_constrained = false;
        let mut constraint_reason = None;

        // Apply maximum position constraint
        if self.config.enforce_maximum && input.max_position_size > 0 {
            if quantity > input.max_position_size {
                was_constrained = true;
                constraint_reason = Some(format!(
                    "Reduced from {} to max {}",
                    quantity, input.max_position_size
                ));
                quantity = input.max_position_size;
            }
        }

        // Calculate notional value
        let notional = self.calculate_notional(quantity, input);

        // Check cash availability
        if self.config.check_cash && notional > input.available_cash {
            // Reduce to what we can afford
            let affordable = self.calculate_affordable_quantity(input);
            if affordable < quantity {
                was_constrained = true;
                constraint_reason = Some(format!(
                    "Reduced from {quantity} to {affordable} due to cash constraint"
                ));
                quantity = affordable;
            }
        }

        // Recalculate notional after potential reduction
        let notional = self.calculate_notional(quantity, input);

        // Check minimum order size
        if self.config.enforce_minimum && quantity < input.min_order_size {
            return Err(SizingError::BelowMinimum {
                calculated: quantity,
                min: input.min_order_size,
            });
        }

        // Calculate equity percentage
        let equity_percentage = if input.total_equity > Decimal::ZERO {
            (notional / input.total_equity) * Decimal::from(100)
        } else {
            Decimal::ZERO
        };

        Ok(SizingResult {
            quantity,
            notional_value: notional,
            equity_percentage,
            was_constrained,
            constraint_reason,
        })
    }

    /// Calculate position size for options with delta adjustment.
    ///
    /// The effective exposure is: contracts * multiplier * `delta` * `underlying_price`
    ///
    /// # Errors
    ///
    /// Returns error if sizing calculation fails.
    pub fn calculate_options_delta_adjusted(
        &self,
        input: &SizingInput,
        delta: Decimal,
        underlying_price: Decimal,
    ) -> Result<SizingResult, SizingError> {
        // For options, we need to account for delta
        // Effective exposure = contracts * multiplier * delta * underlying_price
        // So contracts = target_exposure / (multiplier * delta * underlying_price)

        if delta.abs() < Decimal::new(1, 4) {
            // delta < 0.0001, effectively zero
            return Err(SizingError::InvalidInput(
                "Delta is effectively zero".to_string(),
            ));
        }

        if underlying_price <= Decimal::ZERO {
            return Err(SizingError::InvalidInput(
                "Underlying price must be positive".to_string(),
            ));
        }

        // Calculate target exposure based on sizing unit
        let target_exposure = match input.sizing_unit {
            SizingUnit::Contracts => {
                // Direct contracts, no conversion
                return self.calculate(input);
            }
            SizingUnit::Shares => {
                // Convert shares to equivalent exposure
                input.sizing_value * underlying_price
            }
            SizingUnit::Dollars => input.sizing_value,
            SizingUnit::PctEquity => {
                if input.total_equity <= Decimal::ZERO {
                    return Err(SizingError::ZeroEquity);
                }
                input.total_equity * input.sizing_value / Decimal::from(100)
            }
        };

        // Calculate contracts needed for target exposure
        let multiplier = Decimal::from(input.contract_multiplier);
        let contracts_raw = target_exposure / (multiplier * delta.abs() * underlying_price);

        // Create modified input for contracts
        let mut contracts_input = input.clone();
        contracts_input.sizing_value = contracts_raw;
        contracts_input.sizing_unit = SizingUnit::Contracts;

        self.calculate(&contracts_input)
    }

    // Private helper methods

    fn validate_input(&self, input: &SizingInput) -> Result<(), SizingError> {
        if input.current_price <= Decimal::ZERO {
            return Err(SizingError::InvalidInput(
                "Price must be positive".to_string(),
            ));
        }

        if input.sizing_value < Decimal::ZERO {
            return Err(SizingError::InvalidInput(
                "Sizing value cannot be negative".to_string(),
            ));
        }

        if input.sizing_unit == SizingUnit::PctEquity && input.total_equity <= Decimal::ZERO {
            return Err(SizingError::ZeroEquity);
        }

        Ok(())
    }

    fn calculate_raw_quantity(&self, input: &SizingInput) -> Result<Decimal, SizingError> {
        match input.sizing_unit {
            SizingUnit::Shares | SizingUnit::Contracts => {
                // Direct value, no conversion needed
                Ok(input.sizing_value)
            }
            SizingUnit::Dollars => {
                // Convert dollars to shares: dollars / price
                if input.is_options {
                    // For options: dollars / (price * multiplier)
                    let multiplier = Decimal::from(input.contract_multiplier);
                    Ok(input.sizing_value / (input.current_price * multiplier))
                } else {
                    Ok(input.sizing_value / input.current_price)
                }
            }
            SizingUnit::PctEquity => {
                // Convert percentage to dollars, then to shares
                // percentage / 100 * equity / price
                let dollars = input.total_equity * input.sizing_value / Decimal::from(100);
                if input.is_options {
                    let multiplier = Decimal::from(input.contract_multiplier);
                    Ok(dollars / (input.current_price * multiplier))
                } else {
                    Ok(dollars / input.current_price)
                }
            }
        }
    }

    fn round_quantity(&self, raw: Decimal) -> u64 {
        if self.config.round_down {
            raw.floor().to_u64().unwrap_or(0)
        } else {
            raw.round().to_u64().unwrap_or(0)
        }
    }

    fn calculate_notional(&self, quantity: u64, input: &SizingInput) -> Decimal {
        let qty = Decimal::from(quantity);
        if input.is_options {
            qty * input.current_price * Decimal::from(input.contract_multiplier)
        } else {
            qty * input.current_price
        }
    }

    fn calculate_affordable_quantity(&self, input: &SizingInput) -> u64 {
        let price = if input.is_options {
            input.current_price * Decimal::from(input.contract_multiplier)
        } else {
            input.current_price
        };

        if price <= Decimal::ZERO {
            return 0;
        }

        let raw = input.available_cash / price;
        self.round_quantity(raw)
    }
}

// ============================================================================
// Adaptive Sizing Adjustments
// ============================================================================

/// Apply DTE-based sizing adjustment for options.
///
/// Reduces position size for near-expiration options:
/// - DTE < 7 days: 50% reduction (higher gamma/theta risk)
/// - DTE < 30 days: 25% reduction (elevated time decay)
/// - DTE >= 30 days: No reduction
///
/// # Arguments
///
/// * `base_size` - The base position size in contracts
/// * `dte` - Days to expiration
///
/// # Returns
///
/// Adjusted position size rounded down to integer
///
/// # Example
///
/// ```rust,ignore
/// use execution_engine::risk::sizing::apply_dte_sizing_adjustment;
///
/// assert_eq!(apply_dte_sizing_adjustment(100, 45), 100); // No reduction
/// assert_eq!(apply_dte_sizing_adjustment(100, 20), 75);  // 25% reduction
/// assert_eq!(apply_dte_sizing_adjustment(100, 5), 50);   // 50% reduction
/// ```
#[must_use]
pub fn apply_dte_sizing_adjustment(base_size: u32, dte: u32) -> u32 {
    if dte < 7 {
        // 50% reduction for very short-dated options
        (base_size as f64 * 0.5).floor() as u32
    } else if dte < 30 {
        // 25% reduction for options with < 30 DTE
        (base_size as f64 * 0.75).floor() as u32
    } else {
        // No reduction for longer-dated options
        base_size
    }
}

/// Apply IV rank-based sizing adjustment for options.
///
/// Reduces position size when implied volatility is low:
/// - IV rank < 0.25 (25th percentile): 25% reduction (poor premium collection)
/// - IV rank >= 0.25: No reduction
///
/// For selling options, low IV means less premium captured for the risk taken.
/// This adjustment encourages smaller positions when conditions are unfavorable.
///
/// # Arguments
///
/// * `base_size` - The base position size in contracts
/// * `iv_rank` - IV rank as a percentile (0.0 to 1.0)
///
/// # Returns
///
/// Adjusted position size rounded down to integer
///
/// # Example
///
/// ```rust,ignore
/// use execution_engine::risk::sizing::apply_iv_sizing_adjustment;
///
/// assert_eq!(apply_iv_sizing_adjustment(100, 0.80), 100); // No reduction (high IV)
/// assert_eq!(apply_iv_sizing_adjustment(100, 0.50), 100); // No reduction (mid IV)
/// assert_eq!(apply_iv_sizing_adjustment(100, 0.20), 75);  // 25% reduction (low IV)
/// ```
#[must_use]
pub fn apply_iv_sizing_adjustment(base_size: u32, iv_rank: f64) -> u32 {
    if iv_rank < 0.25 {
        // 25% reduction for low IV environments
        (base_size as f64 * 0.75).floor() as u32
    } else {
        // No reduction for normal or high IV
        base_size
    }
}

/// Apply combined DTE and IV rank adjustments.
///
/// Applies both adjustments multiplicatively:
/// - First applies DTE adjustment
/// - Then applies IV rank adjustment to the result
///
/// # Arguments
///
/// * `base_size` - The base position size in contracts
/// * `dte` - Days to expiration
/// * `iv_rank` - IV rank as a percentile (0.0 to 1.0)
///
/// # Returns
///
/// Adjusted position size rounded down to integer
///
/// # Example
///
/// ```rust,ignore
/// use execution_engine::risk::sizing::apply_combined_sizing_adjustment;
///
/// // 100 contracts, 5 DTE, low IV
/// // DTE adjustment: 100 * 0.5 = 50
/// // IV adjustment: 50 * 0.75 = 37
/// assert_eq!(apply_combined_sizing_adjustment(100, 5, 0.20), 37);
/// ```
#[must_use]
pub fn apply_combined_sizing_adjustment(base_size: u32, dte: u32, iv_rank: f64) -> u32 {
    let dte_adjusted = apply_dte_sizing_adjustment(base_size, dte);
    apply_iv_sizing_adjustment(dte_adjusted, iv_rank)
}

/// Calculate maximum loss for a long option position.
///
/// For long options, maximum loss is limited to the premium paid.
///
/// # Arguments
///
/// * `contracts` - Number of contracts
/// * `premium_paid` - Premium paid per share (not per contract)
/// * `multiplier` - Contract multiplier (default: 100 for equity options)
///
/// # Returns
///
/// Maximum potential loss in dollars
#[must_use]
pub fn calculate_max_loss_long_option(contracts: u32, premium_paid: f64, multiplier: u32) -> f64 {
    contracts as f64 * premium_paid * multiplier as f64
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal_macros::dec;

    fn default_input() -> SizingInput {
        SizingInput {
            sizing_value: dec!(100),
            sizing_unit: SizingUnit::Shares,
            current_price: dec!(50),
            total_equity: dec!(100000),
            available_cash: dec!(50000),
            max_position_size: 1000,
            min_order_size: 1,
            contract_multiplier: 100,
            is_options: false,
        }
    }

    #[test]
    fn test_shares_sizing() {
        let sizer = PositionSizer::default();
        let input = default_input();

        let result = sizer.calculate(&input).unwrap();
        assert_eq!(result.quantity, 100);
        assert_eq!(result.notional_value, dec!(5000)); // 100 * 50
        assert!(!result.was_constrained);
    }

    #[test]
    fn test_contracts_sizing() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(5);
        input.sizing_unit = SizingUnit::Contracts;
        input.is_options = true;
        input.current_price = dec!(3); // Option premium

        let result = sizer.calculate(&input).unwrap();
        assert_eq!(result.quantity, 5);
        assert_eq!(result.notional_value, dec!(1500)); // 5 * 3 * 100
    }

    #[test]
    fn test_dollars_sizing() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(10000);
        input.sizing_unit = SizingUnit::Dollars;

        let result = sizer.calculate(&input).unwrap();
        assert_eq!(result.quantity, 200); // 10000 / 50 = 200 shares
        assert_eq!(result.notional_value, dec!(10000));
    }

    #[test]
    fn test_pct_equity_sizing() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(5); // 5% of equity
        input.sizing_unit = SizingUnit::PctEquity;

        let result = sizer.calculate(&input).unwrap();
        // 5% of 100k = 5000, 5000 / 50 = 100 shares
        assert_eq!(result.quantity, 100);
        assert_eq!(result.notional_value, dec!(5000));
        assert_eq!(result.equity_percentage, dec!(5));
    }

    #[test]
    fn test_max_position_constraint() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(2000); // Exceeds max of 1000
        input.max_position_size = 1000;

        let result = sizer.calculate(&input).unwrap();
        assert_eq!(result.quantity, 1000);
        assert!(result.was_constrained);
        assert!(result.constraint_reason.is_some());
    }

    #[test]
    fn test_cash_constraint() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(20000); // 20000 dollars
        input.sizing_unit = SizingUnit::Dollars;
        input.available_cash = dec!(10000); // Only 10k available
        input.max_position_size = 0; // No max

        let result = sizer.calculate(&input).unwrap();
        // Should be constrained to 10000 / 50 = 200 shares
        assert_eq!(result.quantity, 200);
        assert!(result.was_constrained);
    }

    #[test]
    fn test_below_minimum_error() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(0.5); // Less than 1 share
        input.min_order_size = 1;

        let result = sizer.calculate(&input);
        assert!(matches!(result, Err(SizingError::BelowMinimum { .. })));
    }

    #[test]
    fn test_zero_price_error() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.current_price = Decimal::ZERO;

        let result = sizer.calculate(&input);
        assert!(matches!(result, Err(SizingError::InvalidInput(_))));
    }

    #[test]
    fn test_zero_equity_pct_error() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_unit = SizingUnit::PctEquity;
        input.total_equity = Decimal::ZERO;

        let result = sizer.calculate(&input);
        assert!(matches!(result, Err(SizingError::ZeroEquity)));
    }

    #[test]
    fn test_options_dollars_sizing() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(3000); // 3000 dollars
        input.sizing_unit = SizingUnit::Dollars;
        input.is_options = true;
        input.current_price = dec!(3); // Option premium
        input.contract_multiplier = 100;

        let result = sizer.calculate(&input).unwrap();
        // 3000 / (3 * 100) = 10 contracts
        assert_eq!(result.quantity, 10);
        assert_eq!(result.notional_value, dec!(3000));
    }

    #[test]
    fn test_options_pct_equity_sizing() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(2); // 2% of equity
        input.sizing_unit = SizingUnit::PctEquity;
        input.is_options = true;
        input.current_price = dec!(5); // Option premium
        input.contract_multiplier = 100;
        input.total_equity = dec!(100000);

        let result = sizer.calculate(&input).unwrap();
        // 2% of 100k = 2000, 2000 / (5 * 100) = 4 contracts
        assert_eq!(result.quantity, 4);
    }

    #[test]
    fn test_rounding_down() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(7777); // 7777 dollars
        input.sizing_unit = SizingUnit::Dollars;

        let result = sizer.calculate(&input).unwrap();
        // 7777 / 50 = 155.54, rounds down to 155
        assert_eq!(result.quantity, 155);
    }

    #[test]
    fn test_rounding_nearest() {
        let config = PositionSizerConfig {
            round_down: false,
            ..Default::default()
        };
        let sizer = PositionSizer::with_config(config);
        let mut input = default_input();
        input.sizing_value = dec!(7777);
        input.sizing_unit = SizingUnit::Dollars;

        let result = sizer.calculate(&input).unwrap();
        // 7777 / 50 = 155.54, rounds to 156
        assert_eq!(result.quantity, 156);
    }

    #[test]
    fn test_delta_adjusted_sizing() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(5000); // Target $5000 exposure
        input.sizing_unit = SizingUnit::Dollars;
        input.is_options = true;
        input.current_price = dec!(2); // Option premium
        input.max_position_size = 0;

        let delta = dec!(0.5); // 50 delta call
        let underlying_price = dec!(100);

        let result = sizer
            .calculate_options_delta_adjusted(&input, delta, underlying_price)
            .unwrap();

        // Effective exposure = contracts * 100 * 0.5 * 100 = contracts * 5000
        // For $5000 exposure: contracts = 5000 / 5000 = 1
        assert_eq!(result.quantity, 1);
    }

    #[test]
    fn test_no_constraints() {
        let config = PositionSizerConfig {
            enforce_minimum: false,
            enforce_maximum: false,
            check_cash: false,
            ..Default::default()
        };
        let sizer = PositionSizer::with_config(config);

        let mut input = default_input();
        input.sizing_value = dec!(5000); // Way over max
        input.max_position_size = 100;
        input.available_cash = dec!(1000); // Not enough cash

        let result = sizer.calculate(&input).unwrap();
        // No constraints applied
        assert_eq!(result.quantity, 5000);
        assert!(!result.was_constrained);
    }

    // =========================================================================
    // DTE Sizing Adjustment Tests
    // =========================================================================

    #[test]
    fn test_dte_adjustment_no_reduction() {
        // DTE >= 30: no reduction
        assert_eq!(apply_dte_sizing_adjustment(100, 30), 100);
        assert_eq!(apply_dte_sizing_adjustment(100, 45), 100);
        assert_eq!(apply_dte_sizing_adjustment(100, 90), 100);
        assert_eq!(apply_dte_sizing_adjustment(100, 365), 100);
    }

    #[test]
    fn test_dte_adjustment_25_percent_reduction() {
        // DTE 7-29: 25% reduction
        assert_eq!(apply_dte_sizing_adjustment(100, 7), 75);
        assert_eq!(apply_dte_sizing_adjustment(100, 14), 75);
        assert_eq!(apply_dte_sizing_adjustment(100, 20), 75);
        assert_eq!(apply_dte_sizing_adjustment(100, 29), 75);
    }

    #[test]
    fn test_dte_adjustment_50_percent_reduction() {
        // DTE < 7: 50% reduction
        assert_eq!(apply_dte_sizing_adjustment(100, 0), 50);
        assert_eq!(apply_dte_sizing_adjustment(100, 1), 50);
        assert_eq!(apply_dte_sizing_adjustment(100, 5), 50);
        assert_eq!(apply_dte_sizing_adjustment(100, 6), 50);
    }

    #[test]
    fn test_dte_adjustment_rounding() {
        // Test rounding behavior (floors)
        assert_eq!(apply_dte_sizing_adjustment(10, 5), 5); // 10 * 0.5 = 5
        assert_eq!(apply_dte_sizing_adjustment(11, 5), 5); // 11 * 0.5 = 5.5 → 5
        assert_eq!(apply_dte_sizing_adjustment(10, 20), 7); // 10 * 0.75 = 7.5 → 7
        assert_eq!(apply_dte_sizing_adjustment(11, 20), 8); // 11 * 0.75 = 8.25 → 8
    }

    #[test]
    fn test_dte_adjustment_edge_cases() {
        assert_eq!(apply_dte_sizing_adjustment(0, 5), 0); // Zero size
        assert_eq!(apply_dte_sizing_adjustment(1, 5), 0); // 1 * 0.5 = 0.5 → 0
        assert_eq!(apply_dte_sizing_adjustment(2, 5), 1); // 2 * 0.5 = 1.0 → 1
    }

    // =========================================================================
    // IV Rank Sizing Adjustment Tests
    // =========================================================================

    #[test]
    fn test_iv_adjustment_no_reduction() {
        // IV rank >= 0.25: no reduction
        assert_eq!(apply_iv_sizing_adjustment(100, 0.25), 100);
        assert_eq!(apply_iv_sizing_adjustment(100, 0.50), 100);
        assert_eq!(apply_iv_sizing_adjustment(100, 0.75), 100);
        assert_eq!(apply_iv_sizing_adjustment(100, 1.0), 100);
    }

    #[test]
    fn test_iv_adjustment_25_percent_reduction() {
        // IV rank < 0.25: 25% reduction
        assert_eq!(apply_iv_sizing_adjustment(100, 0.0), 75);
        assert_eq!(apply_iv_sizing_adjustment(100, 0.10), 75);
        assert_eq!(apply_iv_sizing_adjustment(100, 0.20), 75);
        assert_eq!(apply_iv_sizing_adjustment(100, 0.24), 75);
    }

    #[test]
    fn test_iv_adjustment_rounding() {
        assert_eq!(apply_iv_sizing_adjustment(10, 0.20), 7); // 10 * 0.75 = 7.5 → 7
        assert_eq!(apply_iv_sizing_adjustment(11, 0.20), 8); // 11 * 0.75 = 8.25 → 8
    }

    #[test]
    fn test_iv_adjustment_edge_cases() {
        assert_eq!(apply_iv_sizing_adjustment(0, 0.10), 0); // Zero size
        assert_eq!(apply_iv_sizing_adjustment(1, 0.10), 0); // 1 * 0.75 = 0.75 → 0
    }

    // =========================================================================
    // Combined Sizing Adjustment Tests
    // =========================================================================

    #[test]
    fn test_combined_adjustment() {
        // 100 contracts, 5 DTE (50% reduction), low IV (25% reduction)
        // DTE: 100 * 0.5 = 50
        // IV: 50 * 0.75 = 37.5 → 37
        assert_eq!(apply_combined_sizing_adjustment(100, 5, 0.20), 37);
    }

    #[test]
    fn test_combined_adjustment_no_reductions() {
        // High DTE, high IV: no reductions
        assert_eq!(apply_combined_sizing_adjustment(100, 45, 0.80), 100);
    }

    #[test]
    fn test_combined_adjustment_dte_only() {
        // Low DTE, high IV: only DTE reduction
        assert_eq!(apply_combined_sizing_adjustment(100, 5, 0.80), 50);
    }

    #[test]
    fn test_combined_adjustment_iv_only() {
        // High DTE, low IV: only IV reduction
        assert_eq!(apply_combined_sizing_adjustment(100, 45, 0.20), 75);
    }

    // =========================================================================
    // Max Loss Calculation Tests
    // =========================================================================

    #[test]
    fn test_max_loss_long_option() {
        // 5 contracts × $2.50 premium × 100 multiplier = $1,250
        assert_eq!(calculate_max_loss_long_option(5, 2.50, 100), 1250.0);
    }

    #[test]
    fn test_max_loss_single_contract() {
        // 1 contract × $5.00 premium × 100 multiplier = $500
        assert_eq!(calculate_max_loss_long_option(1, 5.0, 100), 500.0);
    }

    #[test]
    fn test_max_loss_mini_option() {
        // Mini options have multiplier of 10
        // 5 contracts × $2.50 premium × 10 multiplier = $125
        assert_eq!(calculate_max_loss_long_option(5, 2.50, 10), 125.0);
    }

    #[test]
    fn test_max_loss_zero_contracts() {
        assert_eq!(calculate_max_loss_long_option(0, 5.0, 100), 0.0);
    }
}
