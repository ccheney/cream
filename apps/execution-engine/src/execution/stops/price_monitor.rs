//! WebSocket-based price monitoring for options stop/target enforcement.
//!
//! Options don't support bracket orders on Alpaca, so we monitor prices via
//! WebSocket and submit market orders when stop/target levels are breached.

use rust_decimal::Decimal;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

use super::{StopsEnforcer, TriggerResult};
use crate::execution::AlpacaAdapter;
use crate::feed::AlpacaMessage;
use crate::models::{
    Action, Decision, Direction, Size, SizeUnit, StrategyFamily, ThesisState, TimeHorizon,
};

/// WebSocket-based price monitor for options positions.
///
/// Listens to quote updates from the feed and checks for stop/target triggers.
/// When a trigger is hit, it submits a market order to close the position.
pub struct StopsPriceMonitor {
    /// Shared stops enforcer with the gateway.
    stops_enforcer: Arc<RwLock<StopsEnforcer>>,
    /// Broker adapter for closing positions.
    adapter: Arc<AlpacaAdapter>,
}

impl StopsPriceMonitor {
    /// Create a new price monitor.
    #[must_use]
    pub const fn new(
        stops_enforcer: Arc<RwLock<StopsEnforcer>>,
        adapter: Arc<AlpacaAdapter>,
    ) -> Self {
        Self {
            stops_enforcer,
            adapter,
        }
    }

    /// Process a message from the feed.
    ///
    /// If the message is a quote, checks for stop/target triggers and
    /// closes positions if necessary.
    pub async fn process_message(&self, message: &AlpacaMessage) {
        if let AlpacaMessage::Quote {
            symbol, bid, ask, ..
        } = message
        {
            // Use mid price for trigger evaluation
            let mid_price = (*bid + *ask) / Decimal::TWO;
            self.check_and_handle_triggers(symbol, mid_price).await;
        }
    }

    /// Check for stop/target triggers and handle them.
    async fn check_and_handle_triggers(&self, symbol: &str, price: Decimal) {
        // Collect triggers with lock, then release before processing
        let triggers = self.stops_enforcer.read().await.check_price(symbol, price);

        for (position_id, trigger) in triggers {
            match trigger {
                TriggerResult::StopLoss {
                    price, timestamp, ..
                } => {
                    warn!(
                        position_id = %position_id,
                        symbol = %symbol,
                        trigger_price = %price,
                        timestamp = %timestamp,
                        "Stop loss triggered for options position"
                    );

                    // Close the position
                    self.close_position(&position_id, symbol, "stop_loss").await;
                }
                TriggerResult::TakeProfit {
                    price, timestamp, ..
                } => {
                    info!(
                        position_id = %position_id,
                        symbol = %symbol,
                        trigger_price = %price,
                        timestamp = %timestamp,
                        "Take profit triggered for options position"
                    );

                    // Close the position
                    self.close_position(&position_id, symbol, "take_profit")
                        .await;
                }
                TriggerResult::None => {}
            }
        }
    }

    /// Close a position via a market sell order.
    async fn close_position(&self, position_id: &str, symbol: &str, reason: &str) {
        // Get position details from the adapter
        match self.adapter.get_position(symbol).await {
            Ok(Some(position)) => {
                let qty = position.qty.abs();

                if qty == Decimal::ZERO {
                    info!(
                        position_id = %position_id,
                        symbol = %symbol,
                        "Position already closed"
                    );
                    return;
                }

                // Determine direction based on current position
                let is_long = position.qty > Decimal::ZERO;

                // Create close decision
                let decision = Decision {
                    decision_id: format!("close-{position_id}-{reason}"),
                    instrument_id: symbol.to_string(),
                    action: if is_long { Action::Sell } else { Action::Buy },
                    direction: if is_long {
                        Direction::Flat
                    } else {
                        Direction::Long
                    },
                    size: Size {
                        quantity: qty,
                        unit: SizeUnit::Contracts,
                    },
                    limit_price: None, // Market order
                    stop_loss_level: Decimal::ZERO,
                    take_profit_level: Decimal::ZERO,
                    strategy_family: StrategyFamily::OptionLong,
                    time_horizon: TimeHorizon::Intraday,
                    thesis_state: ThesisState::Exiting,
                    bullish_factors: vec![],
                    bearish_factors: vec![],
                    rationale: format!("{reason} triggered - closing position"),
                    confidence: Decimal::ONE,
                    legs: vec![],
                    net_limit_price: None,
                };

                info!(
                    position_id = %position_id,
                    symbol = %symbol,
                    qty = %qty,
                    reason = %reason,
                    "Submitting market order to close options position"
                );

                // Submit the close order (options use contracts, not PCT_EQUITY, so no equity needed)
                match self.adapter.submit_single_order(&decision, None).await {
                    Ok(order_state) => {
                        info!(
                            position_id = %position_id,
                            order_id = %order_state.order_id,
                            "Position close order submitted successfully"
                        );

                        // Remove from monitoring
                        let mut enforcer = self.stops_enforcer.write().await;
                        enforcer.stop_monitoring(position_id);
                    }
                    Err(e) => {
                        error!(
                            position_id = %position_id,
                            error = %e,
                            "Failed to submit position close order"
                        );
                    }
                }
            }
            Ok(None) => {
                info!(
                    position_id = %position_id,
                    symbol = %symbol,
                    "Position not found, may already be closed"
                );

                // Remove from monitoring
                let mut enforcer = self.stops_enforcer.write().await;
                enforcer.stop_monitoring(position_id);
            }
            Err(e) => {
                error!(
                    position_id = %position_id,
                    symbol = %symbol,
                    error = %e,
                    "Failed to get position details"
                );
            }
        }
    }
}

/// Run the price monitoring loop.
///
/// Listens to messages from the feed and processes them for stop/target triggers.
pub async fn run_price_monitor(
    monitor: Arc<StopsPriceMonitor>,
    mut rx: tokio::sync::mpsc::Receiver<AlpacaMessage>,
    mut shutdown_rx: tokio::sync::broadcast::Receiver<()>,
) {
    info!("Starting options price monitor for stop/target enforcement");

    loop {
        tokio::select! {
            Some(message) = rx.recv() => {
                monitor.process_message(&message).await;
            }
            _ = shutdown_rx.recv() => {
                info!("Price monitor shutting down");
                break;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution::stops::StopsConfig;
    use crate::models::Environment;

    fn make_test_enforcer() -> Arc<RwLock<StopsEnforcer>> {
        Arc::new(RwLock::new(StopsEnforcer::with_config(
            Environment::Paper,
            StopsConfig::default(),
        )))
    }

    #[test]
    fn test_monitor_creation() {
        // Can't easily test without a real adapter, but ensure the type compiles
        let _enforcer = make_test_enforcer();
    }
}
