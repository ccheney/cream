//! Parallel backtesting infrastructure using Rayon.
//!
//! Provides data-parallel execution of backtests across:
//! - Multiple strategies simultaneously
//! - Parameter grid search optimization
//! - Walk-forward windows
//! - Multiple symbols/instruments
//!
//! # Thread Pool Configuration
//!
//! Rayon uses a work-stealing scheduler with a global thread pool.
//! The default thread count is `num_cpus`, but can be customized:
//!
//! ```ignore
//! use rayon::ThreadPoolBuilder;
//!
//! ThreadPoolBuilder::new()
//!     .num_threads(4)
//!     .build_global()
//!     .expect("Failed to build thread pool");
//! ```
//!
//! # Example
//!
//! ```ignore
//! use execution_engine::backtest::parallel::{
//!     ParallelBacktester, ParameterGrid, BacktestJob,
//! };
//!
//! let backtester = ParallelBacktester::new(ParallelConfig::default());
//!
//! // Run multiple strategies in parallel
//! let results = backtester.run_strategies(&strategies);
//!
//! // Or run parameter grid search
//! let grid = ParameterGrid::builder()
//!     .add_param("sma_period", vec![10, 20, 50, 100, 200])
//!     .add_param("stop_pct", vec![0.02, 0.03, 0.05])
//!     .build();
//!
//! let grid_results = backtester.run_grid_search(&strategy, &grid);
//! ```

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use rayon::prelude::*;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::{Level, debug, info, span};

use super::config::BacktestConfig;
use super::metrics::PerformanceSummary;
use super::walkforward::{WalkForwardConfig, WalkForwardWindow};

// ============================================
// Error Types
// ============================================

/// Errors from parallel backtesting operations.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum ParallelError {
    /// Thread pool initialization failed.
    #[error("Failed to initialize thread pool: {message}")]
    ThreadPoolError {
        /// Error message.
        message: String,
    },

    /// Backtest execution failed.
    #[error("Backtest failed for job '{job_id}': {message}")]
    BacktestFailed {
        /// Job identifier.
        job_id: String,
        /// Error message.
        message: String,
    },

    /// Parameter combination is invalid.
    #[error("Invalid parameter combination: {message}")]
    InvalidParameters {
        /// Error message.
        message: String,
    },

    /// No jobs to execute.
    #[error("No backtest jobs provided")]
    NoJobs,

    /// Timeout exceeded.
    #[error("Backtest timed out after {seconds}s")]
    Timeout {
        /// Timeout duration in seconds.
        seconds: u64,
    },
}

// ============================================
// Configuration
// ============================================

/// Configuration for parallel backtest execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParallelConfig {
    /// Maximum number of threads to use (0 = use all available).
    pub max_threads: usize,

    /// Chunk size for work distribution (0 = auto).
    pub chunk_size: usize,

    /// Whether to collect detailed progress metrics.
    pub track_progress: bool,

    /// Timeout per individual backtest job (seconds, 0 = no timeout).
    pub job_timeout_secs: u64,

    /// Whether to continue on individual job failures.
    pub continue_on_error: bool,

    /// Minimum parallelization threshold (jobs below this run sequentially).
    pub min_parallel_jobs: usize,
}

impl Default for ParallelConfig {
    fn default() -> Self {
        Self {
            max_threads: 0, // Use all available
            chunk_size: 0,  // Auto-determine
            track_progress: true,
            job_timeout_secs: 0, // No timeout
            continue_on_error: true,
            min_parallel_jobs: 4,
        }
    }
}

// ============================================
// Strategy Configuration
// ============================================

/// A strategy configuration to backtest.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StrategyConfig {
    /// Unique strategy identifier.
    pub strategy_id: String,

    /// Strategy name/description.
    pub name: String,

    /// Strategy parameters.
    pub parameters: HashMap<String, ParamValue>,

    /// Symbols/instruments to trade.
    pub symbols: Vec<String>,

    /// Start date (ISO 8601).
    pub start_date: String,

    /// End date (ISO 8601).
    pub end_date: String,
}

/// Parameter value that can be numeric or string.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum ParamValue {
    /// Integer parameter.
    Int(i64),
    /// Decimal parameter.
    Float(f64),
    /// String parameter.
    String(String),
    /// Boolean parameter.
    Bool(bool),
}

impl ParamValue {
    /// Get as integer if applicable.
    #[must_use]
    #[allow(clippy::cast_possible_truncation)]
    pub const fn as_int(&self) -> Option<i64> {
        match self {
            Self::Int(v) => Some(*v),
            // Truncation acceptable: converting float param to int loses decimal part
            Self::Float(v) => Some(*v as i64),
            _ => None,
        }
    }

