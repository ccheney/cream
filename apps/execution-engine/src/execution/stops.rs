//! Stop-loss and take-profit enforcement.
//!
//! This module implements stop and target enforcement for different environments:
//! - LIVE/PAPER: Bracket orders (OCO) for stocks, price monitoring for options
//! - BACKTEST: Deterministic simulation using candle high/low data
//!
//! Reference: docs/plans/07-execution.md (Stops and Targets section)

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use thiserror::Error;

use crate::models::{Direction, Environment};

// ============================================================================
// Types
// ============================================================================

/// Denomination of stop/target price levels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RiskLevelDenomination {
    /// Levels are based on the underlying asset price.
    UnderlyingPrice,
    /// Levels are based on the option premium.
    OptionPrice,
}

impl Default for RiskLevelDenomination {
    fn default() -> Self {
        Self::UnderlyingPrice
    }
}

/// Rule for determining priority when both stop and target trigger in same bar.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SameBarPriority {
    /// Stop-loss takes priority (pessimistic assumption).
    StopFirst,
    /// Take-profit takes priority (optimistic assumption).
    TargetFirst,
    /// Determine by candle direction (open → high → low → close or open → low → high → close).
    HighLowOrder,
}

impl Default for SameBarPriority {
    fn default() -> Self {
        Self::StopFirst // Conservative default
    }
}

/// Stop and target level specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopTargetLevels {
    /// Stop-loss price level.
    pub stop_loss: Decimal,
    /// Take-profit price level.
    pub take_profit: Decimal,
    /// Denomination of levels.
    pub denomination: RiskLevelDenomination,
    /// Entry price for validation.
    pub entry_price: Decimal,
    /// Position direction.
    pub direction: Direction,
}

impl StopTargetLevels {
    /// Create new stop/target levels.
    #[must_use]
    pub fn new(
        stop_loss: Decimal,
        take_profit: Decimal,
        entry_price: Decimal,
        direction: Direction,
    ) -> Self {
        Self {
            stop_loss,
            take_profit,
            denomination: RiskLevelDenomination::default(),
            entry_price,
            direction,
        }
    }

    /// Set the denomination.
    #[must_use]
    pub fn with_denomination(mut self, denomination: RiskLevelDenomination) -> Self {
        self.denomination = denomination;
        self
    }
}

/// Configuration for stops enforcement.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopsConfig {
    /// Priority rule for same-bar stop and target triggers.
    pub same_bar_priority: SameBarPriority,
    /// Monitoring interval in milliseconds for price checks.
    pub monitoring_interval_ms: u64,
    /// Minimum profit/loss ratio required (risk-reward).
    pub min_risk_reward_ratio: Option<Decimal>,
    /// Whether to use bracket orders when available.
    pub use_bracket_orders: bool,
}

impl Default for StopsConfig {
    fn default() -> Self {
        Self {
            same_bar_priority: SameBarPriority::default(),
            monitoring_interval_ms: 100, // 100ms polling
            min_risk_reward_ratio: None,
            use_bracket_orders: true,
        }
    }
}

// ============================================================================
// Errors
// ============================================================================

/// Errors that can occur during stop/target operations.
#[derive(Debug, Error)]
pub enum StopsError {
    /// Stop loss level is invalid.
    #[error("Invalid stop loss: {0}")]
    InvalidStopLoss(String),

    /// Take profit level is invalid.
    #[error("Invalid take profit: {0}")]
    InvalidTakeProfit(String),

    /// Validation failed.
    #[error("Validation failed: {0}")]
    ValidationFailed(String),

    /// Bracket order not supported for this instrument.
    #[error("Bracket orders not supported: {0}")]
    BracketNotSupported(String),

    /// Price monitoring error.
    #[error("Price monitoring error: {0}")]
    MonitoringError(String),
}

// ============================================================================
// Validation
// ============================================================================

/// Validator for stop and target levels.
#[derive(Debug, Clone)]
pub struct StopTargetValidator {
    /// Minimum distance from entry as percentage.
    min_stop_distance_pct: Option<Decimal>,
    /// Maximum distance from entry as percentage.
    max_stop_distance_pct: Option<Decimal>,
}

