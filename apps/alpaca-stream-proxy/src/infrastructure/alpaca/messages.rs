//! Alpaca WebSocket Message Types
//!
//! Wire format types for deserializing messages from Alpaca's WebSocket streams.
//! These types map directly to Alpaca's JSON/MessagePack message schemas.
//!
//! # Message Types
//!
//! ## Control Messages (all streams)
//! - `Connected`: Initial connection acknowledgment
//! - `Success`: Authentication success
//! - `Error`: Error response with code and message
//! - `Subscription`: Subscription confirmation
//!
//! ## SIP Stream (JSON codec)
//! - `Quote`: Real-time stock quotes (NBBO)
//! - `Trade`: Real-time stock trades
//! - `Bar`: OHLCV bars (minute, daily, updated)
//! - `Status`: Trading status updates (halts, etc.)
//!
//! ## OPRA Stream (`MessagePack` codec)
//! - `OptionQuote`: Real-time option quotes
//! - `OptionTrade`: Real-time option trades
//!
//! ## Trade Updates Stream (JSON codec)
//! - `OrderUpdate`: Order lifecycle events (fills, cancels, etc.)
//!
//! # References
//!
//! - [Stock Streaming](https://docs.alpaca.markets/docs/real-time-stock-pricing-data)
//! - [Option Streaming](https://docs.alpaca.markets/docs/real-time-option-data)
//! - [Trade Updates](https://docs.alpaca.markets/docs/websocket-streaming)

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

// =============================================================================
// Control Messages (Common to all streams)
// =============================================================================

/// Message type discriminator for Alpaca WebSocket messages.
///
/// All Alpaca messages include a `T` field indicating the message type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageType {
    /// Connection established
    Success,
    /// Error occurred
    Error,
    /// Subscription confirmation
    Subscription,
    /// Stock quote
    #[serde(rename = "q")]
    Quote,
    /// Stock trade
    #[serde(rename = "t")]
    Trade,
    /// Minute bar
    #[serde(rename = "b")]
    Bar,
    /// Daily bar
    #[serde(rename = "d")]
    DailyBar,
    /// Updated bar
    #[serde(rename = "u")]
    UpdatedBar,
    /// Trading status
    #[serde(rename = "s")]
    Status,
    /// News article
    #[serde(rename = "n")]
    News,
    /// LULD (Limit Up/Limit Down)
    #[serde(rename = "l")]
    Luld,
}

/// Success message indicating connection or authentication succeeded.
///
/// # Wire Format (JSON)
/// ```json
/// {"T": "success", "msg": "connected"}
/// {"T": "success", "msg": "authenticated"}
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SuccessMessage {
    /// Message type (always "success")
    #[serde(rename = "T")]
    pub msg_type: String,

    /// Success message: "connected" or "authenticated"
    pub msg: SuccessKind,
}

/// Kind of success message.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SuccessKind {
    /// Initial connection established
    Connected,
    /// Authentication successful
    Authenticated,
}

/// Error message with code and description.
///
/// # Wire Format (JSON)
/// ```json
/// {"T": "error", "code": 401, "msg": "not authenticated"}
/// ```
///
/// # Error Codes
/// - 400: Invalid syntax
/// - 401: Not authenticated
/// - 402: Auth failed
/// - 403: Already authenticated
/// - 404: Auth timeout
/// - 405: Symbol limit exceeded
/// - 406: Connection limit exceeded
/// - 407: Slow client
/// - 408: Insufficient subscription
/// - 409: Not allowed (internal)
/// - 500: Internal error
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ErrorMessage {
    /// Message type (always "error")
    #[serde(rename = "T")]
    pub msg_type: String,

    /// Error code
    pub code: i32,

    /// Error message
    pub msg: String,
}

impl ErrorMessage {
    /// Check if this is an authentication error.
    #[must_use]
    pub const fn is_auth_error(&self) -> bool {
        matches!(self.code, 401..=404)
    }

    /// Check if this is a rate limit error.
    #[must_use]
    pub const fn is_rate_limit_error(&self) -> bool {
        matches!(self.code, 405..=407)
    }

