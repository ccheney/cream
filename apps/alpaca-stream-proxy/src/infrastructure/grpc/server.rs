//! gRPC Streaming Server Implementation
//!
//! Implements the `StreamProxyService` gRPC service that exposes market data
//! streams to downstream clients.

use std::collections::HashSet;
use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicI32, AtomicU64, Ordering};
use std::time::Instant;

use chrono::{DateTime, Utc};
use prost_types::Timestamp;
use rust_decimal::Decimal;
use tokio::sync::broadcast;
use tokio_stream::Stream;
use tokio_stream::wrappers::ReceiverStream;
use tonic::{Request, Response, Status};

use super::proto::cream::v1::{
    self as proto, ConnectionState, ConnectionStatus, Environment, FeedStatus, FeedType,
    GetConnectionStatusRequest, GetConnectionStatusResponse, OptionQuoteUpdate, OptionTrade,
    OrderDetails, OrderEvent, OrderUpdate, StockBar, StockQuote, StockTrade, StreamBarsRequest,
    StreamBarsResponse, StreamOptionQuotesRequest, StreamOptionQuotesResponse,
    StreamOptionTradesRequest, StreamOptionTradesResponse, StreamOrderUpdatesRequest,
    StreamOrderUpdatesResponse, StreamQuotesRequest, StreamQuotesResponse, StreamTradesRequest,
    StreamTradesResponse, stream_proxy_service_server::StreamProxyService,
};
use crate::SubscriptionManager;
use crate::infrastructure::alpaca::messages::{
    OptionQuoteMessage, OptionTradeMessage, OrderEventType, StockBarMessage, StockQuoteMessage,
    StockTradeMessage, TradeUpdateMessage,
};
use crate::infrastructure::broadcast::SharedBroadcastHub;

// =============================================================================
// Type Aliases
// =============================================================================

type StreamResult<T> = Result<Response<T>, Status>;
type BoxedStream<T> = Pin<Box<dyn Stream<Item = Result<T, Status>> + Send>>;

// =============================================================================
// Server Configuration
// =============================================================================

/// Configuration for the gRPC streaming server.
#[derive(Debug, Clone)]
pub struct StreamProxyServerConfig {
    /// Proxy version string.
    pub version: String,
    /// Environment (PAPER or LIVE).
    pub environment: Environment,
}

impl Default for StreamProxyServerConfig {
    fn default() -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            environment: Environment::Paper,
        }
    }
}

// =============================================================================
// Feed State Tracking
// =============================================================================

/// Tracks the state of an upstream feed connection.
#[derive(Debug)]
pub struct FeedState {
    feed_type: FeedType,
    state: parking_lot::RwLock<ConnectionState>,
    last_connected_at: parking_lot::RwLock<Option<DateTime<Utc>>>,
    error_message: parking_lot::RwLock<Option<String>>,
    subscription_count: AtomicI32,
    reconnect_attempts: AtomicI32,
    messages_received: AtomicU64,
}

impl FeedState {
    const fn new(feed_type: FeedType) -> Self {
        Self {
            feed_type,
            state: parking_lot::RwLock::new(ConnectionState::Disconnected),
            last_connected_at: parking_lot::RwLock::new(None),
            error_message: parking_lot::RwLock::new(None),
            subscription_count: AtomicI32::new(0),
            reconnect_attempts: AtomicI32::new(0),
            messages_received: AtomicU64::new(0),
        }
    }

    /// Set the connection state.
    pub fn set_state(&self, state: ConnectionState) {
        *self.state.write() = state;
        if state == ConnectionState::Connected {
            *self.last_connected_at.write() = Some(Utc::now());
            self.reconnect_attempts.store(0, Ordering::Relaxed);
            *self.error_message.write() = None;
        }
    }

    /// Set an error state with message.
    pub fn set_error(&self, message: String) {
        *self.state.write() = ConnectionState::Error;
        *self.error_message.write() = Some(message);
    }

    /// Increment reconnect attempts.
    pub fn increment_reconnect_attempts(&self) {
        self.reconnect_attempts.fetch_add(1, Ordering::Relaxed);
    }

