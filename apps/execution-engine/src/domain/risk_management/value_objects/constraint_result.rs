//! Constraint validation result types.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Constraint violation severity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ViolationSeverity {
    /// Warning - can proceed with caution.
    Warning,
    /// Error - must reject the plan.
    Error,
    /// Critical - serious violation requiring immediate attention.
    Critical,
}

impl fmt::Display for ViolationSeverity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Warning => write!(f, "WARNING"),
            Self::Error => write!(f, "ERROR"),
            Self::Critical => write!(f, "CRITICAL"),
        }
    }
}

/// A single constraint violation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConstraintViolation {
    /// Violation code (e.g., "PER_INSTRUMENT_NOTIONAL_EXCEEDED").
    pub code: String,
    /// Violation severity.
    pub severity: ViolationSeverity,
    /// Human-readable message.
    pub message: String,
    /// Instrument ID (empty for portfolio-level).
    pub instrument_id: Option<String>,
    /// Field path in the plan (e.g., "decisions[3].size.quantity").
    pub field_path: Option<String>,
    /// Observed value that violated the constraint.
    pub observed: Option<String>,
    /// Configured limit.
    pub limit: Option<String>,
}

impl ConstraintViolation {
    /// Create a new constraint violation.
    #[must_use]
    pub fn new(
        code: impl Into<String>,
        severity: ViolationSeverity,
        message: impl Into<String>,
    ) -> Self {
        Self {
            code: code.into(),
            severity,
            message: message.into(),
            instrument_id: None,
            field_path: None,
            observed: None,
            limit: None,
        }
    }

    /// Create an error-level violation.
    #[must_use]
    pub fn error(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(code, ViolationSeverity::Error, message)
    }

    /// Create a warning-level violation.
    #[must_use]
    pub fn warning(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(code, ViolationSeverity::Warning, message)
    }

    /// Create a critical-level violation.
    #[must_use]
    pub fn critical(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::new(code, ViolationSeverity::Critical, message)
    }

    /// Add instrument context.
    #[must_use]
    pub fn with_instrument(mut self, instrument_id: impl Into<String>) -> Self {
        self.instrument_id = Some(instrument_id.into());
        self
    }

    /// Add field path context.
    #[must_use]
    pub fn with_field_path(mut self, path: impl Into<String>) -> Self {
        self.field_path = Some(path.into());
        self
    }

    /// Add observed value.
    #[must_use]
    pub fn with_observed(mut self, value: impl Into<String>) -> Self {
        self.observed = Some(value.into());
        self
    }

    /// Add limit value.
    #[must_use]
    pub fn with_limit(mut self, value: impl Into<String>) -> Self {
        self.limit = Some(value.into());
        self
    }
}

impl fmt::Display for ConstraintViolation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "[{}] {}: {}", self.severity, self.code, self.message)?;
        if let Some(inst) = &self.instrument_id {
            write!(f, " (instrument: {inst})")?;
        }
        Ok(())
    }
}

/// Result from constraint check.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConstraintResult {
    /// Whether all constraints passed (no errors or critical).
    pub passed: bool,
    /// List of violations.
    pub violations: Vec<ConstraintViolation>,
}

impl ConstraintResult {
    /// Create a successful result with no violations.
    #[must_use]
    pub fn success() -> Self {
        Self {
            passed: true,
            violations: Vec::new(),
        }
    }

    /// Create a failed result with violations.
    #[must_use]
    pub fn failure(violations: Vec<ConstraintViolation>) -> Self {
        Self {
            passed: false,
            violations,
        }
    }

    /// Create a result from violations, automatically determining pass/fail.
    #[must_use]
    pub fn from_violations(violations: Vec<ConstraintViolation>) -> Self {
        let has_blocking = violations.iter().any(|v| {
            matches!(
                v.severity,
                ViolationSeverity::Error | ViolationSeverity::Critical
            )
        });
        Self {
            passed: !has_blocking,
            violations,
        }
    }

    /// Returns true if there are any error-level violations.
    #[must_use]
    pub fn has_errors(&self) -> bool {
        self.violations
            .iter()
            .any(|v| v.severity == ViolationSeverity::Error)
    }

    /// Returns true if there are any critical-level violations.
    #[must_use]
    pub fn has_critical(&self) -> bool {
        self.violations
            .iter()
            .any(|v| v.severity == ViolationSeverity::Critical)
    }

    /// Returns true if there are any warnings.
    #[must_use]
    pub fn has_warnings(&self) -> bool {
        self.violations
            .iter()
            .any(|v| v.severity == ViolationSeverity::Warning)
    }

