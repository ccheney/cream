//! Partial fill monitoring and recovery.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::config::RollConfig;
use crate::options::AssignmentRiskLevel;

/// State of a roll order execution.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RollExecutionState {
    /// Order submitted, awaiting fill.
    Pending,
    /// Close legs filled, awaiting open legs.
    CloseComplete,
    /// Partially filled.
    PartialFill,
    /// Completely filled.
    Filled,
    /// Cancelled.
    Cancelled,
    /// Failed with error.
    Failed,
}

/// Partial fill monitoring result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartialFillMonitor {
    /// Order ID being monitored.
    pub order_id: String,
    /// Current state.
    pub state: RollExecutionState,
    /// Close legs fill percentage.
    pub close_fill_pct: Decimal,
    /// Open legs fill percentage.
    pub open_fill_pct: Decimal,
    /// Time elapsed since submission (seconds).
    pub elapsed_secs: u64,
    /// Whether timeout exceeded.
    pub timeout_exceeded: bool,
    /// Recommended action.
    pub recommended_action: PartialFillAction,
}

/// Action to take for partial fill.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum PartialFillAction {
    /// Continue waiting.
    Wait,
    /// Cancel the order.
    Cancel,
    /// Retry with different parameters.
    Retry,
    /// Manual intervention required.
    ManualIntervention,
}

/// Evaluate partial fill state and recommend action.
#[must_use]
pub fn evaluate_partial_fill(
    order_id: &str,
    close_fill_pct: Decimal,
    open_fill_pct: Decimal,
    elapsed_secs: u64,
    assignment_risk: AssignmentRiskLevel,
    config: &RollConfig,
) -> PartialFillMonitor {
    let timeout_exceeded = elapsed_secs >= config.partial_fill_timeout_secs;
    let state = determine_execution_state(close_fill_pct, open_fill_pct);
    let recommended_action = determine_action(state, timeout_exceeded, assignment_risk);

    PartialFillMonitor {
        order_id: order_id.to_string(),
        state,
        close_fill_pct,
        open_fill_pct,
        elapsed_secs,
        timeout_exceeded,
        recommended_action,
    }
}

fn determine_execution_state(
    close_fill_pct: Decimal,
    open_fill_pct: Decimal,
) -> RollExecutionState {
    if close_fill_pct >= Decimal::ONE && open_fill_pct >= Decimal::ONE {
        RollExecutionState::Filled
    } else if close_fill_pct >= Decimal::ONE {
        RollExecutionState::CloseComplete
    } else if close_fill_pct > Decimal::ZERO || open_fill_pct > Decimal::ZERO {
        RollExecutionState::PartialFill
    } else {
        RollExecutionState::Pending
    }
}

#[allow(clippy::missing_const_for_fn)] // Match with enums prevents const
fn determine_action(
    state: RollExecutionState,
    timeout_exceeded: bool,
    assignment_risk: AssignmentRiskLevel,
) -> PartialFillAction {
    match (state, timeout_exceeded, assignment_risk) {
        (RollExecutionState::Filled, _, _) => PartialFillAction::Wait,

        (_, _, AssignmentRiskLevel::Critical)
        | (RollExecutionState::Pending | RollExecutionState::PartialFill, true, _) => {
            PartialFillAction::Cancel
        }

        (RollExecutionState::CloseComplete, true, _) => PartialFillAction::ManualIntervention,

        _ => PartialFillAction::Wait,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_partial_fill_completed() {
        let config = RollConfig::default();
        let result = evaluate_partial_fill(
            "ord-1",
            Decimal::ONE,
            Decimal::ONE,
            10,
            AssignmentRiskLevel::Low,
            &config,
        );
        assert_eq!(result.state, RollExecutionState::Filled);
        assert_eq!(result.recommended_action, PartialFillAction::Wait);
    }

    #[test]
    fn test_partial_fill_timeout() {
        let config = RollConfig::default();
        let result = evaluate_partial_fill(
            "ord-1",
            Decimal::new(50, 2), // 50%
            Decimal::ZERO,
            35, // > 30 second timeout
            AssignmentRiskLevel::Low,
            &config,
        );
        assert!(result.timeout_exceeded);
        assert_eq!(result.recommended_action, PartialFillAction::Cancel);
    }

    #[test]
    fn test_partial_fill_assignment_risk() {
        let config = RollConfig::default();
        let result = evaluate_partial_fill(
            "ord-1",
            Decimal::new(50, 2),
            Decimal::ZERO,
            5,
            AssignmentRiskLevel::Critical,
            &config,
        );
        assert_eq!(result.recommended_action, PartialFillAction::Cancel);
    }

    #[test]
    fn test_partial_fill_close_complete() {
        let config = RollConfig::default();
        let result = evaluate_partial_fill(
            "ord-1",
            Decimal::ONE,        // Close complete
            Decimal::new(50, 2), // Open 50%
            35,                  // Timeout
            AssignmentRiskLevel::Low,
            &config,
        );
        assert_eq!(result.state, RollExecutionState::CloseComplete);
        assert_eq!(
            result.recommended_action,
            PartialFillAction::ManualIntervention
        );
    }
}
