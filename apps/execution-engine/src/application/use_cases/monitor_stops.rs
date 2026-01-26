//! Monitor Stops Use Case

use std::sync::Arc;

use crate::application::ports::{BrokerPort, PriceFeedPort};
use crate::domain::order_execution::value_objects::{OrderPurpose, OrderSide};
use crate::domain::shared::{OrderId, Symbol};
use crate::domain::stop_enforcement::{
    MonitoredPosition, PriceMonitor, StopsConfig, TriggerResult,
};

/// Result of a stop trigger.
#[derive(Debug, Clone)]
pub struct StopTriggerResult {
    /// Position ID that was triggered.
    pub position_id: String,
    /// What type of trigger occurred.
    pub trigger_type: String,
    /// Price at trigger.
    pub trigger_price: rust_decimal::Decimal,
    /// Order ID of the exit order (if submitted).
    pub exit_order_id: Option<String>,
    /// Error if exit order failed.
    pub error: Option<String>,
}

/// Use case for monitoring stops and triggering exits.
pub struct MonitorStopsUseCase<B, P>
where
    B: BrokerPort,
    P: PriceFeedPort,
{
    broker: Arc<B>,
    price_feed: Arc<P>,
    monitor: PriceMonitor,
}

impl<B, P> MonitorStopsUseCase<B, P>
where
    B: BrokerPort,
    P: PriceFeedPort,
{
    /// Create a new `MonitorStopsUseCase` with default config.
    pub fn new(broker: Arc<B>, price_feed: Arc<P>) -> Self {
        Self {
            broker,
            price_feed,
            monitor: PriceMonitor::new(),
        }
    }

    /// Create with custom configuration.
    pub fn with_config(broker: Arc<B>, price_feed: Arc<P>, config: StopsConfig) -> Self {
        Self {
            broker,
            price_feed,
            monitor: PriceMonitor::with_config(config),
        }
    }

    /// Add a position to monitor.
    pub fn add_position(&mut self, position: MonitoredPosition) {
        self.monitor.add_position(position);
    }

    /// Remove a position from monitoring.
    pub fn remove_position(&mut self, position_id: &OrderId) {
        self.monitor.remove_position(position_id);
    }

    /// Check prices and trigger stops.
    ///
    /// Returns any triggers that occurred.
    pub async fn check_and_trigger(&mut self) -> Vec<StopTriggerResult> {
        let mut results = Vec::new();

        // Get all monitored instruments
        let instrument_ids: Vec<_> = self
            .monitor
            .positions()
            .filter(|p| p.is_active())
            .map(|p| p.instrument_id().clone())
            .collect();

        // Check prices for each
        for instrument_id in instrument_ids {
            let symbol = Symbol::new(instrument_id.as_str());

            // Get current price
            let price = match self.price_feed.get_last_price(&instrument_id).await {
                Ok(p) => p,
                Err(e) => {
                    tracing::warn!("Failed to get price for {}: {}", instrument_id, e);
                    continue;
                }
            };

            // Check for triggers
            let triggers = self.monitor.check_price(&instrument_id, price);

            // Process triggers
            for (position_id, trigger) in triggers {
                let result = match &trigger {
                    TriggerResult::StopLoss { price, .. } => {
                        self.process_trigger(&position_id, &symbol, *price, "stop_loss")
                            .await
                    }
                    TriggerResult::TakeProfit { price, .. } => {
                        self.process_trigger(&position_id, &symbol, *price, "take_profit")
                            .await
                    }
                    TriggerResult::None => continue,
                };

                results.push(result);
            }
        }

        results
    }

    /// Process a trigger and submit exit order.
    async fn process_trigger(
        &mut self,
        position_id: &OrderId,
        symbol: &Symbol,
        trigger_price: rust_decimal::Decimal,
        trigger_type: &str,
    ) -> StopTriggerResult {
        // Get position info for exit order
        let Some(position) = self.monitor.get_position(position_id) else {
            return StopTriggerResult {
                position_id: position_id.to_string(),
                trigger_type: trigger_type.to_string(),
                trigger_price,
                exit_order_id: None,
                error: Some("Position not found".to_string()),
            };
        };

        let quantity = position.quantity();

        // Determine exit order parameters based on trigger type
        let (exit_side, _purpose) = match trigger_type {
            "stop_loss" => (OrderSide::Sell, OrderPurpose::StopLoss),
            // take_profit or any other trigger type defaults to Exit
            _ => (OrderSide::Sell, OrderPurpose::Exit),
        };

        // Build and submit exit order
        let exit_order_id = format!("exit-{position_id}");
        let request = crate::application::ports::SubmitOrderRequest::market(
            OrderId::new(&exit_order_id),
            symbol.clone(),
            exit_side,
            quantity,
        );

        match self.broker.submit_order(request).await {
            Ok(_ack) => {
                // Deactivate the position
                self.monitor.remove_position(position_id);

                StopTriggerResult {
                    position_id: position_id.to_string(),
                    trigger_type: trigger_type.to_string(),
                    trigger_price,
                    exit_order_id: Some(exit_order_id),
                    error: None,
                }
            }
            Err(e) => StopTriggerResult {
                position_id: position_id.to_string(),
                trigger_type: trigger_type.to_string(),
                trigger_price,
                exit_order_id: None,
                error: Some(format!("Failed to submit exit order: {e}")),
            },
        }
    }

    /// Get the number of actively monitored positions.
    #[must_use]
    pub fn active_count(&self) -> usize {
        self.monitor.active_count()
    }

    /// Get the monitoring interval in milliseconds.
    #[must_use]
    pub const fn monitoring_interval_ms(&self) -> u64 {
        self.monitor.monitoring_interval_ms()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::ports::{BrokerError, OrderAck, PriceFeedError, Quote};
    use crate::domain::order_execution::value_objects::OrderStatus;
    use crate::domain::shared::{BrokerId, InstrumentId};
    use crate::domain::stop_enforcement::StopTargetLevels;
    use async_trait::async_trait;
    use rust_decimal::Decimal;
    use std::collections::HashMap;
    use std::sync::RwLock;

    struct MockBroker {
        submitted_orders: RwLock<Vec<crate::application::ports::SubmitOrderRequest>>,
    }

    impl MockBroker {
        fn new() -> Self {
            Self {
                submitted_orders: RwLock::new(vec![]),
            }
        }
    }

    #[async_trait]
    impl BrokerPort for MockBroker {
        async fn submit_order(
            &self,
            request: crate::application::ports::SubmitOrderRequest,
        ) -> Result<OrderAck, BrokerError> {
            let mut orders = self
                .submitted_orders
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            orders.push(request.clone());
            Ok(OrderAck {
                broker_order_id: BrokerId::new("exit-broker-123"),
                client_order_id: request.client_order_id,
                status: OrderStatus::Accepted,
                filled_qty: Decimal::ZERO,
                avg_fill_price: None,
            })
        }

        async fn cancel_order(
            &self,
            _request: crate::application::ports::CancelOrderRequest,
        ) -> Result<(), BrokerError> {
            Ok(())
        }

        async fn get_order(&self, _broker_order_id: &BrokerId) -> Result<OrderAck, BrokerError> {
            Err(BrokerError::OrderNotFound {
                order_id: "unknown".to_string(),
            })
        }

        async fn get_open_orders(&self) -> Result<Vec<OrderAck>, BrokerError> {
            Ok(vec![])
        }

        async fn get_buying_power(&self) -> Result<Decimal, BrokerError> {
            Ok(Decimal::new(100_000, 0))
        }

        async fn get_position(
            &self,
            _instrument_id: &InstrumentId,
        ) -> Result<Option<Decimal>, BrokerError> {
            Ok(None)
        }

        async fn get_all_positions(
            &self,
        ) -> Result<Vec<crate::application::ports::PositionInfo>, BrokerError> {
            Ok(vec![])
        }
    }

    struct MockPriceFeed {
        prices: RwLock<HashMap<String, Decimal>>,
    }

    impl MockPriceFeed {
        fn new() -> Self {
            Self {
                prices: RwLock::new(HashMap::new()),
            }
        }

        fn set_price(&self, symbol: &str, price: Decimal) {
            let mut prices = self
                .prices
                .write()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            prices.insert(symbol.to_string(), price);
        }
    }

    #[async_trait]
    impl PriceFeedPort for MockPriceFeed {
        async fn get_quote(&self, symbol: &Symbol) -> Result<Quote, PriceFeedError> {
            let prices = self
                .prices
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let price = prices
                .get(symbol.as_str())
                .copied()
                .unwrap_or(Decimal::ZERO);
            Ok(Quote::new(
                symbol.clone(),
                price,
                price + Decimal::new(1, 2),
                Decimal::new(100, 0),
                Decimal::new(100, 0),
            ))
        }

        async fn get_quotes(&self, symbols: &[Symbol]) -> Result<Vec<Quote>, PriceFeedError> {
            let mut quotes = vec![];
            for symbol in symbols {
                quotes.push(self.get_quote(symbol).await?);
            }
            Ok(quotes)
        }

        async fn subscribe(&self, _symbol: &Symbol) -> Result<(), PriceFeedError> {
            Ok(())
        }

        async fn unsubscribe(&self, _symbol: &Symbol) -> Result<(), PriceFeedError> {
            Ok(())
        }

        async fn get_last_price(
            &self,
            instrument_id: &InstrumentId,
        ) -> Result<Decimal, PriceFeedError> {
            let prices = self
                .prices
                .read()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            prices
                .get(instrument_id.as_str())
                .copied()
                .ok_or(PriceFeedError::DataUnavailable)
        }
    }

    fn create_long_position(position_id: &str, instrument_id: &str) -> MonitoredPosition {
        let levels = StopTargetLevels::for_long(
            Decimal::new(100, 0),
            Decimal::new(95, 0),
            Decimal::new(110, 0),
        );
        MonitoredPosition::new(
            OrderId::new(position_id),
            InstrumentId::new(instrument_id),
            Decimal::new(100, 0),
            levels,
        )
    }

    #[tokio::test]
    async fn monitor_stops_no_trigger() {
        let broker = Arc::new(MockBroker::new());
        let price_feed = Arc::new(MockPriceFeed::new());
        price_feed.set_price("AAPL", Decimal::new(100, 0));

        let mut use_case = MonitorStopsUseCase::new(broker, price_feed);
        use_case.add_position(create_long_position("pos-1", "AAPL"));

        let results = use_case.check_and_trigger().await;
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn monitor_stops_stop_loss_trigger() {
        let broker = Arc::new(MockBroker::new());
        let price_feed = Arc::new(MockPriceFeed::new());
        price_feed.set_price("AAPL", Decimal::new(94, 0)); // Below stop at 95

        let mut use_case = MonitorStopsUseCase::new(broker.clone(), price_feed);
        use_case.add_position(create_long_position("pos-1", "AAPL"));

        let results = use_case.check_and_trigger().await;
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].trigger_type, "stop_loss");
        assert!(results[0].exit_order_id.is_some());

        // Verify order was submitted
        let submitted = broker
            .submitted_orders
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        assert_eq!(submitted.len(), 1);
    }

    #[tokio::test]
    async fn monitor_stops_take_profit_trigger() {
        let broker = Arc::new(MockBroker::new());
        let price_feed = Arc::new(MockPriceFeed::new());
        price_feed.set_price("AAPL", Decimal::new(111, 0)); // Above target at 110

        let mut use_case = MonitorStopsUseCase::new(broker.clone(), price_feed);
        use_case.add_position(create_long_position("pos-1", "AAPL"));

        let results = use_case.check_and_trigger().await;
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].trigger_type, "take_profit");
        assert!(results[0].exit_order_id.is_some());
    }

    #[tokio::test]
    async fn monitor_stops_active_count() {
        let broker = Arc::new(MockBroker::new());
        let price_feed = Arc::new(MockPriceFeed::new());

        let mut use_case = MonitorStopsUseCase::new(broker, price_feed);
        assert_eq!(use_case.active_count(), 0);

        use_case.add_position(create_long_position("pos-1", "AAPL"));
        assert_eq!(use_case.active_count(), 1);

        use_case.remove_position(&OrderId::new("pos-1"));
        assert_eq!(use_case.active_count(), 0);
    }

    #[tokio::test]
    async fn monitor_stops_with_config() {
        let broker = Arc::new(MockBroker::new());
        let price_feed = Arc::new(MockPriceFeed::new());
        let config = StopsConfig::default();

        let use_case = MonitorStopsUseCase::with_config(broker, price_feed, config);
        assert!(use_case.monitoring_interval_ms() > 0);
    }

    #[tokio::test]
    async fn monitor_stops_monitoring_interval() {
        let broker = Arc::new(MockBroker::new());
        let price_feed = Arc::new(MockPriceFeed::new());

        let use_case = MonitorStopsUseCase::new(broker, price_feed);
        // Default interval should be reasonable
        assert!(use_case.monitoring_interval_ms() >= 100);
    }

    #[tokio::test]
    async fn monitor_stops_price_fetch_error_continues() {
        // Test that price fetch error doesn't crash - just skips that instrument
        let broker = Arc::new(MockBroker::new());
        let price_feed = Arc::new(MockPriceFeed::new());
        // Don't set price for "AAPL" - will cause DataUnavailable error

        let mut use_case = MonitorStopsUseCase::new(broker, price_feed);
        use_case.add_position(create_long_position("pos-1", "AAPL"));

        // Should not panic, just skip the position with missing price
        let results = use_case.check_and_trigger().await;
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn monitor_stops_multiple_positions_one_triggers() {
        let broker = Arc::new(MockBroker::new());
        let price_feed = Arc::new(MockPriceFeed::new());

        // AAPL will trigger stop loss (94 < 95)
        price_feed.set_price("AAPL", Decimal::new(94, 0));
        // MSFT will not trigger (100 is between 95 and 110)
        price_feed.set_price("MSFT", Decimal::new(100, 0));

        let mut use_case = MonitorStopsUseCase::new(broker.clone(), price_feed);
        use_case.add_position(create_long_position("pos-1", "AAPL"));
        use_case.add_position(create_long_position("pos-2", "MSFT"));

        let results = use_case.check_and_trigger().await;
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].trigger_type, "stop_loss");

        // Verify one order was submitted for AAPL exit
        let submitted = broker
            .submitted_orders
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        assert_eq!(submitted.len(), 1);
    }

    // Mock broker that fails on submit
    struct FailingBroker;

    #[async_trait]
    impl BrokerPort for FailingBroker {
        async fn submit_order(
            &self,
            _request: crate::application::ports::SubmitOrderRequest,
        ) -> Result<OrderAck, BrokerError> {
            Err(BrokerError::ConnectionError {
                message: "Broker unavailable".to_string(),
            })
        }

        async fn cancel_order(
            &self,
            _request: crate::application::ports::CancelOrderRequest,
        ) -> Result<(), BrokerError> {
            Ok(())
        }

        async fn get_order(&self, _broker_order_id: &BrokerId) -> Result<OrderAck, BrokerError> {
            Ok(OrderAck {
                broker_order_id: BrokerId::new("test"),
                client_order_id: OrderId::new("test"),
                status: OrderStatus::Accepted,
                filled_qty: Decimal::ZERO,
                avg_fill_price: None,
            })
        }

        async fn get_open_orders(&self) -> Result<Vec<OrderAck>, BrokerError> {
            Ok(vec![])
        }

        async fn get_buying_power(&self) -> Result<Decimal, BrokerError> {
            Ok(Decimal::new(100_000, 0))
        }

        async fn get_position(
            &self,
            _instrument_id: &InstrumentId,
        ) -> Result<Option<Decimal>, BrokerError> {
            Ok(None)
        }

        async fn get_all_positions(
            &self,
        ) -> Result<Vec<crate::application::ports::PositionInfo>, BrokerError> {
            Ok(vec![])
        }
    }

    #[tokio::test]
    async fn monitor_stops_broker_submit_error() {
        let broker = Arc::new(FailingBroker);
        let price_feed = Arc::new(MockPriceFeed::new());
        price_feed.set_price("AAPL", Decimal::new(94, 0)); // Triggers stop loss

        let mut use_case = MonitorStopsUseCase::new(broker, price_feed);
        use_case.add_position(create_long_position("pos-1", "AAPL"));

        let results = use_case.check_and_trigger().await;
        assert_eq!(results.len(), 1);
        assert!(results[0].error.is_some());
        assert!(
            results[0]
                .error
                .as_ref()
                .unwrap()
                .contains("Failed to submit exit order")
        );
        assert!(results[0].exit_order_id.is_none());
    }

    fn create_short_position(position_id: &str, instrument_id: &str) -> MonitoredPosition {
        let levels = StopTargetLevels::for_short(
            Decimal::new(100, 0), // Entry at 100
            Decimal::new(105, 0), // Stop at 105 (above entry)
            Decimal::new(90, 0),  // Target at 90 (below entry)
        );
        MonitoredPosition::new(
            OrderId::new(position_id),
            InstrumentId::new(instrument_id),
            Decimal::new(100, 0),
            levels,
        )
    }

    #[tokio::test]
    async fn monitor_stops_short_position_stop_loss() {
        let broker = Arc::new(MockBroker::new());
        let price_feed = Arc::new(MockPriceFeed::new());
        price_feed.set_price("AAPL", Decimal::new(106, 0)); // Above stop at 105

        let mut use_case = MonitorStopsUseCase::new(broker.clone(), price_feed);
        use_case.add_position(create_short_position("pos-1", "AAPL"));

        let results = use_case.check_and_trigger().await;
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].trigger_type, "stop_loss");
    }

    #[tokio::test]
    async fn monitor_stops_short_position_take_profit() {
        let broker = Arc::new(MockBroker::new());
        let price_feed = Arc::new(MockPriceFeed::new());
        price_feed.set_price("AAPL", Decimal::new(89, 0)); // Below target at 90

        let mut use_case = MonitorStopsUseCase::new(broker.clone(), price_feed);
        use_case.add_position(create_short_position("pos-1", "AAPL"));

        let results = use_case.check_and_trigger().await;
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].trigger_type, "take_profit");
    }

    #[tokio::test]
    async fn stop_trigger_result_fields() {
        let result = StopTriggerResult {
            position_id: "pos-123".to_string(),
            trigger_type: "stop_loss".to_string(),
            trigger_price: Decimal::new(95, 0),
            exit_order_id: Some("exit-pos-123".to_string()),
            error: None,
        };

        assert_eq!(result.position_id, "pos-123");
        assert_eq!(result.trigger_type, "stop_loss");
        assert_eq!(result.trigger_price, Decimal::new(95, 0));
        assert!(result.exit_order_id.is_some());
        assert!(result.error.is_none());

        // Test Clone and Debug
        let cloned = result.clone();
        assert_eq!(cloned.position_id, result.position_id);
        let _debug = format!("{result:?}");
    }
}
