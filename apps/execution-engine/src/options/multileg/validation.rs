//! Multi-leg order validation.
//!
//! Implements Alpaca-specific validation including GCD validation
//! for leg ratios (ratios must be in simplest form).

use serde::{Deserialize, Serialize};

use super::leg::MultiLegOrder;

/// Calculate GCD of two numbers using Euclidean algorithm.
fn gcd_two(a: u32, b: u32) -> u32 {
    if b == 0 { a } else { gcd_two(b, a % b) }
}

/// Calculate GCD of multiple numbers.
///
/// Returns the GCD of all numbers, or 0 if the list is empty.
#[must_use]
pub fn gcd_multiple(numbers: &[u32]) -> u32 {
    if numbers.is_empty() {
        return 0;
    }
    numbers.iter().copied().fold(numbers[0], gcd_two)
}

/// Result of multi-leg validation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiLegValidationResult {
    /// Whether validation passed.
    pub valid: bool,
    /// Validation errors (if any).
    pub errors: Vec<String>,
    /// Validation warnings (if any).
    pub warnings: Vec<String>,
    /// GCD of leg ratios (for diagnostics).
    pub leg_ratio_gcd: u32,
}

impl MultiLegValidationResult {
    /// Create a passing result.
    #[must_use]
    pub const fn success(gcd: u32) -> Self {
        Self {
            valid: true,
            errors: Vec::new(),
            warnings: Vec::new(),
            leg_ratio_gcd: gcd,
        }
    }

    /// Create a failing result.
    #[must_use]
    pub const fn failure(errors: Vec<String>, gcd: u32) -> Self {
        Self {
            valid: false,
            errors,
            warnings: Vec::new(),
            leg_ratio_gcd: gcd,
        }
    }
}

/// Validate leg ratios are in simplest form (GCD = 1).
///
/// Alpaca requires multi-leg option orders to have leg ratios in
/// their simplest form. For example:
/// - [1, 2] is valid (GCD = 1)
/// - [2, 4] is invalid (GCD = 2, should be [1, 2])
/// - [1, 1, 1, 1] is valid (GCD = 1)
///
/// # Arguments
/// * `ratios` - The leg ratios to validate
///
/// # Returns
/// Tuple of (`is_valid`, `gcd`)
#[must_use]
pub fn validate_leg_ratios(ratios: &[u32]) -> (bool, u32) {
    if ratios.is_empty() {
        return (true, 0);
    }

    // Filter out zeros (invalid ratios)
    let valid_ratios: Vec<u32> = ratios.iter().copied().filter(|&r| r > 0).collect();
    if valid_ratios.len() != ratios.len() {
        return (false, 0);
    }

    let gcd = gcd_multiple(&valid_ratios);
    (gcd == 1, gcd)
}

