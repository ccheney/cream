//! Backtest security controls and audit logging.
//!
//! This module provides security controls for backtest simulations including:
//!
//! - Configuration validation to detect sensitive data
//! - Path traversal prevention
//! - Audit logging for backtest operations
//! - Access control for data sources

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

// ============================================
// Configuration Security
// ============================================

/// Patterns that indicate potentially sensitive data in configs.
const SENSITIVE_PATTERNS: &[&str] = &[
    "api_key",
    "api_secret",
    "apikey",
    "secret",
    "password",
    "passwd",
    "token",
    "bearer",
    "authorization",
    "credential",
    "private_key",
    "access_key",
    "secret_key",
];

/// Result of a configuration security scan.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigSecurityScan {
    /// Whether the config passed security checks.
    pub passed: bool,
    /// Warnings found (non-blocking).
    pub warnings: Vec<SecurityWarning>,
    /// Errors found (blocking).
    pub errors: Vec<SecurityError>,
}

impl ConfigSecurityScan {
    /// Create a passing scan result.
    #[must_use]
    pub const fn pass() -> Self {
        Self {
            passed: true,
            warnings: Vec::new(),
            errors: Vec::new(),
        }
    }

    /// Add a warning.
    #[must_use = "method returns modified result"]
    pub fn with_warning(mut self, warning: SecurityWarning) -> Self {
        self.warnings.push(warning);
        self
    }

    /// Add an error.
    #[must_use = "method returns modified result"]
    pub fn with_error(mut self, error: SecurityError) -> Self {
        self.passed = false;
        self.errors.push(error);
        self
    }
}

/// Security warning (non-blocking).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityWarning {
    /// Warning code.
    pub code: String,
    /// Warning message.
    pub message: String,
    /// Location in config (if applicable).
    pub location: Option<String>,
}

/// Security error (blocking).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityError {
    /// Error code.
    pub code: String,
    /// Error message.
    pub message: String,
    /// Location in config (if applicable).
    pub location: Option<String>,
}

/// Scan a configuration string for sensitive data.
///
/// Checks for common patterns that indicate API keys, passwords, etc.
/// that should not be stored in plain text configs.
#[must_use]
pub fn scan_config_for_secrets(config_text: &str) -> ConfigSecurityScan {
    let mut result = ConfigSecurityScan::pass();
    let lower = config_text.to_lowercase();

    for pattern in SENSITIVE_PATTERNS {
        if lower.contains(pattern) {
            // Check if it looks like actual credential data (not just a placeholder)
            let has_value = check_has_secret_value(config_text, pattern);
            if has_value {
                result = result.with_warning(SecurityWarning {
                    code: "SENSITIVE_DATA_DETECTED".to_string(),
                    message: format!(
                        "Configuration may contain sensitive data (pattern: '{pattern}'). \
                         Consider using environment variables."
                    ),
                    location: Some(find_pattern_context(config_text, pattern)),
                });
            }
        }
    }

    result
}

/// Check if a pattern appears to have an actual secret value.
fn check_has_secret_value(text: &str, pattern: &str) -> bool {
    let lower = text.to_lowercase();

    // Find the pattern and check what follows
    if let Some(pos) = lower.find(pattern) {
        let after = &text[pos + pattern.len()..];

        // Skip common non-secret indicators
        let after_trimmed = after.trim_start_matches([':', '=', '"', '\'', ' '].as_ref());

        // Placeholders are fine
        if after_trimmed.starts_with("${")
            || after_trimmed.starts_with("$ENV")
            || after_trimmed.starts_with("YOUR_")
            || after_trimmed.starts_with("XXX")
            || after_trimmed.starts_with("***")
            || after_trimmed.is_empty()
        {
            return false;
        }

        // Check if followed by non-empty value
        if after_trimmed.chars().take(5).any(char::is_alphanumeric) {
            return true;
        }
    }

    false
}

/// Find context around a pattern for the warning message.
fn find_pattern_context(text: &str, pattern: &str) -> String {
    let lower = text.to_lowercase();
    if let Some(pos) = lower.find(pattern) {
        let start = pos.saturating_sub(10);
        let end = (pos + pattern.len() + 20).min(text.len());
        let context = &text[start..end];
        format!("...{}...", context.replace('\n', " "))
    } else {
        pattern.to_string()
    }
}

// ============================================
// Path Security
// ============================================

