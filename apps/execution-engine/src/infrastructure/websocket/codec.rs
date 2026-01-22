//! Message Parsing for Alpaca WebSocket Streams

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Deserialize;

use super::types::{QuoteUpdate, TradeEvent, TradeUpdate, WebSocketError};

/// Raw stock quote message from Alpaca v2/sip stream.
#[derive(Debug, Deserialize)]
struct RawStockQuote {
    /// Message type ("q" for quote).
    #[serde(rename = "T")]
    #[allow(dead_code)]
    msg_type: String,
    /// Symbol.
    #[serde(rename = "S")]
    symbol: String,
    /// Bid price.
    #[serde(rename = "bp")]
    bid_price: f64,
    /// Ask price.
    #[serde(rename = "ap")]
    ask_price: f64,
    /// Bid size.
    #[serde(rename = "bs")]
    bid_size: i32,
    /// Ask size.
    #[serde(rename = "as")]
    ask_size: i32,
    /// Timestamp (RFC-3339).
    #[serde(rename = "t")]
    timestamp: String,
}

/// Raw options quote message from Alpaca v1beta1/opra stream.
#[derive(Debug, Deserialize)]
struct RawOptionsQuote {
    /// Message type ("q" for quote).
    #[serde(rename = "T")]
    #[allow(dead_code)]
    msg_type: String,
    /// OCC symbol.
    #[serde(rename = "S")]
    symbol: String,
    /// Bid price.
    #[serde(rename = "bp")]
    bid_price: f64,
    /// Ask price.
    #[serde(rename = "ap")]
    ask_price: f64,
    /// Bid size.
    #[serde(rename = "bs")]
    bid_size: i32,
    /// Ask size.
    #[serde(rename = "as")]
    ask_size: i32,
    /// Timestamp (RFC-3339).
    #[serde(rename = "t")]
    timestamp: String,
}

/// Raw trade update message from Alpaca trading stream.
#[derive(Debug, Deserialize)]
struct RawTradeUpdate {
    /// Stream name.
    #[allow(dead_code)]
    stream: Option<String>,
    /// Event type.
    event: Option<String>,
    /// Order data.
    order: Option<RawOrder>,
    /// Data wrapper (for alternative format).
    data: Option<RawTradeUpdateData>,
}

/// Alternative format for trade update data.
#[derive(Debug, Deserialize)]
struct RawTradeUpdateData {
    /// Event type.
    event: String,
    /// Order data.
    order: RawOrder,
}

/// Raw order data from trade update.
#[derive(Debug, Deserialize)]
struct RawOrder {
    /// Broker order ID.
    id: String,
    /// Client order ID.
    client_order_id: String,
    /// Symbol.
    symbol: String,
    /// Filled quantity.
    filled_qty: Option<String>,
    /// Average fill price.
    #[serde(rename = "filled_avg_price")]
    avg_fill_price: Option<String>,
    /// Timestamp.
    #[serde(rename = "filled_at")]
    filled_at: Option<String>,
    /// Created timestamp.
    created_at: Option<String>,
    /// Updated timestamp.
    updated_at: Option<String>,
}

/// Control message from Alpaca streams.
#[derive(Debug, Deserialize)]
pub struct ControlMessage {
    /// Message type.
    #[serde(rename = "T")]
    pub msg_type: String,
    /// Message content.
    #[allow(dead_code)]
    pub msg: Option<String>,
    /// Error code.
    #[allow(dead_code)]
    pub code: Option<i32>,
}

/// Parse a stock quote from JSON message.
///
/// # Errors
///
/// Returns error if the message cannot be parsed or is not a quote message.
pub fn parse_stock_quote(json: &str) -> Result<Option<QuoteUpdate>, WebSocketError> {
    // Alpaca sends messages as arrays
    let messages: Vec<serde_json::Value> =
        serde_json::from_str(json).map_err(|e| WebSocketError::ParseError {
            message: format!("invalid JSON: {e}"),
        })?;

    for msg in messages {
        // Check message type
        let msg_type = msg.get("T").and_then(|v| v.as_str()).unwrap_or("");

        if msg_type == "q" {
            let quote: RawStockQuote =
                serde_json::from_value(msg).map_err(|e| WebSocketError::ParseError {
                    message: format!("invalid stock quote: {e}"),
                })?;

            let timestamp = parse_timestamp(&quote.timestamp)?;

            return Ok(Some(QuoteUpdate {
                symbol: quote.symbol,
                bid: decimal_from_f64(quote.bid_price),
                ask: decimal_from_f64(quote.ask_price),
                bid_size: quote.bid_size,
                ask_size: quote.ask_size,
                timestamp,
                is_option: false,
            }));
        }
    }

    Ok(None)
}

