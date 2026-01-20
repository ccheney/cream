//! Price Feed Port (Driven Port)
//!
//! Interface for receiving real-time market data.

use async_trait::async_trait;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::domain::shared::{InstrumentId, Symbol, Timestamp};

/// Market quote data.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Quote {
    /// Instrument symbol.
    pub symbol: Symbol,
    /// Best bid price.
    pub bid: Decimal,
    /// Best ask price.
    pub ask: Decimal,
    /// Bid size.
    pub bid_size: Decimal,
    /// Ask size.
    pub ask_size: Decimal,
    /// Quote timestamp.
    pub timestamp: Timestamp,
}

impl Quote {
    /// Create a new quote.
    #[must_use]
    pub fn new(
        symbol: Symbol,
        bid: Decimal,
        ask: Decimal,
        bid_size: Decimal,
        ask_size: Decimal,
    ) -> Self {
        Self {
            symbol,
            bid,
            ask,
            bid_size,
            ask_size,
            timestamp: Timestamp::now(),
        }
    }

    /// Get the mid price.
    #[must_use]
    pub fn mid(&self) -> Decimal {
        (self.bid + self.ask) / Decimal::from(2)
    }

    /// Get the spread.
    #[must_use]
    pub fn spread(&self) -> Decimal {
        self.ask - self.bid
    }

    /// Get the spread in basis points.
    #[must_use]
    pub fn spread_bps(&self) -> Option<Decimal> {
        let mid = self.mid();
        if mid == Decimal::ZERO {
            return None;
        }
        Some((self.spread() / mid) * Decimal::from(10000))
    }
}

/// Price feed error.
#[derive(Debug, Clone, thiserror::Error)]
pub enum PriceFeedError {
    /// Connection error.
    #[error("Price feed connection error: {message}")]
    ConnectionError {
        /// Error details.
        message: String,
    },

    /// Symbol not found.
    #[error("Symbol not found: {symbol}")]
    SymbolNotFound {
        /// The unknown symbol.
        symbol: String,
    },

    /// Data unavailable.
    #[error("Price data unavailable")]
    DataUnavailable,

    /// Subscription error.
    #[error("Subscription error: {message}")]
    SubscriptionError {
        /// Error details.
        message: String,
    },
}

/// Port for receiving market data.
#[async_trait]
pub trait PriceFeedPort: Send + Sync {
    /// Get the latest quote for a symbol.
    async fn get_quote(&self, symbol: &Symbol) -> Result<Quote, PriceFeedError>;

    /// Get quotes for multiple symbols.
    async fn get_quotes(&self, symbols: &[Symbol]) -> Result<Vec<Quote>, PriceFeedError>;

    /// Subscribe to real-time quotes for a symbol.
    async fn subscribe(&self, symbol: &Symbol) -> Result<(), PriceFeedError>;

    /// Unsubscribe from real-time quotes.
    async fn unsubscribe(&self, symbol: &Symbol) -> Result<(), PriceFeedError>;

    /// Get the last known price for an instrument.
    async fn get_last_price(&self, instrument_id: &InstrumentId)
    -> Result<Decimal, PriceFeedError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quote_new() {
        let quote = Quote::new(
            Symbol::new("AAPL"),
            Decimal::new(150, 0),
            Decimal::new(15010, 2), // 150.10
            Decimal::new(100, 0),
            Decimal::new(200, 0),
        );

        assert_eq!(quote.bid, Decimal::new(150, 0));
        assert_eq!(quote.ask, Decimal::new(15010, 2));
    }

    #[test]
    fn quote_mid() {
        let quote = Quote::new(
            Symbol::new("AAPL"),
            Decimal::new(150, 0),
            Decimal::new(151, 0),
            Decimal::new(100, 0),
            Decimal::new(200, 0),
        );

        // (150 + 151) / 2 = 150.5
        assert_eq!(quote.mid(), Decimal::new(1505, 1));
    }

    #[test]
    fn quote_spread() {
        let quote = Quote::new(
            Symbol::new("AAPL"),
            Decimal::new(150, 0),
            Decimal::new(151, 0),
            Decimal::new(100, 0),
            Decimal::new(200, 0),
        );

        assert_eq!(quote.spread(), Decimal::new(1, 0));
    }

    #[test]
    fn quote_spread_bps() {
        let quote = Quote::new(
            Symbol::new("AAPL"),
            Decimal::new(150, 0),
            Decimal::new(151, 0),
            Decimal::new(100, 0),
            Decimal::new(200, 0),
        );

        let bps = quote.spread_bps().unwrap();
        // spread = 1, mid = 150.5, bps = (1 / 150.5) * 10000 ≈ 66.44
        assert!(bps > Decimal::new(66, 0) && bps < Decimal::new(67, 0));
    }

    #[test]
    fn quote_spread_bps_zero_mid() {
        let quote = Quote::new(
            Symbol::new("TEST"),
            Decimal::ZERO,
            Decimal::ZERO,
            Decimal::new(100, 0),
            Decimal::new(200, 0),
        );

        assert!(quote.spread_bps().is_none());
    }

    #[test]
    fn quote_serde() {
        let quote = Quote::new(
            Symbol::new("AAPL"),
            Decimal::new(150, 0),
            Decimal::new(151, 0),
            Decimal::new(100, 0),
            Decimal::new(200, 0),
        );

        let json = serde_json::to_string(&quote).unwrap();
        let parsed: Quote = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.symbol.as_str(), quote.symbol.as_str());
    }
}
