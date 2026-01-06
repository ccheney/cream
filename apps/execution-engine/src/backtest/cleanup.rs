//! Backtest result file cleanup and storage management.
//!
//! This module handles automatic cleanup of old backtest result files
//! to prevent disk space issues from accumulating outputs.
//!
//! # Features
//!
//! - Configurable retention periods by file type
//! - Storage quota management with soft/hard limits
//! - Archival of important results before deletion
//! - Safe cleanup with dry-run mode

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

// ============================================
// Configuration
// ============================================

/// Configuration for backtest result cleanup.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupConfig {
    /// Base directory for backtest results.
    pub results_dir: PathBuf,

    /// Retention period for regular result files (days).
    pub retention_days: u32,

    /// Retention period for archived/starred results (days).
    /// Set to 0 for infinite retention.
    pub archive_retention_days: u32,

    /// Maximum storage quota in megabytes (soft limit).
    /// Triggers warnings when exceeded.
    pub soft_quota_mb: u64,

    /// Maximum storage quota in megabytes (hard limit).
    /// Triggers automatic cleanup when exceeded.
    pub hard_quota_mb: u64,

    /// File patterns to clean up (glob patterns).
    pub cleanup_patterns: Vec<String>,

    /// File patterns to never delete (glob patterns).
    pub exclude_patterns: Vec<String>,

    /// Whether to archive important results instead of deleting.
    pub archive_before_delete: bool,

    /// Directory for archived results.
    pub archive_dir: PathBuf,
}

impl Default for CleanupConfig {
    fn default() -> Self {
        Self {
            results_dir: PathBuf::from("backtest_results"),
            retention_days: 30,
            archive_retention_days: 365,
            soft_quota_mb: 1024, // 1 GB soft limit
            hard_quota_mb: 5120, // 5 GB hard limit
            cleanup_patterns: vec![
                "*.json".to_string(),
                "*.csv".to_string(),
                "*.parquet".to_string(),
            ],
            exclude_patterns: vec!["*starred*".to_string(), "*important*".to_string()],
            archive_before_delete: true,
            archive_dir: PathBuf::from("backtest_archive"),
        }
    }
}

// ============================================
// Types
// ============================================

/// Result of a cleanup operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupResult {
    /// Number of files deleted.
    pub files_deleted: usize,
    /// Number of files archived.
    pub files_archived: usize,
    /// Bytes reclaimed.
    pub bytes_reclaimed: u64,
    /// Files that failed to delete.
    pub failed_deletions: Vec<String>,
    /// Current storage usage after cleanup.
    pub current_usage_mb: u64,
    /// Whether quota is still exceeded.
    pub quota_exceeded: bool,
}

impl CleanupResult {
    /// Create an empty result.
    pub fn empty() -> Self {
        Self {
            files_deleted: 0,
            files_archived: 0,
            bytes_reclaimed: 0,
            failed_deletions: Vec::new(),
            current_usage_mb: 0,
            quota_exceeded: false,
        }
    }
}

/// Information about a backtest result file.
#[derive(Debug, Clone)]
pub struct ResultFileInfo {
    /// File path.
    pub path: PathBuf,
    /// File size in bytes.
    pub size: u64,
    /// Last modified time.
    pub modified: SystemTime,
    /// Age in days.
    pub age_days: u32,
    /// Whether file is marked as important/starred.
    pub is_important: bool,
}

/// Storage usage summary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageUsage {
    /// Total bytes used.
    pub total_bytes: u64,
    /// Total megabytes used.
    pub total_mb: u64,
    /// Number of files.
    pub file_count: usize,
    /// Oldest file age in days.
    pub oldest_age_days: u32,
    /// Newest file age in days.
    pub newest_age_days: u32,
    /// Percentage of soft quota used.
    pub soft_quota_pct: f64,
    /// Percentage of hard quota used.
    pub hard_quota_pct: f64,
}

