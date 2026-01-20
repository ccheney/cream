//! Alpaca API request and response types.
//!
//! These types map directly to Alpaca's REST API format.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::application::ports::OrderAck;
use crate::domain::order_execution::value_objects::OrderStatus;
use crate::domain::shared::{BrokerId, OrderId};

// ============================================================================
// Order Request Types
// ============================================================================

/// Order request for Alpaca API.
#[derive(Debug, Clone, Serialize)]
pub struct AlpacaOrderRequest {
    /// Stock symbol.
    pub symbol: String,
    /// Quantity (shares).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qty: Option<String>,
    /// Notional value (dollars).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notional: Option<String>,
    /// Order side.
    pub side: String,
    /// Order type.
    #[serde(rename = "type")]
    pub order_type: String,
    /// Time in force.
    pub time_in_force: String,
    /// Limit price (for limit orders).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_price: Option<String>,
    /// Stop price (for stop orders).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop_price: Option<String>,
    /// Client order ID.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_order_id: Option<String>,
    /// Extended hours trading.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extended_hours: Option<bool>,
}

// ============================================================================
// Order Response Types
// ============================================================================

/// Order response from Alpaca API.
///
/// Contains all fields from Alpaca's API for debugging and future use.
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct AlpacaOrderResponse {
    /// Broker order ID.
    pub id: String,
    /// Client order ID.
    pub client_order_id: String,
    /// Symbol.
    pub symbol: String,
    /// Quantity (as string).
    pub qty: String,
    /// Filled quantity (as string).
    pub filled_qty: String,
    /// Average fill price (as string).
    #[serde(default)]
    pub filled_avg_price: Option<String>,
    /// Order status.
    pub status: String,
    /// Order side.
    pub side: String,
    /// Order type.
    #[serde(rename = "type")]
    pub order_type: String,
    /// Time in force.
    pub time_in_force: String,
    /// Limit price.
    #[serde(default)]
    pub limit_price: Option<String>,
    /// Stop price.
    #[serde(default)]
    pub stop_price: Option<String>,
    /// Created timestamp.
    pub created_at: String,
    /// Updated timestamp.
    pub updated_at: String,
    /// Submitted timestamp.
    pub submitted_at: String,
    /// Filled timestamp.
    #[serde(default)]
    pub filled_at: Option<String>,
}

impl AlpacaOrderResponse {
    /// Convert to `OrderAck`.
    #[must_use]
    pub fn to_order_ack(&self) -> OrderAck {
        OrderAck {
            broker_order_id: BrokerId::new(&self.id),
            client_order_id: OrderId::new(&self.client_order_id),
            status: parse_order_status(&self.status),
            filled_qty: self.filled_qty.parse().unwrap_or(Decimal::ZERO),
            avg_fill_price: self.filled_avg_price.as_ref().and_then(|p| p.parse().ok()),
        }
    }
}

// ============================================================================
// Account Types
// ============================================================================

/// Account response from Alpaca API.
///
/// Contains all fields from Alpaca's API for debugging and future use.
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct AlpacaAccountResponse {
    /// Account ID.
    pub id: String,
    /// Account equity.
    pub equity: String,
    /// Cash balance.
    pub cash: String,
    /// Buying power.
    pub buying_power: String,
    /// Day trade count.
    #[serde(default)]
    pub daytrade_count: Option<i32>,
    /// Pattern day trader flag.
    #[serde(default)]
    pub pattern_day_trader: Option<bool>,
}

// ============================================================================
// Position Types
// ============================================================================

/// Position response from Alpaca API.
///
/// Contains all fields from Alpaca's API for debugging and future use.
#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct AlpacaPositionResponse {
    /// Symbol.
    pub symbol: String,
    /// Quantity.
    pub qty: String,
    /// Side (long/short).
    pub side: String,
    /// Average entry price.
    pub avg_entry_price: String,
    /// Market value.
    pub market_value: String,
    /// Current price.
    pub current_price: String,
    /// Unrealized P&L.
    pub unrealized_pl: String,
}

