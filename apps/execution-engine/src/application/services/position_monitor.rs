//! Position Monitor Service
//!
//! Real-time position monitoring with stop-loss and take-profit enforcement.
//! Integrates WebSocket streaming with the `MonitorStopsUseCase` for automatic
//! exit order submission when price triggers are hit.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU8, AtomicU32, Ordering};
use std::time::{Duration, Instant};

use parking_lot::{Mutex, RwLock};
use rust_decimal::Decimal;
use thiserror::Error;
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;

use crate::application::ports::{BrokerPort, PriceFeedPort, QuoteProviderPort, SubmitOrderRequest};
use crate::domain::order_execution::value_objects::OrderSide;
use crate::domain::shared::{InstrumentId, OrderId, Symbol};
use crate::domain::stop_enforcement::{
    MonitoredPosition, PositionDirection, PriceMonitor, StopsConfig, TriggerResult,
};

/// Configuration for the position monitor service.
#[derive(Debug, Clone)]
pub struct PositionMonitorConfig {
    /// Whether position monitoring is enabled.
    pub enabled: bool,
    /// Polling interval for REST fallback (milliseconds).
    pub polling_interval_ms: u64,
    /// Maximum quote age before considering it stale (seconds).
    pub max_quote_age_secs: u64,
    /// Whether to use market orders for exits.
    pub use_market_orders: bool,
    /// Exit order timeout (seconds).
    pub exit_order_timeout_secs: u64,
}

impl Default for PositionMonitorConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            polling_interval_ms: 500,
            max_quote_age_secs: 5,
            use_market_orders: true,
            exit_order_timeout_secs: 30,
        }
    }
}

/// Result of syncing positions from broker.
#[derive(Debug, Clone)]
pub struct SyncResult {
    /// Number of positions synced.
    pub positions_synced: usize,
    /// Symbols subscribed to.
    pub symbols_subscribed: Vec<String>,
    /// Any errors encountered.
    pub errors: Vec<String>,
}

/// Result of executing an exit order.
#[derive(Debug, Clone)]
pub struct ExitResult {
    /// Position ID that was exited.
    pub position_id: String,
    /// Symbol traded.
    pub symbol: String,
    /// Exit order ID.
    pub exit_order_id: Option<String>,
    /// Trigger type (`stop_loss` or `take_profit`).
    pub trigger_type: String,
    /// Trigger price.
    pub trigger_price: Decimal,
    /// Whether the exit was successful.
    pub success: bool,
    /// Error message if failed.
    pub error: Option<String>,
}

/// Position monitor errors.
#[derive(Debug, Error)]
pub enum PositionMonitorError {
    /// Service is not enabled.
    #[error("position monitor is not enabled")]
    NotEnabled,

    /// Position not found.
    #[error("position not found: {position_id}")]
    PositionNotFound {
        /// Position ID.
        position_id: String,
    },

    /// WebSocket connection error.
    #[error("websocket error: {message}")]
    WebSocketError {
        /// Error details.
        message: String,
    },

    /// Exit order failed.
    #[error("exit order failed for {position_id}: {message}")]
    ExitOrderFailed {
        /// Position ID.
        position_id: String,
        /// Error details.
        message: String,
    },

    /// Price feed error.
    #[error("price feed error: {message}")]
    PriceFeedError {
        /// Error details.
        message: String,
    },

    /// Circuit breaker is open.
    #[error("circuit breaker is open, exit orders temporarily disabled")]
    CircuitBreakerOpen,
}

/// Circuit breaker state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CircuitBreakerState {
    /// Closed - normal operation.
    Closed = 0,
    /// Open - temporarily blocking operations.
    Open = 1,
    /// Half-open - testing if service has recovered.
    HalfOpen = 2,
}

impl From<u8> for CircuitBreakerState {
    fn from(value: u8) -> Self {
        match value {
            1 => Self::Open,
            2 => Self::HalfOpen,
            _ => Self::Closed,
        }
    }
}

/// Circuit breaker for exit order failures.
#[derive(Debug)]
pub struct CircuitBreaker {
    failure_count: AtomicU32,
    last_failure: Mutex<Option<Instant>>,
    state: AtomicU8,
    failure_threshold: u32,
    open_duration: Duration,
}

