//! Alpaca API request and response types.

use std::collections::HashMap;

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::models::{
    Decision, OrderLegState, OrderSide, OrderState, OrderStatus, OrderType, TimeInForce,
};

// ============================================================================
// Market Data Types
// ============================================================================

/// Response from GET /v2/stocks/bars endpoint.
#[derive(Debug, Deserialize)]
pub struct AlpacaBarsResponse {
    /// Map of symbol to bars.
    pub bars: HashMap<String, Vec<AlpacaBar>>,
    /// Token for pagination (if more results available).
    pub next_page_token: Option<String>,
}

/// Single OHLCV bar from Alpaca market data API.
#[derive(Debug, Deserialize, Clone)]
pub struct AlpacaBar {
    /// Timestamp in RFC3339 format.
    pub t: String,
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
    /// Volume-weighted average price.
    #[serde(default)]
    pub vw: Option<f64>,
    /// Number of trades.
    #[serde(default)]
    pub n: Option<i32>,
}

/// Response from GET /v2/stocks/quotes/latest endpoint.
#[derive(Debug, Deserialize)]
pub struct AlpacaQuotesResponse {
    /// Map of symbol to latest quote.
    pub quotes: HashMap<String, AlpacaQuote>,
}

/// Latest quote from Alpaca market data API.
#[derive(Debug, Deserialize, Clone)]
pub struct AlpacaQuote {
    /// Timestamp in RFC3339 format.
    pub t: String,
    /// Ask price.
    pub ap: f64,
    /// Ask size.
    #[serde(rename = "as")]
    pub ask_size: i32,
    /// Bid price.
    pub bp: f64,
    /// Bid size.
    pub bs: i32,
}

// ============================================================================
// Trading API Types
// ============================================================================

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct AlpacaErrorResponse {
    pub(super) code: Option<String>,
    pub(super) message: String,
}

/// Take profit leg for bracket orders
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct TakeProfitLeg {
    pub(super) limit_price: String,
}

/// Stop loss leg for bracket orders
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct StopLossLeg {
    pub(super) stop_price: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) limit_price: Option<String>,
}

/// Order class for advanced order types
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum OrderClass {
    /// Simple order (no bracket)
    Simple,
    /// Bracket order with stop-loss and take-profit
    Bracket,
    /// One-triggers-other (entry + single exit)
    Oto,
    /// One-cancels-other (two exits)
    Oco,
    /// Multi-leg options order
    #[serde(rename = "mleg")]
    MultiLeg,
}

/// Helper to skip serializing `order_class` when it's simple.
/// Note: Takes reference due to serde `skip_serializing_if` signature requirement.
#[allow(clippy::trivially_copy_pass_by_ref)]
pub(super) fn is_simple_order(class: &OrderClass) -> bool {
    *class == OrderClass::Simple
}

// ============================================================================
// Multi-Leg Order Types (Level 3 Options)
// ============================================================================

/// Position intent for options orders (Alpaca API format)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(super) enum AlpacaPositionIntent {
    BuyToOpen,
    BuyToClose,
    SellToOpen,
    SellToClose,
}

impl From<crate::models::PositionIntent> for AlpacaPositionIntent {
    fn from(intent: crate::models::PositionIntent) -> Self {
        match intent {
            crate::models::PositionIntent::BuyToOpen => Self::BuyToOpen,
            crate::models::PositionIntent::BuyToClose => Self::BuyToClose,
            crate::models::PositionIntent::SellToOpen => Self::SellToOpen,
            crate::models::PositionIntent::SellToClose => Self::SellToClose,
        }
    }
}

/// Single leg for multi-leg options order request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct AlpacaMultiLegOrderLeg {
    /// OCC option symbol (e.g., "AAPL250117P00190000")
    pub(super) symbol: String,
    /// Quantity ratio (always positive in request, use side for direction)
    pub(super) ratio_qty: String,
    /// Order side (buy/sell)
    pub(super) side: String,
    /// Position intent (buy_to_open, sell_to_open, etc.)
    pub(super) position_intent: AlpacaPositionIntent,
}

