//! Stop-loss and take-profit enforcement.
//!
//! This module implements stop and target enforcement for PAPER/LIVE environments:
//! - Bracket orders (OCO) for stocks
//! - Price monitoring for options
//!
//! Reference: docs/plans/07-execution.md (Stops and Targets section)

mod bracket;
mod error;
mod monitor;
mod simulator;
mod types;
mod validator;

use rust_decimal::Decimal;

use crate::models::Environment;

// Re-export all public types for backwards compatibility
pub use bracket::{
    BracketOrder, BracketOrderBuilder, EntryOrderSpec, StopOrderSpec, TakeProfitOrderSpec,
    supports_bracket_orders,
};
pub use error::StopsError;
pub use monitor::{MonitoredPosition, PriceMonitor};
pub use simulator::{BacktestStopsSimulator, Candle, TriggerResult};
pub use types::{RiskLevelDenomination, SameBarPriority, StopTargetLevels, StopsConfig};
pub use validator::StopTargetValidator;

/// Method used for stop/target enforcement.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnforcementMethod {
    /// Use bracket orders (OCO).
    BracketOrder,
    /// Use real-time price monitoring.
    PriceMonitoring,
}

/// Unified stops enforcer that handles all environments.
#[derive(Debug)]
pub struct StopsEnforcer {
    /// Current environment.
    environment: Environment,
    /// Configuration.
    config: StopsConfig,
    /// Validator.
    validator: StopTargetValidator,
    /// Backtest simulator.
    backtest_simulator: BacktestStopsSimulator,
    /// Price monitor for real-time enforcement.
    price_monitor: PriceMonitor,
}

impl StopsEnforcer {
    /// Create a new stops enforcer.
    #[must_use]
    pub fn new(environment: Environment) -> Self {
        let config = StopsConfig::default();
        Self {
            environment,
            config: config.clone(),
            validator: StopTargetValidator::default(),
            backtest_simulator: BacktestStopsSimulator::with_config(config.clone()),
            price_monitor: PriceMonitor::with_config(config),
        }
    }

    /// Create with custom configuration.
    #[must_use]
    pub fn with_config(environment: Environment, config: StopsConfig) -> Self {
        Self {
            environment,
            config: config.clone(),
            validator: StopTargetValidator::default(),
            backtest_simulator: BacktestStopsSimulator::with_config(config.clone()),
            price_monitor: PriceMonitor::with_config(config),
        }
    }

    /// Validate stop/target levels.
    ///
    /// # Errors
    /// Returns an error if levels are invalid.
    pub fn validate_levels(&self, levels: &StopTargetLevels) -> Result<(), StopsError> {
        self.validator.validate(levels)
    }

    /// Determine enforcement method for an instrument.
    #[must_use]
    pub fn enforcement_method(&self, instrument_id: &str) -> EnforcementMethod {
        if self.config.use_bracket_orders && supports_bracket_orders(instrument_id) {
            EnforcementMethod::BracketOrder
        } else {
            EnforcementMethod::PriceMonitoring
        }
    }

    /// Build a bracket order for an instrument (if supported).
    ///
    /// # Errors
    /// Returns an error if bracket orders aren't supported or levels are invalid.
    pub fn build_bracket_order(
        &self,
        instrument_id: &str,
        side: &str,
        quantity: Decimal,
        entry_price: Option<Decimal>,
        levels: &StopTargetLevels,
    ) -> Result<BracketOrder, StopsError> {
        // Validate levels first
        self.validate_levels(levels)?;

        // Check bracket order support
        if !supports_bracket_orders(instrument_id) {
            return Err(StopsError::BracketNotSupported(format!(
                "Options do not support bracket orders: {instrument_id}"
            )));
        }

        let mut builder = BracketOrderBuilder::new()
            .instrument(instrument_id)
            .side(side)
            .quantity(quantity)
            .stop_loss(levels.stop_loss)
            .take_profit(levels.take_profit);

        if let Some(limit) = entry_price {
            builder = builder.limit_entry(limit);
        }

        builder.build()
    }

    /// Add a position for price monitoring.
    pub fn monitor_position(&mut self, position: MonitoredPosition) {
        self.price_monitor.add_position(position);
    }

    /// Stop monitoring a position.
    pub fn stop_monitoring(&mut self, position_id: &str) {
        self.price_monitor.remove_position(position_id);
    }

    /// Check price update for triggers.
    #[must_use]
    pub fn check_price(&self, instrument_id: &str, price: Decimal) -> Vec<(String, TriggerResult)> {
        self.price_monitor.check_price(instrument_id, price)
    }

    /// Simulate stops through candles (backtest mode).
    #[must_use]
    pub fn simulate_backtest(
        &self,
        candles: &[Candle],
        levels: &StopTargetLevels,
    ) -> TriggerResult {
        self.backtest_simulator.simulate(candles, levels)
    }

    /// Get the current environment.
    #[must_use]
    pub const fn environment(&self) -> Environment {
        self.environment
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Direction;

    fn make_levels(direction: Direction) -> StopTargetLevels {
        match direction {
            Direction::Long => StopTargetLevels::new(
                Decimal::new(95, 0),  // stop at $95
                Decimal::new(110, 0), // target at $110
                Decimal::new(100, 0), // entry at $100
                Direction::Long,
            ),
            Direction::Short => StopTargetLevels::new(
                Decimal::new(105, 0), // stop at $105
                Decimal::new(90, 0),  // target at $90
                Decimal::new(100, 0), // entry at $100
                Direction::Short,
            ),
            Direction::Flat => StopTargetLevels::new(
                Decimal::new(95, 0),
                Decimal::new(105, 0),
                Decimal::new(100, 0),
                Direction::Flat,
            ),
        }
    }

    #[test]
    fn test_enforcer_enforcement_method_stock() {
        let enforcer = StopsEnforcer::new(Environment::Live);
        assert_eq!(
            enforcer.enforcement_method("AAPL"),
            EnforcementMethod::BracketOrder
        );
    }

    #[test]
    fn test_enforcer_enforcement_method_option() {
        let enforcer = StopsEnforcer::new(Environment::Live);
        assert_eq!(
            enforcer.enforcement_method("AAPL240119C00150000"),
            EnforcementMethod::PriceMonitoring
        );
    }

    #[test]
    fn test_enforcer_enforcement_method_paper() {
        let enforcer = StopsEnforcer::new(Environment::Paper);
        assert_eq!(
            enforcer.enforcement_method("AAPL"),
            EnforcementMethod::BracketOrder
        );
    }

    #[test]
    fn test_enforcer_build_bracket_stock() {
        let enforcer = StopsEnforcer::new(Environment::Live);
        let levels = make_levels(Direction::Long);

        let result = enforcer.build_bracket_order(
            "AAPL",
            "buy",
            Decimal::new(100, 0),
            Some(Decimal::new(100, 0)),
            &levels,
        );

        assert!(result.is_ok());
    }

    #[test]
    fn test_enforcer_build_bracket_option_fails() {
        let enforcer = StopsEnforcer::new(Environment::Live);
        let levels = make_levels(Direction::Long);

        let result = enforcer.build_bracket_order(
            "AAPL240119C00150000",
            "buy",
            Decimal::new(10, 0),
            Some(Decimal::new(500, 2)),
            &levels,
        );

        assert!(matches!(result, Err(StopsError::BracketNotSupported(_))));
    }
}