/// Validate that a path is safe (no path traversal attacks).
///
/// # Errors
///
/// Returns an error if:
/// - The path cannot be canonicalized (invalid or does not exist)
/// - The allowed root cannot be canonicalized
/// - The path attempts to traverse outside the allowed root directory
pub fn validate_safe_path(path: &Path, allowed_root: &Path) -> Result<PathBuf, PathSecurityError> {
    // Canonicalize to resolve any .. or symlinks
    let canonical = path
        .canonicalize()
        .map_err(|_| PathSecurityError::InvalidPath(path.display().to_string()))?;

    let root_canonical = allowed_root
        .canonicalize()
        .map_err(|_| PathSecurityError::InvalidRoot(allowed_root.display().to_string()))?;

    // Check if the path is under the allowed root
    if !canonical.starts_with(&root_canonical) {
        return Err(PathSecurityError::PathTraversal {
            attempted: path.display().to_string(),
            root: allowed_root.display().to_string(),
        });
    }

    Ok(canonical)
}

/// Check if a path contains suspicious patterns (without resolving).
///
/// # Errors
///
/// Returns an error if the path contains suspicious patterns such as:
/// - Parent directory references (`..`)
/// - Null bytes (can bypass security checks)
pub fn check_path_patterns(path: &Path) -> Result<(), PathSecurityError> {
    let path_str = path.to_string_lossy();

    // Check for obvious traversal attempts
    if path_str.contains("..") {
        return Err(PathSecurityError::SuspiciousPattern(
            "Path contains '..'".to_string(),
        ));
    }

    // Check for null bytes (can be used to bypass checks)
    if path_str.contains('\0') {
        return Err(PathSecurityError::SuspiciousPattern(
            "Path contains null byte".to_string(),
        ));
    }

    // Check for absolute paths when relative expected
    if path.is_absolute() {
        // This is a warning, not an error
        warn!(
            path = %path_str,
            "Absolute path provided - ensure this is intended"
        );
    }

    Ok(())
}

/// Path security error.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PathSecurityError {
    /// Path traversal attempt detected.
    PathTraversal {
        /// The attempted path.
        attempted: String,
        /// The allowed root directory.
        root: String,
    },
    /// Invalid path (could not canonicalize).
    InvalidPath(String),
    /// Invalid root directory.
    InvalidRoot(String),
    /// Suspicious pattern in path.
    SuspiciousPattern(String),
}

impl std::fmt::Display for PathSecurityError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PathTraversal { attempted, root } => {
                write!(
                    f,
                    "Path traversal attempt: '{attempted}' is outside allowed root '{root}'"
                )
            }
            Self::InvalidPath(p) => write!(f, "Invalid path: '{p}'"),
            Self::InvalidRoot(r) => write!(f, "Invalid root directory: '{r}'"),
            Self::SuspiciousPattern(p) => write!(f, "Suspicious path pattern: {p}"),
        }
    }
}

impl std::error::Error for PathSecurityError {}

// ============================================
// Audit Logging
// ============================================

/// Audit event for backtest operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEvent {
    /// Unique event ID.
    pub event_id: String,
    /// Timestamp.
    pub timestamp: DateTime<Utc>,
    /// Event type.
    pub event_type: AuditEventType,
    /// User or system that triggered the event.
    pub actor: String,
    /// Affected resource.
    pub resource: String,
    /// Event outcome.
    pub outcome: AuditOutcome,
    /// Additional details.
    pub details: Option<String>,
}

/// Type of audit event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuditEventType {
    /// Backtest simulation started.
    BacktestStarted,
    /// Backtest simulation completed.
    BacktestCompleted,
    /// Configuration loaded.
    ConfigLoaded,
    /// Configuration validation failed.
    ConfigValidationFailed,
    /// Data access requested.
    DataAccess,
    /// File operation.
    FileOperation,
    /// Security violation detected.
    SecurityViolation,
}

/// Outcome of an audit event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AuditOutcome {
    /// Operation succeeded.
    Success,
    /// Operation failed.
    Failure,
    /// Operation was denied.
    Denied,
}

/// Audit logger for backtest operations.
#[derive(Debug)]
pub struct AuditLogger {
    /// Service name.
    service: String,
    /// Logged events (for testing/inspection).
    events: Vec<AuditEvent>,
}