    /// Get error-level violations only.
    #[must_use]
    pub fn errors(&self) -> Vec<&ConstraintViolation> {
        self.violations
            .iter()
            .filter(|v| v.severity == ViolationSeverity::Error)
            .collect()
    }

    /// Get warning-level violations only.
    #[must_use]
    pub fn warnings(&self) -> Vec<&ConstraintViolation> {
        self.violations
            .iter()
            .filter(|v| v.severity == ViolationSeverity::Warning)
            .collect()
    }

    /// Add a violation to this result.
    pub fn add_violation(&mut self, violation: ConstraintViolation) {
        if matches!(
            violation.severity,
            ViolationSeverity::Error | ViolationSeverity::Critical
        ) {
            self.passed = false;
        }
        self.violations.push(violation);
    }

    /// Merge another result into this one.
    pub fn merge(&mut self, other: Self) {
        if !other.passed {
            self.passed = false;
        }
        self.violations.extend(other.violations);
    }
}

impl Default for ConstraintResult {
    fn default() -> Self {
        Self::success()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn constraint_violation_new() {
        let v = ConstraintViolation::new("TEST_CODE", ViolationSeverity::Error, "Test message");
        assert_eq!(v.code, "TEST_CODE");
        assert_eq!(v.severity, ViolationSeverity::Error);
    }

    #[test]
    fn constraint_violation_builders() {
        let v = ConstraintViolation::error("CODE", "msg")
            .with_instrument("AAPL")
            .with_field_path("decisions[0].size")
            .with_observed("150")
            .with_limit("100");

        assert_eq!(v.instrument_id, Some("AAPL".to_string()));
        assert_eq!(v.field_path, Some("decisions[0].size".to_string()));
        assert_eq!(v.observed, Some("150".to_string()));
        assert_eq!(v.limit, Some("100".to_string()));
    }

    #[test]
    fn constraint_violation_display() {
        let v = ConstraintViolation::error("MAX_UNITS", "Exceeds limit").with_instrument("AAPL");
        let display = format!("{v}");
        assert!(display.contains("ERROR"));
        assert!(display.contains("MAX_UNITS"));
        assert!(display.contains("AAPL"));
    }

    #[test]
    fn constraint_result_success() {
        let r = ConstraintResult::success();
        assert!(r.passed);
        assert!(r.violations.is_empty());
    }

    #[test]
    fn constraint_result_failure() {
        let r = ConstraintResult::failure(vec![ConstraintViolation::error("CODE", "msg")]);
        assert!(!r.passed);
        assert!(r.has_errors());
    }

    #[test]
    fn constraint_result_from_violations_warnings_only() {
        let r = ConstraintResult::from_violations(vec![ConstraintViolation::warning(
            "WARN",
            "warning only",
        )]);
        assert!(r.passed); // Warnings don't fail
        assert!(r.has_warnings());
    }

    #[test]
    fn constraint_result_from_violations_with_error() {
        let r = ConstraintResult::from_violations(vec![
            ConstraintViolation::warning("WARN", "warning"),
            ConstraintViolation::error("ERR", "error"),
        ]);
        assert!(!r.passed);
    }

    #[test]
    fn constraint_result_add_violation() {
        let mut r = ConstraintResult::success();
        r.add_violation(ConstraintViolation::warning("WARN", "msg"));
        assert!(r.passed);

        r.add_violation(ConstraintViolation::error("ERR", "msg"));
        assert!(!r.passed);
    }

    #[test]
    fn constraint_result_merge() {
        let mut r1 = ConstraintResult::success();
        r1.add_violation(ConstraintViolation::warning("W1", "msg"));

        let mut r2 = ConstraintResult::success();
        r2.add_violation(ConstraintViolation::error("E1", "msg"));

        r1.merge(r2);
        assert!(!r1.passed);
        assert_eq!(r1.violations.len(), 2);
    }

    #[test]
    fn constraint_result_errors_and_warnings() {
        let r = ConstraintResult::from_violations(vec![
            ConstraintViolation::warning("W1", "warning 1"),
            ConstraintViolation::error("E1", "error 1"),
            ConstraintViolation::warning("W2", "warning 2"),
        ]);

        assert_eq!(r.errors().len(), 1);
        assert_eq!(r.warnings().len(), 2);
    }

    #[test]
    fn constraint_result_serde() {
        let r = ConstraintResult::failure(vec![ConstraintViolation::error("CODE", "msg")]);
        let json = serde_json::to_string(&r).unwrap();
        let parsed: ConstraintResult = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.passed, r.passed);
    }
}