    /// Check if this is a subscription error.
    #[must_use]
    pub const fn is_subscription_error(&self) -> bool {
        self.code == 408
    }
}

/// Subscription confirmation message.
///
/// Sent after a subscribe/unsubscribe action to confirm active subscriptions.
///
/// # Wire Format (JSON)
/// ```json
/// {
///   "T": "subscription",
///   "trades": ["AAPL"],
///   "quotes": ["AMD", "CLDR"],
///   "bars": ["*"]
/// }
/// ```
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SubscriptionMessage {
    /// Message type (always "subscription")
    #[serde(rename = "T")]
    pub msg_type: String,

    /// Subscribed trade symbols
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub trades: Vec<String>,

    /// Subscribed quote symbols
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub quotes: Vec<String>,

    /// Subscribed bar symbols
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub bars: Vec<String>,

    /// Subscribed daily bar symbols
    #[serde(default, skip_serializing_if = "Vec::is_empty", rename = "dailyBars")]
    pub daily_bars: Vec<String>,

    /// Subscribed updated bar symbols
    #[serde(default, skip_serializing_if = "Vec::is_empty", rename = "updatedBars")]
    pub updated_bars: Vec<String>,

    /// Subscribed status symbols
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub statuses: Vec<String>,

    /// Subscribed LULD symbols
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub lulds: Vec<String>,

    /// Subscribed news symbols
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub news: Vec<String>,
}

// =============================================================================
// SIP Stream Messages (Stocks - JSON codec)
// =============================================================================

/// Real-time stock quote from SIP feed.
///
/// Represents the National Best Bid and Offer (NBBO) for a stock.
///
/// # Wire Format (JSON)
/// ```json
/// {
///   "T": "q",
///   "S": "AMD",
///   "bx": "U",
///   "bp": 87.66,
///   "bs": 1,
///   "ax": "Q",
///   "ap": 87.68,
///   "as": 4,
///   "t": "2021-02-22T15:51:45.335689322Z",
///   "c": ["R"],
///   "z": "C"
/// }
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StockQuoteMessage {
    /// Message type (always "q")
    #[serde(rename = "T")]
    pub msg_type: String,

    /// Ticker symbol (e.g., "AAPL")
    #[serde(rename = "S")]
    pub symbol: String,

    /// Bid exchange code
    #[serde(rename = "bx")]
    pub bid_exchange: String,

    /// Bid price
    #[serde(rename = "bp")]
    pub bid_price: Decimal,

    /// Bid size (in round lots, multiply by 100 for shares)
    #[serde(rename = "bs")]
    pub bid_size: i32,

    /// Ask exchange code
    #[serde(rename = "ax")]
    pub ask_exchange: String,

    /// Ask price
    #[serde(rename = "ap")]
    pub ask_price: Decimal,

    /// Ask size (in round lots, multiply by 100 for shares)
    #[serde(rename = "as")]
    pub ask_size: i32,

    /// Quote timestamp (RFC-3339 with nanosecond precision)
    #[serde(rename = "t")]
    pub timestamp: DateTime<Utc>,

    /// Quote condition codes
    #[serde(rename = "c", default)]
    pub conditions: Vec<String>,

    /// Tape: "A" (NYSE), "B" (ARCA/regional), "C" (NASDAQ)
    #[serde(rename = "z")]
    pub tape: String,
}

