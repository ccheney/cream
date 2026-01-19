//! Risk Validation Service
//!
//! Orchestrates all risk checks against orders.

use rust_decimal::Decimal;

use crate::domain::order_execution::aggregate::Order;
use crate::domain::order_execution::value_objects::OrderSide;
use crate::domain::risk_management::aggregate::RiskPolicy;
use crate::domain::risk_management::value_objects::{
    ConstraintResult, ConstraintViolation, RiskContext, ViolationSeverity,
};
use crate::domain::shared::Money;

/// Risk Validation Service - validates orders against risk constraints.
pub struct RiskValidationService {
    policy: RiskPolicy,
}

impl RiskValidationService {
    /// Create a new risk validation service with the given policy.
    #[must_use]
    pub fn new(policy: RiskPolicy) -> Self {
        Self { policy }
    }

    /// Create with default policy.
    #[must_use]
    pub fn with_default_policy() -> Self {
        Self::new(RiskPolicy::default())
    }

    /// Validate a list of orders against the risk context.
    #[must_use]
    pub fn validate(&self, orders: &[Order], context: &RiskContext) -> ConstraintResult {
        let mut result = ConstraintResult::success();

        // Per-instrument checks
        for order in orders {
            let instrument_result = self.validate_per_instrument(order, context);
            result.merge(instrument_result);
        }

        // Portfolio-level checks
        let portfolio_result = self.validate_portfolio(orders, context);
        result.merge(portfolio_result);

        // Options Greeks checks
        let options_result = self.validate_options_greeks(orders, context);
        result.merge(options_result);

        // Buying power check
        let buying_power_result = self.validate_buying_power(orders, context);
        result.merge(buying_power_result);

        // PDT check
        let pdt_result = self.validate_pdt(orders, context);
        result.merge(pdt_result);

        result
    }

    /// Validate per-instrument constraints.
    #[must_use]
    pub fn validate_per_instrument(
        &self,
        order: &Order,
        context: &RiskContext,
    ) -> ConstraintResult {
        let mut result = ConstraintResult::success();
        let limits = &self.policy.limits().per_instrument;

        // Get current position for this instrument
        let current_qty = context
            .get_position(order.symbol().as_str())
            .map(|p| p.quantity.amount())
            .unwrap_or(Decimal::ZERO);

        // Calculate new quantity after order
        let order_qty = order.quantity().amount();
        let new_qty = match order.side() {
            OrderSide::Buy => current_qty + order_qty,
            OrderSide::Sell => current_qty - order_qty,
        };

        // Check max units
        if new_qty.abs() > Decimal::from(limits.max_units) {
            result.add_violation(
                ConstraintViolation::error(
                    "PER_INSTRUMENT_UNITS_EXCEEDED",
                    format!(
                        "Position would exceed max units: {} > {}",
                        new_qty.abs(),
                        limits.max_units
                    ),
                )
                .with_instrument(order.symbol().as_str())
                .with_observed(new_qty.abs().to_string())
                .with_limit(limits.max_units.to_string()),
            );
        }

        // Check max notional (estimate)
        if let Some(limit_price) = order.limit_price() {
            let notional = limit_price.amount() * new_qty.abs();
            if notional > limits.max_notional() {
                result.add_violation(
                    ConstraintViolation::error(
                        "PER_INSTRUMENT_NOTIONAL_EXCEEDED",
                        format!(
                            "Position notional would exceed limit: ${:.2} > ${:.2}",
                            notional,
                            limits.max_notional()
                        ),
                    )
                    .with_instrument(order.symbol().as_str())
                    .with_observed(format!("${notional:.2}"))
                    .with_limit(format!("${:.2}", limits.max_notional())),
                );
            }
        }

        // Check max % of equity
        if context.equity.amount() > Decimal::ZERO {
            if let Some(limit_price) = order.limit_price() {
                let notional = limit_price.amount() * order_qty;
                let pct_equity = notional / context.equity.amount();
                if pct_equity > limits.max_pct_equity() {
                    result.add_violation(
                        ConstraintViolation::error(
                            "PER_INSTRUMENT_PCT_EQUITY_EXCEEDED",
                            format!(
                                "Order exceeds max % of equity: {:.1}% > {:.1}%",
                                pct_equity * Decimal::from(100),
                                limits.max_pct_equity() * Decimal::from(100)
                            ),
                        )
                        .with_instrument(order.symbol().as_str()),
                    );
                }
            }
        }

        result
    }

