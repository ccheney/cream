//! Pattern Day Trader (PDT) constraint validation.
//!
//! Implements FINRA Rule 4210 for pattern day trading restrictions:
//! - Accounts under $25,000 equity cannot make more than 3 day trades in 5 business days
//! - A day trade is defined as buying and selling (or selling short and buying to cover)
//!   the same security on the same day
//!
//! This module validates proposed trades against PDT restrictions and provides
//! warnings/errors when trades would violate PDT rules.

use rust_decimal::Decimal;

use crate::config::PdtConstraints;
use crate::models::{Action, ConstraintCheckRequest, ConstraintViolation, ViolationSeverity};

use super::types::ExtendedConstraintContext;

/// Check PDT constraints for the proposed decision plan.
///
/// Returns a violation if:
/// 1. Account is PDT-restricted (equity < $25k)
/// 2. The proposed trades would result in day trades
/// 3. The total day trades would exceed the allowed limit (typically 3)
///
/// Alpaca handles PDT protection at the broker level (403 rejection), but we
/// want to catch this earlier to:
/// - Provide better error messages to agents
/// - Avoid wasted API calls
/// - Give agents context to make better decisions
#[must_use]
pub fn check_pdt_constraints(
    request: &ConstraintCheckRequest,
    context: &ExtendedConstraintContext,
    config: &PdtConstraints,
) -> Option<ConstraintViolation> {
    // PDT constraints disabled
    if !config.enabled {
        return None;
    }

    // No PDT info available - skip check
    let Some(pdt) = &context.pdt else {
        return None;
    };

    let equity_threshold =
        Decimal::try_from(config.equity_threshold).unwrap_or_else(|_| Decimal::new(25_000, 0));
    let max_day_trades = config.max_day_trades.cast_signed();

    // Check if account is PDT-restricted
    if !pdt.is_pdt_restricted(equity_threshold) {
        // Account has >= $25k equity, PDT rules don't apply
        return None;
    }

    // Count potential day trades in the proposed plan
    let potential_day_trades = count_potential_day_trades(request, context);

    if potential_day_trades == 0 {
        // No day trades in the proposed plan
        return None;
    }

    let total_day_trades = pdt.day_trade_count + potential_day_trades;

    if total_day_trades > max_day_trades {
        let remaining = pdt.remaining_day_trades(max_day_trades);

        return Some(ConstraintViolation {
            code: "PDT_LIMIT_EXCEEDED".to_string(),
            severity: ViolationSeverity::Error,
            message: format!(
                "Pattern Day Trading limit would be exceeded. Account has {} day trades used, {} remaining. \
                 Proposed trades would add {} day trades. Account equity ${:.2} is below $25,000 threshold.",
                pdt.day_trade_count,
                remaining,
                potential_day_trades,
                pdt.last_equity.round_dp(2)
            ),
            instrument_id: String::new(),
            field_path: "plan.decisions".to_string(),
            observed: format!(
                "day_trades_used={}, proposed={}, total={}",
                pdt.day_trade_count, potential_day_trades, total_day_trades
            ),
            limit: format!("max_day_trades={max_day_trades}"),
        });
    }

    // Day trades are within limit, but warn if we're getting close
    if total_day_trades == max_day_trades {
        return Some(ConstraintViolation {
            code: "PDT_LIMIT_WARNING".to_string(),
            severity: ViolationSeverity::Warning,
            message: format!(
                "This trade will use your last available day trade. After this, no more day trades \
                 are allowed until the rolling 5-day window resets or account equity reaches $25,000. \
                 Current day trades: {}/{}, equity: ${:.2}",
                pdt.day_trade_count,
                max_day_trades,
                pdt.last_equity.round_dp(2)
            ),
            instrument_id: String::new(),
            field_path: "plan.decisions".to_string(),
            observed: format!("day_trades_after={total_day_trades}"),
            limit: format!("max_day_trades={max_day_trades}"),
        });
    }

    None
}