/// Validate a complete multi-leg order.
///
/// Checks:
/// - At least 2 legs
/// - Leg ratios in simplest form (GCD = 1)
/// - All legs have same underlying
/// - All ratios are positive
///
/// # Arguments
/// * `order` - The multi-leg order to validate
///
/// # Returns
/// Validation result with errors/warnings
#[must_use]
pub fn validate_multi_leg_order(order: &MultiLegOrder) -> MultiLegValidationResult {
    let mut errors = Vec::new();

    // Check minimum legs
    if order.legs.len() < 2 {
        errors.push("Multi-leg order requires at least 2 legs".to_string());
    }

    // Check all legs have same underlying
    let mismatched: Vec<_> = order
        .legs
        .iter()
        .filter(|l| l.contract.underlying_symbol != order.underlying_symbol)
        .collect();
    if !mismatched.is_empty() {
        errors.push(format!(
            "All legs must have same underlying ({}), found mismatched: {:?}",
            order.underlying_symbol,
            mismatched
                .iter()
                .map(|l| &l.contract.underlying_symbol)
                .collect::<Vec<_>>()
        ));
    }

    // Check ratios are positive
    if order.legs.iter().any(|l| l.ratio == 0) {
        errors.push("All leg ratios must be positive".to_string());
    }

    // Validate GCD
    let ratios = order.leg_ratios();
    let (ratios_valid, gcd) = validate_leg_ratios(&ratios);
    if !ratios_valid && gcd > 1 {
        errors.push(format!(
            "Leg ratios {ratios:?} not in simplest form (GCD = {gcd}). Divide all ratios by {gcd}."
        ));
    }

    if errors.is_empty() {
        MultiLegValidationResult::success(gcd)
    } else {
        MultiLegValidationResult::failure(errors, gcd)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::options::multileg::{Greeks, OptionContract, OptionLeg, OptionStyle, OptionType};
    use rust_decimal::Decimal;

    #[test]
    fn test_gcd_two() {
        assert_eq!(gcd_two(48, 18), 6);
        assert_eq!(gcd_two(18, 48), 6);
        assert_eq!(gcd_two(7, 11), 1);
        assert_eq!(gcd_two(12, 12), 12);
        assert_eq!(gcd_two(0, 5), 5);
        assert_eq!(gcd_two(5, 0), 5);
    }

    #[test]
    fn test_gcd_multiple() {
        assert_eq!(gcd_multiple(&[12, 18, 24]), 6);
        assert_eq!(gcd_multiple(&[1, 2, 1]), 1);
        assert_eq!(gcd_multiple(&[2, 4, 6]), 2);
        assert_eq!(gcd_multiple(&[7, 13, 11]), 1);
        assert_eq!(gcd_multiple(&[]), 0);
        assert_eq!(gcd_multiple(&[42]), 42);
    }

    #[test]
    fn test_validate_leg_ratios_valid() {
        // Valid: [1, 2] - GCD is 1
        let (valid, gcd) = validate_leg_ratios(&[1, 2]);
        assert!(valid);
        assert_eq!(gcd, 1);

        // Valid: [1, 1, 1, 1] - Iron condor
        let (valid, gcd) = validate_leg_ratios(&[1, 1, 1, 1]);
        assert!(valid);
        assert_eq!(gcd, 1);

        // Valid: [1, 2, 1] - Butterfly
        let (valid, gcd) = validate_leg_ratios(&[1, 2, 1]);
        assert!(valid);
        assert_eq!(gcd, 1);
    }

    #[test]
    fn test_validate_leg_ratios_invalid() {
        // Invalid: [2, 4] - GCD is 2, should be [1, 2]
        let (valid, gcd) = validate_leg_ratios(&[2, 4]);
        assert!(!valid);
        assert_eq!(gcd, 2);

        // Invalid: [3, 6, 9] - GCD is 3
        let (valid, gcd) = validate_leg_ratios(&[3, 6, 9]);
        assert!(!valid);
        assert_eq!(gcd, 3);
    }

    #[test]
    fn test_validate_leg_ratios_zero() {
        // Invalid: contains zero
        let (valid, _) = validate_leg_ratios(&[1, 0, 2]);
        assert!(!valid);
    }

    #[test]
    fn test_validate_multi_leg_order_valid() {
        let order = make_test_iron_condor();
        let result = validate_multi_leg_order(&order);
        assert!(result.valid, "Errors: {:?}", result.errors);
        assert_eq!(result.leg_ratio_gcd, 1);
    }

    #[test]
    fn test_validate_multi_leg_order_invalid_gcd() {
        let order = MultiLegOrder {
            order_id: "O1".to_string(),
            underlying_symbol: "AAPL".to_string(),
            strategy_name: "test".to_string(),
            legs: vec![
                OptionLeg {
                    leg_index: 0,
                    contract: make_test_contract("C1"),
                    quantity: 2,
                    ratio: 2, // Not simplest form
                    is_long: true,
                    greeks: Greeks::zero(),
                },
                OptionLeg {
                    leg_index: 1,
                    contract: make_test_contract("C2"),
                    quantity: 4,
                    ratio: 4, // Not simplest form
                    is_long: false,
                    greeks: Greeks::zero(),
                },
            ],
            net_premium: Decimal::ZERO,
        };

        let result = validate_multi_leg_order(&order);
        assert!(!result.valid);
        assert_eq!(result.leg_ratio_gcd, 2);
        assert!(result.errors.iter().any(|e| e.contains("simplest form")));
    }

    #[test]
    fn test_validate_multi_leg_order_single_leg() {
        let order = MultiLegOrder {
            order_id: "O1".to_string(),
            underlying_symbol: "AAPL".to_string(),
            strategy_name: "test".to_string(),
            legs: vec![OptionLeg {
                leg_index: 0,
                contract: make_test_contract("C1"),
                quantity: 1,
                ratio: 1,
                is_long: true,
                greeks: Greeks::zero(),
            }],
            net_premium: Decimal::ZERO,
        };

        let result = validate_multi_leg_order(&order);
        assert!(!result.valid);
        assert!(result.errors.iter().any(|e| e.contains("at least 2 legs")));
    }

    fn make_test_contract(id: &str) -> OptionContract {
        OptionContract {
            contract_id: id.to_string(),
            underlying_symbol: "AAPL".to_string(),
            strike: Decimal::new(150, 0),
            expiration: "2024-01-19".to_string(),
            option_type: OptionType::Call,
            style: OptionStyle::American,
            multiplier: 100,
        }
    }

    fn make_test_iron_condor() -> MultiLegOrder {
        MultiLegOrder {
            order_id: "IC1".to_string(),
            underlying_symbol: "AAPL".to_string(),
            strategy_name: "iron_condor".to_string(),
            legs: vec![
                OptionLeg {
                    leg_index: 0,
                    contract: OptionContract {
                        contract_id: "AAPL240119P00140000".to_string(),
                        underlying_symbol: "AAPL".to_string(),
                        strike: Decimal::new(140, 0),
                        expiration: "2024-01-19".to_string(),
                        option_type: OptionType::Put,
                        style: OptionStyle::American,
                        multiplier: 100,
                    },
                    quantity: 1,
                    ratio: 1,
                    is_long: true, // Long put (lower wing)
                    greeks: Greeks::zero(),
                },
                OptionLeg {
                    leg_index: 1,
                    contract: OptionContract {
                        contract_id: "AAPL240119P00145000".to_string(),
                        underlying_symbol: "AAPL".to_string(),
                        strike: Decimal::new(145, 0),
                        expiration: "2024-01-19".to_string(),
                        option_type: OptionType::Put,
                        style: OptionStyle::American,
                        multiplier: 100,
                    },
                    quantity: 1,
                    ratio: 1,
                    is_long: false, // Short put
                    greeks: Greeks::zero(),
                },
                OptionLeg {
                    leg_index: 2,
                    contract: OptionContract {
                        contract_id: "AAPL240119C00155000".to_string(),
                        underlying_symbol: "AAPL".to_string(),
                        strike: Decimal::new(155, 0),
                        expiration: "2024-01-19".to_string(),
                        option_type: OptionType::Call,
                        style: OptionStyle::American,
                        multiplier: 100,
                    },
                    quantity: 1,
                    ratio: 1,
                    is_long: false, // Short call
                    greeks: Greeks::zero(),
                },
                OptionLeg {
                    leg_index: 3,
                    contract: OptionContract {
                        contract_id: "AAPL240119C00160000".to_string(),
                        underlying_symbol: "AAPL".to_string(),
                        strike: Decimal::new(160, 0),
                        expiration: "2024-01-19".to_string(),
                        option_type: OptionType::Call,
                        style: OptionStyle::American,
                        multiplier: 100,
                    },
                    quantity: 1,
                    ratio: 1,
                    is_long: true, // Long call (upper wing)
                    greeks: Greeks::zero(),
                },
            ],
            net_premium: Decimal::new(-150, 0), // Credit received
        }
    }
}
