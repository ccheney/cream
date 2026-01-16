//! Connection monitoring for broker health checks.
//!
//! Monitors broker connection health and triggers mass cancel on disconnect.
//!
//! # Architecture
//!
//! ```text
//! ConnectionMonitor
//!     │
//!     ├── health check loop ──► BrokerAdapter::health_check()
//!     │         │
//!     │         ▼
//!     ├── DisconnectHandler ──► Grace period management
//!     │         │
//!     │         ▼
//!     └── MassCancelEvent ──► Mass cancel trigger
//! ```

use std::sync::Arc;
use std::time::Duration;

use tokio::sync::broadcast;

use crate::execution::BrokerAdapter;
use crate::execution::OrderStateManager;
use crate::models::TimeInForce;

use super::mass_cancel::{
    DisconnectHandler, GtcOrderPolicy, MassCancelConfig, MassCancelEvent, MassCancelResult,
};

/// Connection monitor for broker health checks.
///
/// Runs a background task that periodically checks broker connectivity
/// and triggers mass cancel when connection is lost after grace period.
pub struct ConnectionMonitor<B: BrokerAdapter> {
    /// Broker adapter for health checks.
    adapter: Arc<B>,
    /// Configuration for mass cancel.
    config: MassCancelConfig,
    /// Order state manager for getting active orders.
    state_manager: Arc<OrderStateManager>,
}