impl CircuitBreaker {
    /// Default failure threshold before opening.
    pub const DEFAULT_FAILURE_THRESHOLD: u32 = 3;
    /// Default duration to stay open.
    pub const DEFAULT_OPEN_DURATION: Duration = Duration::from_secs(60);

    /// Create a new circuit breaker.
    #[must_use]
    #[allow(clippy::missing_const_for_fn)]
    pub fn new() -> Self {
        Self {
            failure_count: AtomicU32::new(0),
            last_failure: Mutex::new(None),
            state: AtomicU8::new(CircuitBreakerState::Closed as u8),
            failure_threshold: Self::DEFAULT_FAILURE_THRESHOLD,
            open_duration: Self::DEFAULT_OPEN_DURATION,
        }
    }

    /// Create with custom parameters.
    #[must_use]
    #[allow(clippy::missing_const_for_fn)]
    pub fn with_params(failure_threshold: u32, open_duration: Duration) -> Self {
        Self {
            failure_count: AtomicU32::new(0),
            last_failure: Mutex::new(None),
            state: AtomicU8::new(CircuitBreakerState::Closed as u8),
            failure_threshold,
            open_duration,
        }
    }

    /// Check if execution is allowed.
    #[must_use]
    pub fn can_execute(&self) -> bool {
        let state = CircuitBreakerState::from(self.state.load(Ordering::SeqCst));

        match state {
            CircuitBreakerState::Closed | CircuitBreakerState::HalfOpen => true,
            CircuitBreakerState::Open => {
                let last = self.last_failure.lock();
                if let Some(last_failure) = *last
                    && last_failure.elapsed() >= self.open_duration
                {
                    drop(last);
                    self.state
                        .store(CircuitBreakerState::HalfOpen as u8, Ordering::SeqCst);
                    return true;
                }
                false
            }
        }
    }

    /// Record a successful execution.
    pub fn record_success(&self) {
        self.failure_count.store(0, Ordering::SeqCst);
        self.state
            .store(CircuitBreakerState::Closed as u8, Ordering::SeqCst);
    }

    /// Record a failed execution.
    pub fn record_failure(&self) {
        let count = self.failure_count.fetch_add(1, Ordering::SeqCst) + 1;
        *self.last_failure.lock() = Some(Instant::now());

        if count >= self.failure_threshold {
            self.state
                .store(CircuitBreakerState::Open as u8, Ordering::SeqCst);
            tracing::warn!(
                failure_count = count,
                "Circuit breaker opened after {} consecutive failures",
                count
            );
        }
    }

    /// Get current state.
    #[must_use]
    pub fn state(&self) -> CircuitBreakerState {
        CircuitBreakerState::from(self.state.load(Ordering::SeqCst))
    }

    /// Get failure count.
    #[must_use]
    pub fn failure_count(&self) -> u32 {
        self.failure_count.load(Ordering::SeqCst)
    }
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        Self::new()
    }
}

/// Position monitor service for real-time stop/target enforcement.
pub struct PositionMonitorService<B, P, Q>
where
    B: BrokerPort,
    P: PriceFeedPort,
    Q: QuoteProviderPort,
{
    /// Configuration.
    config: PositionMonitorConfig,
    /// Broker adapter for submitting exit orders.
    broker: Arc<B>,
    /// Price feed for REST fallback.
    price_feed: Arc<P>,
    /// Quote provider for real-time quotes (WebSocket or Proxy).
    quote_provider: Arc<Q>,
    /// Price monitor domain service.
    monitor: Arc<RwLock<PriceMonitor>>,
    /// Mapping from symbol to position IDs monitoring that symbol.
    symbol_positions: Arc<RwLock<HashMap<String, Vec<OrderId>>>>,
    /// Circuit breaker for exit order failures.
    circuit_breaker: Arc<CircuitBreaker>,
    /// Cancellation token for graceful shutdown.
    shutdown: CancellationToken,
    /// Exit result sender for notifications.
    exit_tx: broadcast::Sender<ExitResult>,
}