/// Parse an options quote from JSON or msgpack message.
///
/// # Errors
///
/// Returns error if the message cannot be parsed or is not a quote message.
pub fn parse_options_quote(json: &str) -> Result<Option<QuoteUpdate>, WebSocketError> {
    // Alpaca sends messages as arrays
    let messages: Vec<serde_json::Value> =
        serde_json::from_str(json).map_err(|e| WebSocketError::ParseError {
            message: format!("invalid JSON: {e}"),
        })?;

    for msg in messages {
        let msg_type = msg.get("T").and_then(|v| v.as_str()).unwrap_or("");

        if msg_type == "q" {
            let quote: RawOptionsQuote =
                serde_json::from_value(msg).map_err(|e| WebSocketError::ParseError {
                    message: format!("invalid options quote: {e}"),
                })?;

            let timestamp = parse_timestamp(&quote.timestamp)?;

            return Ok(Some(QuoteUpdate {
                symbol: quote.symbol,
                bid: decimal_from_f64(quote.bid_price),
                ask: decimal_from_f64(quote.ask_price),
                bid_size: quote.bid_size,
                ask_size: quote.ask_size,
                timestamp,
                is_option: true,
            }));
        }
    }

    Ok(None)
}

/// Parse a trade update from JSON message.
///
/// # Errors
///
/// Returns error if the message cannot be parsed.
pub fn parse_trade_update(json: &str) -> Result<Option<TradeUpdate>, WebSocketError> {
    let raw: RawTradeUpdate =
        serde_json::from_str(json).map_err(|e| WebSocketError::ParseError {
            message: format!("invalid trade update JSON: {e}"),
        })?;

    // Handle both message formats
    let (event_str, order) = if let Some(data) = raw.data {
        (data.event, data.order)
    } else if let (Some(event), Some(order)) = (raw.event, raw.order) {
        (event, order)
    } else {
        return Ok(None);
    };

    let event = TradeEvent::from_alpaca_event(&event_str);

    let filled_qty = order
        .filled_qty
        .as_deref()
        .and_then(|s| s.parse::<f64>().ok())
        .map_or(Decimal::ZERO, decimal_from_f64);

    let avg_fill_price = order
        .avg_fill_price
        .as_deref()
        .and_then(|s| s.parse::<f64>().ok())
        .map(decimal_from_f64);

    let timestamp = order
        .filled_at
        .as_deref()
        .or(order.updated_at.as_deref())
        .or(order.created_at.as_deref())
        .map(parse_timestamp)
        .transpose()?
        .unwrap_or_else(Utc::now);

    Ok(Some(TradeUpdate {
        event,
        order_id: order.id,
        client_order_id: order.client_order_id,
        symbol: order.symbol,
        filled_qty,
        avg_fill_price,
        timestamp,
    }))
}

/// Parse a control message (success, error, subscription).
///
/// # Errors
///
/// Returns error if the message cannot be parsed.
pub fn parse_control_message(json: &str) -> Result<Option<ControlMessage>, WebSocketError> {
    let messages: Vec<ControlMessage> =
        serde_json::from_str(json).map_err(|e| WebSocketError::ParseError {
            message: format!("invalid control message JSON: {e}"),
        })?;

    Ok(messages.into_iter().next())
}

/// Check if a message is a success response.
#[must_use]
pub fn is_success_message(json: &str) -> bool {
    if let Ok(Some(ctrl)) = parse_control_message(json) {
        ctrl.msg_type == "success"
    } else {
        false
    }
}

/// Check if a message is an error response.
#[must_use]
pub fn is_error_message(json: &str) -> bool {
    if let Ok(Some(ctrl)) = parse_control_message(json) {
        ctrl.msg_type == "error"
    } else {
        false
    }
}

/// Parse RFC-3339 timestamp.
fn parse_timestamp(s: &str) -> Result<DateTime<Utc>, WebSocketError> {
    DateTime::parse_from_rfc3339(s)
        .map(|dt| dt.with_timezone(&Utc))
        .map_err(|e| WebSocketError::ParseError {
            message: format!("invalid timestamp '{s}': {e}"),
        })
}