impl Default for StopTargetValidator {
    fn default() -> Self {
        Self {
            min_stop_distance_pct: Some(Decimal::new(1, 3)),   // 0.1%
            max_stop_distance_pct: Some(Decimal::new(20, 2)),  // 20%
        }
    }
}

impl StopTargetValidator {
    /// Create a new validator with default settings.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Validate stop and target levels.
    ///
    /// # Errors
    /// Returns an error if levels are invalid.
    pub fn validate(&self, levels: &StopTargetLevels) -> Result<(), StopsError> {
        // Stop and target must be positive
        if levels.stop_loss <= Decimal::ZERO {
            return Err(StopsError::InvalidStopLoss(
                "Stop loss must be positive".to_string(),
            ));
        }

        if levels.take_profit <= Decimal::ZERO {
            return Err(StopsError::InvalidTakeProfit(
                "Take profit must be positive".to_string(),
            ));
        }

        // Stop and target must be different
        if levels.stop_loss == levels.take_profit {
            return Err(StopsError::ValidationFailed(
                "Stop loss and take profit cannot be the same".to_string(),
            ));
        }

        // Validate direction logic
        match levels.direction {
            Direction::Long => {
                // For longs: stop < entry < target
                if levels.stop_loss >= levels.entry_price {
                    return Err(StopsError::InvalidStopLoss(
                        "Long position stop loss must be below entry price".to_string(),
                    ));
                }
                if levels.take_profit <= levels.entry_price {
                    return Err(StopsError::InvalidTakeProfit(
                        "Long position take profit must be above entry price".to_string(),
                    ));
                }
            }
            Direction::Short => {
                // For shorts: target < entry < stop
                if levels.stop_loss <= levels.entry_price {
                    return Err(StopsError::InvalidStopLoss(
                        "Short position stop loss must be above entry price".to_string(),
                    ));
                }
                if levels.take_profit >= levels.entry_price {
                    return Err(StopsError::InvalidTakeProfit(
                        "Short position take profit must be below entry price".to_string(),
                    ));
                }
            }
            Direction::Flat => {
                // Flat positions shouldn't have stops
                return Err(StopsError::ValidationFailed(
                    "Flat positions should not have stop/target levels".to_string(),
                ));
            }
        }

        // Validate distance constraints
        if let Some(min_pct) = self.min_stop_distance_pct {
            let stop_distance = (levels.entry_price - levels.stop_loss).abs() / levels.entry_price;
            if stop_distance < min_pct {
                return Err(StopsError::InvalidStopLoss(format!(
                    "Stop loss too close to entry ({stop_distance:.2}% < {min_pct:.2}% minimum)"
                )));
            }
        }

        if let Some(max_pct) = self.max_stop_distance_pct {
            let stop_distance = (levels.entry_price - levels.stop_loss).abs() / levels.entry_price;
            if stop_distance > max_pct {
                return Err(StopsError::InvalidStopLoss(format!(
                    "Stop loss too far from entry ({stop_distance:.2}% > {max_pct:.2}% maximum)"
                )));
            }
        }

        Ok(())
    }
}

// ============================================================================
// Bracket Orders
// ============================================================================

/// A bracket order with entry, stop-loss, and take-profit legs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BracketOrder {
    /// Unique bracket order ID.
    pub bracket_id: String,
    /// Instrument ID.
    pub instrument_id: String,
    /// Entry order details.
    pub entry: EntryOrderSpec,
    /// Stop-loss order details.
    pub stop_loss: StopOrderSpec,
    /// Take-profit order details.
    pub take_profit: TakeProfitOrderSpec,
}

/// Entry order specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryOrderSpec {
    /// Order side (buy or sell).
    pub side: String,
    /// Quantity.
    pub quantity: Decimal,
    /// Order type (market, limit).
    pub order_type: String,
    /// Limit price (if limit order).
    pub limit_price: Option<Decimal>,
    /// Time in force.
    pub time_in_force: String,
}

/// Stop-loss order specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopOrderSpec {
    /// Stop price.
    pub stop_price: Decimal,
    /// Optional limit price for stop-limit.
    pub limit_price: Option<Decimal>,
}

