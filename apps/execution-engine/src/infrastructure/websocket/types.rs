//! WebSocket Types and Configuration

use std::time::Duration;

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use thiserror::Error;

use crate::infrastructure::broker::alpaca::AlpacaEnvironment;

/// WebSocket connection configuration.
#[derive(Debug, Clone)]
pub struct WebSocketConfig {
    /// API key for authentication.
    pub api_key: String,
    /// API secret for authentication.
    pub api_secret: String,
    /// Trading environment (Paper or Live).
    pub environment: AlpacaEnvironment,

    /// Initial backoff duration for reconnection.
    pub initial_backoff: Duration,
    /// Maximum backoff duration.
    pub max_backoff: Duration,
    /// Backoff multiplier for exponential growth.
    pub backoff_multiplier: f64,
    /// Maximum reconnection attempts before giving up.
    pub max_reconnect_attempts: u32,

    /// Heartbeat interval for connection health checks.
    pub heartbeat_interval: Duration,
    /// Timeout for heartbeat responses.
    pub heartbeat_timeout: Duration,

    /// Maximum symbols per WebSocket connection.
    pub max_symbols_per_connection: usize,
}

impl WebSocketConfig {
    /// Create a new configuration with sensible defaults.
    #[must_use]
    #[allow(clippy::missing_const_for_fn)]
    pub fn new(api_key: String, api_secret: String, environment: AlpacaEnvironment) -> Self {
        Self {
            api_key,
            api_secret,
            environment,
            initial_backoff: Duration::from_millis(500),
            max_backoff: Duration::from_secs(60),
            backoff_multiplier: 2.0,
            max_reconnect_attempts: 10,
            heartbeat_interval: Duration::from_secs(30),
            heartbeat_timeout: Duration::from_secs(10),
            max_symbols_per_connection: 1000,
        }
    }

    /// Get the stock data WebSocket URL.
    #[must_use]
    pub const fn stock_data_url(&self) -> &'static str {
        "wss://stream.data.alpaca.markets/v2/sip"
    }

    /// Get the options data WebSocket URL.
    #[must_use]
    pub const fn options_data_url(&self) -> &'static str {
        "wss://stream.data.alpaca.markets/v1beta1/opra"
    }

    /// Get the trade updates WebSocket URL.
    #[must_use]
    pub const fn trade_updates_url(&self) -> &'static str {
        if self.environment.is_live() {
            "wss://api.alpaca.markets/stream"
        } else {
            "wss://paper-api.alpaca.markets/stream"
        }
    }
}

/// Current state of a WebSocket connection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WebSocketState {
    /// Not connected.
    Disconnected,
    /// Attempting to connect.
    Connecting,
    /// Connected but not yet authenticated.
    Connected,
    /// Authenticated and ready for subscriptions.
    Authenticated,
    /// Connection is being closed.
    Closing,
}

impl WebSocketState {
    /// Check if the connection is ready for sending messages.
    #[must_use]
    pub const fn is_ready(&self) -> bool {
        matches!(self, Self::Authenticated)
    }

    /// Check if the connection is active (connected or authenticated).
    #[must_use]
    pub const fn is_active(&self) -> bool {
        matches!(self, Self::Connected | Self::Authenticated)
    }
}

/// Normalized quote update from WebSocket streams.
#[derive(Debug, Clone)]
pub struct QuoteUpdate {
    /// Symbol (ticker for stocks, OCC symbol for options).
    pub symbol: String,
    /// Best bid price.
    pub bid: Decimal,
    /// Best ask price.
    pub ask: Decimal,
    /// Bid size (contracts or shares).
    pub bid_size: i32,
    /// Ask size (contracts or shares).
    pub ask_size: i32,
    /// Quote timestamp.
    pub timestamp: DateTime<Utc>,
    /// Whether this is an options quote.
    pub is_option: bool,
}

impl QuoteUpdate {
    /// Get the mid price.
    #[must_use]
    pub fn mid_price(&self) -> Decimal {
        (self.bid + self.ask) / Decimal::TWO
    }

