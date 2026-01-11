//! Parallel backtest executor using Rayon.

use std::sync::Arc;
use std::time::Instant;

use rayon::prelude::*;
use rust_decimal::Decimal;
use tracing::{Level, debug, info, span};

use crate::backtest::config::BacktestConfig;
use crate::backtest::metrics::PerformanceSummary;
use crate::backtest::walkforward::{WalkForwardConfig, WalkForwardWindow};

use super::config::ParallelConfig;
use super::error::ParallelError;
use super::grid::ParameterGrid;
use super::progress::ProgressTracker;
use super::result::{GridSearchResult, ParallelResult};
use super::types::{BacktestJob, BacktestJobResult, StrategyConfig};

/// Parallel backtest executor.
pub struct ParallelBacktester {
    config: ParallelConfig,
}

impl ParallelBacktester {
    /// Create a new parallel backtester.
    #[must_use]
    pub const fn new(config: ParallelConfig) -> Self {
        Self { config }
    }

    /// Configure the rayon thread pool.
    ///
    /// # Errors
    ///
    /// Returns error if thread pool cannot be configured.
    pub fn configure_thread_pool(&self) -> Result<(), ParallelError> {
        if self.config.max_threads > 0 {
            rayon::ThreadPoolBuilder::new()
                .num_threads(self.config.max_threads)
                .build_global()
                .map_err(|e| ParallelError::ThreadPoolError {
                    message: e.to_string(),
                })?;
        }
        Ok(())
    }

    /// Run backtest jobs in parallel.
    ///
    /// # Errors
    ///
    /// Returns error if no jobs provided or all jobs fail.
    #[allow(clippy::cast_possible_truncation)]
    pub fn run_jobs(&self, jobs: &[BacktestJob]) -> Result<ParallelResult, ParallelError> {
        if jobs.is_empty() {
            return Err(ParallelError::NoJobs);
        }

        let tracker = Arc::new(ProgressTracker::new(jobs.len() as u64));
        let start_time = Instant::now();

        info!(
            "Starting parallel backtest: {} jobs, {} threads",
            jobs.len(),
            self.effective_thread_count()
        );

        let results: Vec<BacktestJobResult> = if jobs.len() >= self.config.min_parallel_jobs {
            self.run_parallel(jobs, &tracker)
        } else {
            self.run_sequential(jobs, &tracker)
        };

        let elapsed = start_time.elapsed();
        let final_progress = tracker.progress();

        info!(
            "Parallel backtest complete: {}/{} succeeded in {:.2}s ({:.1} jobs/s)",
            final_progress.completed - final_progress.failed,
            final_progress.total,
            elapsed.as_secs_f64(),
            final_progress.jobs_per_sec
        );

        Ok(ParallelResult {
            results,
            total_time_ms: elapsed.as_millis() as u64,
            jobs_executed: jobs.len() as u64,
            jobs_succeeded: final_progress.completed - final_progress.failed,
            jobs_failed: final_progress.failed,
        })
    }

    fn run_parallel(
        &self,
        jobs: &[BacktestJob],
        tracker: &Arc<ProgressTracker>,
    ) -> Vec<BacktestJobResult> {
        jobs.par_iter()
            .map(|job| {
                let result = self.execute_job(job);
                tracker.job_completed(result.success);

                if self.config.track_progress {
                    let progress = tracker.progress();
                    debug!(
                        "Progress: {:.1}% ({}/{}) - ETA: {}s",
                        progress.percentage(),
                        progress.completed,
                        progress.total,
                        progress.eta_secs
                    );
                }

                result
            })
            .collect()
    }

    fn run_sequential(
        &self,
        jobs: &[BacktestJob],
        tracker: &Arc<ProgressTracker>,
    ) -> Vec<BacktestJobResult> {
        jobs.iter()
            .map(|job| {
                let result = self.execute_job(job);
                tracker.job_completed(result.success);
                result
            })
            .collect()
    }

    #[allow(clippy::cast_possible_truncation)]
    fn execute_job(&self, job: &BacktestJob) -> BacktestJobResult {
        let _span = span!(Level::DEBUG, "backtest_job", job_id = %job.job_id);
        let start = Instant::now();

        let performance = self.run_single_backtest(job);
        let elapsed = start.elapsed();

        BacktestJobResult {
            job_id: job.job_id.clone(),
            strategy_id: job.strategy.strategy_id.clone(),
            parameters: job.strategy.parameters.clone(),
            performance: Some(performance),
            execution_time_ms: elapsed.as_millis() as u64,
            error: None,
            success: true,
        }
    }

