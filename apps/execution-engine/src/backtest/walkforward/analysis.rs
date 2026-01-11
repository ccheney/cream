//! Analysis functions for walk-forward windows.

use std::collections::HashMap;

use rust_decimal::Decimal;

use super::types::{
    AggregatedMetrics, OverfittingAnalysis, ParameterStability, WalkForwardConfig,
    WalkForwardWindow,
};

/// Aggregate out-of-sample metrics from completed windows.
#[must_use]
pub fn aggregate_oos_metrics(windows: &[WalkForwardWindow]) -> AggregatedMetrics {
    let windows_with_oos: Vec<_> = windows
        .iter()
        .filter(|w| w.out_of_sample_metrics.is_some())
        .collect();

    if windows_with_oos.is_empty() {
        return AggregatedMetrics::default();
    }

    let n = windows_with_oos.len();
    let mut total_sharpe = Decimal::ZERO;
    let mut sharpe_count = 0;
    let mut total_return = Decimal::ZERO;
    let mut total_max_dd = Decimal::ZERO;
    let mut worst_max_dd = Decimal::ZERO;
    let mut total_win_rate = Decimal::ZERO;
    let mut total_trades = 0u64;
    let mut profitable_windows = 0;
    let mut compound_factor = Decimal::ONE;

    for window in &windows_with_oos {
        if let Some(metrics) = &window.out_of_sample_metrics {
            if let Some(sharpe) = metrics.sharpe_ratio {
                total_sharpe += sharpe;
                sharpe_count += 1;
            }

            total_return += metrics.total_return;
            compound_factor *= Decimal::ONE + metrics.total_return;

            total_max_dd += metrics.max_drawdown;
            if metrics.max_drawdown > worst_max_dd {
                worst_max_dd = metrics.max_drawdown;
            }

            total_win_rate += metrics.win_rate;
            total_trades += metrics.total_trades;

            if metrics.total_return > Decimal::ZERO {
                profitable_windows += 1;
            }
        }
    }

    let avg_sharpe = if sharpe_count > 0 {
        Some(total_sharpe / Decimal::from(sharpe_count))
    } else {
        None
    };

    AggregatedMetrics {
        avg_sharpe,
        avg_return: total_return / Decimal::from(n as u64),
        total_return: compound_factor - Decimal::ONE,
        avg_max_drawdown: total_max_dd / Decimal::from(n as u64),
        worst_max_drawdown: worst_max_dd,
        avg_win_rate: total_win_rate / Decimal::from(n as u64),
        total_trades,
        profitable_windows,
        total_windows: n,
    }
}

/// Analyze overfitting across windows.
#[must_use]
pub fn analyze_overfitting(
    windows: &[WalkForwardWindow],
    config: &WalkForwardConfig,
) -> OverfittingAnalysis {
    let windows_with_both: Vec<_> = windows
        .iter()
        .filter(|w| w.in_sample_metrics.is_some() && w.out_of_sample_metrics.is_some())
        .collect();

    if windows_with_both.is_empty() {
        return OverfittingAnalysis::default();
    }

    let n = windows_with_both.len();
    let mut total_is_sharpe = Decimal::ZERO;
    let mut total_oos_sharpe = Decimal::ZERO;
    let mut is_sharpe_count = 0;
    let mut oos_sharpe_count = 0;
    let mut total_degradation = Decimal::ZERO;
    let mut degradation_count = 0;
    let mut overfit_count = 0;

    for window in &windows_with_both {
        if let Some(is_metrics) = &window.in_sample_metrics
            && let Some(sharpe) = is_metrics.sharpe_ratio
        {
            total_is_sharpe += sharpe;
            is_sharpe_count += 1;
        }

        if let Some(oos_metrics) = &window.out_of_sample_metrics
            && let Some(sharpe) = oos_metrics.sharpe_ratio
        {
            total_oos_sharpe += sharpe;
            oos_sharpe_count += 1;
        }

        if let Some(degradation) = window.sharpe_degradation() {
            total_degradation += degradation;
            degradation_count += 1;

            if degradation > config.overfitting_threshold {
                overfit_count += 1;
            }
        }
    }

    let avg_is_sharpe = if is_sharpe_count > 0 {
        Some(total_is_sharpe / Decimal::from(is_sharpe_count))
    } else {
        None
    };

    let avg_oos_sharpe = if oos_sharpe_count > 0 {
        Some(total_oos_sharpe / Decimal::from(oos_sharpe_count))
    } else {
        None
    };

    let avg_degradation = if degradation_count > 0 {
        Some(total_degradation / Decimal::from(degradation_count))
    } else {
        None
    };

    let overfitting_score = if n > 0 {
        Decimal::from(overfit_count as u64) / Decimal::from(n as u64)
    } else {
        Decimal::ZERO
    };

    let warning = if overfit_count > 0 {
        Some(format!(
            "{}/{} windows show >{}% Sharpe degradation",
            overfit_count,
            n,
            (config.overfitting_threshold * Decimal::ONE_HUNDRED).round_dp(0)
        ))
    } else {
        None
    };

    OverfittingAnalysis {
        avg_sharpe_degradation: avg_degradation,
        overfit_windows: overfit_count,
        total_windows: n,
        avg_in_sample_sharpe: avg_is_sharpe,
        avg_out_of_sample_sharpe: avg_oos_sharpe,
        overfitting_score,
        warning,
    }
}

