//! Multi-leg order simulation (All-or-None behavior).

use std::collections::HashMap;

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::config::BacktestConfig;
use super::fill_engine::{Candle, FillResult, simulate_order};
use crate::models::{OrderSide, OrderType};

/// A single leg of a multi-leg order.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderLeg {
    /// Instrument ID for this leg.
    pub instrument_id: String,
    /// Order side for this leg.
    pub side: OrderSide,
    /// Quantity for this leg.
    pub quantity: Decimal,
    /// Leg ratio (e.g., 1 for 1:1, 2 for 2:1 ratio).
    pub ratio: i32,
    /// Order type for this leg.
    pub order_type: OrderType,
    /// Limit price (if applicable).
    pub limit_price: Option<Decimal>,
}

impl OrderLeg {
    /// Create a new order leg.
    #[must_use]
    pub fn new(
        instrument_id: &str,
        side: OrderSide,
        quantity: Decimal,
        ratio: i32,
        order_type: OrderType,
    ) -> Self {
        Self {
            instrument_id: instrument_id.to_string(),
            side,
            quantity,
            ratio,
            order_type,
            limit_price: None,
        }
    }

    /// Create a new order leg with limit price.
    #[must_use]
    pub fn with_limit(
        instrument_id: &str,
        side: OrderSide,
        quantity: Decimal,
        ratio: i32,
        limit_price: Decimal,
    ) -> Self {
        Self {
            instrument_id: instrument_id.to_string(),
            side,
            quantity,
            ratio,
            order_type: OrderType::Limit,
            limit_price: Some(limit_price),
        }
    }
}

/// Fill result for a single leg.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegFillResult {
    /// Instrument ID.
    pub instrument_id: String,
    /// Fill price.
    pub price: Decimal,
    /// Filled quantity.
    pub quantity: Decimal,
    /// Order side.
    pub side: OrderSide,
    /// Leg ratio.
    pub ratio: i32,
}

/// Result of multi-leg order simulation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiLegFillResult {
    /// Whether all legs were filled.
    pub filled: bool,
    /// Individual leg fills.
    pub leg_fills: Vec<LegFillResult>,
    /// Net price (positive = debit, negative = credit).
    pub net_price: Decimal,
    /// Reason for fill/reject.
    pub reason: String,
}

impl MultiLegFillResult {
    /// Create a rejected result.
    #[must_use]
    pub fn rejected(reason: &str) -> Self {
        Self {
            filled: false,
            leg_fills: Vec::new(),
            net_price: Decimal::ZERO,
            reason: reason.to_string(),
        }
    }

    /// Create a filled result.
    #[must_use]
    pub fn filled(leg_fills: Vec<LegFillResult>, net_price: Decimal) -> Self {
        Self {
            filled: true,
            leg_fills,
            net_price,
            reason: "Multi-leg order filled (All-or-None)".to_string(),
        }
    }
}