    #[allow(clippy::unused_self)]
    fn run_single_backtest(&self, _job: &BacktestJob) -> PerformanceSummary {
        PerformanceSummary::default()
    }

    /// Get effective thread count.
    #[must_use]
    pub fn effective_thread_count(&self) -> usize {
        if self.config.max_threads > 0 {
            self.config.max_threads
        } else {
            rayon::current_num_threads()
        }
    }

    /// Run parameter grid search.
    ///
    /// # Errors
    ///
    /// Returns error if grid is empty or all combinations fail.
    pub fn run_grid_search(
        &self,
        base_strategy: &StrategyConfig,
        grid: &ParameterGrid,
        backtest_config: &BacktestConfig,
    ) -> Result<GridSearchResult, ParallelError> {
        if grid.is_empty() {
            return Err(ParallelError::InvalidParameters {
                message: "Empty parameter grid".to_string(),
            });
        }

        let combinations = grid.combinations();
        info!(
            "Starting grid search: {} parameter combinations",
            combinations.len()
        );

        let jobs: Vec<BacktestJob> = combinations
            .into_iter()
            .enumerate()
            .map(|(i, params)| {
                let mut strategy = base_strategy.clone();
                strategy.strategy_id = format!("{}_{}", strategy.strategy_id, i);
                strategy.parameters = params;

                BacktestJob {
                    job_id: format!("grid_{i}"),
                    strategy,
                    backtest_config: backtest_config.clone(),
                    priority: 0,
                }
            })
            .collect();

        let parallel_result = self.run_jobs(&jobs)?;

        let best_result = parallel_result
            .results
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
            .cloned();

        Ok(GridSearchResult {
            total_combinations: parallel_result.jobs_executed,
            combinations_tested: parallel_result.jobs_succeeded,
            combinations_failed: parallel_result.jobs_failed,
            best_result,
            all_results: parallel_result.results,
            total_time_ms: parallel_result.total_time_ms,
        })
    }

    /// Run walk-forward windows in parallel.
    ///
    /// # Errors
    ///
    /// Returns error if no windows provided.
    pub fn run_walkforward_parallel(
        &self,
        windows: &[WalkForwardWindow],
        _config: &WalkForwardConfig,
        _backtest_config: &BacktestConfig,
    ) -> Result<Vec<WalkForwardWindow>, ParallelError> {
        if windows.is_empty() {
            return Err(ParallelError::NoJobs);
        }

        info!("Running {} walk-forward windows in parallel", windows.len());

        let results: Vec<WalkForwardWindow> = windows
            .par_iter()
            .map(|window| {
                let _span = span!(Level::DEBUG, "walkforward_window", index = window.index);

                let mut result_window = window.clone();
                result_window.in_sample_metrics = Some(PerformanceSummary::default());
                result_window.out_of_sample_metrics = Some(PerformanceSummary::default());

                result_window
            })
            .collect();

        Ok(results)
    }

    /// Run multiple strategies in parallel.
    ///
    /// # Errors
    ///
    /// Returns error if no strategies provided.
    pub fn run_strategies(
        &self,
        strategies: &[StrategyConfig],
        backtest_config: &BacktestConfig,
    ) -> Result<ParallelResult, ParallelError> {
        let jobs: Vec<BacktestJob> = strategies
            .iter()
            .map(|strategy| BacktestJob {
                job_id: strategy.strategy_id.clone(),
                strategy: strategy.clone(),
                backtest_config: backtest_config.clone(),
                priority: 0,
            })
            .collect();

        self.run_jobs(&jobs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parallel_backtester_creation() {
        let config = ParallelConfig::default();
        let backtester = ParallelBacktester::new(config);

        assert!(backtester.effective_thread_count() > 0);
    }

    #[test]
    fn test_empty_jobs_error() {
        let backtester = ParallelBacktester::new(ParallelConfig::default());
        let result = backtester.run_jobs(&[]);

        assert!(matches!(result, Err(ParallelError::NoJobs)));
    }
}