impl<B: BrokerAdapter + 'static> ConnectionMonitor<B> {
    /// Create a new connection monitor.
    #[must_use]
    #[allow(clippy::missing_const_for_fn)] // Arc is not const-constructible
    pub fn new(
        adapter: Arc<B>,
        config: MassCancelConfig,
        state_manager: Arc<OrderStateManager>,
    ) -> Self {
        Self {
            adapter,
            config,
            state_manager,
        }
    }

    /// Run the connection monitor loop.
    ///
    /// This method runs until shutdown signal is received.
    pub async fn run(self, mut shutdown_rx: broadcast::Receiver<()>) {
        if !self.config.enabled {
            tracing::info!("Connection monitor disabled, skipping");
            return;
        }

        let (handler, mut event_rx) = DisconnectHandler::new(self.config.clone());
        let handler = Arc::new(handler);

        let heartbeat_interval = Duration::from_millis(self.config.heartbeat_interval_ms);
        let mut interval = tokio::time::interval(heartbeat_interval);

        tracing::info!(
            heartbeat_interval_ms = self.config.heartbeat_interval_ms,
            heartbeat_timeout_secs = self.config.heartbeat_timeout_seconds,
            grace_period_secs = self.config.grace_period_seconds,
            "Connection monitor started"
        );

        // Grace period tracking
        let mut grace_period_start: Option<std::time::Instant> = None;

        loop {
            tokio::select! {
                _ = interval.tick() => {
                    // Perform health check
                    match self.adapter.health_check().await {
                        Ok(()) => {
                            handler.record_heartbeat();
                            grace_period_start = None;
                            tracing::trace!("Broker health check passed");
                        }
                        Err(e) => {
                            tracing::warn!(error = %e, "Broker health check failed");
                            handler.mark_disconnected();

                            // Track grace period start
                            if grace_period_start.is_none() {
                                grace_period_start = Some(std::time::Instant::now());
                            }

                            // Check if grace period has expired
                            if let Some(start) = grace_period_start {
                                let elapsed = start.elapsed();
                                let grace_period = Duration::from_secs(self.config.grace_period_seconds);

                                if elapsed >= grace_period && handler.should_trigger_mass_cancel() {
                                    tracing::error!(
                                        elapsed_secs = elapsed.as_secs(),
                                        "Grace period expired, triggering mass cancel"
                                    );

                                    let result = self.execute_mass_cancel(handler.gtc_policy()).await;
                                    tracing::warn!(
                                        cancelled = result.cancelled_count,
                                        failed = result.failed_count,
                                        "Mass cancel completed"
                                    );

                                    // Reset grace period after mass cancel
                                    grace_period_start = None;
                                }
                            }
                        }
                    }
                }

                Some(event) = event_rx.recv() => {
                    match event {
                        MassCancelEvent::GracePeriodStarted { detected_at: _, expires_at: _ } => {
                            tracing::warn!("Grace period started due to broker disconnect");
                        }
                        MassCancelEvent::GracePeriodCancelled { reconnected_at: _ } => {
                            tracing::info!("Grace period cancelled, broker reconnected");
                            grace_period_start = None;
                        }
                        MassCancelEvent::MassCancelTriggered { triggered_at: _ } => {
                            tracing::error!("Mass cancel triggered by disconnect handler");
                        }
                        MassCancelEvent::MassCancelCompleted { result } => {
                            tracing::warn!(
                                cancelled = result.cancelled_count,
                                failed = result.failed_count,
                                "Mass cancel completed"
                            );
                        }
                        MassCancelEvent::ManualMassCancelTriggered => {
                            tracing::warn!("Manual mass cancel triggered");
                            let result = self.execute_mass_cancel(handler.gtc_policy()).await;
                            tracing::warn!(
                                cancelled = result.cancelled_count,
                                failed = result.failed_count,
                                "Manual mass cancel completed"
                            );
                        }
                    }
                }

                _ = shutdown_rx.recv() => {
                    tracing::info!("Connection monitor shutting down");
                    handler.shutdown();
                    break;
                }
            }
        }
    }

    /// Execute mass cancel for all active orders.
    async fn execute_mass_cancel(&self, gtc_policy: GtcOrderPolicy) -> MassCancelResult {
        let active_orders = self.state_manager.get_active_orders();

        if active_orders.is_empty() {
            tracing::info!("No active orders to cancel");
            return MassCancelResult::empty();
        }

        // Filter orders based on GTC policy
        let orders_to_cancel: Vec<_> = active_orders
            .iter()
            .filter(|order| match gtc_policy {
                GtcOrderPolicy::Include => true,
                GtcOrderPolicy::Exclude => order.time_in_force != TimeInForce::Gtc,
            })
            .collect();

        let mut cancelled_order_ids = Vec::new();
        let mut failed_order_ids = Vec::new();

        for order in orders_to_cancel {
            tracing::info!(
                order_id = %order.order_id,
                broker_order_id = %order.broker_order_id,
                instrument = %order.instrument_id,
                "Cancelling order due to disconnect"
            );

            match self.adapter.cancel_order(&order.broker_order_id).await {
                Ok(()) => {
                    cancelled_order_ids.push(order.order_id.clone());
                }
                Err(e) => {
                    tracing::error!(
                        order_id = %order.order_id,
                        error = %e,
                        "Failed to cancel order"
                    );
                    failed_order_ids.push(order.order_id.clone());
                }
            }
        }

        // Saturation is safe: order counts will never exceed u32::MAX in practice
        #[allow(clippy::cast_possible_truncation)]
        MassCancelResult {
            cancelled_count: cancelled_order_ids.len() as u32,
            failed_count: failed_order_ids.len() as u32,
            cancelled_order_ids,
            failed_order_ids,
            gtc_included: gtc_policy == GtcOrderPolicy::Include,
            completed_at: chrono::Utc::now(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::execution::BrokerError;
    use crate::models::{
        ExecutionAck, OrderSide, OrderState, OrderStatus, OrderType, SubmitOrdersRequest,
    };
    use async_trait::async_trait;
    use rust_decimal::Decimal;
    use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};

    /// Mock adapter that can simulate connection failures.
    struct MockHealthAdapter {
        healthy: AtomicBool,
        health_check_count: AtomicU32,
        cancel_count: AtomicU32,
    }

    impl MockHealthAdapter {
        fn new() -> Self {
            Self {
                healthy: AtomicBool::new(true),
                health_check_count: AtomicU32::new(0),
                cancel_count: AtomicU32::new(0),
            }
        }

        #[allow(dead_code)] // Available for future tests
        fn set_healthy(&self, healthy: bool) {
            self.healthy.store(healthy, Ordering::SeqCst);
        }

        fn health_check_count(&self) -> u32 {
            self.health_check_count.load(Ordering::SeqCst)
        }

        fn cancel_count(&self) -> u32 {
            self.cancel_count.load(Ordering::SeqCst)
        }
    }

    #[async_trait]
    impl BrokerAdapter for MockHealthAdapter {
        async fn submit_orders(
            &self,
            request: &SubmitOrdersRequest,
        ) -> Result<ExecutionAck, BrokerError> {
            Ok(ExecutionAck {
                cycle_id: request.cycle_id.clone(),
                environment: request.environment,
                ack_time: chrono::Utc::now().to_rfc3339(),
                orders: Vec::new(),
                errors: Vec::new(),
            })
        }

        async fn get_order_status(&self, broker_order_id: &str) -> Result<OrderState, BrokerError> {
            let now = chrono::Utc::now().to_rfc3339();
            Ok(OrderState {
                order_id: format!("order-{broker_order_id}"),
                broker_order_id: broker_order_id.to_string(),
                is_multi_leg: false,
                instrument_id: "AAPL".to_string(),
                status: OrderStatus::Accepted,
                side: OrderSide::Buy,
                order_type: OrderType::Market,
                time_in_force: TimeInForce::Day,
                requested_quantity: Decimal::new(100, 0),
                filled_quantity: Decimal::ZERO,
                avg_fill_price: Decimal::ZERO,
                limit_price: None,
                stop_price: None,
                submitted_at: now.clone(),
                last_update_at: now,
                status_message: String::new(),
                legs: Vec::new(),
            })
        }

        async fn cancel_order(&self, _broker_order_id: &str) -> Result<(), BrokerError> {
            self.cancel_count.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }

        fn broker_name(&self) -> &'static str {
            "MockHealth"
        }

        async fn health_check(&self) -> Result<(), BrokerError> {
            self.health_check_count.fetch_add(1, Ordering::SeqCst);
            if self.healthy.load(Ordering::SeqCst) {
                Ok(())
            } else {
                Err(BrokerError::Http("Connection failed".to_string()))
            }
        }
    }

    #[test]
    fn test_monitor_creation() {
        let adapter = Arc::new(MockHealthAdapter::new());
        let config = MassCancelConfig::default();
        let state_manager = Arc::new(OrderStateManager::new());

        let _monitor = ConnectionMonitor::new(adapter, config, state_manager);
    }

    #[tokio::test]
    async fn test_execute_mass_cancel_empty() {
        let adapter = Arc::new(MockHealthAdapter::new());
        let config = MassCancelConfig::default();
        let state_manager = Arc::new(OrderStateManager::new());

        let monitor = ConnectionMonitor::new(adapter.clone(), config, state_manager);
        let result = monitor.execute_mass_cancel(GtcOrderPolicy::Include).await;

        assert_eq!(result.cancelled_count, 0);
        assert_eq!(result.failed_count, 0);
        assert_eq!(adapter.cancel_count(), 0);
    }

    #[tokio::test]
    async fn test_execute_mass_cancel_with_orders() {
        let adapter = Arc::new(MockHealthAdapter::new());
        let config = MassCancelConfig::default();
        let state_manager = Arc::new(OrderStateManager::new());

        // Add some active orders
        let now = chrono::Utc::now().to_rfc3339();
        let order = OrderState {
            order_id: "test-order-1".to_string(),
            broker_order_id: "broker-1".to_string(),
            is_multi_leg: false,
            instrument_id: "AAPL".to_string(),
            status: OrderStatus::Accepted,
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            time_in_force: TimeInForce::Day,
            requested_quantity: Decimal::new(100, 0),
            filled_quantity: Decimal::ZERO,
            avg_fill_price: Decimal::ZERO,
            limit_price: Some(Decimal::new(150, 0)),
            stop_price: None,
            submitted_at: now.clone(),
            last_update_at: now,
            status_message: String::new(),
            legs: Vec::new(),
        };
        state_manager.insert(order);

        let monitor = ConnectionMonitor::new(adapter.clone(), config, state_manager);
        let result = monitor.execute_mass_cancel(GtcOrderPolicy::Include).await;

        assert_eq!(result.cancelled_count, 1);
        assert_eq!(result.failed_count, 0);
        assert_eq!(adapter.cancel_count(), 1);
    }

    #[tokio::test]
    async fn test_execute_mass_cancel_exclude_gtc() {
        let adapter = Arc::new(MockHealthAdapter::new());
        let config = MassCancelConfig::default();
        let state_manager = Arc::new(OrderStateManager::new());

        // Add day order and GTC order
        let now = chrono::Utc::now().to_rfc3339();
        let day_order = OrderState {
            order_id: "day-order".to_string(),
            broker_order_id: "broker-day".to_string(),
            is_multi_leg: false,
            instrument_id: "AAPL".to_string(),
            status: OrderStatus::Accepted,
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            time_in_force: TimeInForce::Day,
            requested_quantity: Decimal::new(100, 0),
            filled_quantity: Decimal::ZERO,
            avg_fill_price: Decimal::ZERO,
            limit_price: Some(Decimal::new(150, 0)),
            stop_price: None,
            submitted_at: now.clone(),
            last_update_at: now.clone(),
            status_message: String::new(),
            legs: Vec::new(),
        };
        let gtc_order = OrderState {
            order_id: "gtc-order".to_string(),
            broker_order_id: "broker-gtc".to_string(),
            is_multi_leg: false,
            instrument_id: "MSFT".to_string(),
            status: OrderStatus::Accepted,
            side: OrderSide::Buy,
            order_type: OrderType::Limit,
            time_in_force: TimeInForce::Gtc,
            requested_quantity: Decimal::new(50, 0),
            filled_quantity: Decimal::ZERO,
            avg_fill_price: Decimal::ZERO,
            limit_price: Some(Decimal::new(300, 0)),
            stop_price: None,
            submitted_at: now.clone(),
            last_update_at: now,
            status_message: String::new(),
            legs: Vec::new(),
        };
        state_manager.insert(day_order);
        state_manager.insert(gtc_order);

        let monitor = ConnectionMonitor::new(adapter.clone(), config, state_manager);
        let result = monitor.execute_mass_cancel(GtcOrderPolicy::Exclude).await;

        // Only day order should be cancelled
        assert_eq!(result.cancelled_count, 1);
        assert!(!result.gtc_included);
        assert_eq!(adapter.cancel_count(), 1);
    }

    #[tokio::test]
    async fn test_health_check_called() {
        let adapter = Arc::new(MockHealthAdapter::new());
        let config = MassCancelConfig {
            enabled: true,
            heartbeat_interval_ms: 10, // Very short for testing
            heartbeat_timeout_seconds: 1,
            grace_period_seconds: 60,
            gtc_policy: GtcOrderPolicy::Include,
        };
        let state_manager = Arc::new(OrderStateManager::new());

        let monitor = ConnectionMonitor::new(adapter.clone(), config, state_manager);
        let (shutdown_tx, _) = broadcast::channel(1);
        let shutdown_rx = shutdown_tx.subscribe();

        // Spawn monitor
        let handle = tokio::spawn(async move {
            monitor.run(shutdown_rx).await;
        });

        // Wait a bit for health checks
        tokio::time::sleep(Duration::from_millis(50)).await;

        // Send shutdown
        let _ = shutdown_tx.send(());
        let _ = handle.await;

        // Should have done at least one health check
        assert!(adapter.health_check_count() >= 1);
    }

    #[tokio::test]
    async fn test_monitor_disabled() {
        let adapter = Arc::new(MockHealthAdapter::new());
        let config = MassCancelConfig {
            enabled: false,
            ..Default::default()
        };
        let state_manager = Arc::new(OrderStateManager::new());

        let monitor = ConnectionMonitor::new(adapter.clone(), config, state_manager);
        let (shutdown_tx, _) = broadcast::channel(1);
        let shutdown_rx = shutdown_tx.subscribe();

        // Monitor should return immediately when disabled
        let handle = tokio::spawn(async move {
            monitor.run(shutdown_rx).await;
        });

        // Should complete quickly without doing any health checks
        let result = tokio::time::timeout(Duration::from_millis(100), handle).await;
        assert!(result.is_ok());
        assert_eq!(adapter.health_check_count(), 0);
    }
}
