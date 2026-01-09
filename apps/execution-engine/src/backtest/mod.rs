//! Backtest simulation engine for order lifecycle simulation.
//!
//! This module provides simulation capabilities for backtesting trading strategies:
//!
//! - **Fill models**: Configurable slippage (fixed BPS, spread-based, volume impact)
//! - **Commission**: Per-unit commissions with regulatory fees (SEC, TAF, ORF)
//! - **Stop/target triggers**: Candle-based detection with same-bar priority rules
//! - **Partial fills**: Probabilistic and liquidity-based partial fill simulation
//! - **Multi-leg orders**: All-or-None behavior for options spreads
//!
//! # Example
//!
//! ```ignore
//! use execution_engine::backtest::{
//!     BacktestConfig, Candle, SimulationEngine,
//!     simulate_market_order,
//! };
//! use execution_engine::models::OrderSide;
//! use rust_decimal::Decimal;
//!
//! let config = BacktestConfig::default();
//! let candle = Candle::new(
//!     Decimal::new(10000, 2), // open: $100.00
//!     Decimal::new(10100, 2), // high: $101.00
//!     Decimal::new(9900, 2),  // low: $99.00
//!     Decimal::new(10050, 2), // close: $100.50
//!     Decimal::new(100000, 0), // volume: 100,000
//! );
//!
//! let fill = simulate_market_order(
//!     OrderSide::Buy,
//!     Decimal::new(100, 0),
//!     &candle,
//!     &config,
//!     true,
//!     None,
//! );
//!
//! assert!(fill.filled);
//! ```

mod cleanup;
mod commission;
mod config;
mod data_gaps;
mod fill_engine;
mod logging;
mod look_ahead;
mod metrics;
mod monte_carlo;
mod multi_leg;
mod parallel;
mod replay;
mod security;
mod slippage;
mod triggers;
mod walkforward;

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use tracing::{debug, info};

pub use cleanup::{
    CleanupConfig, CleanupResult, QuotaStatus, ResultFileInfo, StorageUsage,
    calculate_storage_usage, check_storage_quota, identify_cleanup_candidates, perform_cleanup,
    scan_results_dir,
};
pub use commission::{InstrumentType, calculate_commission, calculate_multi_leg_commission};
pub use config::{
    BacktestConfig, CommissionConfig, CommissionModel, FillModelConfig, FixedBpsConfig,
    LimitOrderConfig, PartialFillConfig, PerUnitCommissionConfig, RegulatoryFeesConfig,
    SameBarPriority, SlippageConfig, SlippageModel, SlippedStopTargetConfig, SpreadBasedConfig,
    StopTargetConfig, StopTargetFillModel, VolumeImpactConfig,
};
pub use data_gaps::{
    DataGapError, DataGapType, GapStatistics, GapValidationResult, validate_candle_data,
    validate_order_data, validate_spread_data, validate_volume_data,
};
pub use fill_engine::{
    Candle, FillResult, simulate_limit_order, simulate_market_order, simulate_order,
    simulate_stop_limit_order, simulate_stop_order,
};
pub use logging::{
    BacktestEvent, BacktestLogger, CommissionCalculatedEvent, DataGapDetectedEvent,
    OrderFilledEvent, OrderRejectedEvent, OrderSubmittedEvent, PerformanceSummaryEvent,
    SimulationEndEvent, SimulationStartEvent, SlippageAppliedEvent, TriggerActivatedEvent,
    calculate_slippage_bps, create_data_gap_event, create_order_submitted_event,
    create_simulation_start_event, is_adverse_slippage, log_commission_calculated,
    log_data_gap_detected, log_order_filled, log_order_rejected, log_order_submitted,
    log_performance_summary, log_simulation_end, log_simulation_start, log_slippage_applied,
    log_trigger_activated,
};
pub use look_ahead::{
    DataAccessRecord, EarningsRelease, EarningsReleaseTiming, FundamentalDataAvailability,
    LookAheadChecker, LookAheadConfig, LookAheadError, LookAheadSummary, ValidationResult,
    check_earnings_availability, check_fundamental_availability, validate_data_timestamp,
    validate_universe_constituents,
};
pub use metrics::{
    DrawdownPoint, EquityPoint, ExitReason, PerformanceCalculator, PerformanceSummary, TradeRecord,
    format_decimal, format_pct, format_ratio,
};
pub use monte_carlo::{
    DistributionStats, IterationResult, LuckVsSkillAnalysis, MonteCarloBuilder, MonteCarloConfig,
    MonteCarloResult, MonteCarloSimulator, RandomizationMethod, VaRAnalysis,
};
pub use multi_leg::{
    LegFillResult, MultiLegFillResult, OrderLeg, calculate_total_contracts,
    create_bull_call_spread, create_iron_condor, create_straddle, simulate_multi_leg_order,
    validate_balanced_ratios,
};
pub use parallel::{
    BacktestJob, BacktestJobResult, GridSearchResult, ParallelBacktester, ParallelConfig,
    ParallelError, ParallelResult, ParamValue, ParameterGrid, ParameterGridBuilder, Progress,
    ProgressTracker, StrategyConfig,
};
pub use replay::{
    CandleDataSource, CandleEvent, DataSourceType, InMemoryDataSource, MissingDataPolicy,
    ReplayConfig, ReplayEngine, ReplayEngineBuilder, ReplayError, ReplayProgress,
    SynchronizedReplay,
};
pub use security::{
    AuditEvent, AuditEventType, AuditLogger, AuditOutcome, ConfigSecurityScan, DataAccessControl,
    PathSecurityError, SecurityError, SecurityWarning, check_path_patterns,
    scan_config_for_secrets, validate_safe_path,
};
pub use slippage::{apply_slippage, apply_stop_target_slippage};
pub use triggers::{
    PositionDirection, TriggerResult, TriggerType, evaluate_stop, evaluate_target,
    evaluate_triggers, is_stop_triggered, is_target_triggered,
};
pub use walkforward::{
    AggregatedMetrics, OverfittingAnalysis, ParameterStability, WalkForwardBuilder,
    WalkForwardConfig, WalkForwardEngine, WalkForwardResult, WalkForwardWindow, WindowMode,
};