/// Take-profit order specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TakeProfitOrderSpec {
    /// Limit price for take-profit.
    pub limit_price: Decimal,
}

/// Builder for bracket orders.
#[derive(Debug, Default)]
pub struct BracketOrderBuilder {
    instrument_id: Option<String>,
    side: Option<String>,
    quantity: Option<Decimal>,
    entry_type: String,
    entry_limit: Option<Decimal>,
    stop_loss: Option<Decimal>,
    stop_limit: Option<Decimal>,
    take_profit: Option<Decimal>,
    time_in_force: String,
}

impl BracketOrderBuilder {
    /// Create a new bracket order builder.
    #[must_use]
    pub fn new() -> Self {
        Self {
            entry_type: "market".to_string(),
            time_in_force: "day".to_string(),
            ..Default::default()
        }
    }

    /// Set the instrument ID.
    #[must_use]
    pub fn instrument(mut self, id: &str) -> Self {
        self.instrument_id = Some(id.to_string());
        self
    }

    /// Set the order side.
    #[must_use]
    pub fn side(mut self, side: &str) -> Self {
        self.side = Some(side.to_string());
        self
    }

    /// Set the quantity.
    #[must_use]
    pub fn quantity(mut self, qty: Decimal) -> Self {
        self.quantity = Some(qty);
        self
    }

    /// Set as limit entry with specified price.
    #[must_use]
    pub fn limit_entry(mut self, price: Decimal) -> Self {
        self.entry_type = "limit".to_string();
        self.entry_limit = Some(price);
        self
    }

    /// Set the stop-loss price.
    #[must_use]
    pub fn stop_loss(mut self, price: Decimal) -> Self {
        self.stop_loss = Some(price);
        self
    }

    /// Set stop-limit prices.
    #[must_use]
    pub fn stop_limit(mut self, stop: Decimal, limit: Decimal) -> Self {
        self.stop_loss = Some(stop);
        self.stop_limit = Some(limit);
        self
    }

    /// Set the take-profit price.
    #[must_use]
    pub fn take_profit(mut self, price: Decimal) -> Self {
        self.take_profit = Some(price);
        self
    }

    /// Set time in force.
    #[must_use]
    pub fn time_in_force(mut self, tif: &str) -> Self {
        self.time_in_force = tif.to_string();
        self
    }

    /// Build the bracket order.
    ///
    /// # Errors
    /// Returns an error if required fields are missing.
    pub fn build(self) -> Result<BracketOrder, StopsError> {
        let instrument_id = self.instrument_id.ok_or_else(|| {
            StopsError::ValidationFailed("Instrument ID required".to_string())
        })?;

        let side = self.side.ok_or_else(|| {
            StopsError::ValidationFailed("Side required".to_string())
        })?;

        let quantity = self.quantity.ok_or_else(|| {
            StopsError::ValidationFailed("Quantity required".to_string())
        })?;

        let stop_loss_price = self.stop_loss.ok_or_else(|| {
            StopsError::InvalidStopLoss("Stop loss price required".to_string())
        })?;

        let take_profit_price = self.take_profit.ok_or_else(|| {
            StopsError::InvalidTakeProfit("Take profit price required".to_string())
        })?;

        let bracket_id = format!("bracket-{}", uuid::Uuid::new_v4());

        Ok(BracketOrder {
            bracket_id,
            instrument_id,
            entry: EntryOrderSpec {
                side,
                quantity,
                order_type: self.entry_type,
                limit_price: self.entry_limit,
                time_in_force: self.time_in_force,
            },
            stop_loss: StopOrderSpec {
                stop_price: stop_loss_price,
                limit_price: self.stop_limit,
            },
            take_profit: TakeProfitOrderSpec {
                limit_price: take_profit_price,
            },
        })
    }
}

// ============================================================================
// Backtest Simulation
// ============================================================================

/// A candle (OHLCV bar) for backtest simulation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Candle {
    /// Timestamp (ISO 8601).
    pub timestamp: String,
    /// Open price.
    pub open: Decimal,
    /// High price.
    pub high: Decimal,
    /// Low price.
    pub low: Decimal,
    /// Close price.
    pub close: Decimal,
    /// Volume.
    pub volume: Decimal,
}

