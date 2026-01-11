//! Conflicting order detection.
//!
//! Detects conflicting orders within a decision plan:
//! - Buy and Sell for the same instrument
//! - Long and Short directions for the same instrument
//! - Actions that conflict with current positions

use rust_decimal::Decimal;
use std::collections::HashMap;

use crate::models::{Action, ConstraintViolation, Direction, ViolationSeverity};

use super::types::ExtendedConstraintContext;

/// Check for conflicting orders on the same instrument.
pub(crate) fn check_conflicting_orders(
    instrument_actions: &HashMap<String, Vec<(usize, Action, Direction)>>,
    context: &ExtendedConstraintContext,
    violations: &mut Vec<ConstraintViolation>,
) {
    for (instrument_id, actions) in instrument_actions {
        // Check for conflicts only when there are multiple actions
        if actions.len() >= 2 {
            check_buy_sell_conflict(instrument_id, actions, violations);
            check_direction_conflict(instrument_id, actions, violations);
        }

        // Check if action conflicts with existing position (applies to any number of actions)
        check_position_conflicts(instrument_id, actions, context, violations);
    }
}

/// Check for BUY + SELL on same instrument in same plan.
fn check_buy_sell_conflict(
    instrument_id: &str,
    actions: &[(usize, Action, Direction)],
    violations: &mut Vec<ConstraintViolation>,
) {
    let has_buy = actions.iter().any(|(_, a, _)| *a == Action::Buy);
    let has_sell = actions.iter().any(|(_, a, _)| *a == Action::Sell);

    if has_buy && has_sell {
        let num_decisions = actions.len();
        violations.push(ConstraintViolation {
            code: "CONFLICTING_ORDERS".to_string(),
            severity: ViolationSeverity::Error,
            message: format!("Conflicting BUY and SELL orders for {instrument_id} in same plan"),
            instrument_id: instrument_id.to_string(),
            field_path: "plan.decisions".to_string(),
            observed: format!("{num_decisions} decisions"),
            limit: "no conflicting orders".to_string(),
        });
    }
}

/// Check for opposite directions (LONG vs SHORT) on same instrument.
fn check_direction_conflict(
    instrument_id: &str,
    actions: &[(usize, Action, Direction)],
    violations: &mut Vec<ConstraintViolation>,
) {
    let has_long = actions.iter().any(|(_, _, d)| *d == Direction::Long);
    let has_short = actions.iter().any(|(_, _, d)| *d == Direction::Short);

    if has_long && has_short {
        violations.push(ConstraintViolation {
            code: "CONFLICTING_DIRECTIONS".to_string(),
            severity: ViolationSeverity::Error,
            message: format!(
                "Conflicting LONG and SHORT directions for {instrument_id} in same plan"
            ),
            instrument_id: instrument_id.to_string(),
            field_path: "plan.decisions".to_string(),
            observed: "LONG and SHORT".to_string(),
            limit: "single direction per instrument".to_string(),
        });
    }
}