    /// Get the spread.
    #[must_use]
    pub fn spread(&self) -> Decimal {
        self.ask - self.bid
    }

    /// Check if the quote is stale (older than threshold).
    #[must_use]
    pub fn is_stale(&self, max_age: Duration) -> bool {
        let age = Utc::now().signed_duration_since(self.timestamp);
        age > chrono::Duration::from_std(max_age).unwrap_or(chrono::Duration::MAX)
    }
}

/// Trade event type from Alpaca trade updates stream.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TradeEvent {
    /// Order submitted.
    New,
    /// Order accepted by exchange.
    Accepted,
    /// Order partially filled.
    PartialFill,
    /// Order completely filled.
    Fill,
    /// Order canceled.
    Canceled,
    /// Order rejected.
    Rejected,
    /// Order expired.
    Expired,
    /// Order replaced.
    Replaced,
    /// Pending new (order submitted but not yet confirmed).
    PendingNew,
    /// Pending cancel (cancel request submitted).
    PendingCancel,
    /// Pending replace (replace request submitted).
    PendingReplace,
    /// Order stopped (held pending trigger).
    Stopped,
    /// Order suspended.
    Suspended,
    /// Calculated (for complex orders).
    Calculated,
    /// Unknown event type.
    Unknown,
}

impl TradeEvent {
    /// Parse event from Alpaca event string.
    #[must_use]
    pub fn from_alpaca_event(event: &str) -> Self {
        match event {
            "new" => Self::New,
            "accepted" => Self::Accepted,
            "partial_fill" => Self::PartialFill,
            "fill" => Self::Fill,
            "canceled" | "cancelled" => Self::Canceled,
            "rejected" => Self::Rejected,
            "expired" => Self::Expired,
            "replaced" => Self::Replaced,
            "pending_new" => Self::PendingNew,
            "pending_cancel" => Self::PendingCancel,
            "pending_replace" => Self::PendingReplace,
            "stopped" => Self::Stopped,
            "suspended" => Self::Suspended,
            "calculated" => Self::Calculated,
            _ => Self::Unknown,
        }
    }

    /// Check if this event represents a terminal state.
    #[must_use]
    pub const fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Fill | Self::Canceled | Self::Rejected | Self::Expired
        )
    }

    /// Check if this event represents a fill (partial or complete).
    #[must_use]
    pub const fn is_fill(&self) -> bool {
        matches!(self, Self::Fill | Self::PartialFill)
    }
}

/// Trade update from Alpaca trade updates stream.
#[derive(Debug, Clone)]
pub struct TradeUpdate {
    /// Event type.
    pub event: TradeEvent,
    /// Broker-assigned order ID.
    pub order_id: String,
    /// Client order ID.
    pub client_order_id: String,
    /// Symbol traded.
    pub symbol: String,
    /// Filled quantity (for fill events).
    pub filled_qty: Decimal,
    /// Average fill price (for fill events).
    pub avg_fill_price: Option<Decimal>,
    /// Event timestamp.
    pub timestamp: DateTime<Utc>,
}

/// WebSocket errors.
#[derive(Debug, Error)]
pub enum WebSocketError {
    /// Connection failed.
    #[error("connection failed: {message}")]
    ConnectionFailed {
        /// Error details.
        message: String,
    },

    /// Authentication failed.
    #[error("authentication failed: {message}")]
    AuthenticationFailed {
        /// Error details.
        message: String,
    },

    /// Subscription failed.
    #[error("subscription failed for {symbols:?}: {message}")]
    SubscriptionFailed {
        /// Symbols that failed to subscribe.
        symbols: Vec<String>,
        /// Error details.
        message: String,
    },

    /// Message parsing failed.
    #[error("failed to parse message: {message}")]
    ParseError {
        /// Error details.
        message: String,
    },