/// Real-time stock trade from SIP feed.
///
/// # Wire Format (JSON)
/// ```json
/// {
///   "T": "t",
///   "i": 96921,
///   "S": "AAPL",
///   "x": "D",
///   "p": 126.55,
///   "s": 1,
///   "t": "2021-02-22T15:51:44.208Z",
///   "c": ["@", "I"],
///   "z": "C"
/// }
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StockTradeMessage {
    /// Message type (always "t")
    #[serde(rename = "T")]
    pub msg_type: String,

    /// Ticker symbol (e.g., "AAPL")
    #[serde(rename = "S")]
    pub symbol: String,

    /// Trade ID (unique per exchange per day)
    #[serde(rename = "i")]
    pub trade_id: i64,

    /// Exchange code where trade executed
    #[serde(rename = "x")]
    pub exchange: String,

    /// Trade price
    #[serde(rename = "p")]
    pub price: Decimal,

    /// Trade size (shares)
    #[serde(rename = "s")]
    pub size: i32,

    /// Trade timestamp (RFC-3339 with nanosecond precision)
    #[serde(rename = "t")]
    pub timestamp: DateTime<Utc>,

    /// Trade condition codes (e.g., "@" for regular sale)
    #[serde(rename = "c", default)]
    pub conditions: Vec<String>,

    /// Tape: "A" (NYSE), "B" (ARCA/regional), "C" (NASDAQ)
    #[serde(rename = "z")]
    pub tape: String,
}

/// Real-time stock bar (OHLCV) from SIP feed.
///
/// Bar types:
/// - "b": Minute bar
/// - "d": Daily bar
/// - "u": Updated bar (corrections)
///
/// # Wire Format (JSON)
/// ```json
/// {
///   "T": "b",
///   "S": "SPY",
///   "o": 388.985,
///   "h": 389.13,
///   "l": 388.975,
///   "c": 389.12,
///   "v": 49378,
///   "n": 461,
///   "vw": 389.062639,
///   "t": "2021-02-22T19:15:00Z"
/// }
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StockBarMessage {
    /// Message type: "b" (minute), "d" (daily), "u" (updated)
    #[serde(rename = "T")]
    pub msg_type: String,

    /// Ticker symbol
    #[serde(rename = "S")]
    pub symbol: String,

    /// Open price
    #[serde(rename = "o")]
    pub open: Decimal,

    /// High price
    #[serde(rename = "h")]
    pub high: Decimal,

    /// Low price
    #[serde(rename = "l")]
    pub low: Decimal,

    /// Close price
    #[serde(rename = "c")]
    pub close: Decimal,

    /// Volume (shares)
    #[serde(rename = "v")]
    pub volume: i64,

    /// Number of trades in bar
    #[serde(rename = "n", default)]
    pub trade_count: i32,

    /// Volume-weighted average price (VWAP)
    #[serde(rename = "vw", default)]
    pub vwap: Option<Decimal>,

    /// Bar timestamp (start of bar period)
    #[serde(rename = "t")]
    pub timestamp: DateTime<Utc>,
}

/// Trading status message (halts, resumptions, etc.).
///
/// # Wire Format (JSON)
/// ```json
/// {
///   "T": "s",
///   "S": "AAPL",
///   "sc": "T",
///   "sm": "Trading",
///   "rc": "",
///   "rm": "",
///   "t": "2021-02-22T15:00:00Z",
///   "z": "C"
/// }
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct StockStatusMessage {
    /// Message type (always "s")
    #[serde(rename = "T")]
    pub msg_type: String,

    /// Ticker symbol
    #[serde(rename = "S")]
    pub symbol: String,

    /// Status code (e.g., "T" for trading, "H" for halted)
    #[serde(rename = "sc", default)]
    pub status_code: Option<String>,

    /// Status message text
    #[serde(rename = "sm", default)]
    pub status_message: Option<String>,

    /// Reason code for status change
    #[serde(rename = "rc", default)]
    pub reason_code: Option<String>,

    /// Reason message explaining status change
    #[serde(rename = "rm", default)]
    pub reason_message: Option<String>,

    /// Status timestamp
    #[serde(rename = "t", default)]
    pub timestamp: Option<DateTime<Utc>>,

    /// Tape: "A" (NYSE), "B" (ARCA/regional), "C" (NASDAQ)
    #[serde(rename = "z", default)]
    pub tape: Option<String>,
}

// =============================================================================
// OPRA Stream Messages (Options - MessagePack codec)
// =============================================================================

