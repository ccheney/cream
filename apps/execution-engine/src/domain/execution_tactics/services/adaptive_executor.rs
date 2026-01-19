//! Adaptive Executor Domain Service

use rust_decimal::Decimal;

use crate::domain::execution_tactics::value_objects::{
    AdaptiveConfig, MarketContext, SubTactic, Urgency,
};

/// Adaptive executor for dynamic tactic switching.
///
/// Dynamically switches between passive and aggressive based on market conditions.
#[derive(Debug, Clone)]
pub struct AdaptiveExecutor {
    /// Total quantity to execute.
    total_qty: Decimal,
    /// Quantity filled so far.
    filled_qty: Decimal,
    /// Current urgency level (0.0 = passive, 1.0 = aggressive).
    urgency: Decimal,
    /// Configuration.
    config: AdaptiveConfig,
}

impl AdaptiveExecutor {
    /// Create a new Adaptive executor.
    #[must_use]
    pub fn new(total_qty: Decimal, config: AdaptiveConfig) -> Self {
        // Initialize urgency based on configured urgency level
        let initial_urgency = match config.urgency {
            Urgency::Patient => Decimal::new(10, 2), // 0.10
            Urgency::Normal => Decimal::new(30, 2),  // 0.30
            Urgency::Urgent => Decimal::new(60, 2),  // 0.60
        };

        Self {
            total_qty,
            filled_qty: Decimal::ZERO,
            urgency: initial_urgency,
            config,
        }
    }

    /// Evaluate and update urgency based on market context.
    pub fn evaluate_urgency(&mut self, ctx: &MarketContext) {
        let mut urgency_delta = Decimal::ZERO;

        // Price moved against us - increase urgency
        if ctx.is_adverse_move && ctx.price_move_bps.abs() > Decimal::new(50, 0) {
            urgency_delta += Decimal::new(20, 2); // +20%
        }

        // Liquidity declining - increase urgency
        if ctx.volume_vs_expected < Decimal::new(70, 2) {
            urgency_delta += Decimal::new(15, 2); // +15%
        }

        // Spread widening - decrease urgency (wait for better conditions)
        if ctx.spread_bps > Decimal::from(self.config.spread_threshold_bps) {
            urgency_delta -= Decimal::new(10, 2); // -10%
        }

        // Time running out - increase urgency
        if ctx.time_remaining_pct < Decimal::new(20, 2) {
            urgency_delta += Decimal::new(30, 2); // +30%
        }

        // Update urgency, clamping to [0.0, 1.0]
        self.urgency = (self.urgency + urgency_delta)
            .max(Decimal::ZERO)
            .min(Decimal::ONE);
    }

    /// Select the current sub-tactic based on urgency.
    #[must_use]
    pub fn select_sub_tactic(&self) -> SubTactic {
        if self.urgency > Decimal::new(50, 2) {
            SubTactic::AggressiveLimit
        } else {
            SubTactic::PassiveLimit
        }
    }

    /// Record a fill.
    pub fn record_fill(&mut self, filled_qty: Decimal) {
        self.filled_qty += filled_qty;
    }

    /// Get the remaining quantity to execute.
    #[must_use]
    pub fn remaining_qty(&self) -> Decimal {
        self.total_qty - self.filled_qty
    }

    /// Check if execution is complete.
    #[must_use]
    pub fn is_complete(&self) -> bool {
        self.remaining_qty() <= Decimal::ZERO
    }

    /// Get current urgency level.
    #[must_use]
    pub const fn urgency(&self) -> Decimal {
        self.urgency
    }

    /// Get the configuration.
    #[must_use]
    pub const fn config(&self) -> &AdaptiveConfig {
        &self.config
    }

    /// Get the total quantity.
    #[must_use]
    pub const fn total_qty(&self) -> Decimal {
        self.total_qty
    }