    /// Connection closed unexpectedly.
    #[error("connection closed: {reason}")]
    ConnectionClosed {
        /// Close reason.
        reason: String,
    },

    /// Reconnection attempts exhausted.
    #[error("max reconnection attempts ({attempts}) exceeded")]
    ReconnectExhausted {
        /// Number of attempts made.
        attempts: u32,
    },

    /// Send failed.
    #[error("failed to send message: {message}")]
    SendFailed {
        /// Error details.
        message: String,
    },

    /// Timeout waiting for response.
    #[error("timeout waiting for {operation}")]
    Timeout {
        /// Operation that timed out.
        operation: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn websocket_config_urls() {
        let config = WebSocketConfig::new(
            "key".to_string(),
            "secret".to_string(),
            AlpacaEnvironment::Paper,
        );

        assert_eq!(
            config.stock_data_url(),
            "wss://stream.data.alpaca.markets/v2/sip"
        );
        assert_eq!(
            config.options_data_url(),
            "wss://stream.data.alpaca.markets/v1beta1/opra"
        );
        assert_eq!(
            config.trade_updates_url(),
            "wss://paper-api.alpaca.markets/stream"
        );

        let live_config = WebSocketConfig::new(
            "key".to_string(),
            "secret".to_string(),
            AlpacaEnvironment::Live,
        );
        assert_eq!(
            live_config.trade_updates_url(),
            "wss://api.alpaca.markets/stream"
        );
    }

    #[test]
    fn websocket_state_checks() {
        assert!(!WebSocketState::Disconnected.is_ready());
        assert!(!WebSocketState::Connecting.is_ready());
        assert!(!WebSocketState::Connected.is_ready());
        assert!(WebSocketState::Authenticated.is_ready());

        assert!(!WebSocketState::Disconnected.is_active());
        assert!(WebSocketState::Connected.is_active());
        assert!(WebSocketState::Authenticated.is_active());
    }

    #[test]
    fn quote_update_calculations() {
        let quote = QuoteUpdate {
            symbol: "AAPL".to_string(),
            bid: Decimal::new(18550, 2),
            ask: Decimal::new(18552, 2),
            bid_size: 100,
            ask_size: 200,
            timestamp: Utc::now(),
            is_option: false,
        };

        assert_eq!(quote.mid_price(), Decimal::new(18551, 2));
        assert_eq!(quote.spread(), Decimal::new(2, 2));
        assert!(!quote.is_stale(Duration::from_secs(5)));
    }

    #[test]
    fn trade_event_parsing() {
        assert_eq!(TradeEvent::from_alpaca_event("new"), TradeEvent::New);
        assert_eq!(TradeEvent::from_alpaca_event("fill"), TradeEvent::Fill);
        assert_eq!(
            TradeEvent::from_alpaca_event("partial_fill"),
            TradeEvent::PartialFill
        );
        assert_eq!(
            TradeEvent::from_alpaca_event("canceled"),
            TradeEvent::Canceled
        );
        assert_eq!(
            TradeEvent::from_alpaca_event("cancelled"),
            TradeEvent::Canceled
        );
        assert_eq!(
            TradeEvent::from_alpaca_event("unknown_event"),
            TradeEvent::Unknown
        );
    }

    #[test]
    fn trade_event_terminal_states() {
        assert!(TradeEvent::Fill.is_terminal());
        assert!(TradeEvent::Canceled.is_terminal());
        assert!(TradeEvent::Rejected.is_terminal());
        assert!(TradeEvent::Expired.is_terminal());

        assert!(!TradeEvent::New.is_terminal());
        assert!(!TradeEvent::PartialFill.is_terminal());
        assert!(!TradeEvent::Accepted.is_terminal());
    }

    #[test]
    fn trade_event_fill_checks() {
        assert!(TradeEvent::Fill.is_fill());
        assert!(TradeEvent::PartialFill.is_fill());
        assert!(!TradeEvent::New.is_fill());
        assert!(!TradeEvent::Canceled.is_fill());
    }
}