use crate::models::{
    OrderPurpose, OrderSide, OrderStatus, OrderType, PartialFillState, TimeInForce,
};

/// Order lifecycle state in backtest simulation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SimOrderState {
    /// Order created but not yet submitted.
    New,
    /// Order submitted and pending fill.
    Pending,
    /// Order partially filled.
    PartiallyFilled,
    /// Order completely filled.
    Filled,
    /// Order rejected.
    Rejected,
    /// Order cancelled.
    Cancelled,
    /// Order expired.
    Expired,
}

impl From<SimOrderState> for OrderStatus {
    fn from(state: SimOrderState) -> Self {
        match state {
            SimOrderState::New => Self::New,
            SimOrderState::Pending => Self::Accepted,
            SimOrderState::PartiallyFilled => Self::PartiallyFilled,
            SimOrderState::Filled => Self::Filled,
            SimOrderState::Rejected => Self::Rejected,
            SimOrderState::Cancelled => Self::Canceled,
            SimOrderState::Expired => Self::Expired,
        }
    }
}

/// Simulated order in backtest.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimOrder {
    /// Unique order ID.
    pub order_id: String,
    /// Instrument ID.
    pub instrument_id: String,
    /// Order side.
    pub side: OrderSide,
    /// Order type.
    pub order_type: OrderType,
    /// Time in force.
    pub time_in_force: TimeInForce,
    /// Requested quantity.
    pub quantity: Decimal,
    /// Limit price (for limit orders).
    pub limit_price: Option<Decimal>,
    /// Stop price (for stop orders).
    pub stop_price: Option<Decimal>,
    /// Order state.
    pub state: SimOrderState,
    /// Partial fill tracking.
    pub partial_fill_state: Option<PartialFillState>,
    /// Order purpose (for timeout handling).
    pub purpose: OrderPurpose,
    /// Submission timestamp (ISO 8601).
    pub submitted_at: String,
    /// Last update timestamp (ISO 8601).
    pub updated_at: String,
    /// Position direction (for stop/target orders).
    pub position_direction: Option<PositionDirection>,
}

