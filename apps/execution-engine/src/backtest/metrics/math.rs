//! Statistical math utilities for performance metric calculations.

use rust_decimal::Decimal;

use super::constants::{TOLERANCE, TWO};

/// Calculate mean of a slice of decimals.
pub fn mean(values: &[Decimal]) -> Option<Decimal> {
    if values.is_empty() {
        return None;
    }
    let sum: Decimal = values.iter().sum();
    Some(sum / Decimal::from(values.len() as u64))
}

/// Calculate standard deviation of a slice of decimals.
pub fn std_dev(values: &[Decimal]) -> Option<Decimal> {
    if values.len() < 2 {
        return None;
    }

    let avg = mean(values)?;
    let variance_sum: Decimal = values.iter().map(|v| (*v - avg) * (*v - avg)).sum();
    let variance = variance_sum / Decimal::from((values.len() - 1) as u64);

    sqrt_decimal(variance)
}

/// Calculate downside deviation (only negative returns).
pub fn downside_deviation(values: &[Decimal]) -> Option<Decimal> {
    if values.len() < 2 {
        return None;
    }

    let negative_returns: Vec<Decimal> = values
        .iter()
        .filter(|v| **v < Decimal::ZERO)
        .copied()
        .collect();

    if negative_returns.is_empty() {
        return Some(Decimal::ZERO);
    }

    let variance_sum: Decimal = negative_returns.iter().map(|v| *v * *v).sum();
    let variance = variance_sum / Decimal::from(values.len() as u64); // Use total count

    sqrt_decimal(variance)
}

/// Approximate square root using Newton's method.
pub fn sqrt_decimal(value: Decimal) -> Option<Decimal> {
    if value < Decimal::ZERO {
        return None;
    }
    if value == Decimal::ZERO {
        return Some(Decimal::ZERO);
    }

    let mut guess = value / TWO;

    for _ in 0..50 {
        let next = (guess + value / guess) / TWO;
        if (next - guess).abs() < TOLERANCE {
            return Some(next);
        }
        guess = next;
    }

    Some(guess)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mean() {
        let values = vec![
            Decimal::new(10, 0),
            Decimal::new(20, 0),
            Decimal::new(30, 0),
            Decimal::new(40, 0),
        ];
        assert_eq!(mean(&values), Some(Decimal::new(25, 0)));
    }

    #[test]
    fn test_std_dev() {
        let values = vec![
            Decimal::new(10, 0),
            Decimal::new(20, 0),
            Decimal::new(30, 0),
            Decimal::new(40, 0),
        ];
        let Some(std) = std_dev(&values) else {
            panic!("std_dev should succeed for non-empty values");
        };
        // Expected std dev ~ 12.9
        assert!(std > Decimal::new(12, 0) && std < Decimal::new(14, 0));
    }

    #[test]
    fn test_sqrt() {
        let Some(sqrt4) = sqrt_decimal(Decimal::new(4, 0)) else {
            panic!("sqrt of 4 should succeed");
        };
        assert!((sqrt4 - Decimal::new(2, 0)).abs() < Decimal::new(1, 3));

        let Some(sqrt9) = sqrt_decimal(Decimal::new(9, 0)) else {
            panic!("sqrt of 9 should succeed");
        };
        assert!((sqrt9 - Decimal::new(3, 0)).abs() < Decimal::new(1, 3));
    }
}