// ============================================
// Cleanup Functions
// ============================================

/// Scan the results directory and return file information.
pub fn scan_results_dir(config: &CleanupConfig) -> io::Result<Vec<ResultFileInfo>> {
    let mut files = Vec::new();
    let now = SystemTime::now();

    if !config.results_dir.exists() {
        return Ok(files);
    }

    scan_directory(&config.results_dir, &mut files, now, config)?;
    Ok(files)
}

/// Recursively scan a directory for result files.
fn scan_directory(
    dir: &Path,
    files: &mut Vec<ResultFileInfo>,
    now: SystemTime,
    config: &CleanupConfig,
) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_dir() {
            scan_directory(&path, files, now, config)?;
        } else if path.is_file() {
            if let Ok(metadata) = entry.metadata() {
                let modified = metadata.modified().unwrap_or(now);
                let age = now.duration_since(modified).unwrap_or(Duration::ZERO);
                let age_days = (age.as_secs() / 86400) as u32;

                let is_important = is_important_file(&path, config);

                files.push(ResultFileInfo {
                    path,
                    size: metadata.len(),
                    modified,
                    age_days,
                    is_important,
                });
            }
        }
    }
    Ok(())
}

/// Check if a file matches important/exclude patterns.
fn is_important_file(path: &Path, config: &CleanupConfig) -> bool {
    let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

    for pattern in &config.exclude_patterns {
        if matches_pattern(filename, pattern) {
            return true;
        }
    }

    false
}

/// Simple glob pattern matching (supports * wildcard).
fn matches_pattern(filename: &str, pattern: &str) -> bool {
    // Handle simple cases
    if pattern == "*" {
        return true;
    }

    // Convert glob to regex-like matching
    let parts: Vec<&str> = pattern.split('*').collect();

    if parts.len() == 1 {
        // No wildcards
        return filename == pattern;
    }

    let mut pos = 0;
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() {
            continue;
        }

        if i == 0 {
            // Must start with this part
            if !filename.starts_with(part) {
                return false;
            }
            pos = part.len();
        } else if i == parts.len() - 1 {
            // Must end with this part
            if !filename[pos..].ends_with(part) {
                return false;
            }
        } else {
            // Must contain this part
            if let Some(found) = filename[pos..].find(part) {
                pos += found + part.len();
            } else {
                return false;
            }
        }
    }

    true
}

/// Calculate storage usage.
pub fn calculate_storage_usage(files: &[ResultFileInfo], config: &CleanupConfig) -> StorageUsage {
    let total_bytes: u64 = files.iter().map(|f| f.size).sum();
    let total_mb = total_bytes / (1024 * 1024);
    let file_count = files.len();

    let oldest_age_days = files.iter().map(|f| f.age_days).max().unwrap_or(0);
    let newest_age_days = files.iter().map(|f| f.age_days).min().unwrap_or(0);

    let soft_quota_pct = if config.soft_quota_mb > 0 {
        (total_mb as f64 / config.soft_quota_mb as f64) * 100.0
    } else {
        0.0
    };

    let hard_quota_pct = if config.hard_quota_mb > 0 {
        (total_mb as f64 / config.hard_quota_mb as f64) * 100.0
    } else {
        0.0
    };

    StorageUsage {
        total_bytes,
        total_mb,
        file_count,
        oldest_age_days,
        newest_age_days,
        soft_quota_pct,
        hard_quota_pct,
    }
}

/// Identify files that should be cleaned up based on retention policy.
pub fn identify_cleanup_candidates<'a>(
    files: &'a [ResultFileInfo],
    config: &CleanupConfig,
) -> Vec<&'a ResultFileInfo> {
    files
        .iter()
        .filter(|f| {
            if f.is_important {
                // Use archive retention for important files
                config.archive_retention_days > 0 && f.age_days > config.archive_retention_days
            } else {
                // Use regular retention
                f.age_days > config.retention_days
            }
        })
        .collect()
}