    /// Get the filled quantity.
    #[must_use]
    pub const fn filled_qty(&self) -> Decimal {
        self.filled_qty
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adaptive_executor_new_patient() {
        let config = AdaptiveConfig::patient(10);
        let executor = AdaptiveExecutor::new(Decimal::new(1000, 0), config);

        assert_eq!(executor.total_qty(), Decimal::new(1000, 0));
        assert_eq!(executor.urgency(), Decimal::new(10, 2)); // 0.10
        assert_eq!(executor.select_sub_tactic(), SubTactic::PassiveLimit);
    }

    #[test]
    fn adaptive_executor_new_normal() {
        let config = AdaptiveConfig::default();
        let executor = AdaptiveExecutor::new(Decimal::new(1000, 0), config);

        assert_eq!(executor.urgency(), Decimal::new(30, 2)); // 0.30
        assert_eq!(executor.select_sub_tactic(), SubTactic::PassiveLimit);
    }

    #[test]
    fn adaptive_executor_new_urgent() {
        let config = AdaptiveConfig::urgent(10);
        let executor = AdaptiveExecutor::new(Decimal::new(1000, 0), config);

        assert_eq!(executor.urgency(), Decimal::new(60, 2)); // 0.60
        assert_eq!(executor.select_sub_tactic(), SubTactic::AggressiveLimit);
    }

    #[test]
    fn adaptive_executor_evaluate_urgency_adverse_move() {
        let config = AdaptiveConfig::default();
        let mut executor = AdaptiveExecutor::new(Decimal::new(1000, 0), config);

        let initial_urgency = executor.urgency();

        let ctx = MarketContext::new(
            Decimal::new(60, 0), // 60 BPS move
            true,                // adverse
            Decimal::ONE,
            Decimal::ZERO,
            Decimal::ONE,
        );

        executor.evaluate_urgency(&ctx);

        // Should increase by 20%
        assert!(executor.urgency() > initial_urgency);
        assert_eq!(executor.urgency(), Decimal::new(50, 2)); // 0.30 + 0.20
    }

    #[test]
    fn adaptive_executor_evaluate_urgency_low_liquidity() {
        let config = AdaptiveConfig::default();
        let mut executor = AdaptiveExecutor::new(Decimal::new(1000, 0), config);

        let initial_urgency = executor.urgency();

        let ctx = MarketContext::new(
            Decimal::ZERO,
            false,
            Decimal::new(60, 2), // 0.60 (below 0.70 threshold)
            Decimal::ZERO,
            Decimal::ONE,
        );

        executor.evaluate_urgency(&ctx);

        // Should increase by 15%
        assert!(executor.urgency() > initial_urgency);
    }

    #[test]
    fn adaptive_executor_evaluate_urgency_wide_spread() {
        let config = AdaptiveConfig::new(Urgency::Normal, 5); // 5 BPS threshold
        let mut executor = AdaptiveExecutor::new(Decimal::new(1000, 0), config);

        let initial_urgency = executor.urgency();

        let ctx = MarketContext::new(
            Decimal::ZERO,
            false,
            Decimal::ONE,
            Decimal::new(10, 0), // 10 BPS spread (above 5 threshold)
            Decimal::ONE,
        );

        executor.evaluate_urgency(&ctx);

        // Should decrease by 10%
        assert!(executor.urgency() < initial_urgency);
    }

    #[test]
    fn adaptive_executor_evaluate_urgency_time_running_out() {
        let config = AdaptiveConfig::default();
        let mut executor = AdaptiveExecutor::new(Decimal::new(1000, 0), config);

        let initial_urgency = executor.urgency();

        let ctx = MarketContext::new(
            Decimal::ZERO,
            false,
            Decimal::ONE,
            Decimal::ZERO,
            Decimal::new(10, 2), // 0.10 (10% time remaining)
        );

        executor.evaluate_urgency(&ctx);

        // Should increase by 30%
        assert!(executor.urgency() > initial_urgency);
    }

    #[test]
    fn adaptive_executor_urgency_clamped_to_one() {
        let config = AdaptiveConfig::urgent(10);
        let mut executor = AdaptiveExecutor::new(Decimal::new(1000, 0), config);

        // Create context that would add lots of urgency
        let ctx = MarketContext::new(
            Decimal::new(100, 0),
            true,
            Decimal::new(50, 2),
            Decimal::ZERO,
            Decimal::new(5, 2),
        );

        executor.evaluate_urgency(&ctx);

        // Should be clamped to 1.0
        assert!(executor.urgency() <= Decimal::ONE);
    }

    #[test]
    fn adaptive_executor_urgency_clamped_to_zero() {
        let config = AdaptiveConfig::patient(100); // Very high spread threshold
        let mut executor = AdaptiveExecutor::new(Decimal::new(1000, 0), config);

        // Create context that would reduce urgency a lot
        let ctx = MarketContext::new(
            Decimal::ZERO,
            false,
            Decimal::ONE,
            Decimal::new(200, 0), // Wide spread
            Decimal::ONE,
        );

        // Apply multiple times
        for _ in 0..10 {
            executor.evaluate_urgency(&ctx);
        }

        // Should be clamped to 0.0
        assert!(executor.urgency() >= Decimal::ZERO);
    }

    #[test]
    fn adaptive_executor_record_fill() {
        let config = AdaptiveConfig::default();
        let mut executor = AdaptiveExecutor::new(Decimal::new(1000, 0), config);

        executor.record_fill(Decimal::new(200, 0));
        assert_eq!(executor.filled_qty(), Decimal::new(200, 0));
        assert_eq!(executor.remaining_qty(), Decimal::new(800, 0));
    }

    #[test]
    fn adaptive_executor_is_complete() {
        let config = AdaptiveConfig::default();
        let mut executor = AdaptiveExecutor::new(Decimal::new(100, 0), config);

        assert!(!executor.is_complete());

        executor.record_fill(Decimal::new(100, 0));
        assert!(executor.is_complete());
    }

    #[test]
    fn adaptive_executor_select_sub_tactic_threshold() {
        let config = AdaptiveConfig::default();
        let mut executor = AdaptiveExecutor::new(Decimal::new(1000, 0), config);

        // At 0.30, should be passive
        assert_eq!(executor.select_sub_tactic(), SubTactic::PassiveLimit);

        // Push urgency above 0.50
        // Adverse move (+20%) + low liquidity (+15%) = +35%
        // 0.30 + 0.35 = 0.65 > 0.50
        let ctx = MarketContext::new(
            Decimal::new(100, 0), // 100 BPS adverse move (triggers +20%)
            true,                 // adverse move
            Decimal::new(50, 2),  // 50% volume vs expected (< 70%, triggers +15%)
            Decimal::ZERO,        // no spread issue
            Decimal::ONE,         // plenty of time
        );
        executor.evaluate_urgency(&ctx);

        // Should now be aggressive (0.65 > 0.50)
        assert_eq!(executor.select_sub_tactic(), SubTactic::AggressiveLimit);
    }
}