    /// Validate portfolio-level constraints.
    #[must_use]
    pub fn validate_portfolio(&self, orders: &[Order], context: &RiskContext) -> ConstraintResult {
        let mut result = ConstraintResult::success();
        let limits = &self.policy.limits().portfolio;

        // Calculate total new notional from orders
        let mut total_buy_notional = Decimal::ZERO;
        let mut total_sell_notional = Decimal::ZERO;

        for order in orders {
            if let Some(limit_price) = order.limit_price() {
                let notional = limit_price.amount() * order.quantity().amount();
                match order.side() {
                    OrderSide::Buy => total_buy_notional += notional,
                    OrderSide::Sell => total_sell_notional += notional,
                }
            }
        }

        // Add to current exposure
        let current_gross = context.current_exposure.gross.amount();
        let current_net = context.current_exposure.net.amount();
        let new_gross = current_gross + total_buy_notional + total_sell_notional;
        let new_net = current_net + total_buy_notional - total_sell_notional;

        // Check gross notional
        if new_gross > limits.max_gross_notional() {
            result.add_violation(
                ConstraintViolation::error(
                    "PORTFOLIO_GROSS_NOTIONAL_EXCEEDED",
                    format!(
                        "Gross notional would exceed limit: ${:.2} > ${:.2}",
                        new_gross,
                        limits.max_gross_notional()
                    ),
                )
                .with_observed(format!("${new_gross:.2}"))
                .with_limit(format!("${:.2}", limits.max_gross_notional())),
            );
        }

        // Check net notional
        if new_net.abs() > limits.max_net_notional() {
            result.add_violation(
                ConstraintViolation::error(
                    "PORTFOLIO_NET_NOTIONAL_EXCEEDED",
                    format!(
                        "Net notional would exceed limit: ${:.2} > ${:.2}",
                        new_net.abs(),
                        limits.max_net_notional()
                    ),
                )
                .with_observed(format!("${:.2}", new_net.abs()))
                .with_limit(format!("${:.2}", limits.max_net_notional())),
            );
        }

        // Check as % of equity
        if context.equity.amount() > Decimal::ZERO {
            let gross_pct = new_gross / context.equity.amount();
            if gross_pct > limits.max_pct_equity_gross() {
                result.add_violation(ConstraintViolation::error(
                    "PORTFOLIO_GROSS_PCT_EQUITY_EXCEEDED",
                    format!(
                        "Gross exposure exceeds equity limit: {:.1}% > {:.1}%",
                        gross_pct * Decimal::from(100),
                        limits.max_pct_equity_gross() * Decimal::from(100)
                    ),
                ));
            }
        }

        result
    }

    /// Validate options Greeks constraints.
    #[must_use]
    pub fn validate_options_greeks(
        &self,
        _orders: &[Order],
        context: &RiskContext,
    ) -> ConstraintResult {
        let mut result = ConstraintResult::success();
        let limits = &self.policy.limits().options;
        let greeks = &context.current_greeks;

        // Check delta notional (simplified - using raw delta)
        if greeks.delta.abs() > limits.max_delta_notional() {
            result.add_violation(ConstraintViolation::warning(
                "OPTIONS_DELTA_EXCEEDED",
                format!(
                    "Delta exposure exceeds limit: {} > {}",
                    greeks.delta.abs(),
                    limits.max_delta_notional()
                ),
            ));
        }

        // Check gamma
        if greeks.gamma.abs() > limits.max_gamma() {
            result.add_violation(ConstraintViolation::warning(
                "OPTIONS_GAMMA_EXCEEDED",
                format!(
                    "Gamma exposure exceeds limit: {} > {}",
                    greeks.gamma.abs(),
                    limits.max_gamma()
                ),
            ));
        }

        // Check vega
        if greeks.vega.abs() > limits.max_vega() {
            result.add_violation(ConstraintViolation::warning(
                "OPTIONS_VEGA_EXCEEDED",
                format!(
                    "Vega exposure exceeds limit: {} > {}",
                    greeks.vega.abs(),
                    limits.max_vega()
                ),
            ));
        }

        // Check theta (must be >= min, typically negative)
        if greeks.theta < limits.max_theta() {
            result.add_violation(ConstraintViolation::warning(
                "OPTIONS_THETA_EXCEEDED",
                format!(
                    "Theta decay exceeds limit: {} < {}",
                    greeks.theta,
                    limits.max_theta()
                ),
            ));
        }

        result
    }