    /// Get as float if applicable.
    #[must_use]
    #[allow(clippy::cast_precision_loss)]
    pub const fn as_float(&self) -> Option<f64> {
        match self {
            // Precision loss acceptable: i64 can exceed f64 mantissa but rare for params
            Self::Int(v) => Some(*v as f64),
            Self::Float(v) => Some(*v),
            _ => None,
        }
    }

    /// Get as string.
    #[must_use]
    pub fn as_str(&self) -> String {
        match self {
            Self::Int(v) => v.to_string(),
            Self::Float(v) => v.to_string(),
            Self::String(v) => v.clone(),
            Self::Bool(v) => v.to_string(),
        }
    }
}

// ============================================
// Parameter Grid
// ============================================

/// A parameter grid for grid search optimization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParameterGrid {
    /// Parameter names and their possible values.
    parameters: HashMap<String, Vec<ParamValue>>,

    /// Parameter order (for consistent iteration).
    order: Vec<String>,
}

impl ParameterGrid {
    /// Create a new parameter grid builder.
    #[must_use]
    pub fn builder() -> ParameterGridBuilder {
        ParameterGridBuilder::new()
    }

    /// Get the total number of parameter combinations.
    #[must_use]
    pub fn total_combinations(&self) -> usize {
        self.parameters.values().map(Vec::len).product()
    }

    /// Generate all parameter combinations.
    #[must_use]
    pub fn combinations(&self) -> Vec<HashMap<String, ParamValue>> {
        let mut result = vec![HashMap::new()];

        for param_name in &self.order {
            if let Some(values) = self.parameters.get(param_name) {
                let mut new_result = Vec::with_capacity(result.len() * values.len());
                for combo in &result {
                    for value in values {
                        let mut new_combo = combo.clone();
                        new_combo.insert(param_name.clone(), value.clone());
                        new_result.push(new_combo);
                    }
                }
                result = new_result;
            }
        }

        result
    }

    /// Check if grid is empty.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.parameters.is_empty() || self.total_combinations() == 0
    }
}

/// Builder for parameter grids.
#[derive(Debug, Default)]
pub struct ParameterGridBuilder {
    parameters: HashMap<String, Vec<ParamValue>>,
    order: Vec<String>,
}

impl ParameterGridBuilder {
    /// Create a new builder.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Add integer parameter values.
    #[must_use]
    pub fn add_int_param(mut self, name: &str, values: Vec<i64>) -> Self {
        self.order.push(name.to_string());
        self.parameters.insert(
            name.to_string(),
            values.into_iter().map(ParamValue::Int).collect(),
        );
        self
    }

    /// Add float parameter values.
    #[must_use]
    pub fn add_float_param(mut self, name: &str, values: Vec<f64>) -> Self {
        self.order.push(name.to_string());
        self.parameters.insert(
            name.to_string(),
            values.into_iter().map(ParamValue::Float).collect(),
        );
        self
    }

    /// Add string parameter values.
    #[must_use]
    pub fn add_string_param(mut self, name: &str, values: Vec<&str>) -> Self {
        self.order.push(name.to_string());
        self.parameters.insert(
            name.to_string(),
            values
                .into_iter()
                .map(|s| ParamValue::String(s.to_string()))
                .collect(),
        );
        self
    }

    /// Add a parameter range (inclusive).
    #[must_use]
    #[allow(clippy::cast_possible_truncation)]
    pub fn add_int_range(self, name: &str, start: i64, end: i64, step: i64) -> Self {
        // Step size truncation acceptable: u64 step is typically small for param ranges
        let values: Vec<i64> = (start..=end)
            .step_by(step.unsigned_abs() as usize)
            .collect();
        self.add_int_param(name, values)
    }

    /// Build the parameter grid.
    #[must_use]
    pub fn build(self) -> ParameterGrid {
        ParameterGrid {
            parameters: self.parameters,
            order: self.order,
        }
    }
}

// ============================================
// Backtest Job
// ============================================

/// A single backtest job to execute.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestJob {
    /// Unique job identifier.
    pub job_id: String,

    /// Strategy configuration.
    pub strategy: StrategyConfig,

    /// Backtest configuration.
    pub backtest_config: BacktestConfig,

    /// Job priority (higher = run first).
    pub priority: u32,
}