/// Count how many day trades the proposed plan would create.
///
/// A day trade occurs when:
/// 1. Selling a position that was opened today
/// 2. Buying to cover a short position that was opened today
///
/// This function checks each SELL/CLOSE action in the plan against the
/// `positions_opened_today` map to determine if it would be a day trade.
fn count_potential_day_trades(
    request: &ConstraintCheckRequest,
    context: &ExtendedConstraintContext,
) -> i32 {
    let mut day_trades = 0;

    for decision in &request.plan.decisions {
        // Only SELL/CLOSE actions can create day trades
        if !matches!(decision.action, Action::Sell | Action::Close) {
            continue;
        }

        // Check if this position was opened today
        if context
            .positions_opened_today
            .get(&decision.instrument_id)
            .copied()
            .unwrap_or(false)
        {
            day_trades += 1;
        }
    }

    day_trades
}

/// Check if a proposed BUY would potentially lead to a day trade.
///
/// This is a lookahead check - if the agent is considering buying and then
/// selling the same day, we should warn them about PDT implications.
///
/// Returns true if buying this instrument and selling it today would
/// result in a day trade that exceeds the limit.
#[must_use]
pub fn would_buy_create_pdt_risk(
    instrument_id: &str,
    context: &ExtendedConstraintContext,
    config: &PdtConstraints,
) -> bool {
    if !config.enabled {
        return false;
    }

    let Some(pdt) = &context.pdt else {
        return false;
    };

    let equity_threshold =
        Decimal::try_from(config.equity_threshold).unwrap_or_else(|_| Decimal::new(25_000, 0));
    let max_day_trades = config.max_day_trades.cast_signed();

    // Account is not PDT restricted
    if !pdt.is_pdt_restricted(equity_threshold) {
        return false;
    }

    // Already at or over the limit
    if pdt.day_trade_count >= max_day_trades {
        return true;
    }

    // Check if we already have a position that was opened today
    // If we buy more and sell today, it's still one day trade per instrument
    context
        .positions_opened_today
        .get(instrument_id)
        .copied()
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        Action, Decision, DecisionPlan, Direction, Size, SizeUnit, StrategyFamily, ThesisState,
        TimeHorizon,
    };
    use crate::risk::constraints::PdtInfo;

    fn make_decision(instrument_id: &str, action: Action) -> Decision {
        Decision {
            decision_id: "d1".to_string(),
            instrument_id: instrument_id.to_string(),
            action,
            direction: Direction::Long,
            size: Size {
                quantity: Decimal::new(1000, 0),
                unit: SizeUnit::Dollars,
            },
            stop_loss_level: Decimal::new(95, 0),
            take_profit_level: Decimal::new(110, 0),
            limit_price: Some(Decimal::new(100, 0)),
            strategy_family: StrategyFamily::EquityLong,
            time_horizon: TimeHorizon::Swing,
            thesis_state: ThesisState::Watching,
            bullish_factors: vec![],
            bearish_factors: vec![],
            rationale: "Test".to_string(),
            confidence: Decimal::new(75, 2),
            legs: vec![],
            net_limit_price: None,
        }
    }

    fn make_plan(decisions: Vec<Decision>) -> DecisionPlan {
        DecisionPlan {
            plan_id: "p1".to_string(),
            cycle_id: "c1".to_string(),
            timestamp: "2026-01-19T12:00:00Z".to_string(),
            decisions,
            risk_manager_approved: true,
            critic_approved: true,
            plan_rationale: "Test plan".to_string(),
        }
    }

    fn make_pdt_context(
        day_trade_count: i32,
        last_equity: Decimal,
        positions_opened_today: Vec<&str>,
    ) -> ExtendedConstraintContext {
        let mut ctx = ExtendedConstraintContext {
            pdt: Some(PdtInfo {
                day_trade_count,
                is_pattern_day_trader: false,
                last_equity,
                equity: last_equity,
                daytrading_buying_power: Decimal::ZERO,
                potential_day_trades: 0,
            }),
            ..Default::default()
        };
        for symbol in positions_opened_today {
            ctx.positions_opened_today.insert(symbol.to_string(), true);
        }
        ctx
    }

    fn default_config() -> PdtConstraints {
        PdtConstraints::default()
    }

    #[test]
    fn test_pdt_disabled_allows_all() {
        let config = PdtConstraints {
            enabled: false,
            ..default_config()
        };
        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(10_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Action::Sell)]),
        };
        let context = make_pdt_context(3, Decimal::new(10_000, 0), vec!["AAPL"]);

        let result = check_pdt_constraints(&request, &context, &config);
        assert!(result.is_none());
    }

    #[test]
    fn test_above_threshold_allows_unlimited_day_trades() {
        let config = default_config();
        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(30_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Action::Sell)]),
        };
        // Account has $30k equity - above threshold
        let context = make_pdt_context(10, Decimal::new(30_000, 0), vec!["AAPL"]);

        let result = check_pdt_constraints(&request, &context, &config);
        assert!(result.is_none());
    }

    #[test]
    fn test_below_threshold_blocks_fourth_day_trade() {
        let config = default_config();
        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(20_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Action::Sell)]),
        };
        // Already at 3 day trades, trying to do a 4th
        let context = make_pdt_context(3, Decimal::new(20_000, 0), vec!["AAPL"]);

        let result = check_pdt_constraints(&request, &context, &config);
        let Some(violation) = result else {
            panic!("expected PDT_LIMIT_EXCEEDED violation");
        };
        assert_eq!(violation.code, "PDT_LIMIT_EXCEEDED");
        assert_eq!(violation.severity, ViolationSeverity::Error);
    }

    #[test]
    fn test_warns_on_last_day_trade() {
        let config = default_config();
        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(20_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Action::Sell)]),
        };
        // At 2 day trades, this will be the 3rd (last allowed)
        let context = make_pdt_context(2, Decimal::new(20_000, 0), vec!["AAPL"]);

        let result = check_pdt_constraints(&request, &context, &config);
        let Some(violation) = result else {
            panic!("expected PDT_LIMIT_WARNING violation");
        };
        assert_eq!(violation.code, "PDT_LIMIT_WARNING");
        assert_eq!(violation.severity, ViolationSeverity::Warning);
    }

    #[test]
    fn test_buy_does_not_count_as_day_trade() {
        let config = default_config();
        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(20_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Action::Buy)]),
        };
        let context = make_pdt_context(3, Decimal::new(20_000, 0), vec![]);

        let result = check_pdt_constraints(&request, &context, &config);
        // Buy alone doesn't create a day trade
        assert!(result.is_none());
    }

    #[test]
    fn test_sell_not_opened_today_not_day_trade() {
        let config = default_config();
        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(20_000, 0),
            plan: make_plan(vec![make_decision("AAPL", Action::Sell)]),
        };
        // AAPL was NOT opened today - not a day trade
        let context = make_pdt_context(3, Decimal::new(20_000, 0), vec![]);

        let result = check_pdt_constraints(&request, &context, &config);
        assert!(result.is_none());
    }

    #[test]
    fn test_multiple_day_trades_in_plan() {
        let config = default_config();
        let request = ConstraintCheckRequest {
            request_id: "r1".to_string(),
            cycle_id: "c1".to_string(),
            risk_policy_id: "default".to_string(),
            account_equity: Decimal::new(20_000, 0),
            plan: make_plan(vec![
                make_decision("AAPL", Action::Sell),
                make_decision("MSFT", Action::Sell),
            ]),
        };
        // Both AAPL and MSFT were opened today - 2 day trades
        // Already have 2 day trades, so total would be 4 (exceeds 3)
        let context = make_pdt_context(2, Decimal::new(20_000, 0), vec!["AAPL", "MSFT"]);

        let result = check_pdt_constraints(&request, &context, &config);
        let Some(violation) = result else {
            panic!("expected PDT_LIMIT_EXCEEDED violation for multiple day trades");
        };
        assert_eq!(violation.code, "PDT_LIMIT_EXCEEDED");
    }
}
