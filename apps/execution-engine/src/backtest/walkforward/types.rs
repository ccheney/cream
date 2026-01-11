//! Core types for walk-forward analysis.

use std::collections::HashMap;

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::super::metrics::PerformanceSummary;

/// Window mode for walk-forward analysis.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum WindowMode {
    /// Rolling window: fixed-size in-sample window moves forward.
    #[default]
    Rolling,
    /// Anchored window: in-sample start is fixed, window grows over time.
    Anchored,
}

/// Configuration for walk-forward analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalkForwardConfig {
    /// In-sample window size (days).
    pub in_sample_days: u32,
    /// Out-of-sample window size (days).
    pub out_of_sample_days: u32,
    /// Window mode (rolling or anchored).
    pub window_mode: WindowMode,
    /// Minimum number of windows required.
    pub min_windows: usize,
    /// Sharpe ratio degradation threshold (0.5 = 50% drop is flagged).
    pub overfitting_threshold: Decimal,
    /// Risk-free rate for Sharpe calculations.
    pub risk_free_rate: Decimal,
    /// Whether to run windows in parallel.
    pub parallel: bool,
}

impl Default for WalkForwardConfig {
    fn default() -> Self {
        Self {
            in_sample_days: 365,
            out_of_sample_days: 90,
            window_mode: WindowMode::Rolling,
            min_windows: 4,
            overfitting_threshold: Decimal::new(5, 1),
            risk_free_rate: Decimal::new(5, 2),
            parallel: true,
        }
    }
}

/// A single walk-forward window with in-sample and out-of-sample periods.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalkForwardWindow {
    /// Window index (0-based).
    pub index: usize,
    /// In-sample start date (ISO 8601).
    pub in_sample_start: String,
    /// In-sample end date (ISO 8601).
    pub in_sample_end: String,
    /// Out-of-sample start date (ISO 8601).
    pub out_of_sample_start: String,
    /// Out-of-sample end date (ISO 8601).
    pub out_of_sample_end: String,
    /// In-sample performance metrics.
    pub in_sample_metrics: Option<PerformanceSummary>,
    /// Out-of-sample performance metrics.
    pub out_of_sample_metrics: Option<PerformanceSummary>,
    /// Optimal parameters found during in-sample optimization.
    pub optimal_params: HashMap<String, String>,
}

impl WalkForwardWindow {
    /// Create a new walk-forward window.
    #[must_use]
    pub fn new(
        index: usize,
        in_sample_start: &str,
        in_sample_end: &str,
        out_of_sample_start: &str,
        out_of_sample_end: &str,
    ) -> Self {
        Self {
            index,
            in_sample_start: in_sample_start.to_string(),
            in_sample_end: in_sample_end.to_string(),
            out_of_sample_start: out_of_sample_start.to_string(),
            out_of_sample_end: out_of_sample_end.to_string(),
            in_sample_metrics: None,
            out_of_sample_metrics: None,
            optimal_params: HashMap::new(),
        }
    }

    /// Calculate the Sharpe ratio degradation between in-sample and out-of-sample.
    /// Returns the percentage drop (e.g., 0.5 = 50% degradation).
    #[must_use]
    pub fn sharpe_degradation(&self) -> Option<Decimal> {
        let is_sharpe = self.in_sample_metrics.as_ref()?.sharpe_ratio?;
        let oos_sharpe = self.out_of_sample_metrics.as_ref()?.sharpe_ratio?;

        if is_sharpe == Decimal::ZERO {
            return None;
        }

        let degradation = (is_sharpe - oos_sharpe) / is_sharpe.abs();
        Some(degradation)
    }

    /// Check if this window shows signs of overfitting.
    #[must_use]
    pub fn is_overfit(&self, threshold: Decimal) -> bool {
        self.sharpe_degradation().is_some_and(|d| d > threshold)
    }
}

/// Aggregated out-of-sample performance metrics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AggregatedMetrics {
    /// Average Sharpe ratio across all OOS windows.
    pub avg_sharpe: Option<Decimal>,
    /// Average return across all OOS windows.
    pub avg_return: Decimal,
    /// Total return (compounded).
    pub total_return: Decimal,
    /// Average max drawdown.
    pub avg_max_drawdown: Decimal,
    /// Worst max drawdown across windows.
    pub worst_max_drawdown: Decimal,
    /// Average win rate.
    pub avg_win_rate: Decimal,
    /// Total trades across all windows.
    pub total_trades: u64,
    /// Number of profitable windows.
    pub profitable_windows: usize,
    /// Total windows.
    pub total_windows: usize,
}

impl Default for AggregatedMetrics {
    fn default() -> Self {
        Self {
            avg_sharpe: None,
            avg_return: Decimal::ZERO,
            total_return: Decimal::ZERO,
            avg_max_drawdown: Decimal::ZERO,
            worst_max_drawdown: Decimal::ZERO,
            avg_win_rate: Decimal::ZERO,
            total_trades: 0,
            profitable_windows: 0,
            total_windows: 0,
        }
    }
}

/// Overfitting detection analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverfittingAnalysis {
    /// Average Sharpe degradation across windows.
    pub avg_sharpe_degradation: Option<Decimal>,
    /// Number of windows flagged as overfit.
    pub overfit_windows: usize,
    /// Total windows analyzed.
    pub total_windows: usize,
    /// Average in-sample Sharpe.
    pub avg_in_sample_sharpe: Option<Decimal>,
    /// Average out-of-sample Sharpe.
    pub avg_out_of_sample_sharpe: Option<Decimal>,
    /// Overall overfitting score (0 = none, 1 = severe).
    pub overfitting_score: Decimal,
    /// Warning message if overfitting detected.
    pub warning: Option<String>,
}

impl Default for OverfittingAnalysis {
    fn default() -> Self {
        Self {
            avg_sharpe_degradation: None,
            overfit_windows: 0,
            total_windows: 0,
            avg_in_sample_sharpe: None,
            avg_out_of_sample_sharpe: None,
            overfitting_score: Decimal::ZERO,
            warning: None,
        }
    }
}

/// Parameter stability analysis across windows.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterStability {
    /// Parameter variance across windows.
    pub parameter_variance: HashMap<String, Decimal>,
    /// Parameters that changed significantly.
    pub unstable_parameters: Vec<String>,
    /// Stability score (0 = unstable, 1 = stable).
    pub stability_score: Decimal,
    /// Warning if parameters are unstable.
    pub warning: Option<String>,
}

impl Default for ParameterStability {
    fn default() -> Self {
        Self {
            parameter_variance: HashMap::new(),
            unstable_parameters: Vec::new(),
            stability_score: Decimal::ONE,
            warning: None,
        }
    }
}

/// Results of walk-forward analysis.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalkForwardResult {
    /// Configuration used.
    pub config: WalkForwardConfig,
    /// Individual window results.
    pub windows: Vec<WalkForwardWindow>,
    /// Aggregated out-of-sample metrics.
    pub aggregated_oos: AggregatedMetrics,
    /// Overfitting analysis.
    pub overfitting_analysis: OverfittingAnalysis,
    /// Parameter stability analysis.
    pub parameter_stability: ParameterStability,
}
