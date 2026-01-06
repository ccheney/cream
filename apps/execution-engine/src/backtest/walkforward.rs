//! Walk-forward analysis and out-of-sample testing framework.
//!
//! Implements Robert Pardo's (1992) gold standard methodology for strategy validation:
//! - Rolling or anchored window optimization
//! - In-sample optimization + out-of-sample testing
//! - Aggregated out-of-sample performance metrics
//! - Overfitting detection via in-sample vs out-of-sample performance gaps

use std::collections::HashMap;

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

use super::metrics::PerformanceSummary;

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
            in_sample_days: 365,    // 12 months in-sample
            out_of_sample_days: 90, // 3 months out-of-sample
            window_mode: WindowMode::Rolling,
            min_windows: 4,
            overfitting_threshold: Decimal::new(5, 1), // 0.5 = 50%
            risk_free_rate: Decimal::new(5, 2),        // 5%
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
        self.sharpe_degradation()
            .map(|d| d > threshold)
            .unwrap_or(false)
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

/// Walk-forward analysis engine.
#[derive(Debug)]
pub struct WalkForwardEngine {
    config: WalkForwardConfig,
    start_date: String,
    end_date: String,
}

impl WalkForwardEngine {
    /// Create a new walk-forward engine.
    pub fn new(config: WalkForwardConfig, start_date: &str, end_date: &str) -> Self {
        Self {
            config,
            start_date: start_date.to_string(),
            end_date: end_date.to_string(),
        }
    }

    /// Generate walk-forward windows based on configuration.
    #[must_use]
    pub fn generate_windows(&self) -> Vec<WalkForwardWindow> {
        let mut windows = Vec::new();

        // Parse dates (simplified - assumes ISO 8601 format YYYY-MM-DD)
        let total_days = self.estimate_total_days();
        let window_size = self.config.in_sample_days + self.config.out_of_sample_days;

        if total_days < window_size {
            warn!(
                total_days = total_days,
                window_size = window_size,
                "Insufficient data for walk-forward analysis"
            );
            return windows;
        }

        let mut current_start = 0u32;
        let mut index = 0;

        loop {
            let is_start = current_start;
            let is_end;
            let oos_start;
            let oos_end;

            match self.config.window_mode {
                WindowMode::Rolling => {
                    is_end = is_start + self.config.in_sample_days;
                    oos_start = is_end;
                    oos_end = oos_start + self.config.out_of_sample_days;
                }
                WindowMode::Anchored => {
                    // In anchored mode, IS starts at 0 and grows
                    is_end = self.config.in_sample_days
                        + (index as u32 * self.config.out_of_sample_days);
                    oos_start = is_end;
                    oos_end = oos_start + self.config.out_of_sample_days;
                }
            }

            if oos_end > total_days {
                break;
            }

            let window = WalkForwardWindow::new(
                index,
                &self.offset_date(&self.start_date, is_start),
                &self.offset_date(&self.start_date, is_end),
                &self.offset_date(&self.start_date, oos_start),
                &self.offset_date(&self.start_date, oos_end),
            );

            windows.push(window);
            index += 1;

            match self.config.window_mode {
                WindowMode::Rolling => {
                    current_start += self.config.out_of_sample_days;
                }
                WindowMode::Anchored => {
                    // In anchored mode, we just iterate by OOS window
                    // current_start stays at 0
                }
            }

            // Safety limit
            if index >= 100 {
                break;
            }
        }

        info!(
            windows = windows.len(),
            mode = ?self.config.window_mode,
            "Generated walk-forward windows"
        );

        windows
    }