/// Perform cleanup based on configuration.
///
/// # Arguments
///
/// * `config` - Cleanup configuration
/// * `dry_run` - If true, don't actually delete files
///
/// # Returns
///
/// Result with cleanup statistics.
pub fn perform_cleanup(config: &CleanupConfig, dry_run: bool) -> io::Result<CleanupResult> {
    let files = scan_results_dir(config)?;
    let usage = calculate_storage_usage(&files, config);

    info!(
        total_mb = usage.total_mb,
        file_count = usage.file_count,
        "Scanning backtest results for cleanup"
    );

    // Check if cleanup is needed
    if usage.hard_quota_pct < 100.0 {
        // Check retention-based cleanup
        let candidates = identify_cleanup_candidates(&files, config);
        if candidates.is_empty() {
            debug!("No files exceed retention period");
            return Ok(CleanupResult {
                current_usage_mb: usage.total_mb,
                quota_exceeded: usage.hard_quota_pct >= 100.0,
                ..CleanupResult::empty()
            });
        }
    }

    // Identify candidates for cleanup
    let candidates = identify_cleanup_candidates(&files, config);
    let mut result = CleanupResult::empty();

    for file in candidates {
        if dry_run {
            info!(path = ?file.path, age_days = file.age_days, "Would delete file");
            result.files_deleted += 1;
            result.bytes_reclaimed += file.size;
            continue;
        }

        // Archive if configured and file is important
        if config.archive_before_delete && file.is_important {
            match archive_file(&file.path, &config.archive_dir) {
                Ok(()) => {
                    result.files_archived += 1;
                    debug!(path = ?file.path, "Archived file");
                }
                Err(e) => {
                    warn!(path = ?file.path, error = ?e, "Failed to archive file");
                }
            }
        }

        // Delete file
        match fs::remove_file(&file.path) {
            Ok(()) => {
                result.files_deleted += 1;
                result.bytes_reclaimed += file.size;
                debug!(path = ?file.path, size = file.size, "Deleted file");
            }
            Err(e) => {
                warn!(path = ?file.path, error = ?e, "Failed to delete file");
                result
                    .failed_deletions
                    .push(file.path.display().to_string());
            }
        }
    }

    // Recalculate usage
    let files = scan_results_dir(config)?;
    let final_usage = calculate_storage_usage(&files, config);
    result.current_usage_mb = final_usage.total_mb;
    result.quota_exceeded = final_usage.hard_quota_pct >= 100.0;

    info!(
        files_deleted = result.files_deleted,
        bytes_reclaimed = result.bytes_reclaimed,
        current_usage_mb = result.current_usage_mb,
        "Cleanup complete"
    );

    Ok(result)
}

/// Archive a file to the archive directory.
fn archive_file(source: &Path, archive_dir: &Path) -> io::Result<()> {
    // Create archive directory if needed
    fs::create_dir_all(archive_dir)?;

    // Build archive path with timestamp
    let filename = source.file_name().unwrap_or_default();
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let archive_name = format!("{}_{}.archived", timestamp, filename.to_string_lossy());
    let archive_path = archive_dir.join(archive_name);

    // Copy file to archive
    fs::copy(source, &archive_path)?;

    Ok(())
}

/// Check storage quota and return warnings/errors.
pub fn check_storage_quota(config: &CleanupConfig) -> io::Result<QuotaStatus> {
    let files = scan_results_dir(config)?;
    let usage = calculate_storage_usage(&files, config);

    let status = if usage.hard_quota_pct >= 100.0 {
        QuotaStatus::HardLimitExceeded {
            usage_mb: usage.total_mb,
            limit_mb: config.hard_quota_mb,
        }
    } else if usage.soft_quota_pct >= 100.0 {
        QuotaStatus::SoftLimitExceeded {
            usage_mb: usage.total_mb,
            limit_mb: config.soft_quota_mb,
        }
    } else if usage.soft_quota_pct >= 80.0 {
        QuotaStatus::ApproachingLimit {
            usage_mb: usage.total_mb,
            limit_mb: config.soft_quota_mb,
            pct: usage.soft_quota_pct,
        }
    } else {
        QuotaStatus::Ok {
            usage_mb: usage.total_mb,
            available_mb: config.soft_quota_mb - usage.total_mb,
        }
    };

    Ok(status)
}