// ============================================================================
// Error Types
// ============================================================================

/// Error response from Alpaca API.
#[derive(Debug, Clone, Deserialize)]
pub struct AlpacaErrorResponse {
    /// Error code.
    #[serde(default)]
    pub code: Option<String>,
    /// Error message.
    pub message: String,
}

// ============================================================================
// Market Data Types
// ============================================================================

/// Stock snapshot response from Alpaca Market Data API.
#[derive(Debug, Clone, Deserialize)]
pub struct AlpacaSnapshotsResponse {
    /// Map of symbol to snapshot.
    pub snapshots: std::collections::HashMap<String, AlpacaSnapshot>,
}

/// Snapshot for a single symbol.
#[derive(Debug, Clone, Deserialize)]
pub struct AlpacaSnapshot {
    /// Latest quote.
    #[serde(rename = "latestQuote")]
    pub latest_quote: Option<AlpacaQuote>,
    /// Latest trade.
    #[serde(rename = "latestTrade")]
    pub latest_trade: Option<AlpacaTrade>,
    /// Daily bar.
    #[serde(rename = "dailyBar")]
    pub daily_bar: Option<AlpacaBar>,
    /// Previous daily bar.
    #[serde(rename = "prevDailyBar")]
    pub prev_daily_bar: Option<AlpacaBar>,
}

/// Quote from Alpaca.
#[derive(Debug, Clone, Deserialize)]
pub struct AlpacaQuote {
    /// Bid price.
    pub bp: f64,
    /// Ask price.
    pub ap: f64,
    /// Bid size.
    pub bs: i32,
    /// Ask size.
    #[serde(rename = "as")]
    pub ask_size: i32,
    /// Timestamp.
    pub t: String,
}

/// Trade from Alpaca.
#[derive(Debug, Clone, Deserialize)]
pub struct AlpacaTrade {
    /// Trade price.
    pub p: f64,
    /// Trade size.
    pub s: i32,
    /// Timestamp.
    pub t: String,
}

/// Bar (OHLCV) from Alpaca.
#[derive(Debug, Clone, Deserialize)]
pub struct AlpacaBar {
    /// Open price.
    pub o: f64,
    /// High price.
    pub h: f64,
    /// Low price.
    pub l: f64,
    /// Close price.
    pub c: f64,
    /// Volume.
    pub v: i64,
}

/// Option snapshots response from Alpaca.
#[derive(Debug, Clone, Deserialize)]
pub struct AlpacaOptionSnapshotsResponse {
    /// Map of OCC symbol to option snapshot.
    pub snapshots: std::collections::HashMap<String, AlpacaOptionSnapshot>,
}

/// Option snapshot from Alpaca.
#[derive(Debug, Clone, Deserialize)]
pub struct AlpacaOptionSnapshot {
    /// Latest quote.
    #[serde(rename = "latestQuote")]
    pub latest_quote: Option<AlpacaOptionQuote>,
    /// Latest trade.
    #[serde(rename = "latestTrade")]
    pub latest_trade: Option<AlpacaOptionTrade>,
    /// Greeks.
    pub greeks: Option<AlpacaGreeks>,
    /// Implied volatility.
    #[serde(rename = "impliedVolatility")]
    pub implied_volatility: Option<f64>,
}

/// Option quote from Alpaca.
#[derive(Debug, Clone, Deserialize)]
pub struct AlpacaOptionQuote {
    /// Bid price.
    pub bp: f64,
    /// Ask price.
    pub ap: f64,
    /// Bid size.
    pub bs: i32,
    /// Ask size.
    #[serde(rename = "as")]
    pub ask_size: i32,
    /// Timestamp.
    pub t: String,
}

/// Option trade from Alpaca.
#[derive(Debug, Clone, Deserialize)]
pub struct AlpacaOptionTrade {
    /// Trade price.
    pub p: f64,
    /// Trade size.
    pub s: i32,
    /// Timestamp.
    pub t: String,
}