/// Real-time option quote from OPRA feed.
///
/// Note: OPRA stream uses `MessagePack` encoding, not JSON.
///
/// # Wire Format (`MessagePack`, shown as JSON for readability)
/// ```json
/// {
///   "T": "q",
///   "S": "SPXW240327P04925000",
///   "t": "2024-03-12T11:59:38.897261568Z",
///   "bx": "C",
///   "bp": 9.46,
///   "bs": 53,
///   "ax": "C",
///   "ap": 9.66,
///   "as": 38,
///   "c": "A"
/// }
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OptionQuoteMessage {
    /// Message type (always "q")
    #[serde(rename = "T")]
    pub msg_type: String,

    /// OCC option symbol (e.g., "AAPL240315C00172500")
    #[serde(rename = "S")]
    pub symbol: String,

    /// Quote timestamp (RFC-3339 with nanosecond precision)
    #[serde(rename = "t")]
    pub timestamp: DateTime<Utc>,

    /// Bid exchange code
    #[serde(rename = "bx")]
    pub bid_exchange: String,

    /// Bid price
    #[serde(rename = "bp")]
    pub bid_price: Decimal,

    /// Bid size (contracts)
    #[serde(rename = "bs")]
    pub bid_size: i32,

    /// Ask exchange code
    #[serde(rename = "ax")]
    pub ask_exchange: String,

    /// Ask price
    #[serde(rename = "ap")]
    pub ask_price: Decimal,

    /// Ask size (contracts)
    #[serde(rename = "as")]
    pub ask_size: i32,

    /// Quote condition code
    #[serde(rename = "c", default)]
    pub condition: Option<String>,
}

/// Real-time option trade from OPRA feed.
///
/// Note: OPRA stream uses `MessagePack` encoding, not JSON.
///
/// # Wire Format (`MessagePack`, shown as JSON for readability)
/// ```json
/// {
///   "T": "t",
///   "S": "AAPL240315C00172500",
///   "t": "2024-03-11T13:35:35.13312256Z",
///   "p": 2.84,
///   "s": 1,
///   "x": "N",
///   "c": "S"
/// }
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OptionTradeMessage {
    /// Message type (always "t")
    #[serde(rename = "T")]
    pub msg_type: String,

    /// OCC option symbol
    #[serde(rename = "S")]
    pub symbol: String,

    /// Trade timestamp (RFC-3339 with nanosecond precision)
    #[serde(rename = "t")]
    pub timestamp: DateTime<Utc>,

    /// Trade price
    #[serde(rename = "p")]
    pub price: Decimal,

    /// Trade size (contracts)
    #[serde(rename = "s")]
    pub size: i32,

    /// Exchange code where trade occurred
    #[serde(rename = "x")]
    pub exchange: String,

    /// Trade condition code
    #[serde(rename = "c", default)]
    pub condition: Option<String>,
}

// =============================================================================
// Trade Updates Stream Messages (JSON codec)
// =============================================================================

/// Order event types from trade updates stream.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrderEventType {
    /// Order received by Alpaca
    New,
    /// Order completely filled
    Fill,
    /// Order partially filled
    PartialFill,
    /// Order canceled
    Canceled,
    /// Order expired
    Expired,
    /// Order done for the day
    DoneForDay,
    /// Order replaced by another order
    Replaced,
    /// Order rejected
    Rejected,
    /// Order pending submission
    PendingNew,
    /// Order stopped
    Stopped,
    /// Order cancel pending
    PendingCancel,
    /// Order replace pending
    PendingReplace,
    /// Order calculated
    Calculated,
    /// Order suspended
    Suspended,
    /// Order replace was rejected
    OrderReplaceRejected,
    /// Order cancel was rejected
    OrderCancelRejected,
}

/// Order side (buy or sell).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OrderSide {
    /// Buy order
    Buy,
    /// Sell order
    Sell,
}

/// Order type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrderType {
    /// Market order
    Market,
    /// Limit order
    Limit,
    /// Stop order
    Stop,
    /// Stop-limit order
    StopLimit,
    /// Trailing stop order
    TrailingStop,
}