/// Storage quota status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum QuotaStatus {
    /// Storage is within limits.
    Ok { usage_mb: u64, available_mb: u64 },
    /// Approaching soft limit (80%+).
    ApproachingLimit {
        usage_mb: u64,
        limit_mb: u64,
        pct: f64,
    },
    /// Soft limit exceeded.
    SoftLimitExceeded { usage_mb: u64, limit_mb: u64 },
    /// Hard limit exceeded (automatic cleanup required).
    HardLimitExceeded { usage_mb: u64, limit_mb: u64 },
}

impl std::fmt::Display for QuotaStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Ok {
                usage_mb,
                available_mb,
            } => {
                write!(f, "OK: {} MB used, {} MB available", usage_mb, available_mb)
            }
            Self::ApproachingLimit {
                usage_mb,
                limit_mb,
                pct,
            } => {
                write!(
                    f,
                    "WARNING: Approaching limit ({:.1}%): {} MB / {} MB",
                    pct, usage_mb, limit_mb
                )
            }
            Self::SoftLimitExceeded { usage_mb, limit_mb } => {
                write!(
                    f,
                    "SOFT LIMIT EXCEEDED: {} MB / {} MB - consider cleanup",
                    usage_mb, limit_mb
                )
            }
            Self::HardLimitExceeded { usage_mb, limit_mb } => {
                write!(
                    f,
                    "HARD LIMIT EXCEEDED: {} MB / {} MB - cleanup required",
                    usage_mb, limit_mb
                )
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    use tempfile::tempdir;

    fn create_test_file(dir: &Path, name: &str, age_days: u64) -> PathBuf {
        let path = dir.join(name);
        let mut file = File::create(&path).unwrap();
        writeln!(file, "test content").unwrap();

        // Set modified time to simulate age
        if age_days > 0 {
            let mtime = SystemTime::now() - Duration::from_secs(age_days * 86400);
            filetime::set_file_mtime(&path, filetime::FileTime::from_system_time(mtime)).unwrap();
        }

        path
    }

    #[test]
    fn test_matches_pattern() {
        assert!(matches_pattern("test.json", "*.json"));
        assert!(matches_pattern("backtest_results.csv", "*.csv"));
        assert!(!matches_pattern("test.json", "*.csv"));
        assert!(matches_pattern("starred_result.json", "*starred*"));
        assert!(matches_pattern("important_backtest.json", "*important*"));
        assert!(!matches_pattern("regular.json", "*starred*"));
    }

    #[test]
    fn test_cleanup_config_default() {
        let config = CleanupConfig::default();
        assert_eq!(config.retention_days, 30);
        assert_eq!(config.soft_quota_mb, 1024);
        assert_eq!(config.hard_quota_mb, 5120);
    }

    #[test]
    fn test_scan_empty_directory() {
        let dir = tempdir().unwrap();
        let config = CleanupConfig {
            results_dir: dir.path().to_path_buf(),
            ..Default::default()
        };

        let files = scan_results_dir(&config).unwrap();
        assert!(files.is_empty());
    }

    #[test]
    fn test_scan_with_files() {
        let dir = tempdir().unwrap();
        create_test_file(dir.path(), "test1.json", 0);
        create_test_file(dir.path(), "test2.csv", 0);

        let config = CleanupConfig {
            results_dir: dir.path().to_path_buf(),
            ..Default::default()
        };

        let files = scan_results_dir(&config).unwrap();
        assert_eq!(files.len(), 2);
    }

    #[test]
    fn test_calculate_storage_usage() {
        let dir = tempdir().unwrap();
        create_test_file(dir.path(), "test1.json", 5);
        create_test_file(dir.path(), "test2.json", 10);

        let config = CleanupConfig {
            results_dir: dir.path().to_path_buf(),
            ..Default::default()
        };

        let files = scan_results_dir(&config).unwrap();
        let usage = calculate_storage_usage(&files, &config);

        assert_eq!(usage.file_count, 2);
        assert!(usage.total_bytes > 0);
    }

    #[test]
    fn test_identify_cleanup_candidates() {
        let dir = tempdir().unwrap();
        create_test_file(dir.path(), "old.json", 60); // Old, should be deleted
        create_test_file(dir.path(), "new.json", 5); // New, should be kept

        let config = CleanupConfig {
            results_dir: dir.path().to_path_buf(),
            retention_days: 30,
            ..Default::default()
        };

        let files = scan_results_dir(&config).unwrap();
        let candidates = identify_cleanup_candidates(&files, &config);

        assert_eq!(candidates.len(), 1);
        assert!(
            candidates[0]
                .path
                .file_name()
                .unwrap()
                .to_str()
                .unwrap()
                .contains("old")
        );
    }

    #[test]
    fn test_important_file_excluded() {
        let dir = tempdir().unwrap();
        create_test_file(dir.path(), "starred_result.json", 60); // Old but important

        let config = CleanupConfig {
            results_dir: dir.path().to_path_buf(),
            retention_days: 30,
            archive_retention_days: 365,
            ..Default::default()
        };

        let files = scan_results_dir(&config).unwrap();
        assert!(files[0].is_important);

        let candidates = identify_cleanup_candidates(&files, &config);
        assert!(candidates.is_empty()); // Not old enough for archive retention
    }

    #[test]
    fn test_dry_run_cleanup() {
        let dir = tempdir().unwrap();
        let path = create_test_file(dir.path(), "old.json", 60);

        let config = CleanupConfig {
            results_dir: dir.path().to_path_buf(),
            retention_days: 30,
            ..Default::default()
        };

        let result = perform_cleanup(&config, true).unwrap();

        // File should still exist (dry run)
        assert!(path.exists());
        assert_eq!(result.files_deleted, 1);
    }

    #[test]
    fn test_actual_cleanup() {
        let dir = tempdir().unwrap();
        let path = create_test_file(dir.path(), "old.json", 60);

        let config = CleanupConfig {
            results_dir: dir.path().to_path_buf(),
            retention_days: 30,
            archive_before_delete: false,
            ..Default::default()
        };

        let result = perform_cleanup(&config, false).unwrap();

        // File should be deleted
        assert!(!path.exists());
        assert_eq!(result.files_deleted, 1);
        assert!(result.bytes_reclaimed > 0);
    }

    #[test]
    fn test_quota_status_display() {
        let ok = QuotaStatus::Ok {
            usage_mb: 100,
            available_mb: 924,
        };
        assert!(format!("{}", ok).contains("OK"));

        let exceeded = QuotaStatus::HardLimitExceeded {
            usage_mb: 6000,
            limit_mb: 5120,
        };
        assert!(format!("{}", exceeded).contains("HARD LIMIT EXCEEDED"));
    }

    #[test]
    fn test_check_storage_quota() {
        let dir = tempdir().unwrap();
        let config = CleanupConfig {
            results_dir: dir.path().to_path_buf(),
            soft_quota_mb: 1024,
            hard_quota_mb: 5120,
            ..Default::default()
        };

        let status = check_storage_quota(&config).unwrap();
        assert!(matches!(status, QuotaStatus::Ok { .. }));
    }

    #[test]
    fn test_cleanup_result_empty() {
        let result = CleanupResult::empty();
        assert_eq!(result.files_deleted, 0);
        assert_eq!(result.bytes_reclaimed, 0);
        assert!(!result.quota_exceeded);
    }
}
