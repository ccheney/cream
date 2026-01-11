//! Sizing sanity check logic.
//!
//! Provides functions to detect unusually large position sizes
//! relative to historical trading patterns.

use rust_decimal::Decimal;

use super::types::SizingSanityWarning;

/// Calculate median of a list of decimals.
pub(crate) fn calculate_median(values: &[Decimal]) -> Option<Decimal> {
    if values.is_empty() {
        return None;
    }
    let mut sorted = values.to_vec();
    sorted.sort();
    let mid = sorted.len() / 2;
    if sorted.len().is_multiple_of(2) {
        Some((sorted[mid - 1] + sorted[mid]) / Decimal::new(2, 0))
    } else {
        Some(sorted[mid])
    }
}

/// Check if a position size is unusually large.
///
/// Returns a warning if the proposed notional exceeds
/// `threshold_multiplier` * median of historical sizes.
#[must_use]
pub fn check_sizing_sanity(
    proposed_notional: Decimal,
    historical_sizes: &[Decimal],
    threshold_multiplier: Decimal,
) -> Option<SizingSanityWarning> {
    // Need at least some historical data
    if historical_sizes.len() < 5 {
        return None;
    }

    let typical_size = calculate_median(historical_sizes)?;
    if typical_size <= Decimal::ZERO {
        return None;
    }

    let size_multiplier = proposed_notional / typical_size;
    if size_multiplier > threshold_multiplier {
        return Some(SizingSanityWarning {
            proposed_notional,
            typical_size,
            size_multiplier,
            threshold: threshold_multiplier,
            message: format!(
                "Position size ${proposed_notional} is {size_multiplier:.1}x typical size ${typical_size} (threshold: {threshold_multiplier}x)"
            ),
        });
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_median_odd() {
        let values = vec![
            Decimal::new(10_000, 0),
            Decimal::new(20_000, 0),
            Decimal::new(15_000, 0),
            Decimal::new(25_000, 0),
            Decimal::new(18_000, 0),
        ];
        let median = calculate_median(&values);
        assert_eq!(median, Some(Decimal::new(18_000, 0)));
    }

    #[test]
    fn test_calculate_median_even() {
        let values = vec![
            Decimal::new(10_000, 0),
            Decimal::new(20_000, 0),
            Decimal::new(15_000, 0),
            Decimal::new(25_000, 0),
        ];
        let median = calculate_median(&values);
        assert_eq!(median, Some(Decimal::new(17_500, 0)));
    }

    #[test]
    fn test_calculate_median_empty() {
        let values: Vec<Decimal> = vec![];
        let median = calculate_median(&values);
        assert_eq!(median, None);
    }

    #[test]
    fn test_sizing_sanity_within_limit() {
        let historical = vec![
            Decimal::new(10_000, 0),
            Decimal::new(12_000, 0),
            Decimal::new(11_000, 0),
            Decimal::new(13_000, 0),
            Decimal::new(10_500, 0),
        ];
        let threshold = Decimal::new(30, 1); // 3.0

        // Proposed $25k is ~2.3x median $11k - within threshold
        let result = check_sizing_sanity(Decimal::new(25_000, 0), &historical, threshold);
        assert!(result.is_none());
    }

    #[test]
    fn test_sizing_sanity_exceeds_limit() {
        let historical = vec![
            Decimal::new(10_000, 0),
            Decimal::new(12_000, 0),
            Decimal::new(11_000, 0),
            Decimal::new(13_000, 0),
            Decimal::new(10_500, 0),
        ];
        let threshold = Decimal::new(30, 1); // 3.0

        // Proposed $50k is ~4.5x median $11k - exceeds 3x threshold
        let result = check_sizing_sanity(Decimal::new(50_000, 0), &historical, threshold);
        let Some(warning) = result else {
            panic!("sizing sanity check should detect warning");
        };
        assert!(warning.size_multiplier > Decimal::new(4, 0));
        assert_eq!(warning.threshold, Decimal::new(30, 1));
    }

    #[test]
    fn test_sizing_sanity_insufficient_history() {
        // Less than 5 historical data points
        let historical = vec![
            Decimal::new(10_000, 0),
            Decimal::new(12_000, 0),
            Decimal::new(11_000, 0),
        ];
        let threshold = Decimal::new(30, 1);

        // Should return None (can't assess with insufficient data)
        let result = check_sizing_sanity(Decimal::new(100_000, 0), &historical, threshold);
        assert!(result.is_none());
    }
}
