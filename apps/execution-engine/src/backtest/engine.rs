//! Simulation engine for backtesting.

use std::collections::HashMap;

use rust_decimal::Decimal;
use tracing::{debug, info};

use super::commission::{InstrumentType, calculate_commission};
use super::config::BacktestConfig;
use super::fill_engine::{Candle, FillResult, simulate_order};
use super::order::{SimOrder, SimOrderState};
use super::position::SimPosition;
use super::trade::{SimTrade, calculate_holding_period_hours};
use super::triggers::{TriggerResult, TriggerType, evaluate_triggers};
use crate::models::{OrderPurpose, OrderSide, PartialFillState};

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
    pub const fn config(&self) -> &BacktestConfig {
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
        if let Some(order) = self.open_orders.get_mut(order_id)
            && !order.is_terminal()
        {
            order.state = SimOrderState::Cancelled;
            order.updated_at = chrono::Utc::now().to_rfc3339();
            info!(order_id = %order_id, "Order cancelled");
            return true;
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
    pub const fn positions(&self) -> &HashMap<String, SimPosition> {
        &self.positions
    }

    /// Get trade log.
    #[must_use]
    pub fn trades(&self) -> &[SimTrade] {
        &self.trades
    }

    /// Get total commission paid.
    #[must_use]
    pub const fn total_commission(&self) -> Decimal {
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
            let Some(order) = self.open_orders.get_mut(order_id) else {
                return;
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
    use crate::models::{OrderPurpose, OrderType};

    fn make_candle(open: i64, high: i64, low: i64, close: i64) -> Candle {
        Candle {
            open: Decimal::new(open, 2),
            high: Decimal::new(high, 2),
            low: Decimal::new(low, 2),
            close: Decimal::new(close, 2),
            volume: Decimal::new(100_000, 0),
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

        let Some(submitted) = engine.get_order(&order_id) else {
            panic!("submitted order should exist");
        };
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

        let Some(filled) = engine.get_order(&order_id) else {
            panic!("filled order should exist");
        };
        assert_eq!(filled.state, SimOrderState::Filled);
        assert!(filled.filled_quantity() > Decimal::ZERO);

        let Some(position) = engine.get_position("AAPL") else {
            panic!("position should exist after fill");
        };
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
        .with_limit_price(Decimal::new(14800, 2));

        let order_id = engine.submit_order(order);

        // First candle doesn't fill (low = $149.00)
        let candle1 = make_candle(15000, 15100, 14900, 15050);
        engine.process_candle("AAPL", &candle1);

        let Some(order) = engine.get_order(&order_id) else {
            panic!("pending order should exist");
        };
        assert_eq!(order.state, SimOrderState::Pending);

        // Second candle fills (low = $147.00)
        let candle2 = make_candle(15000, 15100, 14700, 14900);
        engine.process_candle("AAPL", &candle2);

        let Some(filled) = engine.get_order(&order_id) else {
            panic!("filled order should exist");
        };
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
        .with_limit_price(Decimal::new(14000, 2));

        let order_id = engine.submit_order(order);
        assert!(engine.cancel_order(&order_id));

        let Some(cancelled) = engine.get_order(&order_id) else {
            panic!("cancelled order should exist");
        };
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

        let Some(position) = engine.get_position("AAPL") else {
            panic!("position should exist after buy");
        };
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

        let Some(position) = engine.get_position("AAPL") else {
            panic!("position should exist after partial sell");
        };
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

        let Some(position) = engine.get_position("AAPL") else {
            panic!("position should exist");
        };
        assert!(position.commission_paid >= Decimal::ZERO);
    }
}
