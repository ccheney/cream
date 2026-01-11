//! Adaptive sizing adjustments for options positions.
//!
//! Provides DTE-based and IV rank-based adjustments to reduce position sizes
//! when market conditions warrant additional caution.

/// Apply DTE-based sizing adjustment for options.
///
/// Reduces position size for near-expiration options:
/// - DTE < 7 days: 50% reduction (higher gamma/theta risk)
/// - DTE < 30 days: 25% reduction (elevated time decay)
/// - DTE >= 30 days: No reduction
#[must_use]
pub fn apply_dte_sizing_adjustment(base_size: u32, dte: u32) -> u32 {
    if dte < 7 {
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        {
            (f64::from(base_size) * 0.5).floor() as u32
        }
    } else if dte < 30 {
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        {
            (f64::from(base_size) * 0.75).floor() as u32
        }
    } else {
        base_size
    }
}

/// Apply IV rank-based sizing adjustment for options.
///
/// Reduces position size when implied volatility is low:
/// - IV rank < 0.25 (25th percentile): 25% reduction (poor premium collection)
/// - IV rank >= 0.25: No reduction
#[must_use]
pub fn apply_iv_sizing_adjustment(base_size: u32, iv_rank: f64) -> u32 {
    if iv_rank < 0.25 {
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        {
            (f64::from(base_size) * 0.75).floor() as u32
        }
    } else {
        base_size
    }
}

/// Apply combined DTE and IV rank adjustments.
///
/// Applies both adjustments multiplicatively:
/// - First applies DTE adjustment
/// - Then applies IV rank adjustment to the result
#[must_use]
pub fn apply_combined_sizing_adjustment(base_size: u32, dte: u32, iv_rank: f64) -> u32 {
    let dte_adjusted = apply_dte_sizing_adjustment(base_size, dte);
    apply_iv_sizing_adjustment(dte_adjusted, iv_rank)
}

/// Calculate maximum loss for a long option position.
///
/// For long options, maximum loss is limited to the premium paid.
#[must_use]
pub fn calculate_max_loss_long_option(contracts: u32, premium_paid: f64, multiplier: u32) -> f64 {
    f64::from(contracts) * premium_paid * f64::from(multiplier)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dte_adjustment_no_reduction() {
        assert_eq!(apply_dte_sizing_adjustment(100, 30), 100);
        assert_eq!(apply_dte_sizing_adjustment(100, 45), 100);
        assert_eq!(apply_dte_sizing_adjustment(100, 90), 100);
        assert_eq!(apply_dte_sizing_adjustment(100, 365), 100);
    }

    #[test]
    fn test_dte_adjustment_25_percent_reduction() {
        assert_eq!(apply_dte_sizing_adjustment(100, 7), 75);
        assert_eq!(apply_dte_sizing_adjustment(100, 14), 75);
        assert_eq!(apply_dte_sizing_adjustment(100, 20), 75);
        assert_eq!(apply_dte_sizing_adjustment(100, 29), 75);
    }

    #[test]
    fn test_dte_adjustment_50_percent_reduction() {
        assert_eq!(apply_dte_sizing_adjustment(100, 0), 50);
        assert_eq!(apply_dte_sizing_adjustment(100, 1), 50);
        assert_eq!(apply_dte_sizing_adjustment(100, 5), 50);
        assert_eq!(apply_dte_sizing_adjustment(100, 6), 50);
    }

    #[test]
    fn test_dte_adjustment_rounding() {
        assert_eq!(apply_dte_sizing_adjustment(10, 5), 5);
        assert_eq!(apply_dte_sizing_adjustment(11, 5), 5);
        assert_eq!(apply_dte_sizing_adjustment(10, 20), 7);
        assert_eq!(apply_dte_sizing_adjustment(11, 20), 8);
    }

    #[test]
    fn test_dte_adjustment_edge_cases() {
        assert_eq!(apply_dte_sizing_adjustment(0, 5), 0);
        assert_eq!(apply_dte_sizing_adjustment(1, 5), 0);
        assert_eq!(apply_dte_sizing_adjustment(2, 5), 1);
    }

    #[test]
    fn test_iv_adjustment_no_reduction() {
        assert_eq!(apply_iv_sizing_adjustment(100, 0.25), 100);
        assert_eq!(apply_iv_sizing_adjustment(100, 0.50), 100);
        assert_eq!(apply_iv_sizing_adjustment(100, 0.75), 100);
        assert_eq!(apply_iv_sizing_adjustment(100, 1.0), 100);
    }

    #[test]
    fn test_iv_adjustment_25_percent_reduction() {
        assert_eq!(apply_iv_sizing_adjustment(100, 0.0), 75);
        assert_eq!(apply_iv_sizing_adjustment(100, 0.10), 75);
        assert_eq!(apply_iv_sizing_adjustment(100, 0.20), 75);
        assert_eq!(apply_iv_sizing_adjustment(100, 0.24), 75);
    }

    #[test]
    fn test_iv_adjustment_rounding() {
        assert_eq!(apply_iv_sizing_adjustment(10, 0.20), 7);
        assert_eq!(apply_iv_sizing_adjustment(11, 0.20), 8);
    }

    #[test]
    fn test_iv_adjustment_edge_cases() {
        assert_eq!(apply_iv_sizing_adjustment(0, 0.10), 0);
        assert_eq!(apply_iv_sizing_adjustment(1, 0.10), 0);
    }

    #[test]
    fn test_combined_adjustment() {
        assert_eq!(apply_combined_sizing_adjustment(100, 5, 0.20), 37);
    }

    #[test]
    fn test_combined_adjustment_no_reductions() {
        assert_eq!(apply_combined_sizing_adjustment(100, 45, 0.80), 100);
    }

    #[test]
    fn test_combined_adjustment_dte_only() {
        assert_eq!(apply_combined_sizing_adjustment(100, 5, 0.80), 50);
    }

    #[test]
    fn test_combined_adjustment_iv_only() {
        assert_eq!(apply_combined_sizing_adjustment(100, 45, 0.20), 75);
    }

    #[test]
    fn test_max_loss_long_option() {
        assert!((calculate_max_loss_long_option(5, 2.50, 100) - 1250.0).abs() < 1e-10);
    }

    #[test]
    fn test_max_loss_single_contract() {
        assert!((calculate_max_loss_long_option(1, 5.0, 100) - 500.0).abs() < 1e-10);
    }

    #[test]
    fn test_max_loss_mini_option() {
        assert!((calculate_max_loss_long_option(5, 2.50, 10) - 125.0).abs() < 1e-10);
    }

    #[test]
    fn test_max_loss_zero_contracts() {
        assert!((calculate_max_loss_long_option(0, 5.0, 100) - 0.0).abs() < 1e-10);
    }
}