/// Time in force for orders.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimeInForce {
    /// Day order (canceled at end of day)
    Day,
    /// Good-til-canceled
    Gtc,
    /// Market open (execute at open)
    Opg,
    /// Market close (execute at close)
    Cls,
    /// Immediate-or-cancel
    Ioc,
    /// Fill-or-kill
    Fok,
}

/// Order class for complex orders.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OrderClass {
    /// Simple single-leg order
    Simple,
    /// Bracket order (entry + stop loss + take profit)
    Bracket,
    /// One-cancels-other
    Oco,
    /// One-triggers-other
    Oto,
    /// Multi-leg (options)
    Mleg,
}

/// Order details within a trade update message.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderDetails {
    /// Unique order ID
    pub id: String,

    /// Client-provided order ID
    pub client_order_id: String,

    /// Order creation timestamp
    pub created_at: DateTime<Utc>,

    /// Last update timestamp
    pub updated_at: DateTime<Utc>,

    /// When order was submitted to exchange
    #[serde(default)]
    pub submitted_at: Option<DateTime<Utc>>,

    /// When order was fully filled
    #[serde(default)]
    pub filled_at: Option<DateTime<Utc>>,

    /// When order expired
    #[serde(default)]
    pub expired_at: Option<DateTime<Utc>>,

    /// When order was canceled
    #[serde(default)]
    pub canceled_at: Option<DateTime<Utc>>,

    /// When order failed
    #[serde(default)]
    pub failed_at: Option<DateTime<Utc>>,

    /// When order was replaced
    #[serde(default)]
    pub replaced_at: Option<DateTime<Utc>>,

    /// ID of the order that replaced this one
    #[serde(default)]
    pub replaced_by: Option<String>,

    /// ID of the order this one replaces
    #[serde(default)]
    pub replaces: Option<String>,

    /// Asset UUID
    #[serde(default)]
    pub asset_id: Option<String>,

    /// Ticker symbol
    pub symbol: String,

    /// Asset class (`us_equity`, `us_option`, crypto)
    #[serde(default)]
    pub asset_class: Option<String>,

    /// Order quantity (may be null for notional orders)
    #[serde(default)]
    pub qty: Option<String>,

    /// Notional value for fractional orders
    #[serde(default)]
    pub notional: Option<String>,

    /// Filled quantity
    pub filled_qty: String,

    /// Average fill price
    #[serde(default)]
    pub filled_avg_price: Option<String>,

    /// Order class
    #[serde(default)]
    pub order_class: Option<OrderClass>,

    /// Order type
    #[serde(rename = "type")]
    pub order_type: OrderType,

    /// Order side
    pub side: OrderSide,

    /// Time in force
    pub time_in_force: TimeInForce,

    /// Limit price
    #[serde(default)]
    pub limit_price: Option<String>,

    /// Stop price
    #[serde(default)]
    pub stop_price: Option<String>,

    /// Current order status
    pub status: String,

    /// Whether order executes in extended hours
    #[serde(default)]
    pub extended_hours: bool,

    /// Legs for multi-leg orders
    #[serde(default)]
    pub legs: Option<Vec<OrderLeg>>,

    /// Trailing stop percent
    #[serde(default)]
    pub trail_percent: Option<String>,

    /// Trailing stop price
    #[serde(default)]
    pub trail_price: Option<String>,

    /// High water mark for trailing stop
    #[serde(default)]
    pub hwm: Option<String>,
}

/// Order leg for multi-leg orders.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OrderLeg {
    /// Leg order ID
    pub id: String,

    /// Symbol for this leg
    pub symbol: String,

    /// Side for this leg
    pub side: OrderSide,

    /// Quantity for this leg
    #[serde(default)]
    pub qty: Option<String>,

    /// Filled quantity for this leg
    #[serde(default)]
    pub filled_qty: Option<String>,

    /// Average fill price for this leg
    #[serde(default)]
    pub filled_avg_price: Option<String>,

    /// Ratio quantity for spread orders
    #[serde(default)]
    pub ratio_qty: Option<String>,

    /// Status of this leg
    #[serde(default)]
    pub status: Option<String>,
}