impl<B, P, Q> PositionMonitorService<B, P, Q>
where
    B: BrokerPort + Send + Sync + 'static,
    P: PriceFeedPort + Send + Sync + 'static,
    Q: QuoteProviderPort + Send + Sync + 'static,
{
    /// Create a new position monitor service.
    #[must_use]
    pub fn new(
        broker: Arc<B>,
        price_feed: Arc<P>,
        quote_provider: Arc<Q>,
        shutdown: CancellationToken,
    ) -> Self {
        let (exit_tx, _) = broadcast::channel(64);

        Self {
            config: PositionMonitorConfig::default(),
            broker,
            price_feed,
            quote_provider,
            monitor: Arc::new(RwLock::new(PriceMonitor::new())),
            symbol_positions: Arc::new(RwLock::new(HashMap::new())),
            circuit_breaker: Arc::new(CircuitBreaker::new()),
            shutdown,
            exit_tx,
        }
    }

    /// Create with custom configuration.
    #[must_use]
    pub fn with_config(
        config: PositionMonitorConfig,
        broker: Arc<B>,
        price_feed: Arc<P>,
        quote_provider: Arc<Q>,
        shutdown: CancellationToken,
    ) -> Self {
        let (exit_tx, _) = broadcast::channel(64);

        Self {
            config,
            broker,
            price_feed,
            quote_provider,
            monitor: Arc::new(RwLock::new(PriceMonitor::with_config(
                StopsConfig::default(),
            ))),
            symbol_positions: Arc::new(RwLock::new(HashMap::new())),
            circuit_breaker: Arc::new(CircuitBreaker::new()),
            shutdown,
            exit_tx,
        }
    }

    /// Start the monitoring loop.
    ///
    /// This spawns background tasks for:
    /// 1. Processing WebSocket quote updates
    /// 2. REST polling fallback when WebSocket is disconnected
    ///
    /// # Errors
    ///
    /// Returns `PositionMonitorError::NotEnabled` if monitoring is disabled.
    #[allow(clippy::unused_async)]
    pub async fn start(&self) -> Result<(), PositionMonitorError> {
        if !self.config.enabled {
            return Err(PositionMonitorError::NotEnabled);
        }

        tracing::info!("Starting position monitor service");

        // Start WebSocket quote processing
        self.start_quote_processor();

        // Start REST fallback polling
        self.start_rest_fallback();

        Ok(())
    }

    /// Start the WebSocket quote processor task.
    fn start_quote_processor(&self) {
        let mut quote_rx = self.quote_provider.quote_updates();
        let monitor = Arc::clone(&self.monitor);
        let symbol_positions = Arc::clone(&self.symbol_positions);
        let broker = Arc::clone(&self.broker);
        let circuit_breaker = Arc::clone(&self.circuit_breaker);
        let exit_tx = self.exit_tx.clone();
        let shutdown = self.shutdown.clone();
        let max_quote_age = Duration::from_secs(self.config.max_quote_age_secs);

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    result = quote_rx.recv() => {
                        match result {
                            Ok(quote) => {
                                // Skip stale quotes
                                if quote.is_stale(max_quote_age) {
                                    tracing::debug!(
                                        symbol = %quote.symbol,
                                        "Skipping stale quote"
                                    );
                                    continue;
                                }

                                // Process the quote
                                let triggers = {
                                    let monitor_guard = monitor.read();
                                    let instrument_id = InstrumentId::new(&quote.symbol);
                                    // Use mid price for trigger checks
                                    let price = quote.mid_price();
                                    monitor_guard.check_price(&instrument_id, price)
                                };

                                // Execute triggers
                                for (position_id, trigger) in triggers {
                                    if !circuit_breaker.can_execute() {
                                        tracing::warn!(
                                            position_id = %position_id,
                                            "Circuit breaker open, skipping exit"
                                        );
                                        continue;
                                    }

                                    let result = execute_exit(
                                        &broker,
                                        &monitor,
                                        &symbol_positions,
                                        &circuit_breaker,
                                        &position_id,
                                        &quote.symbol,
                                        &trigger,
                                    )
                                    .await;

                                    let _ = exit_tx.send(result);
                                }
                            }
                            Err(broadcast::error::RecvError::Lagged(n)) => {
                                tracing::warn!(
                                    skipped = n,
                                    "Quote processor lagged, skipped {} messages",
                                    n
                                );
                            }
                            Err(broadcast::error::RecvError::Closed) => {
                                tracing::info!("Quote channel closed");
                                break;
                            }
                        }
                    }
                    () = shutdown.cancelled() => {
                        tracing::info!("Quote processor shutting down");
                        break;
                    }
                }
            }
        });
    }

    /// Start the REST fallback polling task.
    fn start_rest_fallback(&self) {
        let monitor = Arc::clone(&self.monitor);
        let symbol_positions = Arc::clone(&self.symbol_positions);
        let broker = Arc::clone(&self.broker);
        let price_feed = Arc::clone(&self.price_feed);
        let circuit_breaker = Arc::clone(&self.circuit_breaker);
        let quote_provider = Arc::clone(&self.quote_provider);
        let exit_tx = self.exit_tx.clone();
        let shutdown = self.shutdown.clone();
        let polling_interval = Duration::from_millis(self.config.polling_interval_ms);

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(polling_interval);

            loop {
                tokio::select! {
                    _ = interval.tick() => {
                        // Only poll if WebSocket is disconnected
                        if quote_provider.is_connected() {
                            continue;
                        }

                        // Get symbols to poll
                        let symbols: Vec<Symbol> = {
                            let positions = symbol_positions.read();
                            positions.keys().map(Symbol::new).collect()
                        };

                        if symbols.is_empty() {
                            continue;
                        }

                        // Fetch quotes via REST
                        match price_feed.get_quotes(&symbols).await {
                            Ok(quotes) => {
                                for quote in quotes {
                                    let instrument_id = InstrumentId::new(quote.symbol.as_str());

                                    let triggers = {
                                        let monitor_guard = monitor.read();
                                        monitor_guard.check_price(&instrument_id, quote.bid)
                                    };

                                    for (position_id, trigger) in triggers {
                                        if !circuit_breaker.can_execute() {
                                            continue;
                                        }

                                        let result = execute_exit(
                                            &broker,
                                            &monitor,
                                            &symbol_positions,
                                            &circuit_breaker,
                                            &position_id,
                                            quote.symbol.as_str(),
                                            &trigger,
                                        )
                                        .await;

                                        let _ = exit_tx.send(result);
                                    }
                                }
                            }
                            Err(e) => {
                                tracing::warn!(
                                    error = %e,
                                    "REST fallback quote fetch failed"
                                );
                            }
                        }
                    }
                    () = shutdown.cancelled() => {
                        tracing::info!("REST fallback polling shutting down");
                        break;
                    }
                }
            }
        });
    }

    /// Register a position for monitoring.
    ///
    /// # Errors
    ///
    /// Returns `PositionMonitorError::WebSocketError` if subscription fails.
    pub async fn register_position(
        &self,
        position: MonitoredPosition,
    ) -> Result<(), PositionMonitorError> {
        let symbol = position.instrument_id().as_str().to_string();
        let position_id = position.position_id().clone();
        let is_option = symbol.len() > 10; // OCC symbols are longer than 10 chars

        // Add to monitor
        {
            let mut monitor = self.monitor.write();
            monitor.add_position(position);
        }

        // Track symbol -> position mapping
        {
            let mut positions = self.symbol_positions.write();
            positions
                .entry(symbol.clone())
                .or_default()
                .push(position_id);
        }

        // Subscribe to WebSocket quotes
        if is_option {
            self.quote_provider
                .subscribe_options_quotes(std::slice::from_ref(&symbol))
                .await
                .map_err(|e| PositionMonitorError::WebSocketError {
                    message: e.to_string(),
                })?;
        } else {
            self.quote_provider
                .subscribe_stock_quotes(std::slice::from_ref(&symbol))
                .await
                .map_err(|e| PositionMonitorError::WebSocketError {
                    message: e.to_string(),
                })?;
        }

        tracing::info!(
            symbol = %symbol,
            "Registered position for monitoring"
        );

        Ok(())
    }

    /// Remove a position from monitoring.
    ///
    /// # Errors
    ///
    /// This method currently does not return errors but reserves the ability to do so.
    pub async fn remove_position(&self, position_id: &OrderId) -> Result<(), PositionMonitorError> {
        // Get the symbol before removing
        let symbol = {
            let monitor = self.monitor.read();
            monitor
                .get_position(position_id)
                .map(|p| p.instrument_id().as_str().to_string())
        };

        // Remove from monitor
        {
            let mut monitor = self.monitor.write();
            monitor.remove_position(position_id);
        }

        // Update symbol -> position mapping
        if let Some(symbol) = symbol {
            let should_unsubscribe = {
                let mut positions = self.symbol_positions.write();
                positions.get_mut(&symbol).is_some_and(|pos_list| {
                    pos_list.retain(|id| id != position_id);
                    pos_list.is_empty()
                })
            };

            // Unsubscribe if no more positions for this symbol
            if should_unsubscribe {
                let is_option = symbol.len() > 10;
                if is_option {
                    let _ = self
                        .quote_provider
                        .unsubscribe_options_quotes(std::slice::from_ref(&symbol))
                        .await;
                } else {
                    let _ = self
                        .quote_provider
                        .unsubscribe_stock_quotes(std::slice::from_ref(&symbol))
                        .await;
                }

                let mut positions = self.symbol_positions.write();
                positions.remove(&symbol);
            }

            tracing::info!(
                position_id = %position_id,
                symbol = %symbol,
                "Removed position from monitoring"
            );
        }

        Ok(())
    }

    /// Get the number of actively monitored positions.
    #[must_use]
    pub fn active_count(&self) -> usize {
        self.monitor.read().active_count()
    }

    /// Get monitored symbols.
    #[must_use]
    pub fn monitored_symbols(&self) -> Vec<String> {
        self.symbol_positions.read().keys().cloned().collect()
    }

    /// Get exit result receiver for notifications.
    #[must_use]
    pub fn exit_updates(&self) -> broadcast::Receiver<ExitResult> {
        self.exit_tx.subscribe()
    }

    /// Check if WebSocket is connected.
    #[must_use]
    pub fn is_websocket_connected(&self) -> bool {
        self.quote_provider.is_connected()
    }

    /// Get circuit breaker state.
    #[must_use]
    pub fn circuit_breaker_state(&self) -> CircuitBreakerState {
        self.circuit_breaker.state()
    }

    /// Sync positions from broker on startup.
    ///
    /// This fetches open positions from the broker and registers them
    /// for monitoring if they have stop/target levels defined.
    ///
    /// # Errors
    ///
    /// This method currently does not return errors but reserves the ability to do so.
    #[allow(clippy::unused_async)]
    pub async fn sync_from_broker(&self) -> Result<SyncResult, PositionMonitorError> {
        tracing::info!("Syncing positions from broker");

        // In a real implementation, this would:
        // 1. Fetch open positions from broker via get_positions()
        // 2. Load stop/target levels from database
        // 3. Register each position for monitoring
        //
        // For now, return empty result as this requires additional infrastructure
        Ok(SyncResult {
            positions_synced: 0,
            symbols_subscribed: vec![],
            errors: vec![],
        })
    }
}