    /// Validate buying power.
    #[must_use]
    pub fn validate_buying_power(
        &self,
        orders: &[Order],
        context: &RiskContext,
    ) -> ConstraintResult {
        let mut result = ConstraintResult::success();

        // Calculate total buying power required
        let mut required = Decimal::ZERO;
        for order in orders {
            if order.side() == OrderSide::Buy {
                if let Some(limit_price) = order.limit_price() {
                    required += limit_price.amount() * order.quantity().amount();
                } else {
                    // For market orders, we'd need current price - skip for now
                }
            }
        }

        // Check against available buying power
        if required > context.buying_power.amount() {
            result.add_violation(
                ConstraintViolation::error(
                    "INSUFFICIENT_BUYING_POWER",
                    format!(
                        "Insufficient buying power: required ${:.2}, available ${:.2}",
                        required,
                        context.buying_power.amount()
                    ),
                )
                .with_observed(format!("${required:.2}"))
                .with_limit(format!("${:.2}", context.buying_power.amount())),
            );
        }

        result
    }

    /// Validate PDT rules.
    #[must_use]
    pub fn validate_pdt(&self, orders: &[Order], context: &RiskContext) -> ConstraintResult {
        let mut result = ConstraintResult::success();

        if !context.pdt_status.is_restricted() {
            return result;
        }

        // Count potential day trades
        let mut potential_day_trades = 0u8;
        for order in orders {
            // A day trade is a round-trip in the same day
            // If we have a position and are closing it, that's a day trade
            if let Some(pos) = context.get_position(order.symbol().as_str()) {
                let closing = match order.side() {
                    OrderSide::Buy => pos.is_short(),
                    OrderSide::Sell => pos.is_long(),
                };
                if closing {
                    potential_day_trades += 1;
                }
            }
        }

        if potential_day_trades > context.day_trades_remaining {
            result.add_violation(ConstraintViolation::error(
                "PDT_VIOLATION",
                format!(
                    "Would exceed day trade limit: {} day trades, {} remaining",
                    potential_day_trades, context.day_trades_remaining
                ),
            ));
        }

        result
    }

    /// Get the current policy.
    #[must_use]
    pub fn policy(&self) -> &RiskPolicy {
        &self.policy
    }