impl SimOrder {
    /// Create a new simulated order.
    #[must_use]
    pub fn new(
        order_id: &str,
        instrument_id: &str,
        side: OrderSide,
        order_type: OrderType,
        quantity: Decimal,
        purpose: OrderPurpose,
    ) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            order_id: order_id.to_string(),
            instrument_id: instrument_id.to_string(),
            side,
            order_type,
            time_in_force: TimeInForce::Day,
            quantity,
            limit_price: None,
            stop_price: None,
            state: SimOrderState::New,
            partial_fill_state: None,
            purpose,
            submitted_at: now.clone(),
            updated_at: now,
            position_direction: None,
        }
    }

    /// Set limit price.
    #[must_use]
    pub fn with_limit_price(mut self, price: Decimal) -> Self {
        self.limit_price = Some(price);
        self
    }

    /// Set stop price.
    #[must_use]
    pub fn with_stop_price(mut self, price: Decimal) -> Self {
        self.stop_price = Some(price);
        self
    }

    /// Set time in force.
    #[must_use]
    pub fn with_time_in_force(mut self, tif: TimeInForce) -> Self {
        self.time_in_force = tif;
        self
    }

    /// Set position direction (for protective orders).
    #[must_use]
    pub fn with_position_direction(mut self, direction: PositionDirection) -> Self {
        self.position_direction = Some(direction);
        self
    }

    /// Check if order is in terminal state.
    #[must_use]
    pub fn is_terminal(&self) -> bool {
        matches!(
            self.state,
            SimOrderState::Filled
                | SimOrderState::Rejected
                | SimOrderState::Cancelled
                | SimOrderState::Expired
        )
    }

    /// Get filled quantity.
    #[must_use]
    pub fn filled_quantity(&self) -> Decimal {
        self.partial_fill_state
            .as_ref()
            .map_or(Decimal::ZERO, |s| s.cum_qty)
    }

    /// Get remaining quantity.
    #[must_use]
    pub fn remaining_quantity(&self) -> Decimal {
        self.partial_fill_state
            .as_ref()
            .map_or(self.quantity, |s| s.leaves_qty)
    }

    /// Get average fill price.
    #[must_use]
    pub fn avg_fill_price(&self) -> Decimal {
        self.partial_fill_state
            .as_ref()
            .map_or(Decimal::ZERO, |s| s.avg_px)
    }
}

/// Simulated position in backtest.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimPosition {
    /// Instrument ID.
    pub instrument_id: String,
    /// Position quantity (positive = long, negative = short).
    pub quantity: Decimal,
    /// Average entry price.
    pub avg_entry_price: Decimal,
    /// Stop loss level.
    pub stop_loss: Option<Decimal>,
    /// Take profit level.
    pub take_profit: Option<Decimal>,
    /// Unrealized P&L.
    pub unrealized_pnl: Decimal,
    /// Realized P&L.
    pub realized_pnl: Decimal,
    /// Total commission paid.
    pub commission_paid: Decimal,
    /// Position opened timestamp.
    pub opened_at: String,
}