/// Multi-leg options order request (Level 3 Options)
///
/// Alpaca API constraints:
/// - Max 4 legs
/// - ratio_qty GCD must be 1
/// - type: only "limit" for multi-leg
/// - time_in_force: "day" only for options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(super) struct AlpacaMultiLegOrderRequest {
    /// Order class (always "mleg" for multi-leg)
    pub(super) order_class: String,
    /// Total quantity (contracts)
    pub(super) qty: String,
    /// Order type (only "limit" supported for multi-leg)
    #[serde(rename = "type")]
    pub(super) order_type: String,
    /// Net limit price for the spread (debit positive, credit negative)
    pub(super) limit_price: String,
    /// Time in force (only "day" for options)
    pub(super) time_in_force: String,
    /// Order legs (2-4 legs)
    pub(super) legs: Vec<AlpacaMultiLegOrderLeg>,
    /// Optional client order ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) client_order_id: Option<String>,
}

impl AlpacaMultiLegOrderRequest {
    /// Create a multi-leg order request from a decision with legs.
    ///
    /// Returns None if the decision doesn't have valid multi-leg data.
    pub(super) fn from_decision(decision: &Decision) -> Option<Self> {
        // Must have legs for multi-leg order
        if decision.legs.is_empty() || decision.legs.len() > 4 {
            return None;
        }

        // Multi-leg orders require a net limit price
        let limit_price = decision.net_limit_price?;

        let legs: Vec<AlpacaMultiLegOrderLeg> = decision
            .legs
            .iter()
            .map(|leg| {
                // ratio_qty in our model: positive = buy, negative = sell
                let side = if leg.ratio_qty >= 0 { "buy" } else { "sell" };
                AlpacaMultiLegOrderLeg {
                    symbol: leg.symbol.clone(),
                    ratio_qty: leg.ratio_qty.unsigned_abs().to_string(),
                    side: side.to_string(),
                    position_intent: leg.position_intent.into(),
                }
            })
            .collect();

        Some(Self {
            order_class: "mleg".to_string(),
            qty: decision.size.quantity.to_string(),
            order_type: "limit".to_string(),
            limit_price: limit_price.to_string(),
            time_in_force: "day".to_string(),
            legs,
            client_order_id: Some(decision.decision_id.clone()),
        })
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct AlpacaOrderRequest {
    pub(super) symbol: String,
    pub(super) qty: Option<String>,
    pub(super) notional: Option<String>,
    pub(super) side: String,
    #[serde(rename = "type")]
    pub(super) order_type: String,
    pub(super) time_in_force: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) limit_price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) stop_price: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) client_order_id: Option<String>,
    /// Order class for bracket/OTO/OCO orders
    #[serde(skip_serializing_if = "is_simple_order")]
    pub(super) order_class: OrderClass,
    /// Take profit leg for bracket orders
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) take_profit: Option<TakeProfitLeg>,
    /// Stop loss leg for bracket orders
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) stop_loss: Option<StopLossLeg>,
}

impl AlpacaOrderRequest {
    pub(super) fn from_decision(decision: &Decision) -> Self {
        let side = match decision.direction {
            crate::models::Direction::Long => "buy",
            crate::models::Direction::Short | crate::models::Direction::Flat => "sell",
        };

        let (qty, notional) = match decision.size.unit {
            crate::models::SizeUnit::Shares | crate::models::SizeUnit::Contracts => {
                (Some(decision.size.quantity.to_string()), None)
            }
            crate::models::SizeUnit::Dollars => (None, Some(decision.size.quantity.to_string())),
            crate::models::SizeUnit::PctEquity => {
                // For percentage, we'd need account equity to convert to dollars
                // For now, use notional with the percentage value
                (None, Some(decision.size.quantity.to_string()))
            }
        };

        let order_type = if decision.limit_price.is_some() {
            "limit"
        } else {
            "market"
        };

        // Determine order class and legs based on stop/target levels
        let has_stop = decision.stop_loss_level > Decimal::ZERO;
        let has_target = decision.take_profit_level > Decimal::ZERO;

        let (order_class, take_profit, stop_loss) = match (has_stop, has_target) {
            // Both stop and target: bracket order
            (true, true) => (
                OrderClass::Bracket,
                Some(TakeProfitLeg {
                    limit_price: decision.take_profit_level.to_string(),
                }),
                Some(StopLossLeg {
                    stop_price: decision.stop_loss_level.to_string(),
                    limit_price: None, // Use stop market order for stop loss
                }),
            ),
            // Only stop loss: OTO (one-triggers-other)
            (true, false) => (
                OrderClass::Oto,
                None,
                Some(StopLossLeg {
                    stop_price: decision.stop_loss_level.to_string(),
                    limit_price: None,
                }),
            ),
            // Only take profit: OTO with take profit
            (false, true) => (
                OrderClass::Oto,
                Some(TakeProfitLeg {
                    limit_price: decision.take_profit_level.to_string(),
                }),
                None,
            ),
            // No stop or target: simple order
            (false, false) => (OrderClass::Simple, None, None),
        };

        Self {
            symbol: decision.instrument_id.clone(),
            qty,
            notional,
            side: side.to_string(),
            order_type: order_type.to_string(),
            time_in_force: "day".to_string(),
            limit_price: decision.limit_price.map(|p| p.to_string()),
            stop_price: None,
            client_order_id: Some(decision.decision_id.clone()),
            order_class,
            take_profit,
            stop_loss,
        }
    }
}

