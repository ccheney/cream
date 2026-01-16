//! Core position sizing logic.

use rust_decimal::Decimal;
use rust_decimal::prelude::*;

use super::error::SizingError;
use super::types::{SizingInput, SizingResult, SizingUnit};

/// Configuration for position sizing behavior.
#[allow(clippy::struct_excessive_bools)]
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
#[derive(Debug, Clone, Default)]
pub struct PositionSizer {
    config: PositionSizerConfig,
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
        Self::validate_input(input)?;

        let raw_quantity = Self::calculate_raw_quantity(input);
        let mut quantity = self.round_quantity(raw_quantity);

        let mut was_constrained = false;
        let mut constraint_reason = None;

        if self.config.enforce_maximum
            && input.max_position_size > 0
            && quantity > input.max_position_size
        {
            was_constrained = true;
            constraint_reason = Some(format!(
                "Reduced from {} to max {}",
                quantity, input.max_position_size
            ));
            quantity = input.max_position_size;
        }

        let notional = Self::calculate_notional(quantity, input);

        if self.config.check_cash && notional > input.available_cash {
            let affordable = self.calculate_affordable_quantity(input);
            if affordable < quantity {
                was_constrained = true;
                constraint_reason = Some(format!(
                    "Reduced from {quantity} to {affordable} due to cash constraint"
                ));
                quantity = affordable;
            }
        }

        let notional = Self::calculate_notional(quantity, input);

        if self.config.enforce_minimum && quantity < input.min_order_size {
            return Err(SizingError::BelowMinimum {
                calculated: quantity,
                min: input.min_order_size,
            });
        }

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
        if delta.abs() < Decimal::new(1, 4) {
            return Err(SizingError::InvalidInput(
                "Delta is effectively zero".to_string(),
            ));
        }

        if underlying_price <= Decimal::ZERO {
            return Err(SizingError::InvalidInput(
                "Underlying price must be positive".to_string(),
            ));
        }

        let target_exposure = match input.sizing_unit {
            SizingUnit::Contracts => {
                return self.calculate(input);
            }
            SizingUnit::Shares => input.sizing_value * underlying_price,
            SizingUnit::Dollars => input.sizing_value,
            SizingUnit::PctEquity => {
                if input.total_equity <= Decimal::ZERO {
                    return Err(SizingError::ZeroEquity);
                }
                input.total_equity * input.sizing_value / Decimal::from(100)
            }
        };

        let multiplier = Decimal::from(input.contract_multiplier);
        let contracts_raw = target_exposure / (multiplier * delta.abs() * underlying_price);

        let mut contracts_input = input.clone();
        contracts_input.sizing_value = contracts_raw;
        contracts_input.sizing_unit = SizingUnit::Contracts;