/// Convert f64 to Decimal with reasonable precision.
fn decimal_from_f64(value: f64) -> Decimal {
    Decimal::try_from(value).unwrap_or(Decimal::ZERO)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_stock_quote_success() {
        let json = r#"[{"T":"q","S":"AAPL","bx":"K","bp":185.50,"bs":100,"ax":"Q","ap":185.52,"as":200,"c":["R"],"z":"C","t":"2024-01-15T14:30:00.123456789Z"}]"#;

        let result = parse_stock_quote(json).unwrap();
        assert!(result.is_some());

        let quote = result.unwrap();
        assert_eq!(quote.symbol, "AAPL");
        assert_eq!(quote.bid, Decimal::try_from(185.50).unwrap());
        assert_eq!(quote.ask, Decimal::try_from(185.52).unwrap());
        assert_eq!(quote.bid_size, 100);
        assert_eq!(quote.ask_size, 200);
        assert!(!quote.is_option);
    }

    #[test]
    fn parse_stock_quote_non_quote_message() {
        let json = r#"[{"T":"success","msg":"connected"}]"#;
        let result = parse_stock_quote(json).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn parse_options_quote_success() {
        let json = r#"[{"T":"q","S":"AAPL240315C00172500","bx":"C","bp":2.84,"bs":53,"ax":"C","ap":2.86,"as":38,"c":"A","t":"2024-01-15T14:30:00Z"}]"#;

        let result = parse_options_quote(json).unwrap();
        assert!(result.is_some());

        let quote = result.unwrap();
        assert_eq!(quote.symbol, "AAPL240315C00172500");
        assert!(quote.is_option);
    }

    #[test]
    fn parse_trade_update_fill() {
        let json = r#"{
            "stream": "trade_updates",
            "event": "fill",
            "order": {
                "id": "abc123",
                "client_order_id": "my-order-1",
                "symbol": "AAPL",
                "filled_qty": "100",
                "filled_avg_price": "185.51",
                "filled_at": "2024-01-15T14:30:00Z"
            }
        }"#;

        let result = parse_trade_update(json).unwrap();
        assert!(result.is_some());

        let update = result.unwrap();
        assert_eq!(update.event, TradeEvent::Fill);
        assert_eq!(update.order_id, "abc123");
        assert_eq!(update.client_order_id, "my-order-1");
        assert_eq!(update.symbol, "AAPL");
        assert_eq!(update.filled_qty, Decimal::from(100));
        assert!(update.avg_fill_price.is_some());
    }

    #[test]
    fn parse_trade_update_alternative_format() {
        let json = r#"{
            "data": {
                "event": "partial_fill",
                "order": {
                    "id": "xyz789",
                    "client_order_id": "my-order-2",
                    "symbol": "MSFT",
                    "filled_qty": "50",
                    "filled_avg_price": "375.25",
                    "created_at": "2024-01-15T14:00:00Z"
                }
            }
        }"#;

        let result = parse_trade_update(json).unwrap();
        assert!(result.is_some());

        let update = result.unwrap();
        assert_eq!(update.event, TradeEvent::PartialFill);
        assert_eq!(update.filled_qty, Decimal::from(50));
    }

    #[test]
    fn is_success_message_check() {
        assert!(is_success_message(r#"[{"T":"success","msg":"connected"}]"#));
        assert!(is_success_message(
            r#"[{"T":"success","msg":"authenticated"}]"#
        ));
        assert!(!is_success_message(
            r#"[{"T":"error","msg":"auth failed"}]"#
        ));
        assert!(!is_success_message(r#"[{"T":"q","S":"AAPL"}]"#));
    }

    #[test]
    fn is_error_message_check() {
        assert!(is_error_message(
            r#"[{"T":"error","msg":"auth failed","code":401}]"#
        ));
        assert!(!is_error_message(r#"[{"T":"success","msg":"connected"}]"#));
    }

    #[test]
    fn quote_update_mid_price_and_spread() {
        let quote = QuoteUpdate {
            symbol: "TEST".to_string(),
            bid: Decimal::new(100, 0),
            ask: Decimal::new(102, 0),
            bid_size: 100,
            ask_size: 100,
            timestamp: Utc::now(),
            is_option: false,
        };

        assert_eq!(quote.mid_price(), Decimal::new(101, 0));
        assert_eq!(quote.spread(), Decimal::new(2, 0));
    }
}