/// Simulate a multi-leg options order.
///
/// Multi-leg orders follow All-or-None (AON) behavior:
/// - All legs must be fillable for the order to execute
/// - If any leg cannot fill, the entire order is rejected
///
/// # Arguments
/// * `legs` - The order legs to simulate
/// * `candles` - Map of instrument ID to candle data
/// * `config` - Backtest configuration
/// * `avg_volumes` - Optional map of instrument ID to average volume
///
/// # Returns
/// Multi-leg fill result with net price (debit/credit)
pub fn simulate_multi_leg_order(
    legs: &[OrderLeg],
    candles: &HashMap<String, Candle>,
    config: &BacktestConfig,
    avg_volumes: Option<&HashMap<String, Decimal>>,
) -> MultiLegFillResult {
    if legs.is_empty() {
        return MultiLegFillResult::rejected("No legs in multi-leg order");
    }

    // Validate all instruments have candle data
    for leg in legs {
        if !candles.contains_key(&leg.instrument_id) {
            return MultiLegFillResult::rejected(&format!(
                "Missing candle data for instrument: {}",
                leg.instrument_id
            ));
        }
    }

    // Try to fill each leg
    let mut leg_results: Vec<(OrderLeg, FillResult)> = Vec::new();

    for leg in legs {
        // Safety: we validated all instruments have candle data above
        let candle = candles
            .get(&leg.instrument_id)
            .expect("candle data validated to exist for all legs");
        let avg_volume = avg_volumes.and_then(|v| v.get(&leg.instrument_id).copied());

        let fill = simulate_order(
            leg.order_type,
            leg.side,
            leg.quantity,
            leg.limit_price,
            None, // No stop price for multi-leg options orders
            candle,
            config,
            true, // Always treat as entry for multi-leg
            avg_volume,
        );

        leg_results.push((leg.clone(), fill));
    }

    // Check if all legs filled (All-or-None)
    for (leg, fill) in &leg_results {
        if !fill.filled {
            return MultiLegFillResult::rejected(&format!(
                "Leg {} did not fill: {}",
                leg.instrument_id, fill.reason
            ));
        }
    }

    // All legs filled - calculate net price
    let leg_fills: Vec<LegFillResult> = leg_results
        .iter()
        .map(|(leg, fill)| LegFillResult {
            instrument_id: leg.instrument_id.clone(),
            price: fill.price.unwrap_or(Decimal::ZERO),
            quantity: fill.filled_quantity,
            side: leg.side,
            ratio: leg.ratio,
        })
        .collect();

    let net_price = calculate_net_price(&leg_fills);

    MultiLegFillResult::filled(leg_fills, net_price)
}

/// Calculate the net price for a multi-leg fill.
///
/// Net price = sum of (`fill_price` * `ratio` * `side_multiplier`) for all legs
/// - Positive = net debit (money paid)
/// - Negative = net credit (money received)
fn calculate_net_price(leg_fills: &[LegFillResult]) -> Decimal {
    leg_fills
        .iter()
        .map(|fill| {
            let side_multiplier = match fill.side {
                OrderSide::Buy => Decimal::ONE,   // Pay for buys
                OrderSide::Sell => -Decimal::ONE, // Receive for sells
            };

            fill.price * Decimal::from(fill.ratio) * side_multiplier
        })
        .sum()
}

/// Calculate the total contracts traded in a multi-leg fill.
#[must_use]
pub fn calculate_total_contracts(leg_fills: &[LegFillResult]) -> Decimal {
    leg_fills
        .iter()
        .map(|fill| fill.quantity * Decimal::from(fill.ratio.abs()))
        .sum()
}

/// Validate leg ratios for common spread types.
///
/// Returns true if the ratios are balanced (common spreads have 1:1 ratios).
#[must_use]
pub fn validate_balanced_ratios(legs: &[OrderLeg]) -> bool {
    if legs.is_empty() {
        return true;
    }

    // For balanced spreads, absolute ratios should be equal
    let first_ratio = legs[0].ratio.abs();
    legs.iter().all(|leg| leg.ratio.abs() == first_ratio)
}

/// Create a bull call spread order.
///
/// Buy lower strike call, sell higher strike call.
#[must_use]
pub fn create_bull_call_spread(
    long_call: &str,
    short_call: &str,
    quantity: Decimal,
    long_limit: Option<Decimal>,
    short_limit: Option<Decimal>,
) -> Vec<OrderLeg> {
    vec![
        OrderLeg {
            instrument_id: long_call.to_string(),
            side: OrderSide::Buy,
            quantity,
            ratio: 1,
            order_type: if long_limit.is_some() {
                OrderType::Limit
            } else {
                OrderType::Market
            },
            limit_price: long_limit,
        },
        OrderLeg {
            instrument_id: short_call.to_string(),
            side: OrderSide::Sell,
            quantity,
            ratio: 1,
            order_type: if short_limit.is_some() {
                OrderType::Limit
            } else {
                OrderType::Market
            },
            limit_price: short_limit,
        },
    ]
}

