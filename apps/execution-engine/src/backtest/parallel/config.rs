//! Configuration for parallel backtest execution.

use serde::{Deserialize, Serialize};

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
            max_threads: 0,
            chunk_size: 0,
            track_progress: true,
            job_timeout_secs: 0,
            continue_on_error: true,
            min_parallel_jobs: 4,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parallel_config_default() {
        let config = ParallelConfig::default();

        assert_eq!(config.max_threads, 0);
        assert!(config.continue_on_error);
        assert!(config.track_progress);
        assert_eq!(config.min_parallel_jobs, 4);
    }
}