/// Result from a single backtest job.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacktestJobResult {
    /// Job identifier.
    pub job_id: String,

    /// Strategy identifier.
    pub strategy_id: String,

    /// Parameters used.
    pub parameters: HashMap<String, ParamValue>,

    /// Performance summary.
    pub performance: Option<PerformanceSummary>,

    /// Execution time in milliseconds.
    pub execution_time_ms: u64,

    /// Error message if failed.
    pub error: Option<String>,

    /// Whether job completed successfully.
    pub success: bool,
}

// ============================================
// Progress Tracking
// ============================================

/// Progress tracker for parallel execution.
#[derive(Debug)]
pub struct ProgressTracker {
    total_jobs: u64,
    completed_jobs: AtomicU64,
    failed_jobs: AtomicU64,
    start_time: Instant,
}

impl ProgressTracker {
    /// Create a new progress tracker.
    #[must_use]
    pub fn new(total_jobs: u64) -> Self {
        Self {
            total_jobs,
            completed_jobs: AtomicU64::new(0),
            failed_jobs: AtomicU64::new(0),
            start_time: Instant::now(),
        }
    }

    /// Mark a job as completed.
    pub fn job_completed(&self, success: bool) {
        self.completed_jobs.fetch_add(1, Ordering::Relaxed);
        if !success {
            self.failed_jobs.fetch_add(1, Ordering::Relaxed);
        }
    }

    /// Get current progress.
    #[must_use]
    #[allow(
        clippy::cast_precision_loss,
        clippy::cast_possible_truncation,
        clippy::cast_sign_loss
    )]
    pub fn progress(&self) -> Progress {
        let completed = self.completed_jobs.load(Ordering::Relaxed);
        let failed = self.failed_jobs.load(Ordering::Relaxed);
        let elapsed = self.start_time.elapsed();

        // Precision loss acceptable for rate calculation (approximate metric)
        let jobs_per_sec = if elapsed.as_secs_f64() > 0.0 {
            completed as f64 / elapsed.as_secs_f64()
        } else {
            0.0
        };

        let remaining = self.total_jobs.saturating_sub(completed);
        // Truncation acceptable for ETA calculation (approximate metric)
        let eta_secs = if jobs_per_sec > 0.0 {
            (remaining as f64 / jobs_per_sec) as u64
        } else {
            0
        };

        Progress {
            total: self.total_jobs,
            completed,
            failed,
            elapsed_secs: elapsed.as_secs(),
            eta_secs,
            jobs_per_sec,
        }
    }
}

/// Progress snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Progress {
    /// Total number of jobs.
    pub total: u64,
    /// Completed jobs.
    pub completed: u64,
    /// Failed jobs.
    pub failed: u64,
    /// Elapsed time in seconds.
    pub elapsed_secs: u64,
    /// Estimated time remaining in seconds.
    pub eta_secs: u64,
    /// Jobs processed per second.
    pub jobs_per_sec: f64,
}

impl Progress {
    /// Get completion percentage.
    #[must_use]
    #[allow(clippy::cast_precision_loss)]
    pub fn percentage(&self) -> f64 {
        if self.total == 0 {
            100.0
        } else {
            // Precision loss acceptable for percentage display (approximate metric)
            (self.completed as f64 / self.total as f64) * 100.0
        }
    }
}

