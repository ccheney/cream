//! Prometheus Metrics Module
//!
//! Exposes application metrics via Prometheus format for monitoring.
//!
//! # Metrics Categories
//!
//! - **Messages**: Counts of messages received and sent by type
//! - **Connections**: WebSocket and gRPC connection states
//! - **Subscriptions**: Active subscription counts
//! - **Latency**: Message processing and delivery latencies
//!
//! # Integration
//!
//! Metrics are exposed at `/metrics` on the health server port.

use std::sync::OnceLock;
use std::time::Duration;

use metrics::{counter, describe_counter, describe_gauge, describe_histogram, gauge, histogram};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};

// =============================================================================
// Global Metrics Handle
// =============================================================================

static PROMETHEUS_HANDLE: OnceLock<PrometheusHandle> = OnceLock::new();

/// Initialize the Prometheus metrics recorder.
///
/// # Panics
///
/// Panics if called more than once or if the recorder cannot be installed.
pub fn init_metrics() -> PrometheusHandle {
    PROMETHEUS_HANDLE
        .get_or_init(|| {
            let builder = PrometheusBuilder::new();
            let handle = builder
                .install_recorder()
                .expect("failed to install Prometheus recorder");

            register_metrics();
            handle
        })
        .clone()
}

/// Get the Prometheus handle for rendering metrics.
///
/// Returns `None` if metrics have not been initialized.
#[must_use]
pub fn get_metrics_handle() -> Option<PrometheusHandle> {
    PROMETHEUS_HANDLE.get().cloned()
}

// =============================================================================
// Metric Registration
// =============================================================================

fn register_metrics() {
    // Message counters
    describe_counter!(
        "alpaca_proxy_messages_received_total",
        "Total messages received from Alpaca feeds"
    );
    describe_counter!(
        "alpaca_proxy_messages_sent_total",
        "Total messages sent to gRPC clients"
    );
    describe_counter!(
        "alpaca_proxy_messages_dropped_total",
        "Total messages dropped due to slow consumers"
    );

    // Connection gauges
    describe_gauge!(
        "alpaca_proxy_websocket_connections",
        "Number of active WebSocket connections to Alpaca"
    );
    describe_gauge!(
        "alpaca_proxy_grpc_clients",
        "Number of active gRPC client connections"
    );

    // Subscription gauges
    describe_gauge!(
        "alpaca_proxy_subscriptions_total",
        "Total number of active subscriptions"
    );

    // Error counters
    describe_counter!(
        "alpaca_proxy_websocket_errors_total",
        "Total WebSocket errors by type"
    );
    describe_counter!(
        "alpaca_proxy_reconnects_total",
        "Total WebSocket reconnection attempts"
    );

    // Latency histograms
    describe_histogram!(
        "alpaca_proxy_message_processing_seconds",
        "Time to process messages from WebSocket to broadcast"
    );
}

// =============================================================================
// Metric Recording Functions
// =============================================================================

/// Metric labels for feed types.
#[derive(Debug, Clone, Copy)]
pub enum FeedType {
    /// SIP stock feed.
    Sip,
    /// OPRA options feed.
    Opra,
    /// Trade updates feed.
    Trading,
}

impl FeedType {
    const fn as_str(self) -> &'static str {
        match self {
            Self::Sip => "sip",
            Self::Opra => "opra",
            Self::Trading => "trading",
        }
    }
}

/// Metric labels for message types.
#[derive(Debug, Clone, Copy)]
pub enum MessageType {
    /// Stock quote.
    StockQuote,
    /// Stock trade.
    StockTrade,
    /// Stock bar.
    StockBar,
    /// Option quote.
    OptionQuote,
    /// Option trade.
    OptionTrade,
    /// Order update.
    OrderUpdate,
}

impl MessageType {
    const fn as_str(self) -> &'static str {
        match self {
            Self::StockQuote => "stock_quote",
            Self::StockTrade => "stock_trade",
            Self::StockBar => "stock_bar",
            Self::OptionQuote => "option_quote",
            Self::OptionTrade => "option_trade",
            Self::OrderUpdate => "order_update",
        }
    }
}

/// Record a message received from an Alpaca feed.
pub fn record_message_received(feed: FeedType, msg_type: MessageType) {
    counter!(
        "alpaca_proxy_messages_received_total",
        "feed" => feed.as_str(),
        "message_type" => msg_type.as_str()
    )
    .increment(1);
}

/// Record a message sent to gRPC clients.
pub fn record_message_sent(msg_type: MessageType, count: u64) {
    counter!(
        "alpaca_proxy_messages_sent_total",
        "message_type" => msg_type.as_str()
    )
    .increment(count);
}

/// Record messages dropped due to slow consumers.
pub fn record_messages_dropped(msg_type: MessageType, count: u64) {
    counter!(
        "alpaca_proxy_messages_dropped_total",
        "message_type" => msg_type.as_str()
    )
    .increment(count);
}

/// Update the WebSocket connection count for a feed.
pub fn set_websocket_connections(feed: FeedType, count: f64) {
    gauge!(
        "alpaca_proxy_websocket_connections",
        "feed" => feed.as_str()
    )
    .set(count);
}

/// Update the gRPC client count.
pub fn set_grpc_clients(count: f64) {
    gauge!("alpaca_proxy_grpc_clients").set(count);
}

/// Update the total subscription count.
pub fn set_subscriptions(feed: FeedType, count: f64) {
    gauge!(
        "alpaca_proxy_subscriptions_total",
        "feed" => feed.as_str()
    )
    .set(count);
}

/// Record a WebSocket error.
pub fn record_websocket_error(feed: FeedType, error_type: &str) {
    counter!(
        "alpaca_proxy_websocket_errors_total",
        "feed" => feed.as_str(),
        "error_type" => error_type.to_string()
    )
    .increment(1);
}

/// Record a WebSocket reconnection attempt.
pub fn record_reconnect(feed: FeedType) {
    counter!(
        "alpaca_proxy_reconnects_total",
        "feed" => feed.as_str()
    )
    .increment(1);
}

/// Record message processing duration.
pub fn record_processing_duration(feed: FeedType, duration: Duration) {
    histogram!(
        "alpaca_proxy_message_processing_seconds",
        "feed" => feed.as_str()
    )
    .record(duration.as_secs_f64());
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn feed_type_as_str() {
        assert_eq!(FeedType::Sip.as_str(), "sip");
        assert_eq!(FeedType::Opra.as_str(), "opra");
        assert_eq!(FeedType::Trading.as_str(), "trading");
    }

    #[test]
    fn message_type_as_str() {
        assert_eq!(MessageType::StockQuote.as_str(), "stock_quote");
        assert_eq!(MessageType::StockTrade.as_str(), "stock_trade");
        assert_eq!(MessageType::StockBar.as_str(), "stock_bar");
        assert_eq!(MessageType::OptionQuote.as_str(), "option_quote");
        assert_eq!(MessageType::OptionTrade.as_str(), "option_trade");
        assert_eq!(MessageType::OrderUpdate.as_str(), "order_update");
    }
}