/// Execute an exit order for a triggered position.
async fn execute_exit<B: BrokerPort>(
    broker: &Arc<B>,
    monitor: &Arc<RwLock<PriceMonitor>>,
    symbol_positions: &Arc<RwLock<HashMap<String, Vec<OrderId>>>>,
    circuit_breaker: &Arc<CircuitBreaker>,
    position_id: &OrderId,
    symbol: &str,
    trigger: &TriggerResult,
) -> ExitResult {
    let (trigger_type, trigger_price) = match trigger {
        TriggerResult::StopLoss { price, .. } => ("stop_loss", *price),
        TriggerResult::TakeProfit { price, .. } => ("take_profit", *price),
        TriggerResult::None => {
            return ExitResult {
                position_id: position_id.to_string(),
                symbol: symbol.to_string(),
                exit_order_id: None,
                trigger_type: "none".to_string(),
                trigger_price: Decimal::ZERO,
                success: false,
                error: Some("No trigger".to_string()),
            };
        }
    };

    // Get position direction and quantity for exit order
    let (exit_side, quantity) = {
        let monitor_guard = monitor.read();
        monitor_guard.get_position(position_id).map(|p| {
            let side = match p.levels().direction {
                PositionDirection::Long => OrderSide::Sell,
                PositionDirection::Short => OrderSide::Buy,
            };
            (side, p.quantity())
        })
    }
    .unzip();

    let (Some(exit_side), Some(quantity)) = (exit_side, quantity) else {
        return ExitResult {
            position_id: position_id.to_string(),
            symbol: symbol.to_string(),
            exit_order_id: None,
            trigger_type: trigger_type.to_string(),
            trigger_price,
            success: false,
            error: Some("Position not found".to_string()),
        };
    };

    // Build exit order
    let exit_order_id = format!("exit-{position_id}-{trigger_type}");
    let request = SubmitOrderRequest::market(
        OrderId::new(&exit_order_id),
        Symbol::new(symbol),
        exit_side,
        quantity,
    );

    tracing::info!(
        position_id = %position_id,
        symbol = %symbol,
        trigger_type = %trigger_type,
        trigger_price = %trigger_price,
        "Executing exit order"
    );

    // Submit exit order
    match broker.submit_order(request).await {
        Ok(_ack) => {
            circuit_breaker.record_success();

            // Remove position from monitoring
            {
                let mut monitor_guard = monitor.write();
                monitor_guard.remove_position(position_id);
            }

            // Update symbol tracking
            {
                let mut positions = symbol_positions.write();
                if let Some(pos_list) = positions.get_mut(symbol) {
                    pos_list.retain(|id| id != position_id);
                }
            }

            tracing::info!(
                position_id = %position_id,
                exit_order_id = %exit_order_id,
                trigger_type = %trigger_type,
                "Exit order submitted successfully"
            );

            ExitResult {
                position_id: position_id.to_string(),
                symbol: symbol.to_string(),
                exit_order_id: Some(exit_order_id),
                trigger_type: trigger_type.to_string(),
                trigger_price,
                success: true,
                error: None,
            }
        }
        Err(e) => {
            circuit_breaker.record_failure();

            tracing::error!(
                position_id = %position_id,
                error = %e,
                "Exit order failed"
            );

            ExitResult {
                position_id: position_id.to_string(),
                symbol: symbol.to_string(),
                exit_order_id: None,
                trigger_type: trigger_type.to_string(),
                trigger_price,
                success: false,
                error: Some(e.to_string()),
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn circuit_breaker_new() {
        let cb = CircuitBreaker::new();
        assert_eq!(cb.state(), CircuitBreakerState::Closed);
        assert_eq!(cb.failure_count(), 0);
        assert!(cb.can_execute());
    }

    #[test]
    fn circuit_breaker_opens_after_failures() {
        let cb = CircuitBreaker::with_params(3, Duration::from_secs(60));

        cb.record_failure();
        assert_eq!(cb.state(), CircuitBreakerState::Closed);
        assert!(cb.can_execute());

        cb.record_failure();
        assert_eq!(cb.state(), CircuitBreakerState::Closed);

        cb.record_failure();
        assert_eq!(cb.state(), CircuitBreakerState::Open);
        assert!(!cb.can_execute());
    }

    #[test]
    fn circuit_breaker_resets_on_success() {
        let cb = CircuitBreaker::with_params(3, Duration::from_secs(60));

        cb.record_failure();
        cb.record_failure();
        assert_eq!(cb.failure_count(), 2);

        cb.record_success();
        assert_eq!(cb.failure_count(), 0);
        assert_eq!(cb.state(), CircuitBreakerState::Closed);
    }

    #[test]
    fn position_monitor_config_default() {
        let config = PositionMonitorConfig::default();
        assert!(config.enabled);
        assert_eq!(config.polling_interval_ms, 500);
        assert_eq!(config.max_quote_age_secs, 5);
        assert!(config.use_market_orders);
    }

    #[test]
    fn exit_result_fields() {
        let result = ExitResult {
            position_id: "pos-123".to_string(),
            symbol: "AAPL".to_string(),
            exit_order_id: Some("exit-pos-123-stop_loss".to_string()),
            trigger_type: "stop_loss".to_string(),
            trigger_price: Decimal::new(95, 0),
            success: true,
            error: None,
        };

        assert_eq!(result.position_id, "pos-123");
        assert!(result.success);
        assert!(result.error.is_none());
    }

    #[test]
    fn sync_result_fields() {
        let result = SyncResult {
            positions_synced: 5,
            symbols_subscribed: vec!["AAPL".to_string(), "MSFT".to_string()],
            errors: vec![],
        };

        assert_eq!(result.positions_synced, 5);
        assert_eq!(result.symbols_subscribed.len(), 2);
        assert!(result.errors.is_empty());
    }
}
