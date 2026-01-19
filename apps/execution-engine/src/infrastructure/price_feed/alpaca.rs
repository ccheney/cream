//! Alpaca Market Data price feed adapter.

use std::collections::HashSet;
use std::sync::RwLock;

use async_trait::async_trait;
use rust_decimal::Decimal;

use crate::application::ports::{PriceFeedError, PriceFeedPort, Quote};
use crate::domain::shared::{InstrumentId, Symbol};
use crate::infrastructure::broker::alpaca::{AlpacaConfig, AlpacaError};

/// Alpaca price feed adapter.
///
/// Implements `PriceFeedPort` using Alpaca's Market Data API.
#[derive(Debug)]
pub struct AlpacaPriceFeedAdapter {
    client: reqwest::Client,
    api_key: String,
    api_secret: String,
    data_url: String,
    subscriptions: RwLock<HashSet<String>>,
}

impl AlpacaPriceFeedAdapter {
    /// Create a new Alpaca price feed adapter.
    pub fn new(config: &AlpacaConfig) -> Result<Self, AlpacaError> {
        if config.api_key.is_empty() || config.api_secret.is_empty() {
            return Err(AlpacaError::AuthenticationFailed);
        }

        let client = reqwest::Client::builder()
            .timeout(config.timeout)
            .build()
            .map_err(|e| AlpacaError::Network(e.to_string()))?;

        Ok(Self {
            client,
            api_key: config.api_key.clone(),
            api_secret: config.api_secret.clone(),
            data_url: config.data_base_url().to_string(),
            subscriptions: RwLock::new(HashSet::new()),
        })
    }

    /// Fetch latest quote from Alpaca.
    async fn fetch_quote(&self, symbol: &str) -> Result<AlpacaQuoteResponse, AlpacaError> {
        let url = format!(
            "{}/v2/stocks/{}/quotes/latest",
            self.data_url,
            symbol.to_uppercase()
        );

        let response = self
            .client
            .get(&url)
            .header("APCA-API-KEY-ID", &self.api_key)
            .header("APCA-API-SECRET-KEY", &self.api_secret)
            .send()
            .await
            .map_err(|e| AlpacaError::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AlpacaError::Api {
                code: status.as_u16().to_string(),
                message: body,
            });
        }

        response
            .json()
            .await
            .map_err(|e| AlpacaError::JsonParse(e.to_string()))
    }

    /// Fetch latest quotes for multiple symbols.
    async fn fetch_quotes(&self, symbols: &[String]) -> Result<AlpacaQuotesResponse, AlpacaError> {
        if symbols.is_empty() {
            return Ok(AlpacaQuotesResponse {
                quotes: std::collections::HashMap::new(),
            });
        }

        let symbols_param = symbols.join(",");
        let url = format!(
            "{}/v2/stocks/quotes/latest?symbols={}",
            self.data_url, symbols_param
        );

        let response = self
            .client
            .get(&url)
            .header("APCA-API-KEY-ID", &self.api_key)
            .header("APCA-API-SECRET-KEY", &self.api_secret)
            .send()
            .await
            .map_err(|e| AlpacaError::Network(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(AlpacaError::Api {
                code: status.as_u16().to_string(),
                message: body,
            });
        }

        response
            .json()
            .await
            .map_err(|e| AlpacaError::JsonParse(e.to_string()))
    }
}

#[async_trait]
impl PriceFeedPort for AlpacaPriceFeedAdapter {
    async fn get_quote(&self, symbol: &Symbol) -> Result<Quote, PriceFeedError> {
        let response = self.fetch_quote(symbol.as_str()).await.map_err(|e| {
            PriceFeedError::ConnectionError {
                message: e.to_string(),
            }
        })?;

        let bid =
            Decimal::try_from(response.quote.bp).map_err(|_| PriceFeedError::DataUnavailable)?;
        let ask =
            Decimal::try_from(response.quote.ap).map_err(|_| PriceFeedError::DataUnavailable)?;

        #[allow(clippy::cast_precision_loss)]
        let bid_size = Decimal::from(response.quote.bs);
        #[allow(clippy::cast_precision_loss)]
        let ask_size = Decimal::from(response.quote.ask_size);

        Ok(Quote::new(symbol.clone(), bid, ask, bid_size, ask_size))
    }

    async fn get_quotes(&self, symbols: &[Symbol]) -> Result<Vec<Quote>, PriceFeedError> {
        let symbol_strings: Vec<String> = symbols.iter().map(|s| s.as_str().to_string()).collect();

        let response = self.fetch_quotes(&symbol_strings).await.map_err(|e| {
            PriceFeedError::ConnectionError {
                message: e.to_string(),
            }
        })?;

        let mut quotes = Vec::with_capacity(symbols.len());
        for symbol in symbols {
            if let Some(quote_data) = response.quotes.get(symbol.as_str()) {
                let bid = Decimal::try_from(quote_data.bp)
                    .map_err(|_| PriceFeedError::DataUnavailable)?;
                let ask = Decimal::try_from(quote_data.ap)
                    .map_err(|_| PriceFeedError::DataUnavailable)?;

                #[allow(clippy::cast_precision_loss)]
                let bid_size = Decimal::from(quote_data.bs);
                #[allow(clippy::cast_precision_loss)]
                let ask_size = Decimal::from(quote_data.ask_size);

                quotes.push(Quote::new(symbol.clone(), bid, ask, bid_size, ask_size));
            }
        }

        Ok(quotes)
    }

    async fn subscribe(&self, symbol: &Symbol) -> Result<(), PriceFeedError> {
        let mut subscriptions = self.subscriptions.write().unwrap();
        subscriptions.insert(symbol.as_str().to_string());
        Ok(())
    }

    async fn unsubscribe(&self, symbol: &Symbol) -> Result<(), PriceFeedError> {
        let mut subscriptions = self.subscriptions.write().unwrap();
        subscriptions.remove(symbol.as_str());
        Ok(())
    }

    async fn get_last_price(
        &self,
        instrument_id: &InstrumentId,
    ) -> Result<Decimal, PriceFeedError> {
        let quote = self.get_quote(&Symbol::new(instrument_id.as_str())).await?;
        Ok(quote.mid())
    }
}

// API response types

#[derive(Debug, serde::Deserialize)]
struct AlpacaQuoteResponse {
    quote: AlpacaQuoteData,
}

#[derive(Debug, serde::Deserialize)]
struct AlpacaQuotesResponse {
    quotes: std::collections::HashMap<String, AlpacaQuoteData>,
}

#[derive(Debug, serde::Deserialize)]
struct AlpacaQuoteData {
    /// Bid price.
    bp: f64,
    /// Ask price.
    ap: f64,
    /// Bid size.
    bs: i32,
    /// Ask size.
    #[serde(rename = "as")]
    ask_size: i32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn alpaca_price_feed_creation_fails_empty_credentials() {
        use crate::infrastructure::broker::alpaca::AlpacaEnvironment;

        let config = AlpacaConfig::new(
            String::new(),
            "secret".to_string(),
            AlpacaEnvironment::Paper,
        );

        let result = AlpacaPriceFeedAdapter::new(&config);
        assert!(result.is_err());
    }
}