/// Trade update message data.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TradeUpdateData {
    /// Event type (fill, canceled, etc.)
    pub event: OrderEventType,

    /// Order details
    pub order: OrderDetails,

    /// Event timestamp
    #[serde(default)]
    pub timestamp: Option<DateTime<Utc>>,

    /// Current position quantity after fill
    #[serde(default)]
    pub position_qty: Option<String>,

    /// Fill price (for fill events)
    #[serde(default)]
    pub price: Option<String>,

    /// Fill quantity (for fill events)
    #[serde(default)]
    pub qty: Option<String>,
}

/// Trade update message from Alpaca trading stream.
///
/// # Wire Format (JSON)
/// ```json
/// {
///   "stream": "trade_updates",
///   "data": {
///     "event": "fill",
///     "order": { ... },
///     "timestamp": "2021-09-17T22:19:33Z",
///     "price": "150.50",
///     "qty": "10"
///   }
/// }
/// ```
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TradeUpdateMessage {
    /// Stream name (always `trade_updates`)
    pub stream: String,

    /// Update data
    pub data: TradeUpdateData,
}

// =============================================================================
// Authentication Messages (Trade Updates Stream)
// =============================================================================

/// Authorization response from trade updates stream.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthorizationMessage {
    /// Stream name (always "authorization")
    pub stream: String,

    /// Authorization data
    pub data: AuthorizationData,
}

/// Authorization response data.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthorizationData {
    /// Status: "authorized" or "unauthorized"
    pub status: String,

    /// Action: "authenticate"
    pub action: String,
}

impl AuthorizationMessage {
    /// Check if authorization succeeded.
    #[must_use]
    pub fn is_authorized(&self) -> bool {
        self.data.status == "authorized"
    }
}

/// Listening confirmation message.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListeningMessage {
    /// Stream name (always "listening")
    pub stream: String,

    /// Listening data
    pub data: ListeningData,
}

/// Listening confirmation data.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ListeningData {
    /// List of active streams
    pub streams: Vec<String>,
}

// =============================================================================
// Outbound Messages (Client -> Server)
// =============================================================================

/// Authentication request for market data streams.
#[derive(Debug, Clone, Serialize)]
pub struct AuthRequest {
    /// Action: "auth"
    pub action: &'static str,

    /// API key
    pub key: String,

    /// API secret
    pub secret: String,
}

impl AuthRequest {
    /// Create a new authentication request.
    #[must_use]
    pub const fn new(key: String, secret: String) -> Self {
        Self {
            action: "auth",
            key,
            secret,
        }
    }
}

/// Authentication request for trade updates stream.
#[derive(Debug, Clone, Serialize)]
pub struct TradeAuthRequest {
    /// Action: "authenticate"
    pub action: &'static str,

    /// Authentication data
    pub data: TradeAuthData,
}

/// Authentication data for trade updates stream.
#[derive(Debug, Clone, Serialize)]
pub struct TradeAuthData {
    /// API key
    pub key_id: String,

    /// API secret
    pub secret_key: String,
}

impl TradeAuthRequest {
    /// Create a new trade authentication request.
    #[must_use]
    pub const fn new(key: String, secret: String) -> Self {
        Self {
            action: "authenticate",
            data: TradeAuthData {
                key_id: key,
                secret_key: secret,
            },
        }
    }
}

/// Subscription request for market data streams.
#[derive(Debug, Clone, Default, Serialize)]
pub struct SubscriptionRequest {
    /// Action: "subscribe" or "unsubscribe"
    pub action: String,

    /// Trade symbols
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub trades: Vec<String>,

    /// Quote symbols
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub quotes: Vec<String>,

    /// Bar symbols
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub bars: Vec<String>,

    /// Daily bar symbols
    #[serde(skip_serializing_if = "Vec::is_empty", rename = "dailyBars")]
    pub daily_bars: Vec<String>,

    /// Updated bar symbols
    #[serde(skip_serializing_if = "Vec::is_empty", rename = "updatedBars")]
    pub updated_bars: Vec<String>,

    /// Status symbols
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub statuses: Vec<String>,

