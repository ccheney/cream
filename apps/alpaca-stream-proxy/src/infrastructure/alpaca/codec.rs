//! Stream Codec Module
//!
//! Provides encoding and decoding for Alpaca WebSocket streams.
//!
//! - **SIP/IEX Streams**: JSON codec for stock data
//! - **OPRA Stream**: `MessagePack` codec for options data
//! - **Trade Updates**: JSON codec for order events
//!
//! # OPRA `MessagePack` Format
//!
//! The OPRA options stream uses binary `MessagePack` encoding for efficiency.
//! Messages are sent as arrays where each element is a map representing a quote or trade.
//!
//! Example decoded structure:
//! ```json
//! [{"T":"q","S":"AAPL240315C00172500","bp":5.50,...}]
//! ```

use crate::infrastructure::alpaca::messages::{
    AlpacaMessage, ErrorMessage, OptionQuoteMessage, OptionTradeMessage, StockBarMessage,
    StockQuoteMessage, StockStatusMessage, StockTradeMessage, SubscriptionMessage, SuccessMessage,
};

/// Codec errors.
#[derive(Debug, thiserror::Error)]
pub enum CodecError {
    /// JSON encoding/decoding failed.
    #[error("JSON codec error: {0}")]
    Json(#[from] serde_json::Error),

    /// `MessagePack` encoding failed.
    #[error("`MessagePack` encode error: {0}")]
    MsgPackEncode(#[from] rmp_serde::encode::Error),

    /// `MessagePack` decoding failed.
    #[error("`MessagePack` decode error: {0}")]
    MsgPackDecode(#[from] rmp_serde::decode::Error),

    /// Unknown message type.
    #[error("unknown message type: {0}")]
    UnknownMessageType(String),

    /// Empty message array.
    #[error("empty message array")]
    EmptyArray,

    /// Invalid message format.
    #[error("invalid message format: {0}")]
    InvalidFormat(String),
}

/// JSON codec for SIP/IEX stock streams and trade updates.
#[derive(Debug, Default, Clone)]
pub struct JsonCodec;

impl JsonCodec {
    /// Create a new JSON codec.
    #[must_use]
    pub const fn new() -> Self {
        Self
    }

    /// Decode a JSON text message into an `AlpacaMessage`.
    ///
    /// Alpaca sends messages as JSON arrays, where each element is a message object.
    /// This method decodes the first message in the array.
    ///
    /// # Errors
    ///
    /// Returns an error if JSON parsing fails or the message format is invalid.
    pub fn decode(&self, text: &str) -> Result<Vec<AlpacaMessage>, CodecError> {
        let trimmed = text.trim();

        // Handle array format (most Alpaca messages)
        if trimmed.starts_with('[') {
            self.decode_array(trimmed)
        } else if trimmed.starts_with('{') {
            // Handle single object format (some control messages)
            let msg = self.decode_single_object(trimmed)?;
            Ok(vec![msg])
        } else {
            Err(CodecError::InvalidFormat(format!(
                "expected JSON array or object, got: {}...",
                &trimmed[..trimmed.len().min(50)]
            )))
        }
    }

    /// Decode a JSON array of messages.
    fn decode_array(&self, text: &str) -> Result<Vec<AlpacaMessage>, CodecError> {
        // First try to parse as an array of raw values to inspect types
        let raw_array: Vec<serde_json::Value> = serde_json::from_str(text)?;

        if raw_array.is_empty() {
            return Ok(vec![]);
        }

        let mut messages = Vec::with_capacity(raw_array.len());

        for value in raw_array {
            // Determine message type from "T" field or "stream" field
            let msg_type = value
                .get("T")
                .and_then(|v| v.as_str())
                .or_else(|| value.get("stream").and_then(|v| v.as_str()));

            let message = match msg_type {
                Some("success") => {
                    let m: SuccessMessage = serde_json::from_value(value)?;
                    AlpacaMessage::Success(m)
                }
                Some("error") => {
                    let m: ErrorMessage = serde_json::from_value(value)?;
                    AlpacaMessage::Error(m)
                }
                Some("subscription") => {
                    let m: SubscriptionMessage = serde_json::from_value(value)?;
                    AlpacaMessage::Subscription(m)
                }
                Some("q") => {
                    let m: StockQuoteMessage = serde_json::from_value(value)?;
                    AlpacaMessage::StockQuote(m)
                }
                Some("t") => {
                    let m: StockTradeMessage = serde_json::from_value(value)?;
                    AlpacaMessage::StockTrade(m)
                }
                Some("b" | "d" | "u") => {
                    let m: StockBarMessage = serde_json::from_value(value)?;
                    AlpacaMessage::StockBar(m)
                }
                Some("s") => {
                    let m: StockStatusMessage = serde_json::from_value(value)?;
                    AlpacaMessage::StockStatus(m)
                }
                Some("trade_updates" | "authorization" | "listening") => {
                    let m: AlpacaMessage = serde_json::from_value(value)?;
                    m
                }
                Some(other) => {
                    return Err(CodecError::UnknownMessageType(other.to_string()));
                }
                None => {
                    // Try to parse as a generic AlpacaMessage
                    let m: AlpacaMessage = serde_json::from_value(value)?;
                    m
                }
            };

            messages.push(message);
        }

        Ok(messages)
    }

    /// Decode a single JSON object message.
    fn decode_single_object(&self, text: &str) -> Result<AlpacaMessage, CodecError> {
        let value: serde_json::Value = serde_json::from_str(text)?;

        let msg_type = value
            .get("T")
            .and_then(|v| v.as_str())
            .or_else(|| value.get("stream").and_then(|v| v.as_str()));

        match msg_type {
            Some("success") => {
                let m: SuccessMessage = serde_json::from_value(value)?;
                Ok(AlpacaMessage::Success(m))
            }
            Some("error") => {
                let m: ErrorMessage = serde_json::from_value(value)?;
                Ok(AlpacaMessage::Error(m))
            }
            Some("subscription") => {
                let m: SubscriptionMessage = serde_json::from_value(value)?;
                Ok(AlpacaMessage::Subscription(m))
            }
            _ => {
                // Try generic parse
                Ok(serde_json::from_value(value)?)
            }
        }
    }

    /// Encode a value to JSON string.
    ///
    /// # Errors
    ///
    /// Returns an error if JSON serialization fails.
    pub fn encode<T: serde::Serialize>(&self, value: &T) -> Result<String, CodecError> {
        Ok(serde_json::to_string(value)?)
    }
}

/// `MessagePack` codec for OPRA options stream.
///
/// The OPRA stream sends binary `MessagePack`-encoded messages for efficiency.
/// Messages are typically arrays of quote/trade objects.
#[derive(Debug, Default, Clone)]
pub struct MsgPackCodec;

impl MsgPackCodec {
    /// Create a new `MessagePack` codec.
    #[must_use]
    pub const fn new() -> Self {
        Self
    }

    /// Decode binary `MessagePack` data into Alpaca messages.
    ///
    /// OPRA messages are sent as arrays where each element is a message object.
    /// We try to decode as option quotes first (most common), then trades.
    ///
    /// # Errors
    ///
    /// Returns an error if `MessagePack` parsing fails or the message format is invalid.
    pub fn decode(&self, data: &[u8]) -> Result<Vec<AlpacaMessage>, CodecError> {
        // Try to decode as array of option quotes first (most common case)
        if let Ok(quotes) = rmp_serde::from_slice::<Vec<OptionQuoteMessage>>(data)
            && !quotes.is_empty()
            && quotes.iter().all(|q| q.msg_type == "q")
        {
            return Ok(quotes.into_iter().map(AlpacaMessage::OptionQuote).collect());
        }

        // Try as array of option trades
        if let Ok(trades) = rmp_serde::from_slice::<Vec<OptionTradeMessage>>(data)
            && !trades.is_empty()
            && trades.iter().all(|t| t.msg_type == "t")
        {
            return Ok(trades.into_iter().map(AlpacaMessage::OptionTrade).collect());
        }

        // Try as array of success messages (connection/auth)
        if let Ok(msgs) = rmp_serde::from_slice::<Vec<SuccessMessage>>(data)
            && !msgs.is_empty()
        {
            return Ok(msgs.into_iter().map(AlpacaMessage::Success).collect());
        }

        // Try as array of error messages
        if let Ok(msgs) = rmp_serde::from_slice::<Vec<ErrorMessage>>(data)
            && !msgs.is_empty()
        {
            return Ok(msgs.into_iter().map(AlpacaMessage::Error).collect());
        }

        // Try to read as raw Value to check for empty array
        let mut cursor = std::io::Cursor::new(data);
        if let Ok(raw_value) = rmpv::decode::read_value(&mut cursor)
            && let Some(arr) = raw_value.as_array()
            && arr.is_empty()
        {
            return Ok(vec![]);
        }

        Err(CodecError::InvalidFormat(
            "could not determine message type".to_string(),
        ))
    }

    /// Decode a single option quote from `MessagePack` bytes.
    ///
    /// # Errors
    ///
    /// Returns an error if decoding fails.
    pub fn decode_option_quote(&self, data: &[u8]) -> Result<OptionQuoteMessage, CodecError> {
        Ok(rmp_serde::from_slice(data)?)
    }

    /// Decode a single option trade from `MessagePack` bytes.
    ///
    /// # Errors
    ///
    /// Returns an error if decoding fails.
    pub fn decode_option_trade(&self, data: &[u8]) -> Result<OptionTradeMessage, CodecError> {
        Ok(rmp_serde::from_slice(data)?)
    }

    /// Encode a value to `MessagePack` bytes.
    ///
    /// # Errors
    ///
    /// Returns an error if `MessagePack` serialization fails.
    pub fn encode<T: serde::Serialize>(&self, value: &T) -> Result<Vec<u8>, CodecError> {
        Ok(rmp_serde::to_vec(value)?)
    }

    /// Encode a value to `MessagePack` bytes with named fields (map format).
    ///
    /// This produces `MessagePack` maps with string keys, which matches
    /// how Alpaca sends data.
    ///
    /// # Errors
    ///
    /// Returns an error if `MessagePack` serialization fails.
    pub fn encode_named<T: serde::Serialize>(&self, value: &T) -> Result<Vec<u8>, CodecError> {
        Ok(rmp_serde::to_vec_named(value)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rust_decimal::Decimal;

    #[test]
    fn json_codec_decode_success_array() {
        let codec = JsonCodec::new();
        let json = r#"[{"T":"success","msg":"connected"}]"#;

        let messages = codec.decode(json).unwrap();
        assert_eq!(messages.len(), 1);

        match &messages[0] {
            AlpacaMessage::Success(msg) => {
                assert_eq!(msg.msg_type, "success");
            }
            _ => panic!("expected Success message"),
        }
    }

    #[test]
    fn json_codec_decode_multiple_messages() {
        let codec = JsonCodec::new();
        let json = r#"[
            {"T":"q","S":"AAPL","bx":"Q","bp":150.00,"bs":1,"ax":"P","ap":150.01,"as":2,"t":"2024-01-15T10:00:00Z","z":"C"},
            {"T":"t","i":123,"S":"AAPL","x":"Q","p":150.005,"s":100,"t":"2024-01-15T10:00:01Z","z":"C"}
        ]"#;

        let messages = codec.decode(json).unwrap();
        assert_eq!(messages.len(), 2);

        assert!(matches!(&messages[0], AlpacaMessage::StockQuote(_)));
        assert!(matches!(&messages[1], AlpacaMessage::StockTrade(_)));
    }

    #[test]
    fn json_codec_decode_single_object() {
        let codec = JsonCodec::new();
        let json = r#"{"T":"error","code":401,"msg":"not authenticated"}"#;

        let messages = codec.decode(json).unwrap();
        assert_eq!(messages.len(), 1);

        match &messages[0] {
            AlpacaMessage::Error(msg) => {
                assert_eq!(msg.code, 401);
            }
            _ => panic!("expected Error message"),
        }
    }

    #[test]
    fn json_codec_decode_empty_array() {
        let codec = JsonCodec::new();
        let json = "[]";

        let messages = codec.decode(json).unwrap();
        assert!(messages.is_empty());
    }

    #[test]
    fn json_codec_encode() {
        let codec = JsonCodec::new();
        let msg = ErrorMessage {
            msg_type: "error".to_string(),
            code: 401,
            msg: "test".to_string(),
        };

        let json = codec.encode(&msg).unwrap();
        assert!(json.contains(r#""code":401"#));
    }

    #[test]
    fn msgpack_codec_decode_option_quote() {
        let codec = MsgPackCodec::new();

        // Create a sample option quote message as `MessagePack`
        let quote = OptionQuoteMessage {
            msg_type: "q".to_string(),
            symbol: "AAPL240315C00172500".to_string(),
            timestamp: chrono::Utc::now(),
            bid_exchange: "C".to_string(),
            bid_price: Decimal::new(550, 2), // 5.50
            bid_size: 10,
            ask_exchange: "C".to_string(),
            ask_price: Decimal::new(560, 2), // 5.60
            ask_size: 15,
            condition: Some("A".to_string()),
        };

        // Encode as an array of one message (using named to get map format)
        let bytes = rmp_serde::to_vec_named(&vec![&quote]).unwrap();

        let messages = codec.decode(&bytes).unwrap();
        assert_eq!(messages.len(), 1);

        match &messages[0] {
            AlpacaMessage::OptionQuote(msg) => {
                assert_eq!(msg.symbol, "AAPL240315C00172500");
                assert_eq!(msg.bid_size, 10);
            }
            _ => panic!("expected OptionQuote message"),
        }
    }

    #[test]
    fn msgpack_codec_decode_option_trade() {
        let codec = MsgPackCodec::new();

        let trade = OptionTradeMessage {
            msg_type: "t".to_string(),
            symbol: "AAPL240315C00172500".to_string(),
            timestamp: chrono::Utc::now(),
            price: Decimal::new(555, 2), // 5.55
            size: 5,
            exchange: "N".to_string(),
            condition: Some("S".to_string()),
        };

        let bytes = rmp_serde::to_vec_named(&vec![&trade]).unwrap();

        let messages = codec.decode(&bytes).unwrap();
        assert_eq!(messages.len(), 1);

        match &messages[0] {
            AlpacaMessage::OptionTrade(msg) => {
                assert_eq!(msg.symbol, "AAPL240315C00172500");
                assert_eq!(msg.size, 5);
            }
            _ => panic!("expected OptionTrade message"),
        }
    }

    #[test]
    fn msgpack_codec_decode_multiple_quotes() {
        let codec = MsgPackCodec::new();

        let quote1 = OptionQuoteMessage {
            msg_type: "q".to_string(),
            symbol: "SPY240315P00450000".to_string(),
            timestamp: chrono::Utc::now(),
            bid_exchange: "C".to_string(),
            bid_price: Decimal::new(250, 2),
            bid_size: 20,
            ask_exchange: "C".to_string(),
            ask_price: Decimal::new(260, 2),
            ask_size: 25,
            condition: None,
        };

        let quote2 = OptionQuoteMessage {
            msg_type: "q".to_string(),
            symbol: "QQQ240315C00400000".to_string(),
            timestamp: chrono::Utc::now(),
            bid_exchange: "P".to_string(),
            bid_price: Decimal::new(350, 2),
            bid_size: 15,
            ask_exchange: "P".to_string(),
            ask_price: Decimal::new(360, 2),
            ask_size: 18,
            condition: None,
        };

        let bytes = rmp_serde::to_vec_named(&vec![&quote1, &quote2]).unwrap();

        let messages = codec.decode(&bytes).unwrap();
        assert_eq!(messages.len(), 2);
        assert!(matches!(&messages[0], AlpacaMessage::OptionQuote(_)));
        assert!(matches!(&messages[1], AlpacaMessage::OptionQuote(_)));
    }

    #[test]
    fn msgpack_codec_decode_empty() {
        let codec = MsgPackCodec::new();
        let bytes = rmp_serde::to_vec::<Vec<OptionQuoteMessage>>(&vec![]).unwrap();

        let messages = codec.decode(&bytes).unwrap();
        assert!(messages.is_empty());
    }

    #[test]
    fn msgpack_codec_encode() {
        let codec = MsgPackCodec::new();
        let trade = OptionTradeMessage {
            msg_type: "t".to_string(),
            symbol: "TEST".to_string(),
            timestamp: chrono::Utc::now(),
            price: Decimal::new(100, 2),
            size: 1,
            exchange: "N".to_string(),
            condition: None,
        };

        let bytes = codec.encode(&trade).unwrap();
        assert!(!bytes.is_empty());

        // Verify we can decode what we encoded
        let decoded: OptionTradeMessage = rmp_serde::from_slice(&bytes).unwrap();
        assert_eq!(decoded.symbol, "TEST");
    }
}
