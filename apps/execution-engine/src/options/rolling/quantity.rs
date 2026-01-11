//! Fractional contract rounding and quantity calculations.

use rust_decimal::Decimal;

/// Round contract quantity conservatively (always floor).
///
/// For rolling, we always round down to avoid overexposure.
#[must_use]
pub fn round_contracts_conservative(quantity: Decimal) -> i32 {
    quantity.floor().try_into().unwrap_or(0)
}

/// Calculate new contract quantity for a roll.
///
/// Takes into account delta targeting and conservative rounding.
#[must_use]
pub fn calculate_roll_quantity(
    original_quantity: i32,
    original_delta_per_contract: Decimal,
    new_delta_per_contract: Decimal,
    maintain_delta_exposure: bool,
) -> i32 {
    if !maintain_delta_exposure {
        return original_quantity;
    }

    if new_delta_per_contract.abs() < Decimal::new(1, 3) {
        return original_quantity;
    }

    let total_delta = Decimal::from(original_quantity) * original_delta_per_contract;
    let new_quantity = total_delta / new_delta_per_contract;

    round_contracts_conservative(new_quantity.abs()) * original_quantity.signum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_round_contracts_floor() {
        assert_eq!(round_contracts_conservative(Decimal::new(35, 1)), 3); // 3.5 -> 3
        assert_eq!(round_contracts_conservative(Decimal::new(39, 1)), 3); // 3.9 -> 3
        assert_eq!(round_contracts_conservative(Decimal::new(30, 1)), 3); // 3.0 -> 3
    }

    #[test]
    fn test_calculate_roll_quantity_same_delta() {
        let qty = calculate_roll_quantity(
            10,
            Decimal::new(30, 2), // 0.30 delta
            Decimal::new(30, 2), // 0.30 delta (same)
            true,
        );
        assert_eq!(qty, 10);
    }

    #[test]
    fn test_calculate_roll_quantity_different_delta() {
        // Original: 10 contracts @ 0.30 delta = 3.0 total delta
        // New: 0.25 delta -> 3.0 / 0.25 = 12 contracts
        let qty = calculate_roll_quantity(
            10,
            Decimal::new(30, 2), // 0.30 delta
            Decimal::new(25, 2), // 0.25 delta
            true,
        );
        assert_eq!(qty, 12);
    }

    #[test]
    fn test_calculate_roll_quantity_no_maintain() {
        let qty = calculate_roll_quantity(
            10,
            Decimal::new(30, 2),
            Decimal::new(25, 2),
            false, // Don't maintain delta
        );
        assert_eq!(qty, 10);
    }

    #[test]
    fn test_calculate_roll_quantity_near_zero_new_delta() {
        let qty = calculate_roll_quantity(
            10,
            Decimal::new(30, 2),
            Decimal::new(1, 4), // 0.0001 - near zero
            true,
        );
        assert_eq!(qty, 10);
    }
}