/// Greeks from Alpaca.
#[derive(Debug, Clone, Deserialize)]
pub struct AlpacaGreeks {
    /// Delta.
    pub delta: Option<f64>,
    /// Gamma.
    pub gamma: Option<f64>,
    /// Theta.
    pub theta: Option<f64>,
    /// Vega.
    pub vega: Option<f64>,
    /// Rho.
    pub rho: Option<f64>,
}

/// Parse an OCC option symbol to extract contract details.
///
/// OCC format: AAPL  240119C00150000
/// - Root symbol (6 chars, space-padded)
/// - Expiration (YYMMDD)
/// - Type (C/P)
/// - Strike (8 digits, strike * 1000)
#[derive(Debug, Clone)]
pub struct ParsedOptionContract {
    /// Underlying symbol.
    pub underlying: String,
    /// Expiration date (YYYY-MM-DD).
    pub expiration: String,
    /// Option type.
    pub option_type: ParsedOptionType,
    /// Strike price.
    pub strike: rust_decimal::Decimal,
}

/// Parsed option type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParsedOptionType {
    /// Call option.
    Call,
    /// Put option.
    Put,
}

impl ParsedOptionContract {
    /// Parse an OCC symbol into contract details.
    ///
    /// Returns `None` if the symbol is not a valid OCC format.
    #[must_use]
    pub fn from_occ_symbol(symbol: &str) -> Option<Self> {
        // OCC symbols are typically 21 characters
        if symbol.len() < 15 {
            return None;
        }

        // Find where the date starts (after the underlying symbol)
        // The underlying is space-padded to 6 chars, but may be shorter
        let underlying_end = symbol.chars().position(|c| c.is_ascii_digit()).unwrap_or(6);
        let underlying = symbol[..underlying_end].trim().to_string();

        if underlying.is_empty() {
            return None;
        }

        // Rest of string should be: YYMMDD + C/P + 8 digits
        let rest = &symbol[underlying_end..];
        if rest.len() < 15 {
            return None;
        }

        // Parse expiration (YYMMDD)
        let exp_str = &rest[..6];
        let year = exp_str[..2].parse::<i32>().ok()?;
        let month = exp_str[2..4].parse::<u32>().ok()?;
        let day = exp_str[4..6].parse::<u32>().ok()?;

        if month > 12 || day > 31 {
            return None;
        }

        let expiration = format!("20{year:02}-{month:02}-{day:02}");

        // Parse option type
        let type_char = rest.chars().nth(6)?;
        let option_type = match type_char {
            'C' => ParsedOptionType::Call,
            'P' => ParsedOptionType::Put,
            _ => return None,
        };

        // Parse strike (8 digits, strike * 1000)
        let strike_str = &rest[7..15];
        let strike_int: i64 = strike_str.parse().ok()?;
        let strike = rust_decimal::Decimal::new(strike_int, 3); // Divide by 1000

        Some(Self {
            underlying,
            expiration,
            option_type,
            strike,
        })
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Parse Alpaca order status string to domain `OrderStatus`.
fn parse_order_status(status: &str) -> OrderStatus {
    match status.to_lowercase().as_str() {
        "accepted" | "accepted_for_bidding" | "replaced" | "pending_replace" => {
            OrderStatus::Accepted
        }
        "partially_filled" => OrderStatus::PartiallyFilled,
        "filled" => OrderStatus::Filled,
        "done_for_day" | "expired" => OrderStatus::Expired,
        "canceled" | "pending_cancel" => OrderStatus::Canceled,
        "rejected" => OrderStatus::Rejected,
        // new, pending_new, stopped, suspended, calculated, and unknown -> New
        _ => OrderStatus::New,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_order_status_new() {
        assert_eq!(parse_order_status("new"), OrderStatus::New);
        assert_eq!(parse_order_status("pending_new"), OrderStatus::New);
    }

    #[test]
    fn parse_order_status_accepted() {
        assert_eq!(parse_order_status("accepted"), OrderStatus::Accepted);
    }

    #[test]
    fn parse_order_status_filled() {
        assert_eq!(parse_order_status("filled"), OrderStatus::Filled);
        assert_eq!(
            parse_order_status("partially_filled"),
            OrderStatus::PartiallyFilled
        );
    }

    #[test]
    fn parse_order_status_canceled() {
        assert_eq!(parse_order_status("canceled"), OrderStatus::Canceled);
        assert_eq!(parse_order_status("pending_cancel"), OrderStatus::Canceled);
    }

    #[test]
    fn parse_order_status_rejected() {
        assert_eq!(parse_order_status("rejected"), OrderStatus::Rejected);
    }

    #[test]
    fn parse_order_status_expired() {
        assert_eq!(parse_order_status("expired"), OrderStatus::Expired);
        assert_eq!(parse_order_status("done_for_day"), OrderStatus::Expired);
    }

    #[test]
    fn alpaca_order_response_to_order_ack() {
        let response = AlpacaOrderResponse {
            id: "broker-123".to_string(),
            client_order_id: "client-456".to_string(),
            symbol: "AAPL".to_string(),
            qty: "100".to_string(),
            filled_qty: "50".to_string(),
            filled_avg_price: Some("150.25".to_string()),
            status: "partially_filled".to_string(),
            side: "buy".to_string(),
            order_type: "limit".to_string(),
            time_in_force: "day".to_string(),
            limit_price: Some("150.00".to_string()),
            stop_price: None,
            created_at: "2024-01-15T10:00:00Z".to_string(),
            updated_at: "2024-01-15T10:05:00Z".to_string(),
            submitted_at: "2024-01-15T10:00:00Z".to_string(),
            filled_at: None,
        };

        let ack = response.to_order_ack();
        assert_eq!(ack.broker_order_id.as_str(), "broker-123");
        assert_eq!(ack.client_order_id.as_str(), "client-456");
        assert_eq!(ack.status, OrderStatus::PartiallyFilled);
        assert_eq!(ack.filled_qty, Decimal::new(50, 0));
        assert_eq!(ack.avg_fill_price, Some(Decimal::new(15025, 2)));
    }

    #[test]
    fn parse_occ_symbol_call() {
        let contract = ParsedOptionContract::from_occ_symbol("AAPL  240119C00150000").unwrap();
        assert_eq!(contract.underlying, "AAPL");
        assert_eq!(contract.expiration, "2024-01-19");
        assert_eq!(contract.option_type, ParsedOptionType::Call);
        assert_eq!(contract.strike, Decimal::new(150, 0));
    }

    #[test]
    fn parse_occ_symbol_put() {
        let contract = ParsedOptionContract::from_occ_symbol("MSFT  251220P00400000").unwrap();
        assert_eq!(contract.underlying, "MSFT");
        assert_eq!(contract.expiration, "2025-12-20");
        assert_eq!(contract.option_type, ParsedOptionType::Put);
        assert_eq!(contract.strike, Decimal::new(400, 0));
    }

    #[test]
    fn parse_occ_symbol_fractional_strike() {
        let contract = ParsedOptionContract::from_occ_symbol("SPY   240215C00500500").unwrap();
        assert_eq!(contract.underlying, "SPY");
        assert_eq!(contract.strike, Decimal::new(5005, 1)); // 500.5
    }

    #[test]
    fn parse_occ_symbol_short_underlying() {
        let contract = ParsedOptionContract::from_occ_symbol("F     260115C00012000").unwrap();
        assert_eq!(contract.underlying, "F");
        assert_eq!(contract.strike, Decimal::new(12, 0));
    }

    #[test]
    fn parse_occ_symbol_invalid_too_short() {
        assert!(ParsedOptionContract::from_occ_symbol("AAPL").is_none());
    }

    #[test]
    fn parse_occ_symbol_invalid_type() {
        assert!(ParsedOptionContract::from_occ_symbol("AAPL  240119X00150000").is_none());
    }
}