impl AuditLogger {
    /// Create a new audit logger.
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
            events: Vec::new(),
        }
    }

    /// Log an audit event.
    pub fn log(&mut self, event: AuditEvent) {
        // Log to structured logging
        info!(
            event_id = %event.event_id,
            event_type = ?event.event_type,
            actor = %event.actor,
            resource = %event.resource,
            outcome = ?event.outcome,
            service = %self.service,
            "Audit event"
        );

        // Store for inspection
        self.events.push(event);
    }

    /// Log backtest start.
    pub fn log_backtest_start(&mut self, simulation_id: &str, config_hash: &str) {
        let event = AuditEvent {
            event_id: generate_event_id(),
            timestamp: Utc::now(),
            event_type: AuditEventType::BacktestStarted,
            actor: "system".to_string(),
            resource: simulation_id.to_string(),
            outcome: AuditOutcome::Success,
            details: Some(format!("config_hash={config_hash}")),
        };
        self.log(event);
    }

    /// Log backtest completion.
    pub fn log_backtest_complete(&mut self, simulation_id: &str, success: bool) {
        let event = AuditEvent {
            event_id: generate_event_id(),
            timestamp: Utc::now(),
            event_type: AuditEventType::BacktestCompleted,
            actor: "system".to_string(),
            resource: simulation_id.to_string(),
            outcome: if success {
                AuditOutcome::Success
            } else {
                AuditOutcome::Failure
            },
            details: None,
        };
        self.log(event);
    }

    /// Log data access.
    pub fn log_data_access(&mut self, actor: &str, data_source: &str, allowed: bool) {
        let event = AuditEvent {
            event_id: generate_event_id(),
            timestamp: Utc::now(),
            event_type: AuditEventType::DataAccess,
            actor: actor.to_string(),
            resource: data_source.to_string(),
            outcome: if allowed {
                AuditOutcome::Success
            } else {
                AuditOutcome::Denied
            },
            details: None,
        };
        self.log(event);
    }

    /// Log security violation.
    pub fn log_security_violation(&mut self, actor: &str, violation: &str) {
        let event = AuditEvent {
            event_id: generate_event_id(),
            timestamp: Utc::now(),
            event_type: AuditEventType::SecurityViolation,
            actor: actor.to_string(),
            resource: violation.to_string(),
            outcome: AuditOutcome::Denied,
            details: None,
        };
        self.log(event);

        warn!(
            actor = %actor,
            violation = %violation,
            "Security violation detected"
        );
    }

    /// Get logged events.
    #[must_use]
    pub fn events(&self) -> &[AuditEvent] {
        &self.events
    }

    /// Clear logged events.
    pub fn clear(&mut self) {
        self.events.clear();
    }
}

/// Generate a unique event ID.
fn generate_event_id() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);

    let timestamp = Utc::now().timestamp_millis();
    let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("audit-{timestamp}-{counter}")
}

// ============================================
// Access Control
// ============================================

/// Simple access control for data sources.
#[derive(Debug, Clone)]
pub struct DataAccessControl {
    /// Allowed data sources.
    allowed_sources: HashSet<String>,
    /// Denied patterns.
    denied_patterns: Vec<String>,
}

impl DataAccessControl {
    /// Create with default allowed sources.
    #[must_use]
    pub fn new() -> Self {
        Self {
            allowed_sources: HashSet::new(),
            denied_patterns: Vec::new(),
        }
    }

    /// Allow a specific data source.
    pub fn allow_source(&mut self, source: impl Into<String>) {
        self.allowed_sources.insert(source.into());
    }

    /// Deny a pattern.
    pub fn deny_pattern(&mut self, pattern: impl Into<String>) {
        self.denied_patterns.push(pattern.into());
    }

    /// Check if a data source is allowed.
    #[must_use]
    pub fn is_allowed(&self, source: &str) -> bool {
        // Check denied patterns first
        for pattern in &self.denied_patterns {
            if source.contains(pattern) {
                return false;
            }
        }

        // If no allowed sources specified, allow all
        if self.allowed_sources.is_empty() {
            return true;
        }

        // Check allowed sources
        self.allowed_sources.contains(source)
    }
}

impl Default for DataAccessControl {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_scan_config_no_secrets() {
        let config = r#"
            strategy_name: "momentum"
            symbols: ["AAPL", "GOOGL"]
            lookback_days: 20
        "#;

        let result = scan_config_for_secrets(config);
        assert!(result.passed);
        assert!(result.warnings.is_empty());
    }

    #[test]
    fn test_scan_config_with_secrets() {
        let config = r#"
            api_key: "sk_live_abc123"
            api_secret: "my_secret_value"
        "#;

        let result = scan_config_for_secrets(config);
        assert!(result.passed); // Warnings don't fail
        assert!(!result.warnings.is_empty());
    }

