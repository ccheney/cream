//! Mock price feed for testing.

use std::collections::HashMap;
use std::sync::RwLock;

use async_trait::async_trait;
use rust_decimal::Decimal;

use crate::application::ports::{PriceFeedError, PriceFeedPort, Quote};
use crate::domain::shared::{InstrumentId, Symbol};

/// Mock price feed for testing.
#[derive(Debug, Default)]
pub struct MockPriceFeed {
    prices: RwLock<HashMap<String, Decimal>>,
    subscriptions: RwLock<Vec<String>>,
}

impl MockPriceFeed {
    /// Create a new mock price feed.
    #[must_use]
    pub fn new() -> Self {
        Self {
            prices: RwLock::new(HashMap::new()),
            subscriptions: RwLock::new(vec![]),
        }
    }

    /// Set the price for a symbol.
    pub fn set_price(&self, symbol: &str, price: Decimal) {
        let mut prices = self.prices.write().unwrap();
        prices.insert(symbol.to_string(), price);
    }

    /// Get the subscribed symbols.
    #[must_use]
    pub fn subscriptions(&self) -> Vec<String> {
        self.subscriptions.read().unwrap().clone()
    }

    /// Check if a symbol is subscribed.
    #[must_use]
    pub fn is_subscribed(&self, symbol: &str) -> bool {
        self.subscriptions
            .read()
            .unwrap()
            .contains(&symbol.to_string())
    }
}

#[async_trait]
impl PriceFeedPort for MockPriceFeed {
    async fn get_quote(&self, symbol: &Symbol) -> Result<Quote, PriceFeedError> {
        let prices = self.prices.read().unwrap();
        let price = prices
            .get(symbol.as_str())
            .copied()
            .unwrap_or(Decimal::new(100, 0));

        // Simulate bid/ask spread of 0.01
        let spread = Decimal::new(1, 2);
        let bid = price;
        let ask = price + spread;

        Ok(Quote::new(
            symbol.clone(),
            bid,
            ask,
            Decimal::new(100, 0), // bid_size
            Decimal::new(100, 0), // ask_size
        ))
    }

    async fn get_quotes(&self, symbols: &[Symbol]) -> Result<Vec<Quote>, PriceFeedError> {
        let mut quotes = vec![];
        for symbol in symbols {
            quotes.push(self.get_quote(symbol).await?);
        }
        Ok(quotes)
    }

    async fn subscribe(&self, symbol: &Symbol) -> Result<(), PriceFeedError> {
        let mut subscriptions = self.subscriptions.write().unwrap();
        if !subscriptions.contains(&symbol.as_str().to_string()) {
            subscriptions.push(symbol.as_str().to_string());
        }
        Ok(())
    }

    async fn unsubscribe(&self, symbol: &Symbol) -> Result<(), PriceFeedError> {
        let mut subscriptions = self.subscriptions.write().unwrap();
        subscriptions.retain(|s| s != symbol.as_str());
        Ok(())
    }

    async fn get_last_price(
        &self,
        instrument_id: &InstrumentId,
    ) -> Result<Decimal, PriceFeedError> {
        let prices = self.prices.read().unwrap();
        prices
            .get(instrument_id.as_str())
            .copied()
            .ok_or(PriceFeedError::DataUnavailable)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn get_quote_default() {
        let feed = MockPriceFeed::new();
        let quote = feed.get_quote(&Symbol::new("AAPL")).await.unwrap();

        assert_eq!(quote.symbol.as_str(), "AAPL");
        assert_eq!(quote.bid, Decimal::new(100, 0));
        assert_eq!(quote.ask, Decimal::new(10001, 2));
    }

    #[tokio::test]
    async fn get_quote_custom_price() {
        let feed = MockPriceFeed::new();
        feed.set_price("AAPL", Decimal::new(150, 0));

        let quote = feed.get_quote(&Symbol::new("AAPL")).await.unwrap();

        assert_eq!(quote.bid, Decimal::new(150, 0));
        assert_eq!(quote.ask, Decimal::new(15001, 2));
    }

    #[tokio::test]
    async fn get_last_price() {
        let feed = MockPriceFeed::new();
        feed.set_price("AAPL", Decimal::new(150, 0));

        let price = feed
            .get_last_price(&InstrumentId::new("AAPL"))
            .await
            .unwrap();
        assert_eq!(price, Decimal::new(150, 0));
    }

    #[tokio::test]
    async fn get_last_price_not_found() {
        let feed = MockPriceFeed::new();

        let result = feed.get_last_price(&InstrumentId::new("UNKNOWN")).await;
        assert!(matches!(result, Err(PriceFeedError::DataUnavailable)));
    }

    #[tokio::test]
    async fn subscribe_and_unsubscribe() {
        let feed = MockPriceFeed::new();

        feed.subscribe(&Symbol::new("AAPL")).await.unwrap();
        assert!(feed.is_subscribed("AAPL"));
        assert_eq!(feed.subscriptions().len(), 1);

        feed.unsubscribe(&Symbol::new("AAPL")).await.unwrap();
        assert!(!feed.is_subscribed("AAPL"));
        assert!(feed.subscriptions().is_empty());
    }

    #[tokio::test]
    async fn subscribe_idempotent() {
        let feed = MockPriceFeed::new();

        feed.subscribe(&Symbol::new("AAPL")).await.unwrap();
        feed.subscribe(&Symbol::new("AAPL")).await.unwrap();

        assert_eq!(feed.subscriptions().len(), 1);
    }
}