/// Analyze parameter stability across windows.
#[must_use]
pub fn analyze_parameter_stability(windows: &[WalkForwardWindow]) -> ParameterStability {
    if windows.is_empty() {
        return ParameterStability::default();
    }

    let mut param_values: HashMap<String, Vec<String>> = HashMap::new();

    for window in windows {
        for (key, value) in &window.optimal_params {
            param_values
                .entry(key.clone())
                .or_default()
                .push(value.clone());
        }
    }

    let mut parameter_variance = HashMap::new();
    let mut unstable_parameters = Vec::new();

    for (param_name, values) in &param_values {
        let numeric_values: Vec<Decimal> = values
            .iter()
            .filter_map(|v| v.parse::<f64>().ok())
            .map(|f| Decimal::from_f64_retain(f).unwrap_or(Decimal::ZERO))
            .collect();

        if numeric_values.len() > 1
            && let Some(variance) = calculate_variance(&numeric_values)
        {
            parameter_variance.insert(param_name.clone(), variance);

            let mean =
                numeric_values.iter().sum::<Decimal>() / Decimal::from(numeric_values.len() as u64);

            if mean != Decimal::ZERO {
                let cv = variance / mean.abs();
                if cv > Decimal::new(5, 1) {
                    unstable_parameters.push(param_name.clone());
                }
            }
        }
    }

    let stability_score = if param_values.is_empty() {
        Decimal::ONE
    } else {
        let stable_count = param_values.len() - unstable_parameters.len();
        Decimal::from(stable_count as u64) / Decimal::from(param_values.len() as u64)
    };

    let warning = if unstable_parameters.is_empty() {
        None
    } else {
        Some(format!(
            "Parameters with high variance: {}",
            unstable_parameters.join(", ")
        ))
    };

    ParameterStability {
        parameter_variance,
        unstable_parameters,
        stability_score,
        warning,
    }
}

/// Calculate variance of a slice of decimals.
#[must_use]
pub fn calculate_variance(values: &[Decimal]) -> Option<Decimal> {
    if values.len() < 2 {
        return None;
    }

    let n = Decimal::from(values.len() as u64);
    let sum: Decimal = values.iter().sum();
    let mean = sum / n;

    let variance_sum: Decimal = values.iter().map(|v| (*v - mean) * (*v - mean)).sum();

    Some(variance_sum / (n - Decimal::ONE))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backtest::metrics::PerformanceSummary;

    #[test]
    fn test_calculate_variance() {
        let values = vec![
            Decimal::new(10, 0),
            Decimal::new(20, 0),
            Decimal::new(30, 0),
        ];

        let Some(variance) = calculate_variance(&values) else {
            panic!("variance should be calculable");
        };
        assert_eq!(variance, Decimal::new(100, 0));
    }

    #[test]
    fn test_calculate_variance_insufficient_data() {
        assert!(calculate_variance(&[]).is_none());
        assert!(calculate_variance(&[Decimal::ONE]).is_none());
    }

    #[test]
    fn test_aggregate_oos_metrics_empty() {
        let metrics = aggregate_oos_metrics(&[]);
        assert_eq!(metrics.total_windows, 0);
    }

    #[test]
    fn test_aggregate_oos_metrics() {
        let mut first_window =
            WalkForwardWindow::new(0, "2020-01-01", "2020-12-31", "2021-01-01", "2021-03-31");
        let first_oos = PerformanceSummary {
            total_return: Decimal::new(10, 2),
            sharpe_ratio: Some(Decimal::new(15, 1)),
            win_rate: Decimal::new(6, 1),
            max_drawdown: Decimal::new(5, 2),
            total_trades: 50,
            ..Default::default()
        };
        first_window.out_of_sample_metrics = Some(first_oos);

        let mut second_window =
            WalkForwardWindow::new(1, "2021-01-01", "2021-12-31", "2022-01-01", "2022-03-31");
        let second_oos = PerformanceSummary {
            total_return: Decimal::new(-5, 2),
            sharpe_ratio: Some(Decimal::new(-5, 1)),
            win_rate: Decimal::new(4, 1),
            max_drawdown: Decimal::new(15, 2),
            total_trades: 30,
            ..Default::default()
        };
        second_window.out_of_sample_metrics = Some(second_oos);

        let test_windows = vec![first_window, second_window];
        let aggregated = aggregate_oos_metrics(&test_windows);

        assert_eq!(aggregated.total_windows, 2);
        assert_eq!(aggregated.profitable_windows, 1);
        assert_eq!(aggregated.total_trades, 80);
        assert_eq!(aggregated.worst_max_drawdown, Decimal::new(15, 2));
        assert_eq!(aggregated.avg_sharpe, Some(Decimal::new(5, 1)));
    }

    #[test]
    fn test_analyze_overfitting() {
        let config = WalkForwardConfig {
            overfitting_threshold: Decimal::new(5, 1),
            ..Default::default()
        };

        let mut window =
            WalkForwardWindow::new(0, "2020-01-01", "2020-12-31", "2021-01-01", "2021-03-31");

        let is_metrics = PerformanceSummary {
            sharpe_ratio: Some(Decimal::new(2, 0)),
            ..Default::default()
        };
        window.in_sample_metrics = Some(is_metrics);

        let oos_metrics = PerformanceSummary {
            sharpe_ratio: Some(Decimal::new(8, 1)),
            ..Default::default()
        };
        window.out_of_sample_metrics = Some(oos_metrics);

        let windows = vec![window];
        let analysis = analyze_overfitting(&windows, &config);

        assert_eq!(analysis.total_windows, 1);
        assert_eq!(analysis.overfit_windows, 1);
        assert!(analysis.warning.is_some());
    }
}