/// Bracket order leg from Alpaca API response
#[derive(Debug, Serialize, Deserialize, Clone)]
pub(super) struct AlpacaOrderLeg {
    pub(super) id: String,
    #[serde(default)]
    pub(super) client_order_id: Option<String>,
    pub(super) status: String,
    #[serde(rename = "type")]
    pub(super) order_type: String,
    pub(super) side: String,
    #[serde(default)]
    pub(super) limit_price: Option<String>,
    #[serde(default)]
    pub(super) stop_price: Option<String>,
    pub(super) qty: String,
    pub(super) filled_qty: String,
    #[serde(default)]
    pub(super) filled_avg_price: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct AlpacaOrderResponse {
    pub(super) id: String,
    pub(super) client_order_id: String,
    pub(super) symbol: String,
    pub(super) qty: String,
    pub(super) filled_qty: String,
    pub(super) side: String,
    #[serde(rename = "type")]
    pub(super) order_type: String,
    pub(super) time_in_force: String,
    pub(super) status: String,
    #[serde(default)]
    pub(super) limit_price: Option<String>,
    #[serde(default)]
    pub(super) stop_price: Option<String>,
    #[serde(default)]
    pub(super) filled_avg_price: Option<String>,
    pub(super) created_at: String,
    pub(super) updated_at: String,
    pub(super) submitted_at: String,
    #[serde(default)]
    pub(super) filled_at: Option<String>,
    /// Order class (simple, bracket, oto, oco)
    #[serde(default)]
    pub(super) order_class: Option<String>,
    /// Bracket order legs (stop loss and take profit)
    #[serde(default)]
    pub(super) legs: Option<Vec<AlpacaOrderLeg>>,
}

impl OrderState {
    pub(super) fn from_alpaca_response(response: &AlpacaOrderResponse) -> Self {
        // Determine if this is a multi-leg order (bracket/OTO/OCO)
        let is_multi_leg = response
            .order_class
            .as_ref()
            .is_some_and(|c| c != "simple" && !c.is_empty());

        // Convert bracket legs to our OrderLegState format
        let legs: Vec<OrderLegState> = response
            .legs
            .as_ref()
            .map(|alpaca_legs| {
                alpaca_legs
                    .iter()
                    .enumerate()
                    .map(|(idx, leg)| {
                        // Truncation acceptable: leg index is bounded by order legs count (typically < 10)
                        #[allow(clippy::cast_possible_truncation)]
                        let leg_index = idx as u32;
                        OrderLegState {
                            leg_index,
                            instrument_id: response.symbol.clone(),
                            side: if leg.side == "buy" {
                                OrderSide::Buy
                            } else {
                                OrderSide::Sell
                            },
                            quantity: leg.qty.parse().unwrap_or(Decimal::ZERO),
                            filled_quantity: leg.filled_qty.parse().unwrap_or(Decimal::ZERO),
                            avg_fill_price: leg
                                .filled_avg_price
                                .as_ref()
                                .and_then(|p| p.parse().ok())
                                .unwrap_or(Decimal::ZERO),
                            status: parse_order_status(&leg.status),
                        }
                    })
                    .collect()
            })
            .unwrap_or_default();

        Self {
            order_id: response.client_order_id.clone(),
            broker_order_id: response.id.clone(),
            is_multi_leg,
            instrument_id: response.symbol.clone(),
            status: parse_order_status(&response.status),
            side: if response.side == "buy" {
                OrderSide::Buy
            } else {
                OrderSide::Sell
            },
            order_type: parse_order_type(&response.order_type),
            time_in_force: parse_time_in_force(&response.time_in_force),
            requested_quantity: response.qty.parse().unwrap_or(Decimal::ZERO),
            filled_quantity: response.filled_qty.parse().unwrap_or(Decimal::ZERO),
            avg_fill_price: response
                .filled_avg_price
                .as_ref()
                .and_then(|p| p.parse().ok())
                .unwrap_or(Decimal::ZERO),
            limit_price: response.limit_price.as_ref().and_then(|p| p.parse().ok()),
            stop_price: response.stop_price.as_ref().and_then(|p| p.parse().ok()),
            submitted_at: response.submitted_at.clone(),
            last_update_at: response.updated_at.clone(),
            status_message: response.status.clone(),
            legs,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct AlpacaAccountResponse {
    pub(super) id: String,
    pub(super) equity: String,
    pub(super) cash: String,
    pub(super) buying_power: String,
    #[serde(default)]
    pub(super) maintenance_margin: Option<String>,
    #[serde(default)]
    pub(super) daytrade_count: Option<i32>,
    #[serde(default)]
    pub(super) pattern_day_trader: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(super) struct AlpacaPositionResponse {
    pub(super) symbol: String,
    pub(super) qty: String,
    pub(super) side: String,
    pub(super) avg_entry_price: String,
    pub(super) market_value: String,
    pub(super) current_price: String,
    pub(super) unrealized_pl: String,
    #[serde(default)]
    pub(super) unrealized_plpc: Option<String>,
    #[serde(default)]
    pub(super) cost_basis: Option<String>,
}

// ============================================================================
// Options Data Types
// ============================================================================

/// Response from GET /v1beta1/options/snapshots endpoint.
#[derive(Debug, Deserialize)]
pub struct AlpacaOptionSnapshotsResponse {
    /// Map of option symbol to snapshot.
    pub snapshots: HashMap<String, AlpacaOptionSnapshot>,
}

/// Single option snapshot from Alpaca options data API.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AlpacaOptionSnapshot {
    /// Latest quote for the option.
    #[serde(default)]
    pub latest_quote: Option<AlpacaOptionQuote>,
    /// Latest trade for the option.
    #[serde(default)]
    pub latest_trade: Option<AlpacaOptionTrade>,
    /// Greeks for the option.
    #[serde(default)]
    pub greeks: Option<AlpacaOptionGreeks>,
    /// Implied volatility.
    #[serde(default)]
    pub implied_volatility: Option<f64>,
}

/// Option quote from Alpaca.
#[derive(Debug, Deserialize, Clone)]
pub struct AlpacaOptionQuote {
    /// Timestamp.
    pub t: String,
    /// Ask price.
    pub ap: f64,
    /// Ask size.
    #[serde(rename = "as")]
    pub ask_size: i32,
    /// Bid price.
    pub bp: f64,
    /// Bid size.
    pub bs: i32,
    /// Ask exchange.
    #[serde(default)]
    pub ax: Option<String>,
    /// Bid exchange.
    #[serde(default)]
    pub bx: Option<String>,
    /// Condition.
    #[serde(default)]
    pub c: Option<String>,
}

/// Option trade from Alpaca.
#[derive(Debug, Deserialize, Clone)]
pub struct AlpacaOptionTrade {
    /// Timestamp.
    pub t: String,
    /// Price.
    pub p: f64,
    /// Size.
    pub s: i32,
    /// Exchange.
    #[serde(default)]
    pub x: Option<String>,
    /// Condition.
    #[serde(default)]
    pub c: Option<String>,
}

/// Option Greeks from Alpaca.
#[derive(Debug, Deserialize, Clone)]
pub struct AlpacaOptionGreeks {
    /// Delta.
    #[serde(default)]
    pub delta: Option<f64>,
    /// Gamma.
    #[serde(default)]
    pub gamma: Option<f64>,
    /// Theta.
    #[serde(default)]
    pub theta: Option<f64>,
    /// Vega.
    #[serde(default)]
    pub vega: Option<f64>,
    /// Rho.
    #[serde(default)]
    pub rho: Option<f64>,
}

/// Option contract details parsed from OCC symbol.
#[derive(Debug, Clone)]
pub struct AlpacaOptionContract {
    /// Full OCC symbol.
    pub symbol: String,
    /// Underlying symbol.
    pub underlying: String,
    /// Expiration date (YYYY-MM-DD).
    pub expiration: String,
    /// Option type (call or put).
    pub option_type: OptionType,
    /// Strike price.
    pub strike: f64,
}

/// Option type enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OptionType {
    /// Call option.
    Call,
    /// Put option.
    Put,
}

impl AlpacaOptionContract {
    /// Parse an OCC symbol into contract details.
    ///
    /// OCC format: ROOT (up to 6 chars padded) + YYMMDD + C/P + strike * 1000 (8 digits)
    /// e.g., "AAPL  240119C00185000" -> { underlying: "AAPL", expiration: "2024-01-19", type: "call", strike: 185 }
    #[must_use]
    pub fn parse_occ_symbol(symbol: &str) -> Option<Self> {
        // Remove all spaces and convert to uppercase
        let normalized: String = symbol.chars().filter(|c| !c.is_whitespace()).collect();
        let normalized = normalized.to_uppercase();

        // OSI format: ROOT + YYMMDD + C/P + 8 digit strike
        // Minimum length: 1 (root) + 6 (date) + 1 (type) + 8 (strike) = 16
        if normalized.len() < 16 {
            return None;
        }

        // Extract components from the end (strike is always 8 digits, type is 1 char, date is 6 digits)
        #[allow(clippy::cast_precision_loss)]
        // Strike price precision loss is negligible for practical values
        let strike = normalized[normalized.len() - 8..].parse::<u64>().ok()? as f64 / 1000.0;
        let type_char = normalized.chars().nth(normalized.len() - 9)?;
        let date_str = &normalized[normalized.len() - 15..normalized.len() - 9];
        let underlying = normalized[..normalized.len() - 15].to_string();

        let option_type = match type_char {
            'C' => OptionType::Call,
            'P' => OptionType::Put,
            _ => return None,
        };

        if date_str.len() != 6 || !date_str.chars().all(|c| c.is_ascii_digit()) {
            return None;
        }

        // Parse date: YYMMDD -> YYYY-MM-DD
        let yy: u32 = date_str[0..2].parse().ok()?;
        let mm = &date_str[2..4];
        let dd = &date_str[4..6];
        let year = if yy >= 70 { 1900 + yy } else { 2000 + yy };

        Some(Self {
            symbol: symbol.to_string(),
            underlying,
            expiration: format!("{year}-{mm}-{dd}"),
            option_type,
            strike,
        })
    }
}

// ============================================================================
// Helper functions for parsing Alpaca enums
// ============================================================================

pub(super) fn parse_order_status(status: &str) -> OrderStatus {
    match status {
        "accepted" => OrderStatus::Accepted,
        "partially_filled" => OrderStatus::PartiallyFilled,
        "filled" => OrderStatus::Filled,
        "canceled" | "pending_cancel" => OrderStatus::Canceled,
        "rejected" => OrderStatus::Rejected,
        "expired" => OrderStatus::Expired,
        // "new", "pending_new", and unknown statuses default to New
        _ => OrderStatus::New,
    }
}

pub(super) fn parse_order_type(order_type: &str) -> OrderType {
    match order_type {
        "limit" => OrderType::Limit,
        "stop" => OrderType::Stop,
        "stop_limit" => OrderType::StopLimit,
        // "market" and unknown types default to Market
        _ => OrderType::Market,
    }
}

pub(super) fn parse_time_in_force(tif: &str) -> TimeInForce {
    match tif {
        "gtc" => TimeInForce::Gtc,
        "ioc" => TimeInForce::Ioc,
        "fok" => TimeInForce::Fok,
        "opg" => TimeInForce::Opg,
        "cls" => TimeInForce::Cls,
        // "day" and unknown values default to Day
        _ => TimeInForce::Day,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_order_status() {
        assert_eq!(parse_order_status("new"), OrderStatus::New);
        assert_eq!(parse_order_status("filled"), OrderStatus::Filled);
        assert_eq!(parse_order_status("canceled"), OrderStatus::Canceled);
        assert_eq!(parse_order_status("rejected"), OrderStatus::Rejected);
    }

    #[test]
    fn test_parse_order_type() {
        assert_eq!(parse_order_type("market"), OrderType::Market);
        assert_eq!(parse_order_type("limit"), OrderType::Limit);
        assert_eq!(parse_order_type("stop"), OrderType::Stop);
    }
}