    /// LULD symbols
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub lulds: Vec<String>,

    /// News symbols
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub news: Vec<String>,
}

impl SubscriptionRequest {
    /// Create a subscribe request.
    #[must_use]
    pub fn subscribe() -> Self {
        Self {
            action: "subscribe".to_string(),
            ..Default::default()
        }
    }

    /// Create an unsubscribe request.
    #[must_use]
    pub fn unsubscribe() -> Self {
        Self {
            action: "unsubscribe".to_string(),
            ..Default::default()
        }
    }

    /// Add trade symbols.
    #[must_use]
    pub fn with_trades(mut self, symbols: Vec<String>) -> Self {
        self.trades = symbols;
        self
    }

    /// Add quote symbols.
    #[must_use]
    pub fn with_quotes(mut self, symbols: Vec<String>) -> Self {
        self.quotes = symbols;
        self
    }

    /// Add bar symbols.
    #[must_use]
    pub fn with_bars(mut self, symbols: Vec<String>) -> Self {
        self.bars = symbols;
        self
    }
}

/// Listen request for trade updates stream.
#[derive(Debug, Clone, Serialize)]
pub struct ListenRequest {
    /// Action: "listen"
    pub action: &'static str,

    /// Listen data
    pub data: ListenData,
}

/// Listen data for trade updates stream.
#[derive(Debug, Clone, Serialize)]
pub struct ListenData {
    /// Streams to listen to
    pub streams: Vec<String>,
}

impl ListenRequest {
    /// Create a listen request for trade updates.
    #[must_use]
    pub fn trade_updates() -> Self {
        Self {
            action: "listen",
            data: ListenData {
                streams: vec!["trade_updates".to_string()],
            },
        }
    }
}

// =============================================================================
// Unified Incoming Message Enum
// =============================================================================

