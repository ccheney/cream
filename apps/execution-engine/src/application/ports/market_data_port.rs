//! Market Data Port (Driven Port)
//!
//! Interface for fetching market data from external providers.
//! This is a secondary/outbound port used by application use cases.

use async_trait::async_trait;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::domain::shared::Timestamp;

/// Market quote for a single symbol.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MarketQuote {
    /// Symbol (e.g., "AAPL").
    pub symbol: String,
    /// Best bid price.
    pub bid: Decimal,
    /// Best ask price.
    pub ask: Decimal,
    /// Bid size (shares/contracts).
    pub bid_size: i32,
    /// Ask size (shares/contracts).
    pub ask_size: i32,
    /// Last trade price.
    pub last: Decimal,
    /// Last trade size.
    pub last_size: i32,
    /// Cumulative volume.
    pub volume: i64,
    /// Quote timestamp.
    pub timestamp: Timestamp,
}

impl MarketQuote {
    /// Get the mid price.
    #[must_use]
    pub fn mid(&self) -> Decimal {
        (self.bid + self.ask) / Decimal::from(2)
    }
}

/// Option type (call or put).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OptionType {
    /// Call option.
    Call,
    /// Put option.
    Put,
}

/// Option contract details.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct OptionContract {
    /// Underlying symbol.
    pub underlying: String,
    /// Expiration date (YYYY-MM-DD).
    pub expiration: String,
    /// Strike price.
    pub strike: Decimal,
    /// Option type.
    pub option_type: OptionType,
}

/// Greeks for an option.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OptionGreeks {
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

/// Option quote with contract info and Greeks.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionQuote {
    /// Option contract.
    pub contract: OptionContract,
    /// Quote data (bid, ask, etc.).
    pub quote: Option<MarketQuote>,
    /// Implied volatility.
    pub implied_volatility: Option<f64>,
    /// Greeks.
    pub greeks: Option<OptionGreeks>,
    /// Open interest.
    pub open_interest: i32,
}

/// Option chain for an underlying.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptionChainData {
    /// Underlying symbol.
    pub underlying: String,
    /// Underlying price.
    pub underlying_price: Decimal,
    /// Option quotes.
    pub options: Vec<OptionQuote>,
    /// Chain timestamp.
    pub as_of: Timestamp,
}

/// Market data error.
#[derive(Debug, Clone, thiserror::Error)]
pub enum MarketDataError {
    /// Connection error.
    #[error("Market data connection error: {message}")]
    ConnectionError {
        /// Error details.
        message: String,
    },

    /// Authentication failed.
    #[error("Market data authentication failed")]
    AuthenticationFailed,

    /// Symbol not found.
    #[error("Symbol not found: {symbol}")]
    SymbolNotFound {
        /// The unknown symbol.
        symbol: String,
    },

    /// Data unavailable.
    #[error("Market data unavailable: {message}")]
    DataUnavailable {
        /// Error details.
        message: String,
    },

    /// Rate limited.
    #[error("Rate limited, retry after {retry_after_secs} seconds")]
    RateLimited {
        /// Seconds to wait before retrying.
        retry_after_secs: u64,
    },

    /// API error.
    #[error("Market data API error: {message}")]
    ApiError {
        /// Error details.
        message: String,
    },
}

/// Port for fetching market data from external providers.
///
/// This is a driven (secondary/outbound) port. The infrastructure layer
/// provides implementations (e.g., Alpaca adapter).
#[async_trait]
pub trait MarketDataPort: Send + Sync {
    /// Get quotes for multiple symbols.
    ///
    /// Returns quotes for each symbol that has data available.
    /// Symbols without data are silently skipped.
    async fn get_quotes(&self, symbols: &[String]) -> Result<Vec<MarketQuote>, MarketDataError>;

    /// Get option chain for an underlying symbol.
    ///
    /// Includes option contracts, quotes, and Greeks where available.
    async fn get_option_chain(&self, underlying: &str) -> Result<OptionChainData, MarketDataError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn market_quote_mid() {
        let quote = MarketQuote {
            symbol: "AAPL".to_string(),
            bid: Decimal::new(150, 0),
            ask: Decimal::new(151, 0),
            bid_size: 100,
            ask_size: 200,
            last: Decimal::new(15050, 2),
            last_size: 10,
            volume: 1_000_000,
            timestamp: Timestamp::now(),
        };

        // (150 + 151) / 2 = 150.5
        assert_eq!(quote.mid(), Decimal::new(1505, 1));
    }
}
