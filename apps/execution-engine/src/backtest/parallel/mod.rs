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

mod config;
mod error;
mod executor;
mod grid;
mod progress;
mod result;
mod types;

pub use config::ParallelConfig;
pub use error::ParallelError;
pub use executor::ParallelBacktester;
pub use grid::{ParameterGrid, ParameterGridBuilder};
pub use progress::{Progress, ProgressTracker};
pub use result::{GridSearchResult, ParallelResult};
pub use types::{BacktestJob, BacktestJobResult, ParamValue, StrategyConfig};