    /// Increment messages received counter.
    pub fn increment_messages(&self) {
        self.messages_received.fetch_add(1, Ordering::Relaxed);
    }

    /// Update subscription count.
    pub fn set_subscription_count(&self, count: i32) {
        self.subscription_count.store(count, Ordering::Relaxed);
    }

    /// Get the current connection state.
    #[must_use]
    pub fn get_state(&self) -> ConnectionState {
        *self.state.read()
    }

    /// Get messages received count.
    #[must_use]
    pub fn get_messages_received(&self) -> u64 {
        self.messages_received.load(Ordering::Relaxed)
    }

    /// Get reconnect attempts count.
    #[must_use]
    pub fn get_reconnect_attempts(&self) -> i32 {
        self.reconnect_attempts.load(Ordering::Relaxed)
    }

    fn to_proto(&self) -> FeedStatus {
        FeedStatus {
            feed_type: self.feed_type.into(),
            state: (*self.state.read()).into(),
            last_connected_at: self.last_connected_at.read().map(datetime_to_timestamp),
            error_message: self.error_message.read().clone(),
            subscription_count: self.subscription_count.load(Ordering::Relaxed),
            reconnect_attempts: self.reconnect_attempts.load(Ordering::Relaxed),
            messages_received: i64::try_from(self.messages_received.load(Ordering::Relaxed))
                .unwrap_or(i64::MAX),
        }
    }
}

// =============================================================================
// Server Implementation
// =============================================================================

/// gRPC streaming server for market data.
pub struct StreamProxyServer {
    config: StreamProxyServerConfig,
    broadcast_hub: SharedBroadcastHub,
    #[allow(dead_code)]
    subscription_manager: Arc<SubscriptionManager>,
    started_at: Instant,
    client_count: Arc<AtomicI32>,
    sip_state: Arc<FeedState>,
    opra_state: Arc<FeedState>,
    trading_state: Arc<FeedState>,
}

impl StreamProxyServer {
    /// Create a new gRPC streaming server.
    #[must_use]
    pub fn new(
        config: StreamProxyServerConfig,
        broadcast_hub: SharedBroadcastHub,
        subscription_manager: Arc<SubscriptionManager>,
    ) -> Self {
        Self {
            config,
            broadcast_hub,
            subscription_manager,
            started_at: Instant::now(),
            client_count: Arc::new(AtomicI32::new(0)),
            sip_state: Arc::new(FeedState::new(FeedType::Sip)),
            opra_state: Arc::new(FeedState::new(FeedType::Opra)),
            trading_state: Arc::new(FeedState::new(FeedType::TradeUpdates)),
        }
    }

    /// Get the SIP feed state for external updates.
    #[must_use]
    pub fn sip_state(&self) -> Arc<FeedState> {
        Arc::clone(&self.sip_state)
    }

    /// Get the OPRA feed state for external updates.
    #[must_use]
    pub fn opra_state(&self) -> Arc<FeedState> {
        Arc::clone(&self.opra_state)
    }

    /// Get the trading feed state for external updates.
    #[must_use]
    pub fn trading_state(&self) -> Arc<FeedState> {
        Arc::clone(&self.trading_state)
    }

    fn increment_client_count(&self) {
        self.client_count.fetch_add(1, Ordering::Relaxed);
    }
}

#[tonic::async_trait]
impl StreamProxyService for StreamProxyServer {
    type StreamQuotesStream = BoxedStream<StreamQuotesResponse>;
    type StreamTradesStream = BoxedStream<StreamTradesResponse>;
    type StreamBarsStream = BoxedStream<StreamBarsResponse>;
    type StreamOptionQuotesStream = BoxedStream<StreamOptionQuotesResponse>;
    type StreamOptionTradesStream = BoxedStream<StreamOptionTradesResponse>;
    type StreamOrderUpdatesStream = BoxedStream<StreamOrderUpdatesResponse>;

