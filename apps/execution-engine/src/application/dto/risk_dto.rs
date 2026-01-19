//! Risk DTOs

use serde::{Deserialize, Serialize};

use crate::domain::risk_management::value_objects::{ConstraintResult, ConstraintViolation};

/// DTO for a constraint violation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViolationDto {
    /// Violation code.
    pub code: String,
    /// Violation severity.
    pub severity: String,
    /// Violation message.
    pub message: String,
    /// Instrument ID (if applicable).
    pub instrument_id: Option<String>,
    /// Field path (if applicable).
    pub field_path: Option<String>,
    /// Observed value (if applicable).
    pub observed: Option<String>,
    /// Limit value (if applicable).
    pub limit: Option<String>,
}

impl From<ConstraintViolation> for ViolationDto {
    fn from(v: ConstraintViolation) -> Self {
        Self {
            code: v.code,
            severity: format!("{}", v.severity),
            message: v.message,
            instrument_id: v.instrument_id,
            field_path: v.field_path,
            observed: v.observed,
            limit: v.limit,
        }
    }
}

/// DTO for risk validation result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskValidationDto {
    /// Whether validation passed.
    pub passed: bool,
    /// Violations (if any).
    pub violations: Vec<ViolationDto>,
}

impl From<ConstraintResult> for RiskValidationDto {
    fn from(result: ConstraintResult) -> Self {
        Self {
            passed: result.passed,
            violations: result
                .violations
                .into_iter()
                .map(ViolationDto::from)
                .collect(),
        }
    }
}

impl RiskValidationDto {
    /// Create a passed validation.
    #[must_use]
    pub fn passed() -> Self {
        Self {
            passed: true,
            violations: vec![],
        }
    }

    /// Create a failed validation.
    #[must_use]
    pub fn failed(violations: Vec<ViolationDto>) -> Self {
        Self {
            passed: false,
            violations,
        }
    }
}

/// Request DTO for constraint checking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstraintCheckRequestDto {
    /// Order IDs to check.
    pub order_ids: Vec<String>,
    /// Include portfolio context.
    pub include_portfolio_context: bool,
}

/// Response DTO for constraint checking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConstraintCheckResponseDto {
    /// Overall result.
    pub result: RiskValidationDto,
    /// Per-order results (keyed by order ID).
    pub per_order_results: std::collections::HashMap<String, RiskValidationDto>,
}

impl ConstraintCheckResponseDto {
    /// Create a response with just overall result.
    #[must_use]
    pub fn overall(result: RiskValidationDto) -> Self {
        Self {
            result,
            per_order_results: std::collections::HashMap::new(),
        }
    }

    /// Create a response with per-order results.
    #[must_use]
    pub fn with_per_order(
        result: RiskValidationDto,
        per_order: std::collections::HashMap<String, RiskValidationDto>,
    ) -> Self {
        Self {
            result,
            per_order_results: per_order,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn violation_dto_from() {
        let violation = ConstraintViolation::error("MAX_POSITION", "Position limit exceeded")
            .with_observed("150")
            .with_limit("100");

        let dto = ViolationDto::from(violation);
        assert_eq!(dto.code, "MAX_POSITION");
        assert_eq!(dto.observed, Some("150".to_string()));
        assert_eq!(dto.limit, Some("100".to_string()));
    }

    #[test]
    fn risk_validation_dto_passed() {
        let dto = RiskValidationDto::passed();
        assert!(dto.passed);
        assert!(dto.violations.is_empty());
    }

    #[test]
    fn risk_validation_dto_failed() {
        let dto = RiskValidationDto::failed(vec![ViolationDto {
            code: "test".to_string(),
            severity: "ERROR".to_string(),
            message: "test violation".to_string(),
            instrument_id: None,
            field_path: None,
            observed: Some("1".to_string()),
            limit: Some("0".to_string()),
        }]);

        assert!(!dto.passed);
        assert_eq!(dto.violations.len(), 1);
    }

    #[test]
    fn risk_validation_dto_from_constraint_result() {
        let result = ConstraintResult::success();
        let dto = RiskValidationDto::from(result);
        assert!(dto.passed);
    }

    #[test]
    fn constraint_check_response_overall() {
        let response = ConstraintCheckResponseDto::overall(RiskValidationDto::passed());
        assert!(response.result.passed);
        assert!(response.per_order_results.is_empty());
    }
}