        self.calculate(&contracts_input)
    }

    fn validate_input(input: &SizingInput) -> Result<(), SizingError> {
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

    fn calculate_raw_quantity(input: &SizingInput) -> Decimal {
        match input.sizing_unit {
            SizingUnit::Shares | SizingUnit::Contracts => input.sizing_value,
            SizingUnit::Dollars => {
                if input.is_options {
                    let multiplier = Decimal::from(input.contract_multiplier);
                    input.sizing_value / (input.current_price * multiplier)
                } else {
                    input.sizing_value / input.current_price
                }
            }
            SizingUnit::PctEquity => {
                let dollars = input.total_equity * input.sizing_value / Decimal::from(100);
                if input.is_options {
                    let multiplier = Decimal::from(input.contract_multiplier);
                    dollars / (input.current_price * multiplier)
                } else {
                    dollars / input.current_price
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

    fn calculate_notional(quantity: u64, input: &SizingInput) -> Decimal {
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

#[cfg(test)]
#[allow(clippy::expect_used)]
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

        let result = sizer
            .calculate(&input)
            .expect("should calculate shares sizing");
        assert_eq!(result.quantity, 100);
        assert_eq!(result.notional_value, dec!(5000));
        assert!(!result.was_constrained);
    }

    #[test]
    fn test_contracts_sizing() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(5);
        input.sizing_unit = SizingUnit::Contracts;
        input.is_options = true;
        input.current_price = dec!(3);

        let result = sizer
            .calculate(&input)
            .expect("should calculate contracts sizing");
        assert_eq!(result.quantity, 5);
        assert_eq!(result.notional_value, dec!(1500));
    }

    #[test]
    fn test_dollars_sizing() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(10000);
        input.sizing_unit = SizingUnit::Dollars;

        let result = sizer
            .calculate(&input)
            .expect("should calculate dollars sizing");
        assert_eq!(result.quantity, 200);
        assert_eq!(result.notional_value, dec!(10000));
    }

    #[test]
    fn test_pct_equity_sizing() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(5);
        input.sizing_unit = SizingUnit::PctEquity;

        let result = sizer
            .calculate(&input)
            .expect("should calculate pct equity sizing");
        assert_eq!(result.quantity, 100);
        assert_eq!(result.notional_value, dec!(5000));
        assert_eq!(result.equity_percentage, dec!(5));
    }

    #[test]
    fn test_max_position_constraint() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(2000);
        input.max_position_size = 1000;

        let result = sizer
            .calculate(&input)
            .expect("should calculate with max position constraint");
        assert_eq!(result.quantity, 1000);
        assert!(result.was_constrained);
        assert!(result.constraint_reason.is_some());
    }

    #[test]
    fn test_cash_constraint() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(20000);
        input.sizing_unit = SizingUnit::Dollars;
        input.available_cash = dec!(10000);
        input.max_position_size = 0;

        let result = sizer
            .calculate(&input)
            .expect("should calculate with cash constraint");
        assert_eq!(result.quantity, 200);
        assert!(result.was_constrained);
    }

    #[test]
    fn test_below_minimum_error() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(0.5);
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
        input.sizing_value = dec!(3000);
        input.sizing_unit = SizingUnit::Dollars;
        input.is_options = true;
        input.current_price = dec!(3);
        input.contract_multiplier = 100;

        let result = sizer
            .calculate(&input)
            .expect("should calculate options dollars sizing");
        assert_eq!(result.quantity, 10);
        assert_eq!(result.notional_value, dec!(3000));
    }

    #[test]
    fn test_options_pct_equity_sizing() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(2);
        input.sizing_unit = SizingUnit::PctEquity;
        input.is_options = true;
        input.current_price = dec!(5);
        input.contract_multiplier = 100;
        input.total_equity = dec!(100000);

        let result = sizer
            .calculate(&input)
            .expect("should calculate options pct equity sizing");
        assert_eq!(result.quantity, 4);
    }

    #[test]
    fn test_rounding_down() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(7777);
        input.sizing_unit = SizingUnit::Dollars;

        let result = sizer
            .calculate(&input)
            .expect("should calculate with rounding down");
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

        let result = sizer
            .calculate(&input)
            .expect("should calculate with rounding nearest");
        assert_eq!(result.quantity, 156);
    }

    #[test]
    fn test_delta_adjusted_sizing() {
        let sizer = PositionSizer::default();
        let mut input = default_input();
        input.sizing_value = dec!(5000);
        input.sizing_unit = SizingUnit::Dollars;
        input.is_options = true;
        input.current_price = dec!(2);
        input.max_position_size = 0;

        let delta = dec!(0.5);
        let underlying_price = dec!(100);

        let result = sizer
            .calculate_options_delta_adjusted(&input, delta, underlying_price)
            .expect("should calculate delta-adjusted sizing");

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
        input.sizing_value = dec!(5000);
        input.max_position_size = 100;
        input.available_cash = dec!(1000);

        let result = sizer
            .calculate(&input)
            .expect("should calculate with no constraints");
        assert_eq!(result.quantity, 5000);
        assert!(!result.was_constrained);
    }
}
