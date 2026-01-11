//! Walk-forward analysis engine.

use tracing::{debug, info, warn};

use super::analysis::{aggregate_oos_metrics, analyze_overfitting, analyze_parameter_stability};
use super::types::{WalkForwardConfig, WalkForwardResult, WalkForwardWindow, WindowMode};

/// Walk-forward analysis engine.
#[derive(Debug)]
pub struct WalkForwardEngine {
    config: WalkForwardConfig,
    start_date: String,
    end_date: String,
}

impl WalkForwardEngine {
    /// Create a new walk-forward engine.
    #[must_use]
    pub fn new(config: WalkForwardConfig, start_date: &str, end_date: &str) -> Self {
        Self {
            config,
            start_date: start_date.to_string(),
            end_date: end_date.to_string(),
        }
    }

    /// Access the engine configuration.
    #[must_use]
    pub const fn config(&self) -> &WalkForwardConfig {
        &self.config
    }

    /// Generate walk-forward windows based on configuration.
    #[must_use]
    pub fn generate_windows(&self) -> Vec<WalkForwardWindow> {
        let mut windows = Vec::new();

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
            let (is_end, oos_start, oos_end) = match self.config.window_mode {
                WindowMode::Rolling => {
                    let is_end = is_start + self.config.in_sample_days;
                    let oos_start = is_end;
                    let oos_end = oos_start + self.config.out_of_sample_days;
                    (is_end, oos_start, oos_end)
                }
                WindowMode::Anchored => {
                    #[allow(clippy::cast_possible_truncation)]
                    let idx = index as u32;
                    let is_end =
                        self.config.in_sample_days + (idx * self.config.out_of_sample_days);
                    let oos_start = is_end;
                    let oos_end = oos_start + self.config.out_of_sample_days;
                    (is_end, oos_start, oos_end)
                }
            };

            if oos_end > total_days {
                break;
            }

            let window = WalkForwardWindow::new(
                index,
                &offset_date(&self.start_date, is_start),
                &offset_date(&self.start_date, is_end),
                &offset_date(&self.start_date, oos_start),
                &offset_date(&self.start_date, oos_end),
            );

            windows.push(window);
            index += 1;

            if self.config.window_mode == WindowMode::Rolling {
                current_start += self.config.out_of_sample_days;
            }

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

    /// Run complete walk-forward analysis.
    /// This generates windows and analysis structure; actual backtests are run externally.
    #[must_use]
    pub fn run(&self, windows: Vec<WalkForwardWindow>) -> WalkForwardResult {
        debug!(windows = windows.len(), "Running walk-forward analysis");

        let aggregated_oos = aggregate_oos_metrics(&windows);
        let overfitting_analysis = analyze_overfitting(&windows, &self.config);
        let parameter_stability = analyze_parameter_stability(&windows);

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
}

/// Offset a date by a number of days (simplified).
fn offset_date(base: &str, days: u32) -> String {
    let year: u32 = base[0..4].parse().unwrap_or(2024);
    let month: u32 = base[5..7].parse().unwrap_or(1);
    let day: u32 = base[8..10].parse().unwrap_or(1);

    let total_days = year * 365 + month * 30 + day + days;
    let new_year = total_days / 365;
    let remaining = total_days % 365;
    let new_month = (remaining / 30).clamp(1, 12);
    let new_day = (remaining % 30).clamp(1, 28);

    format!("{new_year:04}-{new_month:02}-{new_day:02}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backtest::walkforward::WalkForwardBuilder;

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
}