    /// Aggregate out-of-sample metrics from completed windows.
    #[must_use]
    pub fn aggregate_oos_metrics(&self, windows: &[WalkForwardWindow]) -> AggregatedMetrics {
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

        // Compound returns
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
    pub fn analyze_overfitting(&self, windows: &[WalkForwardWindow]) -> OverfittingAnalysis {
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
            if let Some(is_metrics) = &window.in_sample_metrics {
                if let Some(sharpe) = is_metrics.sharpe_ratio {
                    total_is_sharpe += sharpe;
                    is_sharpe_count += 1;
                }
            }

            if let Some(oos_metrics) = &window.out_of_sample_metrics {
                if let Some(sharpe) = oos_metrics.sharpe_ratio {
                    total_oos_sharpe += sharpe;
                    oos_sharpe_count += 1;
                }
            }

            if let Some(degradation) = window.sharpe_degradation() {
                total_degradation += degradation;
                degradation_count += 1;

                if degradation > self.config.overfitting_threshold {
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

        // Calculate overfitting score (0 to 1)
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
                (self.config.overfitting_threshold * Decimal::ONE_HUNDRED).round_dp(0)
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
    pub fn analyze_parameter_stability(&self, windows: &[WalkForwardWindow]) -> ParameterStability {
        if windows.is_empty() {
            return ParameterStability::default();
        }

        // Collect all parameter values across windows
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
            // Calculate variance for numeric parameters
            let numeric_values: Vec<Decimal> = values
                .iter()
                .filter_map(|v| v.parse::<f64>().ok())
                .map(|f| Decimal::from_f64_retain(f).unwrap_or(Decimal::ZERO))
                .collect();

            if numeric_values.len() > 1 {
                if let Some(variance) = calculate_variance(&numeric_values) {
                    parameter_variance.insert(param_name.clone(), variance);

                    // Flag as unstable if variance is high relative to mean
                    let mean = numeric_values.iter().sum::<Decimal>()
                        / Decimal::from(numeric_values.len() as u64);

                    if mean != Decimal::ZERO {
                        let cv = variance / mean.abs(); // Coefficient of variation
                        if cv > Decimal::new(5, 1) {
                            // >50% CV is unstable
                            unstable_parameters.push(param_name.clone());
                        }
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

        let warning = if !unstable_parameters.is_empty() {
            Some(format!(
                "Parameters with high variance: {}",
                unstable_parameters.join(", ")
            ))
        } else {
            None
        };

        ParameterStability {
            parameter_variance,
            unstable_parameters,
            stability_score,
            warning,
        }
    }

    /// Run complete walk-forward analysis (without actual backtesting).
    /// This generates windows and analysis structure; actual backtests are run externally.
    #[must_use]
    pub fn run(&self, windows: Vec<WalkForwardWindow>) -> WalkForwardResult {
        debug!(windows = windows.len(), "Running walk-forward analysis");

        let aggregated_oos = self.aggregate_oos_metrics(&windows);
        let overfitting_analysis = self.analyze_overfitting(&windows);
        let parameter_stability = self.analyze_parameter_stability(&windows);

        WalkForwardResult {
            config: self.config.clone(),
            windows,
            aggregated_oos,
            overfitting_analysis,
            parameter_stability,
        }
    }

    /// Estimate total days in the date range.
    fn estimate_total_days(&self) -> u32 {
        // Simple estimation based on string comparison
        // In production, use chrono for proper date parsing
        let start_year: u32 = self.start_date[0..4].parse().unwrap_or(2024);
        let end_year: u32 = self.end_date[0..4].parse().unwrap_or(2024);

        let start_month: u32 = self.start_date[5..7].parse().unwrap_or(1);
        let end_month: u32 = self.end_date[5..7].parse().unwrap_or(12);

        let start_day: u32 = self.start_date[8..10].parse().unwrap_or(1);
        let end_day: u32 = self.end_date[8..10].parse().unwrap_or(28);

        let start_days = start_year * 365 + start_month * 30 + start_day;
        let end_days = end_year * 365 + end_month * 30 + end_day;

        end_days.saturating_sub(start_days)
    }

    /// Offset a date by a number of days (simplified).
    fn offset_date(&self, base: &str, days: u32) -> String {
        // Simplified date offset - in production use chrono
        let year: u32 = base[0..4].parse().unwrap_or(2024);
        let month: u32 = base[5..7].parse().unwrap_or(1);
        let day: u32 = base[8..10].parse().unwrap_or(1);

        let total_days = year * 365 + month * 30 + day + days;
        let new_year = total_days / 365;
        let remaining = total_days % 365;
        let new_month = (remaining / 30).min(12).max(1);
        let new_day = (remaining % 30).min(28).max(1);

        format!("{:04}-{:02}-{:02}", new_year, new_month, new_day)
    }
}

/// Calculate variance of a slice of decimals.
fn calculate_variance(values: &[Decimal]) -> Option<Decimal> {
    if values.len() < 2 {
        return None;
    }

    let n = Decimal::from(values.len() as u64);
    let sum: Decimal = values.iter().sum();
    let mean = sum / n;

    let variance_sum: Decimal = values.iter().map(|v| (*v - mean) * (*v - mean)).sum();

    Some(variance_sum / (n - Decimal::ONE))
}

/// Builder for walk-forward analysis.
#[derive(Debug, Default)]
pub struct WalkForwardBuilder {
    config: WalkForwardConfig,
    start_date: Option<String>,
    end_date: Option<String>,
}

impl WalkForwardBuilder {
    /// Create a new builder.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Set in-sample window size in days.
    #[must_use]
    pub fn in_sample_days(mut self, days: u32) -> Self {
        self.config.in_sample_days = days;
        self
    }

    /// Set out-of-sample window size in days.
    #[must_use]
    pub fn out_of_sample_days(mut self, days: u32) -> Self {
        self.config.out_of_sample_days = days;
        self
    }

    /// Set window mode.
    #[must_use]
    pub fn window_mode(mut self, mode: WindowMode) -> Self {
        self.config.window_mode = mode;
        self
    }

    /// Set overfitting threshold.
    #[must_use]
    pub fn overfitting_threshold(mut self, threshold: Decimal) -> Self {
        self.config.overfitting_threshold = threshold;
        self
    }

    /// Set start date.
    #[must_use]
    pub fn start_date(mut self, date: &str) -> Self {
        self.start_date = Some(date.to_string());
        self
    }

    /// Set end date.
    #[must_use]
    pub fn end_date(mut self, date: &str) -> Self {
        self.end_date = Some(date.to_string());
        self
    }

    /// Build the walk-forward engine.
    #[must_use]
    pub fn build(self) -> WalkForwardEngine {
        WalkForwardEngine::new(
            self.config,
            self.start_date.as_deref().unwrap_or("2020-01-01"),
            self.end_date.as_deref().unwrap_or("2024-12-31"),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_walk_forward_config_default() {
        let config = WalkForwardConfig::default();
        assert_eq!(config.in_sample_days, 365);
        assert_eq!(config.out_of_sample_days, 90);
        assert_eq!(config.window_mode, WindowMode::Rolling);
    }

    #[test]
    fn test_generate_windows_rolling() {
        let engine = WalkForwardBuilder::new()
            .in_sample_days(365)
            .out_of_sample_days(90)
            .window_mode(WindowMode::Rolling)
            .start_date("2020-01-01")
            .end_date("2024-01-01")
            .build();

        let windows = engine.generate_windows();
        assert!(!windows.is_empty());

        // Each window should have sequential dates
        for (i, window) in windows.iter().enumerate() {
            assert_eq!(window.index, i);
            assert!(window.in_sample_start < window.in_sample_end);
            assert!(window.in_sample_end <= window.out_of_sample_start);
            assert!(window.out_of_sample_start < window.out_of_sample_end);
        }
    }

    #[test]
    fn test_generate_windows_anchored() {
        let engine = WalkForwardBuilder::new()
            .in_sample_days(365)
            .out_of_sample_days(90)
            .window_mode(WindowMode::Anchored)
            .start_date("2020-01-01")
            .end_date("2024-01-01")
            .build();

        let windows = engine.generate_windows();
        assert!(!windows.is_empty());

        // In anchored mode, all windows start at the same date
        let first_start = &windows[0].in_sample_start;
        for window in &windows {
            assert_eq!(&window.in_sample_start, first_start);
        }
    }

    #[test]
    fn test_insufficient_data() {
        let engine = WalkForwardBuilder::new()
            .in_sample_days(365)
            .out_of_sample_days(90)
            .start_date("2024-01-01")
            .end_date("2024-06-01")
            .build();

        let windows = engine.generate_windows();
        assert!(windows.is_empty());
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

        // No metrics - degradation should be None
        assert!(window.sharpe_degradation().is_none());

        // Add in-sample metrics with Sharpe = 2.0
        let mut is_metrics = PerformanceSummary::default();
        is_metrics.sharpe_ratio = Some(Decimal::new(2, 0));
        window.in_sample_metrics = Some(is_metrics);

        // Add out-of-sample metrics with Sharpe = 1.0 (50% degradation)
        let mut oos_metrics = PerformanceSummary::default();
        oos_metrics.sharpe_ratio = Some(Decimal::ONE);
        window.out_of_sample_metrics = Some(oos_metrics);

        let degradation = window.sharpe_degradation().unwrap();
        assert_eq!(degradation, Decimal::new(5, 1)); // 0.5 = 50%
    }

    #[test]
    fn test_overfitting_detection() {
        let mut window =
            WalkForwardWindow::new(0, "2020-01-01", "2020-12-31", "2021-01-01", "2021-03-31");

        let mut is_metrics = PerformanceSummary::default();
        is_metrics.sharpe_ratio = Some(Decimal::new(3, 0)); // IS Sharpe = 3.0
        window.in_sample_metrics = Some(is_metrics);

        let mut oos_metrics = PerformanceSummary::default();
        oos_metrics.sharpe_ratio = Some(Decimal::ONE); // OOS Sharpe = 1.0
        window.out_of_sample_metrics = Some(oos_metrics);

        // Degradation = (3-1)/3 = 0.667 > 0.5 threshold
        assert!(window.is_overfit(Decimal::new(5, 1)));
        assert!(!window.is_overfit(Decimal::new(7, 1))); // Higher threshold
    }

    #[test]
    fn test_aggregate_oos_metrics() {
        let engine = WalkForwardBuilder::new().build();

        let mut window1 =
            WalkForwardWindow::new(0, "2020-01-01", "2020-12-31", "2021-01-01", "2021-03-31");
        let mut oos1 = PerformanceSummary::default();
        oos1.total_return = Decimal::new(10, 2); // 10%
        oos1.sharpe_ratio = Some(Decimal::new(15, 1)); // 1.5
        oos1.win_rate = Decimal::new(6, 1); // 60%
        oos1.max_drawdown = Decimal::new(5, 2); // 5%
        oos1.total_trades = 50;
        window1.out_of_sample_metrics = Some(oos1);

        let mut window2 =
            WalkForwardWindow::new(1, "2021-01-01", "2021-12-31", "2022-01-01", "2022-03-31");
        let mut oos2 = PerformanceSummary::default();
        oos2.total_return = Decimal::new(-5, 2); // -5%
        oos2.sharpe_ratio = Some(Decimal::new(-5, 1)); // -0.5
        oos2.win_rate = Decimal::new(4, 1); // 40%
        oos2.max_drawdown = Decimal::new(15, 2); // 15%
        oos2.total_trades = 30;
        window2.out_of_sample_metrics = Some(oos2);

        let windows = vec![window1, window2];
        let aggregated = engine.aggregate_oos_metrics(&windows);

        assert_eq!(aggregated.total_windows, 2);
        assert_eq!(aggregated.profitable_windows, 1);
        assert_eq!(aggregated.total_trades, 80);
        assert_eq!(aggregated.worst_max_drawdown, Decimal::new(15, 2));

        // Avg Sharpe = (1.5 + -0.5) / 2 = 0.5
        assert_eq!(aggregated.avg_sharpe, Some(Decimal::new(5, 1)));
    }

    #[test]
    fn test_analyze_overfitting() {
        let engine = WalkForwardBuilder::new()
            .overfitting_threshold(Decimal::new(5, 1))
            .build();

        let mut window =
            WalkForwardWindow::new(0, "2020-01-01", "2020-12-31", "2021-01-01", "2021-03-31");

        let mut is_metrics = PerformanceSummary::default();
        is_metrics.sharpe_ratio = Some(Decimal::new(2, 0));
        window.in_sample_metrics = Some(is_metrics);

        let mut oos_metrics = PerformanceSummary::default();
        oos_metrics.sharpe_ratio = Some(Decimal::new(8, 1)); // 0.8 (60% degradation)
        window.out_of_sample_metrics = Some(oos_metrics);

        let windows = vec![window];
        let analysis = engine.analyze_overfitting(&windows);

        assert_eq!(analysis.total_windows, 1);
        assert_eq!(analysis.overfit_windows, 1);
        assert!(analysis.warning.is_some());
    }

    #[test]
    fn test_calculate_variance() {
        let values = vec![
            Decimal::new(10, 0),
            Decimal::new(20, 0),
            Decimal::new(30, 0),
        ];

        let variance = calculate_variance(&values).unwrap();
        // Mean = 20, variance = ((10-20)^2 + (20-20)^2 + (30-20)^2) / 2 = 200/2 = 100
        assert_eq!(variance, Decimal::new(100, 0));
    }

    #[test]
    fn test_builder_pattern() {
        let engine = WalkForwardBuilder::new()
            .in_sample_days(180)
            .out_of_sample_days(30)
            .window_mode(WindowMode::Anchored)
            .overfitting_threshold(Decimal::new(4, 1))
            .start_date("2022-01-01")
            .end_date("2024-01-01")
            .build();

        assert_eq!(engine.config.in_sample_days, 180);
        assert_eq!(engine.config.out_of_sample_days, 30);
        assert_eq!(engine.config.window_mode, WindowMode::Anchored);
    }
}