impl SimPosition {
    /// Create a new simulated position.
    #[must_use]
    pub fn new(instrument_id: &str, quantity: Decimal, entry_price: Decimal) -> Self {
        Self {
            instrument_id: instrument_id.to_string(),
            quantity,
            avg_entry_price: entry_price,
            stop_loss: None,
            take_profit: None,
            unrealized_pnl: Decimal::ZERO,
            realized_pnl: Decimal::ZERO,
            commission_paid: Decimal::ZERO,
            opened_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// Get position direction.
    #[must_use]
    pub fn direction(&self) -> PositionDirection {
        if self.quantity > Decimal::ZERO {
            PositionDirection::Long
        } else {
            PositionDirection::Short
        }
    }

    /// Check if position is flat.
    #[must_use]
    pub fn is_flat(&self) -> bool {
        self.quantity == Decimal::ZERO
    }

    /// Update unrealized P&L.
    pub fn update_unrealized_pnl(&mut self, current_price: Decimal) {
        let price_diff = current_price - self.avg_entry_price;
        self.unrealized_pnl = price_diff * self.quantity;
    }
}

/// Simulation engine for backtesting.
#[derive(Debug)]
pub struct SimulationEngine {
    /// Backtest configuration.
    config: BacktestConfig,
    /// Open orders.
    open_orders: HashMap<String, SimOrder>,
    /// Positions by instrument.
    positions: HashMap<String, SimPosition>,
    /// Historical candles by instrument.
    candle_history: HashMap<String, Vec<Candle>>,
    /// Average volume by instrument (for volume impact).
    avg_volumes: HashMap<String, Decimal>,
    /// Order counter for ID generation.
    order_counter: u64,
    /// Current simulation time.
    current_time: String,
    /// Total commission paid.
    total_commission: Decimal,
    /// Trade log.
    trades: Vec<SimTrade>,
}

/// Trade record for backtest output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimTrade {
    /// Trade ID.
    pub trade_id: String,
    /// Instrument ID.
    pub instrument_id: String,
    /// Trade side.
    pub side: String,
    /// Entry time.
    pub entry_time: String,
    /// Entry price.
    pub entry_price: Decimal,
    /// Entry slippage.
    pub entry_slippage: Decimal,
    /// Exit time.
    pub exit_time: String,
    /// Exit price.
    pub exit_price: Decimal,
    /// Exit slippage.
    pub exit_slippage: Decimal,
    /// Exit reason.
    pub exit_reason: String,
    /// Quantity.
    pub quantity: Decimal,
    /// Gross P&L.
    pub gross_pnl: Decimal,
    /// Commission paid.
    pub commission: Decimal,
    /// Net P&L.
    pub net_pnl: Decimal,
    /// Holding period in hours.
    pub holding_period_hours: f64,
}

/// Calculate holding period in hours between two RFC3339 timestamps.
///
/// Returns 0.0 if either timestamp cannot be parsed.
#[must_use]
fn calculate_holding_period_hours(entry_time: &str, exit_time: &str) -> f64 {
    let entry: DateTime<Utc> = match entry_time.parse() {
        Ok(dt) => dt,
        Err(_) => return 0.0,
    };
    let exit: DateTime<Utc> = match exit_time.parse() {
        Ok(dt) => dt,
        Err(_) => return 0.0,
    };

    let duration = exit.signed_duration_since(entry);
    // Convert to hours (duration.num_seconds() / 3600.0)
    #[allow(clippy::cast_precision_loss)]
    let hours = duration.num_seconds() as f64 / 3600.0;

    // Return 0.0 for negative durations (shouldn't happen, but be safe)
    if hours < 0.0 { 0.0 } else { hours }
}

impl SimulationEngine {
    /// Create a new simulation engine.
    #[must_use]
    pub fn new(config: BacktestConfig) -> Self {
        Self {
            config,
            open_orders: HashMap::new(),
            positions: HashMap::new(),
            candle_history: HashMap::new(),
            avg_volumes: HashMap::new(),
            order_counter: 0,
            current_time: String::new(),
            total_commission: Decimal::ZERO,
            trades: Vec::new(),
        }
    }

    /// Get the current configuration.
    #[must_use]
    pub fn config(&self) -> &BacktestConfig {
        &self.config
    }

    /// Generate a new order ID.
    fn next_order_id(&mut self) -> String {
        self.order_counter += 1;
        format!("sim-order-{:08}", self.order_counter)
    }

    /// Submit an order to the simulation.
    pub fn submit_order(&mut self, mut order: SimOrder) -> String {
        if order.order_id.is_empty() {
            order.order_id = self.next_order_id();
        }

        order.state = SimOrderState::Pending;
        order.partial_fill_state = Some(PartialFillState::new(
            order.order_id.clone(),
            order.quantity,
            order.purpose,
        ));

        let order_id = order.order_id.clone();
        info!(
            order_id = %order_id,
            instrument = %order.instrument_id,
            side = ?order.side,
            "Order submitted to simulation"
        );

        self.open_orders.insert(order_id.clone(), order);
        order_id
    }

    /// Cancel an order.
    pub fn cancel_order(&mut self, order_id: &str) -> bool {
        if let Some(order) = self.open_orders.get_mut(order_id) {
            if !order.is_terminal() {
                order.state = SimOrderState::Cancelled;
                order.updated_at = chrono::Utc::now().to_rfc3339();
                info!(order_id = %order_id, "Order cancelled");
                return true;
            }
        }
        false
    }

    /// Get an order by ID.
    #[must_use]
    pub fn get_order(&self, order_id: &str) -> Option<&SimOrder> {
        self.open_orders.get(order_id)
    }

