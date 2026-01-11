//! Builder pattern for walk-forward analysis configuration.

use rust_decimal::Decimal;

use super::engine::WalkForwardEngine;
use super::types::{WalkForwardConfig, WindowMode};

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
    pub const fn in_sample_days(mut self, days: u32) -> Self {
        self.config.in_sample_days = days;
        self
    }

    /// Set out-of-sample window size in days.
    #[must_use]
    pub const fn out_of_sample_days(mut self, days: u32) -> Self {
        self.config.out_of_sample_days = days;
        self
    }

    /// Set window mode.
    #[must_use]
    pub const fn window_mode(mut self, mode: WindowMode) -> Self {
        self.config.window_mode = mode;
        self
    }

    /// Set overfitting threshold.
    #[must_use]
    pub const fn overfitting_threshold(mut self, threshold: Decimal) -> Self {
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
    fn test_builder_pattern() {
        let engine = WalkForwardBuilder::new()
            .in_sample_days(180)
            .out_of_sample_days(30)
            .window_mode(WindowMode::Anchored)
            .overfitting_threshold(Decimal::new(4, 1))
            .start_date("2022-01-01")
            .end_date("2024-01-01")
            .build();

        assert_eq!(engine.config().in_sample_days, 180);
        assert_eq!(engine.config().out_of_sample_days, 30);
        assert_eq!(engine.config().window_mode, WindowMode::Anchored);
    }

    #[test]
    fn test_builder_defaults() {
        let engine = WalkForwardBuilder::new().build();
        let config = engine.config();

        assert_eq!(config.in_sample_days, 365);
        assert_eq!(config.out_of_sample_days, 90);
        assert_eq!(config.window_mode, WindowMode::Rolling);
    }
}
