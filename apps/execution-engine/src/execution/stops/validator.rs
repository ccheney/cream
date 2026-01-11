//! Stop/target level validation.

use rust_decimal::Decimal;

use super::error::StopsError;
use super::types::StopTargetLevels;
use crate::models::Direction;

/// Validator for stop and target levels.
#[derive(Debug, Clone)]
pub struct StopTargetValidator {
    /// Minimum distance from entry as percentage.
    min_stop_distance_pct: Option<Decimal>,
    /// Maximum distance from entry as percentage.
    max_stop_distance_pct: Option<Decimal>,
}

impl Default for StopTargetValidator {
    fn default() -> Self {
        Self {
            min_stop_distance_pct: Some(Decimal::new(1, 3)), // 0.1%
            max_stop_distance_pct: Some(Decimal::new(20, 2)), // 20%
        }
    }
}

impl StopTargetValidator {
    /// Create a new validator with default settings.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Validate stop and target levels.
    ///
    /// # Errors
    /// Returns an error if levels are invalid.
    pub fn validate(&self, levels: &StopTargetLevels) -> Result<(), StopsError> {
        // Stop and target must be positive
        if levels.stop_loss <= Decimal::ZERO {
            return Err(StopsError::InvalidStopLoss(
                "Stop loss must be positive".to_string(),
            ));
        }

        if levels.take_profit <= Decimal::ZERO {
            return Err(StopsError::InvalidTakeProfit(
                "Take profit must be positive".to_string(),
            ));
        }

        // Stop and target must be different
        if levels.stop_loss == levels.take_profit {
            return Err(StopsError::ValidationFailed(
                "Stop loss and take profit cannot be the same".to_string(),
            ));
        }

        // Validate direction logic
        match levels.direction {
            Direction::Long => {
                // For longs: stop < entry < target
                if levels.stop_loss >= levels.entry_price {
                    return Err(StopsError::InvalidStopLoss(
                        "Long position stop loss must be below entry price".to_string(),
                    ));
                }
                if levels.take_profit <= levels.entry_price {
                    return Err(StopsError::InvalidTakeProfit(
                        "Long position take profit must be above entry price".to_string(),
                    ));
                }
            }
            Direction::Short => {
                // For shorts: target < entry < stop
                if levels.stop_loss <= levels.entry_price {
                    return Err(StopsError::InvalidStopLoss(
                        "Short position stop loss must be above entry price".to_string(),
                    ));
                }
                if levels.take_profit >= levels.entry_price {
                    return Err(StopsError::InvalidTakeProfit(
                        "Short position take profit must be below entry price".to_string(),
                    ));
                }
            }
            Direction::Flat => {
                // Flat positions shouldn't have stops
                return Err(StopsError::ValidationFailed(
                    "Flat positions should not have stop/target levels".to_string(),
                ));
            }
        }

        // Validate distance constraints
        if let Some(min_pct) = self.min_stop_distance_pct {
            let stop_distance = (levels.entry_price - levels.stop_loss).abs() / levels.entry_price;
            if stop_distance < min_pct {
                return Err(StopsError::InvalidStopLoss(format!(
                    "Stop loss too close to entry ({stop_distance:.2}% < {min_pct:.2}% minimum)"
                )));
            }
        }

        if let Some(max_pct) = self.max_stop_distance_pct {
            let stop_distance = (levels.entry_price - levels.stop_loss).abs() / levels.entry_price;
            if stop_distance > max_pct {
                return Err(StopsError::InvalidStopLoss(format!(
                    "Stop loss too far from entry ({stop_distance:.2}% > {max_pct:.2}% maximum)"
                )));
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_long_levels() -> StopTargetLevels {
        StopTargetLevels::new(
            Decimal::new(95, 0),  // stop at $95
            Decimal::new(110, 0), // target at $110
            Decimal::new(100, 0), // entry at $100
            Direction::Long,
        )
    }

    fn make_short_levels() -> StopTargetLevels {
        StopTargetLevels::new(
            Decimal::new(105, 0), // stop at $105
            Decimal::new(90, 0),  // target at $90
            Decimal::new(100, 0), // entry at $100
            Direction::Short,
        )
    }

    #[test]
    fn test_validate_long_position_valid() {
        let validator = StopTargetValidator::new();
        let levels = make_long_levels();
        assert!(validator.validate(&levels).is_ok());
    }

    #[test]
    fn test_validate_short_position_valid() {
        let validator = StopTargetValidator::new();
        let levels = make_short_levels();
        assert!(validator.validate(&levels).is_ok());
    }

    #[test]
    fn test_validate_stop_must_be_positive() {
        let validator = StopTargetValidator::new();
        let levels = StopTargetLevels::new(
            Decimal::new(-10, 0),
            Decimal::new(110, 0),
            Decimal::new(100, 0),
            Direction::Long,
        );
        assert!(matches!(
            validator.validate(&levels),
            Err(StopsError::InvalidStopLoss(_))
        ));
    }

    #[test]
    fn test_validate_long_stop_below_entry() {
        let validator = StopTargetValidator::new();
        let levels = StopTargetLevels::new(
            Decimal::new(105, 0), // stop above entry - invalid for long
            Decimal::new(110, 0),
            Decimal::new(100, 0),
            Direction::Long,
        );
        assert!(matches!(
            validator.validate(&levels),
            Err(StopsError::InvalidStopLoss(_))
        ));
    }

    #[test]
    fn test_validate_short_stop_above_entry() {
        let validator = StopTargetValidator::new();
        let levels = StopTargetLevels::new(
            Decimal::new(95, 0), // stop below entry - invalid for short
            Decimal::new(90, 0),
            Decimal::new(100, 0),
            Direction::Short,
        );
        assert!(matches!(
            validator.validate(&levels),
            Err(StopsError::InvalidStopLoss(_))
        ));
    }

    #[test]
    fn test_validate_flat_position_fails() {
        let validator = StopTargetValidator::new();
        let levels = StopTargetLevels::new(
            Decimal::new(95, 0),
            Decimal::new(105, 0),
            Decimal::new(100, 0),
            Direction::Flat,
        );
        assert!(matches!(
            validator.validate(&levels),
            Err(StopsError::ValidationFailed(_))
        ));
    }
}