    /// Get all open orders.
    #[must_use]
    pub fn open_orders(&self) -> Vec<&SimOrder> {
        self.open_orders
            .values()
            .filter(|o| !o.is_terminal())
            .collect()
    }

    /// Get a position by instrument.
    #[must_use]
    pub fn get_position(&self, instrument_id: &str) -> Option<&SimPosition> {
        self.positions.get(instrument_id)
    }

    /// Get all positions.
    #[must_use]
    pub fn positions(&self) -> &HashMap<String, SimPosition> {
        &self.positions
    }

    /// Get trade log.
    #[must_use]
    pub fn trades(&self) -> &[SimTrade] {
        &self.trades
    }

    /// Get total commission paid.
    #[must_use]
    pub fn total_commission(&self) -> Decimal {
        self.total_commission
    }

    /// Set average volume for an instrument.
    pub fn set_avg_volume(&mut self, instrument_id: &str, volume: Decimal) {
        self.avg_volumes.insert(instrument_id.to_string(), volume);
    }

    /// Process a new candle for all open orders and positions.
    pub fn process_candle(&mut self, instrument_id: &str, candle: &Candle) {
        self.current_time.clone_from(&candle.timestamp);

        // Store candle history
        self.candle_history
            .entry(instrument_id.to_string())
            .or_default()
            .push(candle.clone());

        // Process open orders for this instrument
        let order_ids: Vec<String> = self
            .open_orders
            .iter()
            .filter(|(_, o)| o.instrument_id == instrument_id && !o.is_terminal())
            .map(|(id, _)| id.clone())
            .collect();

        for order_id in order_ids {
            self.process_order(&order_id, candle);
        }

        // Update position P&L
        if let Some(position) = self.positions.get_mut(instrument_id) {
            position.update_unrealized_pnl(candle.close);

            // Check stop/target triggers
            if !position.is_flat() {
                self.check_position_triggers(instrument_id, candle);
            }
        }
    }

    /// Process an individual order against a candle.
    fn process_order(&mut self, order_id: &str, candle: &Candle) {
        let order = match self.open_orders.get(order_id) {
            Some(o) => o.clone(),
            None => return,
        };

        if order.is_terminal() {
            return;
        }

        let avg_volume = self.avg_volumes.get(&order.instrument_id).copied();
        let is_entry = matches!(order.purpose, OrderPurpose::Entry | OrderPurpose::ScaleIn);

        let fill_result = simulate_order(
            order.order_type,
            order.side,
            order.remaining_quantity(),
            order.limit_price,
            order.stop_price,
            candle,
            &self.config,
            is_entry,
            avg_volume,
        );

        if fill_result.filled {
            self.apply_fill(order_id, &fill_result, candle);
        }
    }

    /// Apply a fill to an order.
    fn apply_fill(&mut self, order_id: &str, fill: &FillResult, candle: &Candle) {
        let fill_price = fill.price.unwrap_or(candle.close);

        // Extract data needed for position update before mutable borrow
        let (instrument_id, side, instrument_type) = {
            let order = match self.open_orders.get_mut(order_id) {
                Some(o) => o,
                None => return,
            };

            // Apply fill to partial fill state
            if let Some(pf_state) = &mut order.partial_fill_state {
                use crate::models::ExecutionFill;

                pf_state.apply_fill(ExecutionFill {
                    fill_id: format!("{}-fill-{}", order_id, pf_state.fills.len()),
                    quantity: fill.filled_quantity,
                    price: fill_price,
                    timestamp: candle.timestamp.clone(),
                    venue: "BACKTEST".to_string(),
                    liquidity: None,
                    commission: None,
                });

                // Update order state
                if pf_state.is_filled() {
                    order.state = SimOrderState::Filled;
                } else if pf_state.is_partial() {
                    order.state = SimOrderState::PartiallyFilled;
                }
            }

            order.updated_at.clone_from(&candle.timestamp);

            // Determine instrument type
            let instrument_type = if order.instrument_id.len() > 15 {
                InstrumentType::Option
            } else {
                InstrumentType::Equity
            };

            (order.instrument_id.clone(), order.side, instrument_type)
        };

        // Calculate commission
        let commission = calculate_commission(
            &self.config.commission,
            instrument_type,
            side,
            fill.filled_quantity,
            fill_price,
        );

        self.total_commission += commission;

        // Update position (now safe - order borrow has ended)
        self.update_position(
            &instrument_id,
            side,
            fill.filled_quantity,
            fill_price,
            commission,
        );

        debug!(
            order_id = %order_id,
            fill_price = %fill_price,
            quantity = %fill.filled_quantity,
            commission = %commission,
            "Order filled"
        );
    }