/// Result of checking if stop or target was triggered.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TriggerResult {
    /// No trigger occurred.
    None,
    /// Stop-loss was triggered.
    StopLoss {
        /// Price at which stop was triggered.
        price: Decimal,
        /// Timestamp of trigger.
        timestamp: String,
    },
    /// Take-profit was triggered.
    TakeProfit {
        /// Price at which target was triggered.
        price: Decimal,
        /// Timestamp of trigger.
        timestamp: String,
    },
}

/// Simulator for stop/target triggers in backtest mode.
#[derive(Debug, Clone)]
pub struct BacktestStopsSimulator {
    /// Configuration.
    config: StopsConfig,
}

impl Default for BacktestStopsSimulator {
    fn default() -> Self {
        Self::new()
    }
}

impl BacktestStopsSimulator {
    /// Create a new backtest simulator.
    #[must_use]
    pub fn new() -> Self {
        Self {
            config: StopsConfig::default(),
        }
    }

    /// Create with custom configuration.
    #[must_use]
    pub fn with_config(config: StopsConfig) -> Self {
        Self { config }
    }

    /// Check if stop or target is triggered by a candle.
    ///
    /// For long positions:
    /// - Stop triggers on candle low
    /// - Target triggers on candle high
    ///
    /// For short positions:
    /// - Stop triggers on candle high
    /// - Target triggers on candle low
    #[must_use]
    pub fn check_trigger(&self, candle: &Candle, levels: &StopTargetLevels) -> TriggerResult {
        let (stop_triggered, target_triggered) = match levels.direction {
            Direction::Long => {
                let stop = candle.low <= levels.stop_loss;
                let target = candle.high >= levels.take_profit;
                (stop, target)
            }
            Direction::Short => {
                let stop = candle.high >= levels.stop_loss;
                let target = candle.low <= levels.take_profit;
                (stop, target)
            }
            Direction::Flat => return TriggerResult::None,
        };

        // Handle both triggered in same bar
        if stop_triggered && target_triggered {
            return self.resolve_same_bar_conflict(candle, levels);
        }

        if stop_triggered {
            let price = match levels.direction {
                Direction::Long => levels.stop_loss,
                Direction::Short => levels.stop_loss,
                Direction::Flat => return TriggerResult::None,
            };
            return TriggerResult::StopLoss {
                price,
                timestamp: candle.timestamp.clone(),
            };
        }

        if target_triggered {
            let price = match levels.direction {
                Direction::Long => levels.take_profit,
                Direction::Short => levels.take_profit,
                Direction::Flat => return TriggerResult::None,
            };
            return TriggerResult::TakeProfit {
                price,
                timestamp: candle.timestamp.clone(),
            };
        }

        TriggerResult::None
    }

    /// Resolve conflict when both stop and target trigger in same bar.
    fn resolve_same_bar_conflict(&self, candle: &Candle, levels: &StopTargetLevels) -> TriggerResult {
        match self.config.same_bar_priority {
            SameBarPriority::StopFirst => TriggerResult::StopLoss {
                price: levels.stop_loss,
                timestamp: candle.timestamp.clone(),
            },
            SameBarPriority::TargetFirst => TriggerResult::TakeProfit {
                price: levels.take_profit,
                timestamp: candle.timestamp.clone(),
            },
            SameBarPriority::HighLowOrder => {
                // Determine bar direction: up bar (close > open) or down bar
                let is_up_bar = candle.close > candle.open;

                match levels.direction {
                    Direction::Long => {
                        // Long position on up bar: likely hit low first (stop), then high (target)
                        // Long position on down bar: likely hit high first (target), then low (stop)
                        if is_up_bar {
                            TriggerResult::StopLoss {
                                price: levels.stop_loss,
                                timestamp: candle.timestamp.clone(),
                            }
                        } else {
                            TriggerResult::TakeProfit {
                                price: levels.take_profit,
                                timestamp: candle.timestamp.clone(),
                            }
                        }
                    }
                    Direction::Short => {
                        // Short position on up bar: likely hit low first (target), then high (stop)
                        // Short position on down bar: likely hit high first (stop), then low (target)
                        if is_up_bar {
                            TriggerResult::TakeProfit {
                                price: levels.take_profit,
                                timestamp: candle.timestamp.clone(),
                            }
                        } else {
                            TriggerResult::StopLoss {
                                price: levels.stop_loss,
                                timestamp: candle.timestamp.clone(),
                            }
                        }
                    }
                    Direction::Flat => TriggerResult::None,
                }
            }
        }
    }

