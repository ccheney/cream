//! Bracket order types and builder.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::error::StopsError;

/// A bracket order with entry, stop-loss, and take-profit legs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BracketOrder {
    /// Unique bracket order ID.
    pub bracket_id: String,
    /// Instrument ID.
    pub instrument_id: String,
    /// Entry order details.
    pub entry: EntryOrderSpec,
    /// Stop-loss order details.
    pub stop_loss: StopOrderSpec,
    /// Take-profit order details.
    pub take_profit: TakeProfitOrderSpec,
}

/// Entry order specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EntryOrderSpec {
    /// Order side (buy or sell).
    pub side: String,
    /// Quantity.
    pub quantity: Decimal,
    /// Order type (market, limit).
    pub order_type: String,
    /// Limit price (if limit order).
    pub limit_price: Option<Decimal>,
    /// Time in force.
    pub time_in_force: String,
}

/// Stop-loss order specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StopOrderSpec {
    /// Stop price.
    pub stop_price: Decimal,
    /// Optional limit price for stop-limit.
    pub limit_price: Option<Decimal>,
}

/// Take-profit order specification.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TakeProfitOrderSpec {
    /// Limit price for take-profit.
    pub limit_price: Decimal,
}

/// Builder for bracket orders.
#[derive(Debug, Default)]
pub struct BracketOrderBuilder {
    instrument_id: Option<String>,
    side: Option<String>,
    quantity: Option<Decimal>,
    entry_type: String,
    entry_limit: Option<Decimal>,
    stop_loss: Option<Decimal>,
    stop_limit: Option<Decimal>,
    take_profit: Option<Decimal>,
    time_in_force: String,
}

impl BracketOrderBuilder {
    /// Create a new bracket order builder.
    #[must_use]
    pub fn new() -> Self {
        Self {
            entry_type: "market".to_string(),
            time_in_force: "day".to_string(),
            ..Default::default()
        }
    }

    /// Set the instrument ID.
    #[must_use]
    pub fn instrument(mut self, id: &str) -> Self {
        self.instrument_id = Some(id.to_string());
        self
    }

    /// Set the order side.
    #[must_use]
    pub fn side(mut self, side: &str) -> Self {
        self.side = Some(side.to_string());
        self
    }

    /// Set the quantity.
    #[must_use]
    pub const fn quantity(mut self, qty: Decimal) -> Self {
        self.quantity = Some(qty);
        self
    }

    /// Set as limit entry with specified price.
    #[must_use]
    pub fn limit_entry(mut self, price: Decimal) -> Self {
        self.entry_type = "limit".to_string();
        self.entry_limit = Some(price);
        self
    }

    /// Set the stop-loss price.
    #[must_use]
    pub const fn stop_loss(mut self, price: Decimal) -> Self {
        self.stop_loss = Some(price);
        self
    }

    /// Set stop-limit prices.
    #[must_use]
    pub const fn stop_limit(mut self, stop: Decimal, limit: Decimal) -> Self {
        self.stop_loss = Some(stop);
        self.stop_limit = Some(limit);
        self
    }

    /// Set the take-profit price.
    #[must_use]
    pub const fn take_profit(mut self, price: Decimal) -> Self {
        self.take_profit = Some(price);
        self
    }

    /// Set time in force.
    #[must_use]
    pub fn time_in_force(mut self, tif: &str) -> Self {
        self.time_in_force = tif.to_string();
        self
    }

    /// Build the bracket order.
    ///
    /// # Errors
    /// Returns an error if required fields are missing.
    pub fn build(self) -> Result<BracketOrder, StopsError> {
        let instrument_id = self
            .instrument_id
            .ok_or_else(|| StopsError::ValidationFailed("Instrument ID required".to_string()))?;

        let side = self
            .side
            .ok_or_else(|| StopsError::ValidationFailed("Side required".to_string()))?;

        let quantity = self
            .quantity
            .ok_or_else(|| StopsError::ValidationFailed("Quantity required".to_string()))?;

        let stop_loss_price = self
            .stop_loss
            .ok_or_else(|| StopsError::InvalidStopLoss("Stop loss price required".to_string()))?;

        let take_profit_price = self.take_profit.ok_or_else(|| {
            StopsError::InvalidTakeProfit("Take profit price required".to_string())
        })?;

        let bracket_id = format!("bracket-{}", uuid::Uuid::new_v4());

        Ok(BracketOrder {
            bracket_id,
            instrument_id,
            entry: EntryOrderSpec {
                side,
                quantity,
                order_type: self.entry_type,
                limit_price: self.entry_limit,
                time_in_force: self.time_in_force,
            },
            stop_loss: StopOrderSpec {
                stop_price: stop_loss_price,
                limit_price: self.stop_limit,
            },
            take_profit: TakeProfitOrderSpec {
                limit_price: take_profit_price,
            },
        })
    }
}

/// Determines whether bracket orders are supported for an instrument.
#[must_use]
pub fn supports_bracket_orders(instrument_id: &str) -> bool {
    // Options don't support bracket orders on Alpaca (as of Jan 2026)
    // Options have symbols like "AAPL240119C00150000" or start with "O:"
    let is_option = instrument_id.len() > 10
        || instrument_id.starts_with("O:")
        || (instrument_id.chars().any(|c| c.is_ascii_digit())
            && instrument_id.chars().any(|c| c == 'C' || c == 'P'));

    !is_option
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_bracket_order_builder() {
        let order = match BracketOrderBuilder::new()
            .instrument("AAPL")
            .side("buy")
            .quantity(Decimal::new(100, 0))
            .limit_entry(Decimal::new(15000, 2))
            .stop_loss(Decimal::new(14500, 2))
            .take_profit(Decimal::new(16000, 2))
            .build()
        {
            Ok(o) => o,
            Err(e) => panic!("should build bracket order: {e}"),
        };

        assert_eq!(order.instrument_id, "AAPL");
        assert_eq!(order.entry.quantity, Decimal::new(100, 0));
        assert_eq!(order.stop_loss.stop_price, Decimal::new(14500, 2));
        assert_eq!(order.take_profit.limit_price, Decimal::new(16000, 2));
    }

    #[test]
    fn test_bracket_order_missing_fields() {
        let result = BracketOrderBuilder::new().instrument("AAPL").build();
        assert!(result.is_err());
    }

    #[test]
    fn test_supports_bracket_orders_stock() {
        assert!(supports_bracket_orders("AAPL"));
        assert!(supports_bracket_orders("MSFT"));
        assert!(supports_bracket_orders("SPY"));
    }

    #[test]
    fn test_supports_bracket_orders_option() {
        // Options should not support bracket orders
        assert!(!supports_bracket_orders("AAPL240119C00150000"));
        assert!(!supports_bracket_orders("O:AAPL240119C00150000"));
    }
}