    #[test]
    fn test_scan_config_with_placeholders() {
        let config = r#"
            api_key: "${API_KEY}"
            api_secret: "$ENV_VAR"
        "#;

        let result = scan_config_for_secrets(config);
        assert!(result.passed);
        assert!(result.warnings.is_empty()); // Placeholders are fine
    }

    #[test]
    fn test_path_patterns_clean() {
        let path = Path::new("backtest/results/run_001.json");
        assert!(check_path_patterns(path).is_ok());
    }

    #[test]
    fn test_path_patterns_traversal() {
        let path = Path::new("backtest/../../../etc/passwd");
        assert!(check_path_patterns(path).is_err());
    }

    #[test]
    fn test_path_patterns_null_byte() {
        let path = Path::new("backtest/results\0hidden");
        assert!(check_path_patterns(path).is_err());
    }

    #[test]
    fn test_validate_safe_path() {
        let dir = match tempdir() {
            Ok(d) => d,
            Err(e) => panic!("should create temp directory: {e}"),
        };
        let root = dir.path();

        // Create a file inside the root
        let file_path = root.join("test.json");
        if let Err(e) = std::fs::write(&file_path, "{}") {
            panic!("should write test file: {e}");
        }

        // Valid path should work
        let result = validate_safe_path(&file_path, root);
        assert!(result.is_ok());
    }

    #[test]
    fn test_validate_safe_path_traversal() {
        let dir = match tempdir() {
            Ok(d) => d,
            Err(e) => panic!("should create temp directory: {e}"),
        };
        let root = dir.path();

        // Attempt to access parent (may not exist, but pattern should fail)
        let path = root.join("../etc/passwd");
        let result = validate_safe_path(&path, root);
        // This might fail for different reasons, but should not succeed
        let Some(parent) = root.parent() else {
            panic!("temp dir should have parent");
        };
        assert!(
            result.is_err()
                || !result
                    .unwrap_or_else(|_| panic!("result is Ok in this branch"))
                    .starts_with(parent)
        );
    }

    #[test]
    fn test_audit_logger() {
        let mut logger = AuditLogger::new("test-backtest");

        logger.log_backtest_start("sim-001", "abc123");
        logger.log_data_access("system", "candles/AAPL", true);
        logger.log_backtest_complete("sim-001", true);

        assert_eq!(logger.events().len(), 3);
        assert!(matches!(
            logger.events()[0].event_type,
            AuditEventType::BacktestStarted
        ));
    }

    #[test]
    fn test_audit_security_violation() {
        let mut logger = AuditLogger::new("test-backtest");

        logger.log_security_violation("user-123", "Path traversal attempt");

        assert_eq!(logger.events().len(), 1);
        assert!(matches!(logger.events()[0].outcome, AuditOutcome::Denied));
    }

    #[test]
    fn test_data_access_control_default() {
        let control = DataAccessControl::new();

        // No restrictions, all allowed
        assert!(control.is_allowed("any_source"));
    }

    #[test]
    fn test_data_access_control_whitelist() {
        let mut control = DataAccessControl::new();
        control.allow_source("candles");
        control.allow_source("quotes");

        assert!(control.is_allowed("candles"));
        assert!(control.is_allowed("quotes"));
        assert!(!control.is_allowed("secret_data"));
    }

    #[test]
    fn test_data_access_control_deny_pattern() {
        let mut control = DataAccessControl::new();
        control.deny_pattern("private");
        control.deny_pattern("secret");

        assert!(!control.is_allowed("private_data"));
        assert!(!control.is_allowed("secret_config"));
        assert!(control.is_allowed("public_data"));
    }

    #[test]
    fn test_config_security_scan_methods() {
        let scan = ConfigSecurityScan::pass().with_warning(SecurityWarning {
            code: "TEST".to_string(),
            message: "Test warning".to_string(),
            location: None,
        });

        assert!(scan.passed);
        assert_eq!(scan.warnings.len(), 1);

        let scan = scan.with_error(SecurityError {
            code: "ERR".to_string(),
            message: "Test error".to_string(),
            location: None,
        });

        assert!(!scan.passed);
        assert_eq!(scan.errors.len(), 1);
    }

    #[test]
    fn test_generate_event_id() {
        let id1 = generate_event_id();
        let id2 = generate_event_id();

        assert_ne!(id1, id2);
        assert!(id1.starts_with("audit-"));
    }
}
