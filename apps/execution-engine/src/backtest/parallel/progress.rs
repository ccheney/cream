//! Progress tracking for parallel backtest execution.

use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

use serde::{Deserialize, Serialize};

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

        let jobs_per_sec = if elapsed.as_secs_f64() > 0.0 {
            completed as f64 / elapsed.as_secs_f64()
        } else {
            0.0
        };

        let remaining = self.total_jobs.saturating_sub(completed);
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
            (self.completed as f64 / self.total as f64) * 100.0
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
