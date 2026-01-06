//! Position sizing calculations for DecisionPlan execution.
//!
//! Implements deterministic sizing logic supporting 4 units:
//! - SHARES: Fixed number of shares
//! - CONTRACTS: Fixed number of option contracts
//! - DOLLARS: Dollar amount to allocate (convert to shares)
//! - PCT_EQUITY: Percentage of total equity (convert to shares)
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
    /// Total portfolio equity (required for PCT_EQUITY).
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
    /// Calculated number of shares (or contracts if is_options).
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
    /// - Insufficient cash (if check_cash is enabled)
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
                    "Reduced from {} to {} due to cash constraint",
                    quantity, affordable
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
    /// The effective exposure is: contracts * multiplier * delta * underlying_price
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
}