    /// Update the policy.
    pub fn set_policy(&mut self, policy: RiskPolicy) {
        self.policy = policy;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::order_execution::aggregate::{CreateOrderCommand, Order};
    use crate::domain::order_execution::value_objects::{OrderPurpose, OrderType, TimeInForce};
    use crate::domain::risk_management::value_objects::PositionContext;
    use crate::domain::shared::{InstrumentId, Quantity, Symbol};

    fn make_order(symbol: &str, side: OrderSide, qty: i64, price: f64) -> Order {
        Order::new(CreateOrderCommand {
            symbol: Symbol::new(symbol),
            side,
            order_type: OrderType::Limit,
            quantity: Quantity::from_i64(qty),
            limit_price: Some(Money::usd(price)),
            stop_price: None,
            time_in_force: TimeInForce::Day,
            purpose: OrderPurpose::Entry,
            legs: vec![],
        })
        .unwrap()
    }

    fn make_context(equity: f64, buying_power: f64) -> RiskContext {
        RiskContext::new(Money::usd(equity), Money::usd(buying_power))
    }

    #[test]
    fn risk_validation_service_new() {
        let service = RiskValidationService::with_default_policy();
        assert_eq!(service.policy().id(), "default");
    }

    #[test]
    fn validate_passes_for_small_order() {
        let service = RiskValidationService::with_default_policy();
        let order = make_order("AAPL", OrderSide::Buy, 10, 150.0);
        let context = make_context(100_000.0, 200_000.0);

        let result = service.validate(&[order], &context);
        assert!(result.passed);
    }

    #[test]
    fn validate_per_instrument_units_exceeded() {
        let service = RiskValidationService::with_default_policy();
        let order = make_order("AAPL", OrderSide::Buy, 2000, 150.0); // > 1000 max
        let context = make_context(1_000_000.0, 2_000_000.0);

        let result = service.validate_per_instrument(&order, &context);
        assert!(!result.passed);
        assert!(
            result
                .violations
                .iter()
                .any(|v| v.code == "PER_INSTRUMENT_UNITS_EXCEEDED")
        );
    }

    #[test]
    fn validate_per_instrument_notional_exceeded() {
        let service = RiskValidationService::with_default_policy();
        let order = make_order("AAPL", OrderSide::Buy, 500, 150.0); // $75,000 > $50,000 default
        let context = make_context(100_000.0, 200_000.0);

        let result = service.validate_per_instrument(&order, &context);
        assert!(!result.passed);
        assert!(
            result
                .violations
                .iter()
                .any(|v| v.code == "PER_INSTRUMENT_NOTIONAL_EXCEEDED")
        );
    }

    #[test]
    fn validate_portfolio_gross_exceeded() {
        let service = RiskValidationService::with_default_policy();
        // Try to buy $600,000 worth (exceeds $500,000 gross limit)
        let order = make_order("AAPL", OrderSide::Buy, 4000, 150.0);
        let context = make_context(1_000_000.0, 2_000_000.0);

        let result = service.validate_portfolio(&[order], &context);
        assert!(!result.passed);
        assert!(
            result
                .violations
                .iter()
                .any(|v| v.code == "PORTFOLIO_GROSS_NOTIONAL_EXCEEDED")
        );
    }

    #[test]
    fn validate_buying_power_insufficient() {
        let service = RiskValidationService::with_default_policy();
        let order = make_order("AAPL", OrderSide::Buy, 100, 150.0); // $15,000
        let context = make_context(100_000.0, 10_000.0); // Only $10,000 buying power

        let result = service.validate_buying_power(&[order], &context);
        assert!(!result.passed);
        assert!(
            result
                .violations
                .iter()
                .any(|v| v.code == "INSUFFICIENT_BUYING_POWER")
        );
    }

    #[test]
    fn validate_pdt_violation() {
        let service = RiskValidationService::with_default_policy();
        let order = make_order("AAPL", OrderSide::Sell, 100, 150.0);

        let mut context = make_context(20_000.0, 40_000.0); // Under $25k
        context.pdt_status = crate::domain::risk_management::value_objects::PdtStatus::Restricted;
        context.day_trades_remaining = 0;
        context.add_position(
            "AAPL",
            PositionContext::new(
                InstrumentId::new("AAPL"),
                Quantity::from_i64(100), // Long position
                Money::usd(15000.0),
                Money::usd(14000.0),
            ),
        );

        let result = service.validate_pdt(&[order], &context);
        assert!(!result.passed);
        assert!(result.violations.iter().any(|v| v.code == "PDT_VIOLATION"));
    }

    #[test]
    fn validate_options_greeks_warning() {
        let service = RiskValidationService::with_default_policy();

        let mut context = make_context(100_000.0, 200_000.0);
        context.current_greeks = crate::domain::risk_management::value_objects::Greeks::new(
            Decimal::new(200_000, 0), // Exceeds default 100k limit
            Decimal::ZERO,
            Decimal::ZERO,
            Decimal::ZERO,
            Decimal::ZERO,
        );

        let result = service.validate_options_greeks(&[], &context);
        assert!(result.passed); // Warnings don't fail
        assert!(result.has_warnings());
    }

    #[test]
    fn validate_full_check() {
        let service = RiskValidationService::with_default_policy();
        // 10 shares at $150 = $1,500 notional (under 10% of $100k equity)
        let order = make_order("AAPL", OrderSide::Buy, 10, 150.0);
        let context = make_context(100_000.0, 200_000.0);

        let result = service.validate(&[order], &context);
        assert!(result.passed);
    }

    #[test]
    fn set_policy() {
        let mut service = RiskValidationService::with_default_policy();
        let new_policy = RiskPolicy::new("custom", "Custom Policy", Default::default());
        service.set_policy(new_policy);
        assert_eq!(service.policy().id(), "custom");
    }
}