/// Check if actions conflict with existing positions.
fn check_position_conflicts(
    instrument_id: &str,
    actions: &[(usize, Action, Direction)],
    context: &ExtendedConstraintContext,
    violations: &mut Vec<ConstraintViolation>,
) {
    if let Some(&existing_qty) = context.current_positions.get(instrument_id) {
        for (idx, action, _) in actions {
            let conflict = match action {
                // SELL when no position (trying to sell something we don't have)
                Action::Sell if existing_qty <= Decimal::ZERO => true,
                // CLOSE when no position to close
                Action::Close if existing_qty == Decimal::ZERO => true,
                _ => false,
            };

            if conflict {
                violations.push(ConstraintViolation {
                    code: "POSITION_MISMATCH".to_string(),
                    severity: ViolationSeverity::Warning,
                    message: format!(
                        "Action {action:?} conflicts with current position {existing_qty} for {instrument_id}"
                    ),
                    instrument_id: instrument_id.to_string(),
                    field_path: format!("decisions[{idx}].action"),
                    observed: format!("{action:?}"),
                    limit: format!("position={existing_qty}"),
                });
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::risk::constraints::types::BuyingPowerInfo;

    fn empty_context() -> ExtendedConstraintContext {
        ExtendedConstraintContext::default()
    }

    #[test]
    fn test_no_conflict_single_action() {
        let mut instrument_actions = HashMap::new();
        instrument_actions.insert("AAPL".to_string(), vec![(0, Action::Buy, Direction::Long)]);

        let mut violations = Vec::new();
        check_conflicting_orders(&instrument_actions, &empty_context(), &mut violations);
        assert!(violations.is_empty());
    }

    #[test]
    fn test_no_conflict_different_instruments() {
        let mut instrument_actions = HashMap::new();
        instrument_actions.insert("AAPL".to_string(), vec![(0, Action::Buy, Direction::Long)]);
        instrument_actions.insert(
            "MSFT".to_string(),
            vec![(1, Action::Sell, Direction::Short)],
        );

        let mut violations = Vec::new();
        check_conflicting_orders(&instrument_actions, &empty_context(), &mut violations);
        assert!(violations.is_empty());
    }

    #[test]
    fn test_buy_sell_conflict() {
        let mut instrument_actions = HashMap::new();
        instrument_actions.insert(
            "AAPL".to_string(),
            vec![
                (0, Action::Buy, Direction::Long),
                (1, Action::Sell, Direction::Long),
            ],
        );

        let mut violations = Vec::new();
        check_conflicting_orders(&instrument_actions, &empty_context(), &mut violations);
        assert!(violations.iter().any(|v| v.code == "CONFLICTING_ORDERS"));
    }

    #[test]
    fn test_direction_conflict() {
        let mut instrument_actions = HashMap::new();
        instrument_actions.insert(
            "AAPL".to_string(),
            vec![
                (0, Action::Buy, Direction::Long),
                (1, Action::Buy, Direction::Short),
            ],
        );

        let mut violations = Vec::new();
        check_conflicting_orders(&instrument_actions, &empty_context(), &mut violations);
        assert!(
            violations
                .iter()
                .any(|v| v.code == "CONFLICTING_DIRECTIONS")
        );
    }

    #[test]
    fn test_sell_without_position() {
        let mut instrument_actions = HashMap::new();
        instrument_actions.insert(
            "AAPL".to_string(),
            vec![(0, Action::Sell, Direction::Short)],
        );

        let mut context = ExtendedConstraintContext {
            buying_power: BuyingPowerInfo::default(),
            current_positions: HashMap::new(),
            greeks: None,
            historical_position_sizes: vec![],
        };
        context
            .current_positions
            .insert("AAPL".to_string(), Decimal::ZERO);

        let mut violations = Vec::new();
        check_conflicting_orders(&instrument_actions, &context, &mut violations);
        assert!(violations.iter().any(|v| v.code == "POSITION_MISMATCH"));
    }

    #[test]
    fn test_close_without_position() {
        let mut instrument_actions = HashMap::new();
        instrument_actions.insert(
            "AAPL".to_string(),
            vec![(0, Action::Close, Direction::Flat)],
        );

        let mut context = ExtendedConstraintContext::default();
        context
            .current_positions
            .insert("AAPL".to_string(), Decimal::ZERO);

        let mut violations = Vec::new();
        check_conflicting_orders(&instrument_actions, &context, &mut violations);
        assert!(violations.iter().any(|v| v.code == "POSITION_MISMATCH"));
    }

    #[test]
    fn test_sell_with_position() {
        let mut instrument_actions = HashMap::new();
        instrument_actions.insert(
            "AAPL".to_string(),
            vec![(0, Action::Sell, Direction::Short)],
        );

        let mut context = ExtendedConstraintContext::default();
        context
            .current_positions
            .insert("AAPL".to_string(), Decimal::new(100, 0));

        let mut violations = Vec::new();
        check_conflicting_orders(&instrument_actions, &context, &mut violations);
        assert!(violations.is_empty());
    }
}