// ============================================
// Parallel Backtester
// ============================================

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

        // Truncation acceptable: job count should reasonably fit in u64
        let tracker = Arc::new(ProgressTracker::new(jobs.len() as u64));
        let start_time = Instant::now();

        info!(
            "Starting parallel backtest: {} jobs, {} threads",
            jobs.len(),
            self.effective_thread_count()
        );

        // Decide whether to run in parallel or sequential
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

        // Truncation acceptable: millis and job count fit in u64 for practical use
        Ok(ParallelResult {
            results,
            total_time_ms: elapsed.as_millis() as u64,
            jobs_executed: jobs.len() as u64,
            jobs_succeeded: final_progress.completed - final_progress.failed,
            jobs_failed: final_progress.failed,
        })
    }

    /// Run jobs in parallel using rayon.
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

    /// Run jobs sequentially (for small job counts).
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

    /// Execute a single backtest job.
    #[allow(clippy::cast_possible_truncation)]
    fn execute_job(&self, job: &BacktestJob) -> BacktestJobResult {
        let _span = span!(Level::DEBUG, "backtest_job", job_id = %job.job_id);
        let start = Instant::now();

        // In a real implementation, this would run the actual backtest.
        // For now, we create a placeholder result.
        // The actual backtest logic would be integrated here.
        let performance = self.run_single_backtest(job);

        let elapsed = start.elapsed();

        // Truncation acceptable: millis fit in u64 for practical job durations
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

    /// Run a single backtest (placeholder for actual implementation).
    #[allow(clippy::unused_self)]
    fn run_single_backtest(&self, _job: &BacktestJob) -> PerformanceSummary {
        // This is a placeholder that returns default metrics.
        // In production, this would:
        // 1. Load historical data for the symbols
        // 2. Initialize the strategy with parameters
        // 3. Run the backtest simulation
        // 4. Calculate and return performance metrics
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

        // Create jobs for each parameter combination
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

        // Find best result
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

                // Clone window and run backtests for in-sample and out-of-sample
                let mut result_window = window.clone();

                // In production, would run actual in-sample optimization
                // and out-of-sample testing here
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

// ============================================
// Results
// ============================================

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
            // Precision loss acceptable for ratio calculation (approximate metric)
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

// ============================================
// Tests
// ============================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parameter_grid_builder() {
        let grid = ParameterGrid::builder()
            .add_int_param("sma_period", vec![10, 20, 50])
            .add_float_param("stop_pct", vec![0.02, 0.05])
            .build();

        assert_eq!(grid.total_combinations(), 6); // 3 * 2 = 6
    }

    #[test]
    fn test_parameter_grid_combinations() {
        let grid = ParameterGrid::builder()
            .add_int_param("a", vec![1, 2])
            .add_int_param("b", vec![10, 20])
            .build();

        let combos = grid.combinations();
        assert_eq!(combos.len(), 4);

        // Check all combinations exist
        let has_1_10 = combos.iter().any(|c| {
            c.get("a") == Some(&ParamValue::Int(1)) && c.get("b") == Some(&ParamValue::Int(10))
        });
        let has_2_20 = combos.iter().any(|c| {
            c.get("a") == Some(&ParamValue::Int(2)) && c.get("b") == Some(&ParamValue::Int(20))
        });

        assert!(has_1_10);
        assert!(has_2_20);
    }

    #[test]
    fn test_parameter_grid_int_range() {
        let grid = ParameterGrid::builder()
            .add_int_range("period", 10, 50, 10)
            .build();

        assert_eq!(grid.total_combinations(), 5); // 10, 20, 30, 40, 50
    }

    #[test]
    fn test_param_value_conversions() {
        let int_val = ParamValue::Int(42);
        assert_eq!(int_val.as_int(), Some(42));
        assert_eq!(int_val.as_float(), Some(42.0));
        assert_eq!(int_val.as_str(), "42");

        let float_val = ParamValue::Float(3.5);
        assert_eq!(float_val.as_int(), Some(3));
        assert_eq!(float_val.as_float(), Some(3.5));

        let string_val = ParamValue::String("test".to_string());
        assert_eq!(string_val.as_int(), None);
        assert_eq!(string_val.as_str(), "test");
    }

    #[test]
    fn test_progress_tracker() {
        let tracker = ProgressTracker::new(10);

        tracker.job_completed(true);
        tracker.job_completed(true);
        tracker.job_completed(false);

        let progress = tracker.progress();
        assert_eq!(progress.total, 10);
        assert_eq!(progress.completed, 3);
        assert_eq!(progress.failed, 1);
        assert!((progress.percentage() - 30.0).abs() < 0.1);
    }

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

    #[test]
    fn test_parallel_config_default() {
        let config = ParallelConfig::default();

        assert_eq!(config.max_threads, 0);
        assert!(config.continue_on_error);
        assert!(config.track_progress);
        assert_eq!(config.min_parallel_jobs, 4);
    }

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

    #[test]
    fn test_strategy_config_creation() {
        let strategy = StrategyConfig {
            strategy_id: "test_strategy".to_string(),
            name: "Test Strategy".to_string(),
            parameters: HashMap::new(),
            symbols: vec!["AAPL".to_string(), "GOOGL".to_string()],
            start_date: "2024-01-01".to_string(),
            end_date: "2024-12-31".to_string(),
        };

        assert_eq!(strategy.symbols.len(), 2);
    }

    #[test]
    fn test_backtest_job_result_serialization() {
        let result = BacktestJobResult {
            job_id: "job_1".to_string(),
            strategy_id: "strat_1".to_string(),
            parameters: HashMap::new(),
            performance: None,
            execution_time_ms: 500,
            error: Some("Test error".to_string()),
            success: false,
        };

        let json = match serde_json::to_string(&result) {
            Ok(j) => j,
            Err(e) => panic!("Serialization failed: {e}"),
        };
        assert!(json.contains("job_1"));
        assert!(json.contains("Test error"));
    }
}