    /// Update position after a fill.
    fn update_position(
        &mut self,
        instrument_id: &str,
        side: OrderSide,
        quantity: Decimal,
        price: Decimal,
        commission: Decimal,
    ) {
        let position = self
            .positions
            .entry(instrument_id.to_string())
            .or_insert_with(|| SimPosition::new(instrument_id, Decimal::ZERO, Decimal::ZERO));

        let qty_change = match side {
            OrderSide::Buy => quantity,
            OrderSide::Sell => -quantity,
        };

        let old_qty = position.quantity;
        let new_qty = old_qty + qty_change;

        // Update average entry price for increasing position
        if (old_qty >= Decimal::ZERO && qty_change > Decimal::ZERO)
            || (old_qty <= Decimal::ZERO && qty_change < Decimal::ZERO)
        {
            let old_value = old_qty.abs() * position.avg_entry_price;
            let new_value = qty_change.abs() * price;
            let total_qty = old_qty.abs() + qty_change.abs();

            if total_qty > Decimal::ZERO {
                position.avg_entry_price = (old_value + new_value) / total_qty;
            }
        }

        // Calculate realized P&L for closing trades
        if (old_qty > Decimal::ZERO && qty_change < Decimal::ZERO)
            || (old_qty < Decimal::ZERO && qty_change > Decimal::ZERO)
        {
            let closed_qty = qty_change.abs().min(old_qty.abs());
            // Manual signum: 1 for positive, -1 for negative
            let signum = if old_qty > Decimal::ZERO {
                Decimal::ONE
            } else {
                -Decimal::ONE
            };
            let pnl = (price - position.avg_entry_price) * closed_qty * signum;
            position.realized_pnl += pnl;
        }

        position.quantity = new_qty;
        position.commission_paid += commission;
    }

    /// Check and process stop/target triggers for a position.
    fn check_position_triggers(&mut self, instrument_id: &str, candle: &Candle) {
        let position = match self.positions.get(instrument_id) {
            Some(p) => p.clone(),
            None => return,
        };

        let result = evaluate_triggers(
            position.direction(),
            position.stop_loss,
            position.take_profit,
            candle,
            &self.config.stop_target,
        );

        if let Some(fill_price) = result.fill_price() {
            let exit_reason = match &result {
                TriggerResult::Stop { .. } => "STOP",
                TriggerResult::Target { .. } => "TARGET",
                TriggerResult::BothTriggered { selected, .. } => {
                    if *selected == TriggerType::Stop {
                        "STOP"
                    } else {
                        "TARGET"
                    }
                }
                TriggerResult::None => return,
            };

            info!(
                instrument = %instrument_id,
                exit_reason = %exit_reason,
                price = %fill_price,
                "Position trigger hit"
            );

            // Close position
            let exit_side = result.fill_side().unwrap_or(OrderSide::Sell);
            let close_qty = position.quantity.abs();

            let commission = calculate_commission(
                &self.config.commission,
                InstrumentType::Equity,
                exit_side,
                close_qty,
                fill_price,
            );

            self.total_commission += commission;
            self.update_position(instrument_id, exit_side, close_qty, fill_price, commission);

            // Record trade
            if let Some(pos) = self.positions.get(instrument_id) {
                self.trades.push(SimTrade {
                    trade_id: format!("trade-{}", self.trades.len() + 1),
                    instrument_id: instrument_id.to_string(),
                    side: if position.quantity > Decimal::ZERO {
                        "LONG".to_string()
                    } else {
                        "SHORT".to_string()
                    },
                    entry_time: position.opened_at.clone(),
                    entry_price: position.avg_entry_price,
                    entry_slippage: Decimal::ZERO,
                    exit_time: candle.timestamp.clone(),
                    exit_price: fill_price,
                    exit_slippage: Decimal::ZERO,
                    exit_reason: exit_reason.to_string(),
                    quantity: close_qty,
                    gross_pnl: pos.realized_pnl,
                    commission: pos.commission_paid,
                    net_pnl: pos.realized_pnl - pos.commission_paid,
                    holding_period_hours: calculate_holding_period_hours(
                        &position.opened_at,
                        &candle.timestamp,
                    ),
                });
            }
        }
    }