/// Unified enum for all possible incoming Alpaca WebSocket messages.
///
/// This enum can represent any message from any Alpaca stream, making it
/// easier to handle messages in a single match statement.
///
/// Note: `TradeUpdate` is boxed to reduce enum size since `TradeUpdateMessage`
/// is significantly larger than other variants.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AlpacaMessage {
    /// Connection/authentication success
    Success(SuccessMessage),

    /// Error message
    Error(ErrorMessage),

    /// Subscription confirmation
    Subscription(SubscriptionMessage),

    /// Stock quote (SIP)
    StockQuote(StockQuoteMessage),

    /// Stock trade (SIP)
    StockTrade(StockTradeMessage),

    /// Stock bar (SIP)
    StockBar(StockBarMessage),

    /// Stock status (SIP)
    StockStatus(StockStatusMessage),

    /// Option quote (OPRA)
    OptionQuote(OptionQuoteMessage),

    /// Option trade (OPRA)
    OptionTrade(OptionTradeMessage),

    /// Trade update (order events) - boxed due to large size
    TradeUpdate(Box<TradeUpdateMessage>),

    /// Authorization response (trade updates)
    Authorization(AuthorizationMessage),

    /// Listening confirmation (trade updates)
    Listening(ListeningMessage),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_success_connected() {
        let json = r#"{"T":"success","msg":"connected"}"#;
        let msg: SuccessMessage = serde_json::from_str(json).unwrap();
        assert_eq!(msg.msg, SuccessKind::Connected);
    }

    #[test]
    fn test_deserialize_success_authenticated() {
        let json = r#"{"T":"success","msg":"authenticated"}"#;
        let msg: SuccessMessage = serde_json::from_str(json).unwrap();
        assert_eq!(msg.msg, SuccessKind::Authenticated);
    }

    #[test]
    fn test_deserialize_error() {
        let json = r#"{"T":"error","code":401,"msg":"not authenticated"}"#;
        let msg: ErrorMessage = serde_json::from_str(json).unwrap();
        assert_eq!(msg.code, 401);
        assert!(msg.is_auth_error());
    }

    #[test]
    fn test_deserialize_stock_quote() {
        let json = r#"{
            "T": "q",
            "S": "AMD",
            "bx": "U",
            "bp": 87.66,
            "bs": 1,
            "ax": "Q",
            "ap": 87.68,
            "as": 4,
            "t": "2021-02-22T15:51:45.335689322Z",
            "c": ["R"],
            "z": "C"
        }"#;
        let msg: StockQuoteMessage = serde_json::from_str(json).unwrap();
        assert_eq!(msg.symbol, "AMD");
        assert_eq!(msg.bid_exchange, "U");
        assert_eq!(msg.bid_price, Decimal::new(8766, 2));
    }

    #[test]
    fn test_deserialize_stock_trade() {
        let json = r#"{
            "T": "t",
            "i": 96921,
            "S": "AAPL",
            "x": "D",
            "p": 126.55,
            "s": 1,
            "t": "2021-02-22T15:51:44.208Z",
            "c": ["@", "I"],
            "z": "C"
        }"#;
        let msg: StockTradeMessage = serde_json::from_str(json).unwrap();
        assert_eq!(msg.symbol, "AAPL");
        assert_eq!(msg.trade_id, 96921);
        assert_eq!(msg.price, Decimal::new(12655, 2));
    }

    #[test]
    fn test_deserialize_stock_bar() {
        let json = r#"{
            "T": "b",
            "S": "SPY",
            "o": 388.985,
            "h": 389.13,
            "l": 388.975,
            "c": 389.12,
            "v": 49378,
            "n": 461,
            "vw": 389.062639,
            "t": "2021-02-22T19:15:00Z"
        }"#;
        let msg: StockBarMessage = serde_json::from_str(json).unwrap();
        assert_eq!(msg.symbol, "SPY");
        assert_eq!(msg.volume, 49378);
        assert_eq!(msg.trade_count, 461);
    }

    #[test]
    fn test_deserialize_option_quote() {
        let json = r#"{
            "T": "q",
            "S": "SPXW240327P04925000",
            "t": "2024-03-12T11:59:38.897261568Z",
            "bx": "C",
            "bp": 9.46,
            "bs": 53,
            "ax": "C",
            "ap": 9.66,
            "as": 38,
            "c": "A"
        }"#;
        let msg: OptionQuoteMessage = serde_json::from_str(json).unwrap();
        assert_eq!(msg.symbol, "SPXW240327P04925000");
        assert_eq!(msg.bid_size, 53);
    }

    #[test]
    fn test_deserialize_option_trade() {
        let json = r#"{
            "T": "t",
            "S": "AAPL240315C00172500",
            "t": "2024-03-11T13:35:35.13312256Z",
            "p": 2.84,
            "s": 1,
            "x": "N",
            "c": "S"
        }"#;
        let msg: OptionTradeMessage = serde_json::from_str(json).unwrap();
        assert_eq!(msg.symbol, "AAPL240315C00172500");
        assert_eq!(msg.size, 1);
    }

    #[test]
    fn test_serialize_auth_request() {
        let req = AuthRequest::new("key123".to_string(), "secret456".to_string());
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains(r#""action":"auth""#));
        assert!(json.contains(r#""key":"key123""#));
    }

    #[test]
    fn test_serialize_subscription_request() {
        let req = SubscriptionRequest::subscribe()
            .with_quotes(vec!["AAPL".to_string(), "MSFT".to_string()])
            .with_trades(vec!["SPY".to_string()]);

        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains(r#""action":"subscribe""#));
        assert!(json.contains("AAPL"));
        assert!(json.contains("SPY"));
    }

    #[test]
    fn test_error_message_helpers() {
        let auth_error = ErrorMessage {
            msg_type: "error".to_string(),
            code: 401,
            msg: "not authenticated".to_string(),
        };
        assert!(auth_error.is_auth_error());
        assert!(!auth_error.is_rate_limit_error());

        let rate_error = ErrorMessage {
            msg_type: "error".to_string(),
            code: 406,
            msg: "connection limit".to_string(),
        };
        assert!(rate_error.is_rate_limit_error());
        assert!(!rate_error.is_auth_error());
    }
}