    /// Simulate stops through a series of candles.
    ///
    /// Returns the first trigger result encountered.
    #[must_use]
    pub fn simulate(&self, candles: &[Candle], levels: &StopTargetLevels) -> TriggerResult {
        for candle in candles {
            let result = self.check_trigger(candle, levels);
            if result != TriggerResult::None {
                return result;
            }
        }
        TriggerResult::None
    }
}

// ============================================================================
// Price Monitoring
// ============================================================================

/// Position being monitored for stop/target triggers.
#[derive(Debug, Clone)]
pub struct MonitoredPosition {
    /// Position ID.
    pub position_id: String,
    /// Instrument ID.
    pub instrument_id: String,
    /// Stop/target levels.
    pub levels: StopTargetLevels,
    /// Whether monitoring is active.
    pub active: bool,
}

/// Price monitor for real-time stop/target enforcement.
///
/// Used for options positions where bracket orders aren't supported.
#[derive(Debug)]
pub struct PriceMonitor {
    /// Configuration.
    config: StopsConfig,
    /// Positions being monitored.
    positions: HashMap<String, MonitoredPosition>,
}

impl Default for PriceMonitor {
    fn default() -> Self {
        Self::new()
    }
}

impl PriceMonitor {
    /// Create a new price monitor.
    #[must_use]
    pub fn new() -> Self {
        Self {
            config: StopsConfig::default(),
            positions: HashMap::new(),
        }
    }

    /// Create with custom configuration.
    #[must_use]
    pub fn with_config(config: StopsConfig) -> Self {
        Self {
            config,
            positions: HashMap::new(),
        }
    }

    /// Add a position to monitor.
    pub fn add_position(&mut self, position: MonitoredPosition) {
        self.positions.insert(position.position_id.clone(), position);
    }

    /// Remove a position from monitoring.
    pub fn remove_position(&mut self, position_id: &str) -> Option<MonitoredPosition> {
        self.positions.remove(position_id)
    }

    /// Get a position by ID.
    #[must_use]
    pub fn get_position(&self, position_id: &str) -> Option<&MonitoredPosition> {
        self.positions.get(position_id)
    }

    /// Check a price update against all monitored positions.
    ///
    /// Returns a list of (position_id, trigger_result) for any triggers.
    #[must_use]
    pub fn check_price(&self, instrument_id: &str, price: Decimal) -> Vec<(String, TriggerResult)> {
        let timestamp = chrono::Utc::now().to_rfc3339();
        let mut triggers = Vec::new();

        for position in self.positions.values() {
            if !position.active || position.instrument_id != instrument_id {
                continue;
            }

            let result = self.check_price_trigger(price, &position.levels, &timestamp);
            if result != TriggerResult::None {
                triggers.push((position.position_id.clone(), result));
            }
        }

        triggers
    }

    /// Check if a price triggers stop or target.
    fn check_price_trigger(
        &self,
        price: Decimal,
        levels: &StopTargetLevels,
        timestamp: &str,
    ) -> TriggerResult {
        match levels.direction {
            Direction::Long => {
                if price <= levels.stop_loss {
                    TriggerResult::StopLoss {
                        price: levels.stop_loss,
                        timestamp: timestamp.to_string(),
                    }
                } else if price >= levels.take_profit {
                    TriggerResult::TakeProfit {
                        price: levels.take_profit,
                        timestamp: timestamp.to_string(),
                    }
                } else {
                    TriggerResult::None
                }
            }
            Direction::Short => {
                if price >= levels.stop_loss {
                    TriggerResult::StopLoss {
                        price: levels.stop_loss,
                        timestamp: timestamp.to_string(),
                    }
                } else if price <= levels.take_profit {
                    TriggerResult::TakeProfit {
                        price: levels.take_profit,
                        timestamp: timestamp.to_string(),
                    }
                } else {
                    TriggerResult::None
                }
            }
            Direction::Flat => TriggerResult::None,
        }
    }

