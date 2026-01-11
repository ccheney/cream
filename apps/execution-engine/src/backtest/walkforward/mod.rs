//! Walk-forward analysis and out-of-sample testing framework.
//!
//! Implements Robert Pardo's (1992) gold standard methodology for strategy validation:
//! - Rolling or anchored window optimization
//! - In-sample optimization + out-of-sample testing
//! - Aggregated out-of-sample performance metrics
//! - Overfitting detection via in-sample vs out-of-sample performance gaps

mod analysis;
mod builder;
mod engine;
mod types;

pub use builder::WalkForwardBuilder;
pub use engine::WalkForwardEngine;
pub use types::{
    AggregatedMetrics, OverfittingAnalysis, ParameterStability, WalkForwardConfig,
    WalkForwardResult, WalkForwardWindow, WindowMode,
};

#[cfg(test)]
mod tests {
    use rust_decimal::Decimal;

    use super::*;
    use crate::backtest::metrics::PerformanceSummary;

    #[test]
    fn test_walk_forward_config_default() {
        let config = WalkForwardConfig::default();
        assert_eq!(config.in_sample_days, 365);
        assert_eq!(config.out_of_sample_days, 90);
        assert_eq!(config.window_mode, WindowMode::Rolling);
    }

    #[test]
    fn test_walk_forward_window_creation() {
        let window =
            WalkForwardWindow::new(0, "2020-01-01", "2020-12-31", "2021-01-01", "2021-03-31");

        assert_eq!(window.index, 0);
        assert!(window.in_sample_metrics.is_none());
        assert!(window.out_of_sample_metrics.is_none());
    }

    #[test]
    fn test_sharpe_degradation() {
        let mut window =
            WalkForwardWindow::new(0, "2020-01-01", "2020-12-31", "2021-01-01", "2021-03-31");

        assert!(window.sharpe_degradation().is_none());

        let is_metrics = PerformanceSummary {
            sharpe_ratio: Some(Decimal::new(2, 0)),
            ..Default::default()
        };
        window.in_sample_metrics = Some(is_metrics);

        let oos_metrics = PerformanceSummary {
            sharpe_ratio: Some(Decimal::ONE),
            ..Default::default()
        };
        window.out_of_sample_metrics = Some(oos_metrics);

        let Some(degradation) = window.sharpe_degradation() else {
            panic!("degradation should be calculable with both metrics");
        };
        assert_eq!(degradation, Decimal::new(5, 1));
    }

    #[test]
    fn test_overfitting_detection() {
        let mut window =
            WalkForwardWindow::new(0, "2020-01-01", "2020-12-31", "2021-01-01", "2021-03-31");

        let is_metrics = PerformanceSummary {
            sharpe_ratio: Some(Decimal::new(3, 0)),
            ..Default::default()
        };
        window.in_sample_metrics = Some(is_metrics);

        let oos_metrics = PerformanceSummary {
            sharpe_ratio: Some(Decimal::ONE),
            ..Default::default()
        };
        window.out_of_sample_metrics = Some(oos_metrics);

        assert!(window.is_overfit(Decimal::new(5, 1)));
        assert!(!window.is_overfit(Decimal::new(7, 1)));
    }
}
