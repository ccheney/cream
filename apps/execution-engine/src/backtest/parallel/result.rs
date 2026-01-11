//! Result types for parallel backtest execution.

use std::collections::HashMap;

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::types::{BacktestJobResult, ParamValue};

/// Result from parallel backtest execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParallelResult {
    /// Individual job results.
    pub results: Vec<BacktestJobResult>,

    /// Total execution time in milliseconds.
    pub total_time_ms: u64,

    /// Number of jobs executed.
    pub jobs_executed: u64,

    /// Number of successful jobs.
    pub jobs_succeeded: u64,

    /// Number of failed jobs.
    pub jobs_failed: u64,
}

impl ParallelResult {
    /// Get the success rate.
    #[must_use]
    #[allow(clippy::cast_precision_loss)]
    pub fn success_rate(&self) -> f64 {
        if self.jobs_executed == 0 {
            0.0
        } else {
            self.jobs_succeeded as f64 / self.jobs_executed as f64
        }
    }

    /// Get successful results only.
    #[must_use]
    pub fn successful_results(&self) -> Vec<&BacktestJobResult> {
        self.results.iter().filter(|r| r.success).collect()
    }

    /// Get failed results only.
    #[must_use]
    pub fn failed_results(&self) -> Vec<&BacktestJobResult> {
        self.results.iter().filter(|r| !r.success).collect()
    }

    /// Get the best result by Sharpe ratio.
    #[must_use]
    pub fn best_by_sharpe(&self) -> Option<&BacktestJobResult> {
        self.results
            .iter()
            .filter(|r| r.success && r.performance.is_some())
            .max_by(|a, b| {
                let sharpe_a = a
                    .performance
                    .as_ref()
                    .and_then(|p| p.sharpe_ratio)
                    .unwrap_or(Decimal::ZERO);
                let sharpe_b = b
                    .performance
                    .as_ref()
                    .and_then(|p| p.sharpe_ratio)
                    .unwrap_or(Decimal::ZERO);
                sharpe_a.cmp(&sharpe_b)
            })
    }
}

/// Result from grid search optimization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridSearchResult {
    /// Total parameter combinations.
    pub total_combinations: u64,

    /// Combinations successfully tested.
    pub combinations_tested: u64,

    /// Combinations that failed.
    pub combinations_failed: u64,

    /// Best result found.
    pub best_result: Option<BacktestJobResult>,

    /// All results (for analysis).
    pub all_results: Vec<BacktestJobResult>,

    /// Total execution time in milliseconds.
    pub total_time_ms: u64,
}

impl GridSearchResult {
    /// Get optimal parameters from best result.
    #[must_use]
    pub fn optimal_parameters(&self) -> Option<&HashMap<String, ParamValue>> {
        self.best_result.as_ref().map(|r| &r.parameters)
    }

    /// Get the Sharpe ratio of the best result.
    #[must_use]
    pub fn best_sharpe(&self) -> Option<Decimal> {
        self.best_result
            .as_ref()
            .and_then(|r| r.performance.as_ref())
            .and_then(|p| p.sharpe_ratio)
    }
}

#[cfg(test)]
mod tests {
    use crate::backtest::metrics::PerformanceSummary;

    use super::*;

    #[test]
    fn test_parallel_result_success_rate() {
        let result = ParallelResult {
            results: vec![],
            total_time_ms: 1000,
            jobs_executed: 10,
            jobs_succeeded: 8,
            jobs_failed: 2,
        };

        assert!((result.success_rate() - 0.8).abs() < 0.001);
    }

    #[test]
    fn test_grid_search_result_optimal_params() {
        let best_result = BacktestJobResult {
            job_id: "test".to_string(),
            strategy_id: "strat".to_string(),
            parameters: {
                let mut params = HashMap::new();
                params.insert("period".to_string(), ParamValue::Int(20));
                params
            },
            performance: Some(PerformanceSummary::default()),
            execution_time_ms: 100,
            error: None,
            success: true,
        };

        let grid_result = GridSearchResult {
            total_combinations: 10,
            combinations_tested: 10,
            combinations_failed: 0,
            best_result: Some(best_result),
            all_results: vec![],
            total_time_ms: 5000,
        };

        assert!(grid_result.optimal_parameters().is_some());
        let Some(optimal_params) = grid_result.optimal_parameters() else {
            panic!("optimal parameters should exist");
        };
        assert_eq!(optimal_params.get("period"), Some(&ParamValue::Int(20)));
    }
}