    /// Get the monitoring interval.
    #[must_use]
    pub fn monitoring_interval_ms(&self) -> u64 {
        self.config.monitoring_interval_ms
    }

    /// Get count of active monitored positions.
    #[must_use]
    pub fn active_count(&self) -> usize {
        self.positions.values().filter(|p| p.active).count()
    }
}

// ============================================================================
// Unified Enforcer
// ============================================================================

/// Determines whether bracket orders are supported for an instrument.
#[must_use]
pub fn supports_bracket_orders(instrument_id: &str) -> bool {
    // Options don't support bracket orders on Alpaca (as of Jan 2026)
    // Options have symbols like "AAPL240119C00150000" or start with "O:"
    let is_option = instrument_id.len() > 10
        || instrument_id.starts_with("O:")
        || (instrument_id.chars().any(|c| c.is_ascii_digit())
            && instrument_id.chars().any(|c| c == 'C' || c == 'P'));

    !is_option
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
        match self.environment {
            Environment::Backtest => EnforcementMethod::BacktestSimulation,
            Environment::Paper | Environment::Live => {
                if self.config.use_bracket_orders && supports_bracket_orders(instrument_id) {
                    EnforcementMethod::BracketOrder
                } else {
                    EnforcementMethod::PriceMonitoring
                }
            }
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
    pub fn simulate_backtest(&self, candles: &[Candle], levels: &StopTargetLevels) -> TriggerResult {
        self.backtest_simulator.simulate(candles, levels)
    }

    /// Get the current environment.
    #[must_use]
    pub fn environment(&self) -> Environment {
        self.environment
    }
}

/// Method used for stop/target enforcement.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnforcementMethod {
    /// Use bracket orders (OCO).
    BracketOrder,
    /// Use real-time price monitoring.
    PriceMonitoring,
    /// Use backtest simulation with candle data.
    BacktestSimulation,
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn make_levels(direction: Direction) -> StopTargetLevels {
        match direction {
            Direction::Long => StopTargetLevels::new(
                Decimal::new(95, 0),   // stop at $95
                Decimal::new(110, 0),  // target at $110
                Decimal::new(100, 0),  // entry at $100
                Direction::Long,
            ),
            Direction::Short => StopTargetLevels::new(
                Decimal::new(105, 0),  // stop at $105
                Decimal::new(90, 0),   // target at $90
                Decimal::new(100, 0),  // entry at $100
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

    fn make_candle(open: i64, high: i64, low: i64, close: i64) -> Candle {
        Candle {
            timestamp: "2026-01-05T12:00:00Z".to_string(),
            open: Decimal::new(open, 0),
            high: Decimal::new(high, 0),
            low: Decimal::new(low, 0),
            close: Decimal::new(close, 0),
            volume: Decimal::new(1000000, 0),
        }
    }

    // ========================================================================
    // Validation Tests
    // ========================================================================

    #[test]
    fn test_validate_long_position_valid() {
        let validator = StopTargetValidator::new();
        let levels = make_levels(Direction::Long);
        assert!(validator.validate(&levels).is_ok());
    }

    #[test]
    fn test_validate_short_position_valid() {
        let validator = StopTargetValidator::new();
        let levels = make_levels(Direction::Short);
        assert!(validator.validate(&levels).is_ok());
    }

    #[test]
    fn test_validate_stop_must_be_positive() {
        let validator = StopTargetValidator::new();
        let levels = StopTargetLevels::new(
            Decimal::new(-10, 0),
            Decimal::new(110, 0),
            Decimal::new(100, 0),
            Direction::Long,
        );
        assert!(matches!(
            validator.validate(&levels),
            Err(StopsError::InvalidStopLoss(_))
        ));
    }

    #[test]
    fn test_validate_long_stop_below_entry() {
        let validator = StopTargetValidator::new();
        let levels = StopTargetLevels::new(
            Decimal::new(105, 0),  // stop above entry - invalid for long
            Decimal::new(110, 0),
            Decimal::new(100, 0),
            Direction::Long,
        );
        assert!(matches!(
            validator.validate(&levels),
            Err(StopsError::InvalidStopLoss(_))
        ));
    }

    #[test]
    fn test_validate_short_stop_above_entry() {
        let validator = StopTargetValidator::new();
        let levels = StopTargetLevels::new(
            Decimal::new(95, 0),  // stop below entry - invalid for short
            Decimal::new(90, 0),
            Decimal::new(100, 0),
            Direction::Short,
        );
        assert!(matches!(
            validator.validate(&levels),
            Err(StopsError::InvalidStopLoss(_))
        ));
    }

    #[test]
    fn test_validate_flat_position_fails() {
        let validator = StopTargetValidator::new();
        let levels = make_levels(Direction::Flat);
        assert!(matches!(
            validator.validate(&levels),
            Err(StopsError::ValidationFailed(_))
        ));
    }

    // ========================================================================
    // Bracket Order Tests
    // ========================================================================

    #[test]
    fn test_bracket_order_builder() {
        let order = BracketOrderBuilder::new()
            .instrument("AAPL")
            .side("buy")
            .quantity(Decimal::new(100, 0))
            .limit_entry(Decimal::new(15000, 2))
            .stop_loss(Decimal::new(14500, 2))
            .take_profit(Decimal::new(16000, 2))
            .build()
            .unwrap();

        assert_eq!(order.instrument_id, "AAPL");
        assert_eq!(order.entry.quantity, Decimal::new(100, 0));
        assert_eq!(order.stop_loss.stop_price, Decimal::new(14500, 2));
        assert_eq!(order.take_profit.limit_price, Decimal::new(16000, 2));
    }

    #[test]
    fn test_bracket_order_missing_fields() {
        let result = BracketOrderBuilder::new()
            .instrument("AAPL")
            .build();
        assert!(result.is_err());
    }

    #[test]
    fn test_supports_bracket_orders_stock() {
        assert!(supports_bracket_orders("AAPL"));
        assert!(supports_bracket_orders("MSFT"));
        assert!(supports_bracket_orders("SPY"));
    }

    #[test]
    fn test_supports_bracket_orders_option() {
        // Options should not support bracket orders
        assert!(!supports_bracket_orders("AAPL240119C00150000"));
        assert!(!supports_bracket_orders("O:AAPL240119C00150000"));
    }

    // ========================================================================
    // Backtest Simulation Tests
    // ========================================================================

    #[test]
    fn test_backtest_no_trigger() {
        let simulator = BacktestStopsSimulator::new();
        let levels = make_levels(Direction::Long);
        let candle = make_candle(100, 102, 98, 101);

        let result = simulator.check_trigger(&candle, &levels);
        assert_eq!(result, TriggerResult::None);
    }

    #[test]
    fn test_backtest_long_stop_trigger() {
        let simulator = BacktestStopsSimulator::new();
        let levels = make_levels(Direction::Long);
        let candle = make_candle(100, 102, 94, 96);  // low hits stop at 95

        let result = simulator.check_trigger(&candle, &levels);
        assert!(matches!(result, TriggerResult::StopLoss { .. }));
    }

    #[test]
    fn test_backtest_long_target_trigger() {
        let simulator = BacktestStopsSimulator::new();
        let levels = make_levels(Direction::Long);
        let candle = make_candle(100, 112, 99, 111);  // high hits target at 110

        let result = simulator.check_trigger(&candle, &levels);
        assert!(matches!(result, TriggerResult::TakeProfit { .. }));
    }

    #[test]
    fn test_backtest_short_stop_trigger() {
        let simulator = BacktestStopsSimulator::new();
        let levels = make_levels(Direction::Short);
        let candle = make_candle(100, 106, 98, 103);  // high hits stop at 105

        let result = simulator.check_trigger(&candle, &levels);
        assert!(matches!(result, TriggerResult::StopLoss { .. }));
    }

    #[test]
    fn test_backtest_short_target_trigger() {
        let simulator = BacktestStopsSimulator::new();
        let levels = make_levels(Direction::Short);
        let candle = make_candle(100, 101, 88, 89);  // low hits target at 90

        let result = simulator.check_trigger(&candle, &levels);
        assert!(matches!(result, TriggerResult::TakeProfit { .. }));
    }

    #[test]
    fn test_backtest_same_bar_stop_first() {
        let config = StopsConfig {
            same_bar_priority: SameBarPriority::StopFirst,
            ..Default::default()
        };
        let simulator = BacktestStopsSimulator::with_config(config);
        let levels = make_levels(Direction::Long);
        // Both stop (95) and target (110) triggered
        let candle = make_candle(100, 115, 90, 105);

        let result = simulator.check_trigger(&candle, &levels);
        assert!(matches!(result, TriggerResult::StopLoss { .. }));
    }

    #[test]
    fn test_backtest_same_bar_target_first() {
        let config = StopsConfig {
            same_bar_priority: SameBarPriority::TargetFirst,
            ..Default::default()
        };
        let simulator = BacktestStopsSimulator::with_config(config);
        let levels = make_levels(Direction::Long);
        // Both stop (95) and target (110) triggered
        let candle = make_candle(100, 115, 90, 105);

        let result = simulator.check_trigger(&candle, &levels);
        assert!(matches!(result, TriggerResult::TakeProfit { .. }));
    }

    #[test]
    fn test_backtest_simulate_series() {
        let simulator = BacktestStopsSimulator::new();
        let levels = make_levels(Direction::Long);
        let candles = vec![
            make_candle(100, 102, 98, 101),  // no trigger
            make_candle(101, 103, 99, 102),  // no trigger
            make_candle(102, 105, 94, 95),   // stop triggered
        ];

        let result = simulator.simulate(&candles, &levels);
        assert!(matches!(result, TriggerResult::StopLoss { .. }));
    }

    // ========================================================================
    // Price Monitor Tests
    // ========================================================================

    #[test]
    fn test_price_monitor_add_remove() {
        let mut monitor = PriceMonitor::new();

        let position = MonitoredPosition {
            position_id: "pos-1".to_string(),
            instrument_id: "AAPL".to_string(),
            levels: make_levels(Direction::Long),
            active: true,
        };

        monitor.add_position(position);
        assert_eq!(monitor.active_count(), 1);

        monitor.remove_position("pos-1");
        assert_eq!(monitor.active_count(), 0);
    }

    #[test]
    fn test_price_monitor_trigger() {
        let mut monitor = PriceMonitor::new();

        let position = MonitoredPosition {
            position_id: "pos-1".to_string(),
            instrument_id: "AAPL".to_string(),
            levels: make_levels(Direction::Long),
            active: true,
        };

        monitor.add_position(position);

        // Price drops to stop
        let triggers = monitor.check_price("AAPL", Decimal::new(94, 0));
        assert_eq!(triggers.len(), 1);
        assert!(matches!(triggers[0].1, TriggerResult::StopLoss { .. }));
    }

    #[test]
    fn test_price_monitor_no_trigger() {
        let mut monitor = PriceMonitor::new();

        let position = MonitoredPosition {
            position_id: "pos-1".to_string(),
            instrument_id: "AAPL".to_string(),
            levels: make_levels(Direction::Long),
            active: true,
        };

        monitor.add_position(position);

        // Price in safe zone
        let triggers = monitor.check_price("AAPL", Decimal::new(100, 0));
        assert!(triggers.is_empty());
    }

    // ========================================================================
    // Unified Enforcer Tests
    // ========================================================================

    #[test]
    fn test_enforcer_enforcement_method_backtest() {
        let enforcer = StopsEnforcer::new(Environment::Backtest);
        assert_eq!(
            enforcer.enforcement_method("AAPL"),
            EnforcementMethod::BacktestSimulation
        );
    }

    #[test]
    fn test_enforcer_enforcement_method_live_stock() {
        let enforcer = StopsEnforcer::new(Environment::Live);
        assert_eq!(
            enforcer.enforcement_method("AAPL"),
            EnforcementMethod::BracketOrder
        );
    }

    #[test]
    fn test_enforcer_enforcement_method_live_option() {
        let enforcer = StopsEnforcer::new(Environment::Live);
        assert_eq!(
            enforcer.enforcement_method("AAPL240119C00150000"),
            EnforcementMethod::PriceMonitoring
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