    async fn stream_quotes(
        &self,
        request: Request<StreamQuotesRequest>,
    ) -> StreamResult<Self::StreamQuotesStream> {
        let req = request.into_inner();
        let symbols: HashSet<String> = req.symbols.into_iter().collect();
        let filter_all = symbols.is_empty();

        let consumer_id = uuid::Uuid::new_v4().as_u64_pair().0;
        self.increment_client_count();

        let mut rx = self.broadcast_hub.stock_quotes_rx();
        let (tx, grpc_rx) = tokio::sync::mpsc::channel(1024);
        let client_count = self.client_count.clone();
        let sip_state = Arc::clone(&self.sip_state);

        tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(broadcast) => {
                        if filter_all || symbols.contains(&broadcast.quote.symbol) {
                            sip_state.increment_messages();
                            let response = StreamQuotesResponse {
                                quote: Some(stock_quote_to_proto(&broadcast.quote)),
                            };
                            if tx.send(Ok(response)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(consumer_id = %consumer_id, lagged = n, "Quote receiver lagged");
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
            client_count.fetch_sub(1, Ordering::Relaxed);
        });

        let stream = ReceiverStream::new(grpc_rx);
        Ok(Response::new(Box::pin(stream) as Self::StreamQuotesStream))
    }

    async fn stream_trades(
        &self,
        request: Request<StreamTradesRequest>,
    ) -> StreamResult<Self::StreamTradesStream> {
        let req = request.into_inner();
        let symbols: HashSet<String> = req.symbols.into_iter().collect();
        let filter_all = symbols.is_empty();

        let consumer_id = uuid::Uuid::new_v4().as_u64_pair().0;
        self.increment_client_count();

        let mut rx = self.broadcast_hub.stock_trades_rx();
        let (tx, grpc_rx) = tokio::sync::mpsc::channel(1024);
        let client_count = self.client_count.clone();
        let sip_state = Arc::clone(&self.sip_state);

        tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(broadcast) => {
                        if filter_all || symbols.contains(&broadcast.trade.symbol) {
                            sip_state.increment_messages();
                            let response = StreamTradesResponse {
                                trade: Some(stock_trade_to_proto(&broadcast.trade)),
                            };
                            if tx.send(Ok(response)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(consumer_id = %consumer_id, lagged = n, "Trade receiver lagged");
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
            client_count.fetch_sub(1, Ordering::Relaxed);
        });

        let stream = ReceiverStream::new(grpc_rx);
        Ok(Response::new(Box::pin(stream) as Self::StreamTradesStream))
    }

    async fn stream_bars(
        &self,
        request: Request<StreamBarsRequest>,
    ) -> StreamResult<Self::StreamBarsStream> {
        let req = request.into_inner();
        let symbols: HashSet<String> = req.symbols.into_iter().collect();
        let filter_all = symbols.is_empty();

        let consumer_id = uuid::Uuid::new_v4().as_u64_pair().0;
        self.increment_client_count();

        let mut rx = self.broadcast_hub.stock_bars_rx();
        let (tx, grpc_rx) = tokio::sync::mpsc::channel(256);
        let client_count = self.client_count.clone();
        let sip_state = Arc::clone(&self.sip_state);

        tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(broadcast) => {
                        if filter_all || symbols.contains(&broadcast.bar.symbol) {
                            sip_state.increment_messages();
                            let response = StreamBarsResponse {
                                bar: Some(stock_bar_to_proto(&broadcast.bar)),
                            };
                            if tx.send(Ok(response)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(consumer_id = %consumer_id, lagged = n, "Bar receiver lagged");
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
            client_count.fetch_sub(1, Ordering::Relaxed);
        });

        let stream = ReceiverStream::new(grpc_rx);
        Ok(Response::new(Box::pin(stream) as Self::StreamBarsStream))
    }

    async fn stream_option_quotes(
        &self,
        request: Request<StreamOptionQuotesRequest>,
    ) -> StreamResult<Self::StreamOptionQuotesStream> {
        let req = request.into_inner();
        let symbols: HashSet<String> = req.symbols.into_iter().collect();
        let underlyings: HashSet<String> = req.underlyings.into_iter().collect();
        let filter_all = symbols.is_empty() && underlyings.is_empty();

        let consumer_id = uuid::Uuid::new_v4().as_u64_pair().0;
        self.increment_client_count();

        let mut rx = self.broadcast_hub.options_quotes_rx();
        let (tx, grpc_rx) = tokio::sync::mpsc::channel(4096);
        let client_count = self.client_count.clone();
        let opra_state = Arc::clone(&self.opra_state);

        tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(broadcast) => {
                        let matches = filter_all
                            || symbols.contains(&broadcast.quote.symbol)
                            || underlyings
                                .iter()
                                .any(|u| broadcast.quote.symbol.starts_with(u));

                        if matches {
                            opra_state.increment_messages();
                            let response = StreamOptionQuotesResponse {
                                quote: Some(option_quote_to_proto(&broadcast.quote)),
                            };
                            if tx.send(Ok(response)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(consumer_id = %consumer_id, lagged = n, "Option quote receiver lagged");
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
            client_count.fetch_sub(1, Ordering::Relaxed);
        });

        let stream = ReceiverStream::new(grpc_rx);
        Ok(Response::new(
            Box::pin(stream) as Self::StreamOptionQuotesStream
        ))
    }

    async fn stream_option_trades(
        &self,
        request: Request<StreamOptionTradesRequest>,
    ) -> StreamResult<Self::StreamOptionTradesStream> {
        let req = request.into_inner();
        let symbols: HashSet<String> = req.symbols.into_iter().collect();
        let underlyings: HashSet<String> = req.underlyings.into_iter().collect();
        let filter_all = symbols.is_empty() && underlyings.is_empty();

        let consumer_id = uuid::Uuid::new_v4().as_u64_pair().0;
        self.increment_client_count();

        let mut rx = self.broadcast_hub.options_trades_rx();
        let (tx, grpc_rx) = tokio::sync::mpsc::channel(1024);
        let client_count = self.client_count.clone();
        let opra_state = Arc::clone(&self.opra_state);

        tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(broadcast) => {
                        let matches = filter_all
                            || symbols.contains(&broadcast.trade.symbol)
                            || underlyings
                                .iter()
                                .any(|u| broadcast.trade.symbol.starts_with(u));

                        if matches {
                            opra_state.increment_messages();
                            let response = StreamOptionTradesResponse {
                                trade: Some(option_trade_to_proto(&broadcast.trade)),
                            };
                            if tx.send(Ok(response)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(consumer_id = %consumer_id, lagged = n, "Option trade receiver lagged");
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
            client_count.fetch_sub(1, Ordering::Relaxed);
        });

        let stream = ReceiverStream::new(grpc_rx);
        Ok(Response::new(
            Box::pin(stream) as Self::StreamOptionTradesStream
        ))
    }

    async fn stream_order_updates(
        &self,
        request: Request<StreamOrderUpdatesRequest>,
    ) -> StreamResult<Self::StreamOrderUpdatesStream> {
        let req = request.into_inner();
        let order_ids: HashSet<String> = req.order_ids.into_iter().collect();
        let symbols: HashSet<String> = req.symbols.into_iter().collect();
        let filter_all = order_ids.is_empty() && symbols.is_empty();

        let consumer_id = uuid::Uuid::new_v4().as_u64_pair().0;
        self.increment_client_count();

        let mut rx = self.broadcast_hub.order_updates_rx();
        let (tx, grpc_rx) = tokio::sync::mpsc::channel(256);
        let client_count = self.client_count.clone();
        let trading_state = Arc::clone(&self.trading_state);

        tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(broadcast) => {
                        let matches = filter_all
                            || order_ids.contains(&broadcast.update.data.order.id)
                            || symbols.contains(&broadcast.update.data.order.symbol);

                        if matches {
                            trading_state.increment_messages();
                            let response = StreamOrderUpdatesResponse {
                                update: Some(order_update_to_proto(&broadcast.update)),
                            };
                            if tx.send(Ok(response)).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(consumer_id = %consumer_id, lagged = n, "Order update receiver lagged");
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
            client_count.fetch_sub(1, Ordering::Relaxed);
        });

        let stream = ReceiverStream::new(grpc_rx);
        Ok(Response::new(
            Box::pin(stream) as Self::StreamOrderUpdatesStream
        ))
    }

    async fn get_connection_status(
        &self,
        _request: Request<GetConnectionStatusRequest>,
    ) -> StreamResult<GetConnectionStatusResponse> {
        let now = Utc::now();
        let started_at =
            now - chrono::Duration::from_std(self.started_at.elapsed()).unwrap_or_default();

        let status = ConnectionStatus {
            version: self.config.version.clone(),
            started_at: Some(datetime_to_timestamp(started_at)),
            current_time: Some(datetime_to_timestamp(now)),
            feeds: vec![
                self.sip_state.to_proto(),
                self.opra_state.to_proto(),
                self.trading_state.to_proto(),
            ],
            client_count: self.client_count.load(Ordering::Relaxed),
            environment: self.config.environment.into(),
        };

        Ok(Response::new(GetConnectionStatusResponse {
            status: Some(status),
        }))
    }
}

// =============================================================================
// Conversion Functions
// =============================================================================

fn datetime_to_timestamp(dt: DateTime<Utc>) -> Timestamp {
    Timestamp {
        seconds: dt.timestamp(),
        nanos: i32::try_from(dt.timestamp_subsec_nanos()).unwrap_or(i32::MAX),
    }
}

fn decimal_to_f64(d: Decimal) -> f64 {
    use std::str::FromStr;
    f64::from_str(&d.to_string()).unwrap_or(0.0)
}

fn stock_quote_to_proto(msg: &StockQuoteMessage) -> StockQuote {
    StockQuote {
        symbol: msg.symbol.clone(),
        timestamp: Some(datetime_to_timestamp(msg.timestamp)),
        bid_exchange: msg.bid_exchange.clone(),
        bid_price: decimal_to_f64(msg.bid_price),
        bid_size: msg.bid_size,
        ask_exchange: msg.ask_exchange.clone(),
        ask_price: decimal_to_f64(msg.ask_price),
        ask_size: msg.ask_size,
        conditions: msg.conditions.clone(),
        tape: msg.tape.clone(),
    }
}

fn stock_trade_to_proto(msg: &StockTradeMessage) -> StockTrade {
    StockTrade {
        symbol: msg.symbol.clone(),
        timestamp: Some(datetime_to_timestamp(msg.timestamp)),
        trade_id: msg.trade_id,
        exchange: msg.exchange.clone(),
        price: decimal_to_f64(msg.price),
        size: msg.size,
        conditions: msg.conditions.clone(),
        tape: msg.tape.clone(),
    }
}

fn stock_bar_to_proto(msg: &StockBarMessage) -> StockBar {
    StockBar {
        symbol: msg.symbol.clone(),
        timestamp: Some(datetime_to_timestamp(msg.timestamp)),
        open: decimal_to_f64(msg.open),
        high: decimal_to_f64(msg.high),
        low: decimal_to_f64(msg.low),
        close: decimal_to_f64(msg.close),
        volume: msg.volume,
        vwap: msg.vwap.map_or(0.0, decimal_to_f64),
        trade_count: msg.trade_count,
    }
}

fn option_quote_to_proto(msg: &OptionQuoteMessage) -> OptionQuoteUpdate {
    OptionQuoteUpdate {
        symbol: msg.symbol.clone(),
        timestamp: Some(datetime_to_timestamp(msg.timestamp)),
        bid_exchange: msg.bid_exchange.clone(),
        bid_price: decimal_to_f64(msg.bid_price),
        bid_size: msg.bid_size,
        ask_exchange: msg.ask_exchange.clone(),
        ask_price: decimal_to_f64(msg.ask_price),
        ask_size: msg.ask_size,
        condition: msg.condition.clone().unwrap_or_default(),
    }
}

fn option_trade_to_proto(msg: &OptionTradeMessage) -> OptionTrade {
    OptionTrade {
        symbol: msg.symbol.clone(),
        timestamp: Some(datetime_to_timestamp(msg.timestamp)),
        price: decimal_to_f64(msg.price),
        size: msg.size,
        exchange: msg.exchange.clone(),
        condition: msg.condition.clone().unwrap_or_default(),
    }
}

fn order_event_to_proto(event: OrderEventType) -> i32 {
    match event {
        OrderEventType::New => OrderEvent::New.into(),
        OrderEventType::Fill => OrderEvent::Fill.into(),
        OrderEventType::PartialFill => OrderEvent::PartialFill.into(),
        OrderEventType::Canceled => OrderEvent::Canceled.into(),
        OrderEventType::Expired => OrderEvent::Expired.into(),
        OrderEventType::DoneForDay => OrderEvent::DoneForDay.into(),
        OrderEventType::Replaced => OrderEvent::Replaced.into(),
        OrderEventType::Rejected => OrderEvent::Rejected.into(),
        OrderEventType::PendingNew => OrderEvent::PendingNew.into(),
        OrderEventType::Stopped => OrderEvent::Stopped.into(),
        OrderEventType::PendingCancel => OrderEvent::PendingCancel.into(),
        OrderEventType::PendingReplace => OrderEvent::PendingReplace.into(),
        OrderEventType::Calculated => OrderEvent::Calculated.into(),
        OrderEventType::Suspended => OrderEvent::Suspended.into(),
        OrderEventType::OrderReplaceRejected | OrderEventType::OrderCancelRejected => {
            OrderEvent::Unspecified.into()
        }
    }
}

fn order_update_to_proto(msg: &TradeUpdateMessage) -> OrderUpdate {
    let data = &msg.data;
    let order = &data.order;

    OrderUpdate {
        event: order_event_to_proto(data.event),
        event_id: uuid::Uuid::new_v4().to_string(),
        timestamp: data.timestamp.map(datetime_to_timestamp),
        order: Some(OrderDetails {
            id: order.id.clone(),
            client_order_id: order.client_order_id.clone(),
            symbol: order.symbol.clone(),
            asset_class: order_asset_class_to_proto(order.asset_class.as_deref()),
            order_class: order_class_to_proto(order.order_class),
            order_type: order_type_to_proto(order.order_type),
            side: order_side_to_proto(order.side),
            time_in_force: time_in_force_to_proto(order.time_in_force),
            qty: order.qty.clone().unwrap_or_default(),
            filled_qty: order.filled_qty.clone(),
            filled_avg_price: order.filled_avg_price.clone().unwrap_or_default(),
            limit_price: order.limit_price.clone(),
            stop_price: order.stop_price.clone(),
            status: order.status.clone(),
            extended_hours: order.extended_hours,
            created_at: Some(datetime_to_timestamp(order.created_at)),
            updated_at: Some(datetime_to_timestamp(order.updated_at)),
            submitted_at: order.submitted_at.map(datetime_to_timestamp),
            filled_at: order.filled_at.map(datetime_to_timestamp),
            canceled_at: order.canceled_at.map(datetime_to_timestamp),
            expired_at: order.expired_at.map(datetime_to_timestamp),
            failed_at: order.failed_at.map(datetime_to_timestamp),
            legs: order
                .legs
                .as_ref()
                .map(|legs| legs.iter().map(order_leg_to_proto).collect())
                .unwrap_or_default(),
            commission: None,
        }),
        execution_id: None,
        price: data.price.clone(),
        qty: data.qty.clone(),
        position_qty: data.position_qty.clone(),
    }
}

fn order_leg_to_proto(
    leg: &crate::infrastructure::alpaca::messages::OrderLeg,
) -> proto::OrderUpdateLeg {
    proto::OrderUpdateLeg {
        id: leg.id.clone(),
        symbol: leg.symbol.clone(),
        side: order_side_to_proto(leg.side),
        qty: leg.qty.clone().unwrap_or_default(),
        filled_qty: leg.filled_qty.clone().unwrap_or_default(),
        filled_avg_price: leg.filled_avg_price.clone().unwrap_or_default(),
        ratio_qty: leg.ratio_qty.clone().unwrap_or_default(),
        status: leg.status.clone().unwrap_or_default(),
    }
}

fn order_asset_class_to_proto(asset_class: Option<&str>) -> i32 {
    match asset_class {
        Some("us_equity") => proto::AssetClass::UsEquity.into(),
        Some("us_option") => proto::AssetClass::UsOption.into(),
        Some("crypto") => proto::AssetClass::Crypto.into(),
        _ => proto::AssetClass::Unspecified.into(),
    }
}

fn order_class_to_proto(
    order_class: Option<crate::infrastructure::alpaca::messages::OrderClass>,
) -> i32 {
    use crate::infrastructure::alpaca::messages::OrderClass;
    match order_class {
        Some(OrderClass::Simple) => proto::OrderClass::Simple.into(),
        Some(OrderClass::Bracket) => proto::OrderClass::Bracket.into(),
        Some(OrderClass::Oco) => proto::OrderClass::Oco.into(),
        Some(OrderClass::Oto) => proto::OrderClass::Oto.into(),
        Some(OrderClass::Mleg) => proto::OrderClass::Mleg.into(),
        None => proto::OrderClass::Unspecified.into(),
    }
}

fn order_type_to_proto(order_type: crate::infrastructure::alpaca::messages::OrderType) -> i32 {
    use crate::infrastructure::alpaca::messages::OrderType;
    match order_type {
        OrderType::Market => proto::OrderType::Market.into(),
        OrderType::Limit => proto::OrderType::Limit.into(),
        // Proto doesn't have Stop variants - map to Unspecified
        OrderType::Stop | OrderType::StopLimit | OrderType::TrailingStop => {
            proto::OrderType::Unspecified.into()
        }
    }
}

fn order_side_to_proto(side: crate::infrastructure::alpaca::messages::OrderSide) -> i32 {
    use crate::infrastructure::alpaca::messages::OrderSide;
    match side {
        OrderSide::Buy => proto::OrderSide::Buy.into(),
        OrderSide::Sell => proto::OrderSide::Sell.into(),
    }
}

fn time_in_force_to_proto(tif: crate::infrastructure::alpaca::messages::TimeInForce) -> i32 {
    use crate::infrastructure::alpaca::messages::TimeInForce;
    match tif {
        TimeInForce::Day => proto::TimeInForce::Day.into(),
        TimeInForce::Gtc => proto::TimeInForce::Gtc.into(),
        TimeInForce::Opg => proto::TimeInForce::Opg.into(),
        TimeInForce::Cls => proto::TimeInForce::Cls.into(),
        TimeInForce::Ioc => proto::TimeInForce::Ioc.into(),
        TimeInForce::Fok => proto::TimeInForce::Fok.into(),
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feed_state_transitions() {
        let state = FeedState::new(FeedType::Sip);

        assert_eq!(*state.state.read(), ConnectionState::Disconnected);

        state.set_state(ConnectionState::Connecting);
        assert_eq!(*state.state.read(), ConnectionState::Connecting);

        state.set_state(ConnectionState::Connected);
        assert_eq!(*state.state.read(), ConnectionState::Connected);
        assert!(state.last_connected_at.read().is_some());

        state.set_error("test error".to_string());
        assert_eq!(*state.state.read(), ConnectionState::Error);
        assert_eq!(state.error_message.read().as_deref(), Some("test error"));
    }

    #[test]
    fn feed_state_counters() {
        let state = FeedState::new(FeedType::Opra);

        state.increment_messages();
        state.increment_messages();
        assert_eq!(state.messages_received.load(Ordering::Relaxed), 2);

        state.increment_reconnect_attempts();
        assert_eq!(state.reconnect_attempts.load(Ordering::Relaxed), 1);

        state.set_subscription_count(5);
        assert_eq!(state.subscription_count.load(Ordering::Relaxed), 5);
    }

    #[test]
    fn datetime_conversion() {
        let dt = Utc::now();
        let ts = datetime_to_timestamp(dt);
        let expected_nanos = i32::try_from(dt.timestamp_subsec_nanos()).unwrap_or(i32::MAX);

        assert_eq!(ts.seconds, dt.timestamp());
        assert_eq!(ts.nanos, expected_nanos);
    }

    #[test]
    fn decimal_conversion() {
        let d = Decimal::new(12345, 2);
        let f = decimal_to_f64(d);
        assert!((f - 123.45).abs() < 0.001);
    }
}