    /// Clean up expired and filled orders.
    pub fn cleanup_orders(&mut self) {
        let terminal_ids: Vec<String> = self
            .open_orders
            .iter()
            .filter(|(_, o)| o.is_terminal())
            .map(|(id, _)| id.clone())
            .collect();

        for id in terminal_ids {
            self.open_orders.remove(&id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_candle(open: i64, high: i64, low: i64, close: i64) -> Candle {
        Candle {
            open: Decimal::new(open, 2),
            high: Decimal::new(high, 2),
            low: Decimal::new(low, 2),
            close: Decimal::new(close, 2),
            volume: Decimal::new(100000, 0),
            timestamp: "2026-01-05T10:00:00Z".to_string(),
        }
    }

    #[test]
    fn test_simulation_engine_creation() {
        let config = BacktestConfig::default();
        let engine = SimulationEngine::new(config);

        assert!(engine.open_orders().is_empty());
        assert!(engine.positions().is_empty());
    }

    #[test]
    fn test_submit_market_order() {
        let config = BacktestConfig::default();
        let mut engine = SimulationEngine::new(config);

        let order = SimOrder::new(
            "",
            "AAPL",
            OrderSide::Buy,
            OrderType::Market,
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        let order_id = engine.submit_order(order);

        let submitted = engine.get_order(&order_id).unwrap();
        assert_eq!(submitted.state, SimOrderState::Pending);
    }

    #[test]
    fn test_market_order_fill() {
        let config = BacktestConfig::default();
        let mut engine = SimulationEngine::new(config);

        let order = SimOrder::new(
            "",
            "AAPL",
            OrderSide::Buy,
            OrderType::Market,
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );

        let order_id = engine.submit_order(order);
        let candle = make_candle(15000, 15100, 14900, 15050);

        engine.process_candle("AAPL", &candle);

        let filled = engine.get_order(&order_id).unwrap();
        assert_eq!(filled.state, SimOrderState::Filled);
        assert!(filled.filled_quantity() > Decimal::ZERO);

        let position = engine.get_position("AAPL").unwrap();
        assert_eq!(position.quantity, Decimal::new(100, 0));
    }

    #[test]
    fn test_limit_order_fill() {
        let config = BacktestConfig::default();
        let mut engine = SimulationEngine::new(config);

        let order = SimOrder::new(
            "",
            "AAPL",
            OrderSide::Buy,
            OrderType::Limit,
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        )
        .with_limit_price(Decimal::new(14800, 2)); // Limit at $148.00

        let order_id = engine.submit_order(order);

        // First candle doesn't fill (low = $149.00)
        let candle1 = make_candle(15000, 15100, 14900, 15050);
        engine.process_candle("AAPL", &candle1);

        let order = engine.get_order(&order_id).unwrap();
        assert_eq!(order.state, SimOrderState::Pending);

        // Second candle fills (low = $147.00)
        let candle2 = make_candle(15000, 15100, 14700, 14900);
        engine.process_candle("AAPL", &candle2);

        let filled = engine.get_order(&order_id).unwrap();
        assert_eq!(filled.state, SimOrderState::Filled);
    }

    #[test]
    fn test_cancel_order() {
        let config = BacktestConfig::default();
        let mut engine = SimulationEngine::new(config);

        let order = SimOrder::new(
            "",
            "AAPL",
            OrderSide::Buy,
            OrderType::Limit,
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        )
        .with_limit_price(Decimal::new(14000, 2)); // Won't fill

        let order_id = engine.submit_order(order);
        assert!(engine.cancel_order(&order_id));

        let cancelled = engine.get_order(&order_id).unwrap();
        assert_eq!(cancelled.state, SimOrderState::Cancelled);
    }

    #[test]
    fn test_position_tracking() {
        let config = BacktestConfig::default();
        let mut engine = SimulationEngine::new(config);

        // Buy 100 shares
        let buy_order = SimOrder::new(
            "",
            "AAPL",
            OrderSide::Buy,
            OrderType::Market,
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );
        engine.submit_order(buy_order);

        let candle1 = make_candle(15000, 15100, 14900, 15050);
        engine.process_candle("AAPL", &candle1);

        let position = engine.get_position("AAPL").unwrap();
        assert_eq!(position.quantity, Decimal::new(100, 0));
        assert!(position.avg_entry_price > Decimal::ZERO);

        // Sell 50 shares
        let sell_order = SimOrder::new(
            "",
            "AAPL",
            OrderSide::Sell,
            OrderType::Market,
            Decimal::new(50, 0),
            OrderPurpose::ScaleOut,
        );
        engine.submit_order(sell_order);

        let candle2 = make_candle(15100, 15200, 15000, 15150);
        engine.process_candle("AAPL", &candle2);

        let position = engine.get_position("AAPL").unwrap();
        assert_eq!(position.quantity, Decimal::new(50, 0));
    }

    #[test]
    fn test_commission_tracking() {
        let config = BacktestConfig::default();
        let mut engine = SimulationEngine::new(config);

        let order = SimOrder::new(
            "",
            "AAPL",
            OrderSide::Buy,
            OrderType::Market,
            Decimal::new(100, 0),
            OrderPurpose::Entry,
        );
        engine.submit_order(order);

        let candle = make_candle(15000, 15100, 14900, 15050);
        engine.process_candle("AAPL", &candle);

        // Buy has no fees for equity (commission-free broker)
        // But position should track commission for consistency
        let position = engine.get_position("AAPL").unwrap();
        assert!(position.commission_paid >= Decimal::ZERO);
    }

    #[test]
    fn test_sim_order_state_conversion() {
        assert_eq!(OrderStatus::from(SimOrderState::New), OrderStatus::New);
        assert_eq!(
            OrderStatus::from(SimOrderState::Pending),
            OrderStatus::Accepted
        );
        assert_eq!(
            OrderStatus::from(SimOrderState::Filled),
            OrderStatus::Filled
        );
        assert_eq!(
            OrderStatus::from(SimOrderState::Rejected),
            OrderStatus::Rejected
        );
    }

    #[test]
    fn test_calculate_holding_period_hours_valid() {
        // Entry at 10:00, exit at 14:00 = 4 hours
        let entry = "2026-01-05T10:00:00Z";
        let exit = "2026-01-05T14:00:00Z";
        let hours = calculate_holding_period_hours(entry, exit);
        assert!((hours - 4.0).abs() < 0.001);
    }

    #[test]
    fn test_calculate_holding_period_hours_multi_day() {
        // Entry on day 1 at 10:00, exit on day 2 at 10:00 = 24 hours
        let entry = "2026-01-05T10:00:00Z";
        let exit = "2026-01-06T10:00:00Z";
        let hours = calculate_holding_period_hours(entry, exit);
        assert!((hours - 24.0).abs() < 0.001);
    }

    #[test]
    fn test_calculate_holding_period_hours_fractional() {
        // Entry at 10:00, exit at 10:30 = 0.5 hours
        let entry = "2026-01-05T10:00:00Z";
        let exit = "2026-01-05T10:30:00Z";
        let hours = calculate_holding_period_hours(entry, exit);
        assert!((hours - 0.5).abs() < 0.001);
    }

    #[test]
    fn test_calculate_holding_period_hours_invalid_entry() {
        let entry = "not-a-valid-timestamp";
        let exit = "2026-01-05T14:00:00Z";
        let hours = calculate_holding_period_hours(entry, exit);
        assert!((hours - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_calculate_holding_period_hours_invalid_exit() {
        let entry = "2026-01-05T10:00:00Z";
        let exit = "invalid";
        let hours = calculate_holding_period_hours(entry, exit);
        assert!((hours - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_calculate_holding_period_hours_negative_returns_zero() {
        // Exit before entry (shouldn't happen, but should return 0)
        let entry = "2026-01-05T14:00:00Z";
        let exit = "2026-01-05T10:00:00Z";
        let hours = calculate_holding_period_hours(entry, exit);
        assert!((hours - 0.0).abs() < 0.001);
    }
}