/// Create an iron condor order.
///
/// Four legs: long OTM put, short ATM put, short ATM call, long OTM call.
#[must_use]
pub fn create_iron_condor(
    long_put: &str,
    short_put: &str,
    short_call: &str,
    long_call: &str,
    quantity: Decimal,
) -> Vec<OrderLeg> {
    vec![
        OrderLeg::new(long_put, OrderSide::Buy, quantity, 1, OrderType::Market),
        OrderLeg::new(short_put, OrderSide::Sell, quantity, 1, OrderType::Market),
        OrderLeg::new(short_call, OrderSide::Sell, quantity, 1, OrderType::Market),
        OrderLeg::new(long_call, OrderSide::Buy, quantity, 1, OrderType::Market),
    ]
}

/// Create a straddle order.
///
/// Buy call and put at the same strike.
#[must_use]
pub fn create_straddle(call: &str, put: &str, quantity: Decimal) -> Vec<OrderLeg> {
    vec![
        OrderLeg::new(call, OrderSide::Buy, quantity, 1, OrderType::Market),
        OrderLeg::new(put, OrderSide::Buy, quantity, 1, OrderType::Market),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_candle(open: i64, high: i64, low: i64, close: i64) -> Candle {
        Candle {
            open: Decimal::new(open, 2),
            high: Decimal::new(high, 2),
            low: Decimal::new(low, 2),
            close: Decimal::new(close, 2),
            volume: Decimal::new(10000, 0),
            timestamp: "2026-01-05T10:00:00Z".to_string(),
        }
    }

    fn default_config() -> BacktestConfig {
        BacktestConfig::default()
    }

    #[test]
    fn test_bull_call_spread_filled() {
        let config = default_config();

        let legs = create_bull_call_spread(
            "AAPL240119C00150000", // Long call
            "AAPL240119C00155000", // Short call
            Decimal::ONE,
            None,
            None,
        );

        let mut candles = HashMap::new();
        candles.insert(
            "AAPL240119C00150000".to_string(),
            make_candle(500, 550, 480, 520),
        );
        candles.insert(
            "AAPL240119C00155000".to_string(),
            make_candle(200, 230, 180, 210),
        );

        let result = simulate_multi_leg_order(&legs, &candles, &config, None);

        assert!(result.filled);
        assert_eq!(result.leg_fills.len(), 2);

        // Net debit = long price - short price
        // Long fill ~$5.00, Short fill ~$2.00, net debit ~$3.00
        assert!(result.net_price > Decimal::ZERO); // Debit spread
    }

    #[test]
    fn test_multi_leg_missing_candle() {
        let config = default_config();

        let legs = create_bull_call_spread(
            "AAPL240119C00150000",
            "AAPL240119C00155000",
            Decimal::ONE,
            None,
            None,
        );

        let mut candles = HashMap::new();
        candles.insert(
            "AAPL240119C00150000".to_string(),
            make_candle(500, 550, 480, 520),
        );
        // Missing short call candle

        let result = simulate_multi_leg_order(&legs, &candles, &config, None);

        assert!(!result.filled);
        assert!(result.reason.contains("Missing candle data"));
    }

    #[test]
    fn test_multi_leg_limit_order_not_filled() {
        let config = default_config();

        let legs = vec![
            OrderLeg::with_limit(
                "AAPL240119C00150000",
                OrderSide::Buy,
                Decimal::ONE,
                1,
                Decimal::new(400, 2), // Limit at $4.00 (won't fill - candle low is $4.80)
            ),
            OrderLeg::new(
                "AAPL240119C00155000",
                OrderSide::Sell,
                Decimal::ONE,
                1,
                OrderType::Market,
            ),
        ];

        let mut candles = HashMap::new();
        candles.insert(
            "AAPL240119C00150000".to_string(),
            make_candle(500, 550, 480, 520),
        );
        candles.insert(
            "AAPL240119C00155000".to_string(),
            make_candle(200, 230, 180, 210),
        );

        let result = simulate_multi_leg_order(&legs, &candles, &config, None);

        assert!(!result.filled); // All-or-None - one leg didn't fill
        assert!(result.reason.contains("did not fill"));
    }

    #[test]
    fn test_iron_condor() {
        let config = default_config();

        let legs = create_iron_condor(
            "AAPL240119P00140000", // Long put (wing)
            "AAPL240119P00145000", // Short put
            "AAPL240119C00155000", // Short call
            "AAPL240119C00160000", // Long call (wing)
            Decimal::ONE,
        );

        let mut candles = HashMap::new();
        candles.insert(
            "AAPL240119P00140000".to_string(),
            make_candle(100, 120, 90, 110),
        );
        candles.insert(
            "AAPL240119P00145000".to_string(),
            make_candle(200, 230, 180, 210),
        );
        candles.insert(
            "AAPL240119C00155000".to_string(),
            make_candle(250, 280, 230, 260),
        );
        candles.insert(
            "AAPL240119C00160000".to_string(),
            make_candle(150, 170, 130, 160),
        );

        let result = simulate_multi_leg_order(&legs, &candles, &config, None);

        assert!(result.filled);
        assert_eq!(result.leg_fills.len(), 4);

        // Iron condor is typically a net credit
        // Net = -long_put + short_put + short_call - long_call
        // Should be negative (credit)
    }

    #[test]
    fn test_straddle() {
        let config = default_config();

        let legs = create_straddle("AAPL240119C00150000", "AAPL240119P00150000", Decimal::ONE);

        let mut candles = HashMap::new();
        candles.insert(
            "AAPL240119C00150000".to_string(),
            make_candle(500, 550, 480, 520),
        );
        candles.insert(
            "AAPL240119P00150000".to_string(),
            make_candle(300, 330, 280, 310),
        );

        let result = simulate_multi_leg_order(&legs, &candles, &config, None);

        assert!(result.filled);
        assert_eq!(result.leg_fills.len(), 2);

        // Straddle is net debit (buy both)
        assert!(result.net_price > Decimal::ZERO);
    }

    #[test]
    fn test_calculate_net_price() {
        let leg_fills = vec![
            LegFillResult {
                instrument_id: "CALL".to_string(),
                price: Decimal::new(500, 2), // $5.00
                quantity: Decimal::ONE,
                side: OrderSide::Buy,
                ratio: 1,
            },
            LegFillResult {
                instrument_id: "PUT".to_string(),
                price: Decimal::new(200, 2), // $2.00
                quantity: Decimal::ONE,
                side: OrderSide::Sell,
                ratio: 1,
            },
        ];

        let net = calculate_net_price(&leg_fills);

        // Buy $5.00 - Sell $2.00 = $3.00 net debit
        assert_eq!(net, Decimal::new(300, 2));
    }

    #[test]
    fn test_validate_balanced_ratios() {
        let balanced = vec![
            OrderLeg::new("A", OrderSide::Buy, Decimal::ONE, 1, OrderType::Market),
            OrderLeg::new("B", OrderSide::Sell, Decimal::ONE, 1, OrderType::Market),
        ];
        assert!(validate_balanced_ratios(&balanced));

        let unbalanced = vec![
            OrderLeg::new("A", OrderSide::Buy, Decimal::ONE, 2, OrderType::Market),
            OrderLeg::new("B", OrderSide::Sell, Decimal::ONE, 1, OrderType::Market),
        ];
        assert!(!validate_balanced_ratios(&unbalanced));

        assert!(validate_balanced_ratios(&[]));
    }

    #[test]
    fn test_calculate_total_contracts() {
        let leg_fills = vec![
            LegFillResult {
                instrument_id: "A".to_string(),
                price: Decimal::new(500, 2),
                quantity: Decimal::new(2, 0),
                side: OrderSide::Buy,
                ratio: 1,
            },
            LegFillResult {
                instrument_id: "B".to_string(),
                price: Decimal::new(200, 2),
                quantity: Decimal::new(2, 0),
                side: OrderSide::Sell,
                ratio: 1,
            },
        ];

        let total = calculate_total_contracts(&leg_fills);
        assert_eq!(total, Decimal::new(4, 0));
    }
}
