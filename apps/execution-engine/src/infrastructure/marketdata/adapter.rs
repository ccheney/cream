//! Alpaca Market Data Adapter
//!
//! WebSocket-based implementation of `MarketDataPort` using Alpaca's streaming API.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use alpaca_base::auth::Credentials;
use alpaca_base::types::Environment as AlpacaEnv;
use alpaca_websocket::{AlpacaWebSocketClient, DataFeed, MarketDataUpdate, SubscribeMessage};
use async_trait::async_trait;
use futures_util::StreamExt;
use parking_lot::RwLock;
use rust_decimal::Decimal;
use tokio::time::timeout;

use crate::application::ports::{
    MarketDataError, MarketDataPort, MarketQuote, OptionChainData, OptionContract, OptionGreeks,
    OptionQuote, OptionType,
};
use crate::domain::shared::Timestamp;
use crate::infrastructure::broker::alpaca::api_types::AlpacaOptionSnapshotsResponse;
use crate::infrastructure::broker::alpaca::{AlpacaConfig, AlpacaEnvironment, AlpacaError};

/// Timeout for waiting for quotes via WebSocket.
const QUOTE_TIMEOUT: Duration = Duration::from_secs(5);

/// Maximum age for cached quotes before they're considered stale.
const CACHE_MAX_AGE: Duration = Duration::from_secs(30);

/// Alpaca market data adapter using WebSocket streaming.
///
/// This adapter uses Alpaca's WebSocket API for real-time quote streaming
/// and REST API for option chain data (no WebSocket support for full chains).
pub struct AlpacaMarketDataAdapter {
    /// WebSocket client credentials.
    credentials: Credentials,
    /// Alpaca environment (Paper/Live).
    environment: AlpacaEnv,
    /// Data feed type.
    feed: DataFeed,
    /// Quote cache (populated by WebSocket).
    quote_cache: Arc<RwLock<HashMap<String, CachedQuote>>>,
    /// HTTP client for REST API calls (option chains).
    http_client: reqwest::Client,
    /// API key for REST.
    api_key: String,
    /// API secret for REST.
    api_secret: String,
    /// Data API base URL.
    data_url: String,
    /// Trading API base URL (for option contracts endpoint).
    trading_url: String,
}

/// Cached quote with timestamp.
#[derive(Debug, Clone)]
struct CachedQuote {
    quote: MarketQuote,
    updated_at: std::time::Instant,
}

impl std::fmt::Debug for AlpacaMarketDataAdapter {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AlpacaMarketDataAdapter")
            .field("environment", &self.environment)
            .field("feed", &self.feed)
            .field("cache_size", &self.quote_cache.read().len())
            .finish_non_exhaustive()
    }
}

impl AlpacaMarketDataAdapter {
    /// Create a new Alpaca market data adapter.
    ///
    /// # Errors
    ///
    /// Returns error if credentials are invalid.
    pub fn new(config: &AlpacaConfig) -> Result<Self, AlpacaError> {
        if config.api_key.is_empty() || config.api_secret.is_empty() {
            return Err(AlpacaError::AuthenticationFailed);
        }

        let credentials = Credentials::new(config.api_key.clone(), config.api_secret.clone());

        let environment = match config.environment {
            AlpacaEnvironment::Paper => AlpacaEnv::Paper,
            AlpacaEnvironment::Live => AlpacaEnv::Live,
        };

        let feed = match config.environment {
            AlpacaEnvironment::Paper => DataFeed::Iex,
            AlpacaEnvironment::Live => DataFeed::Sip,
        };

        let http_client = reqwest::Client::builder()
            .timeout(config.timeout)
            .build()
            .map_err(|e| AlpacaError::Network(e.to_string()))?;

        Ok(Self {
            credentials,
            environment,
            feed,
            quote_cache: Arc::new(RwLock::new(HashMap::new())),
            http_client,
            api_key: config.api_key.clone(),
            api_secret: config.api_secret.clone(),
            data_url: config.data_base_url().to_string(),
            trading_url: config.trading_base_url().to_string(),
        })
    }

    /// Subscribe to quotes via WebSocket and wait for initial data.
    async fn fetch_quotes_via_websocket(
        &self,
        symbols: &[String],
    ) -> Result<Vec<MarketQuote>, MarketDataError> {
        if symbols.is_empty() {
            return Ok(vec![]);
        }

        let client = AlpacaWebSocketClient::with_feed(
            self.credentials.clone(),
            self.environment.clone(),
            self.feed,
        );

        let subscription = SubscribeMessage {
            trades: None,
            quotes: Some(symbols.to_vec()),
            bars: None,
            trade_updates: None,
        };

        let stream = client
            .subscribe_market_data(subscription)
            .await
            .map_err(|e| MarketDataError::ConnectionError {
                message: format!("WebSocket connection failed: {e}"),
            })?;

        // Collect quotes with timeout
        let mut market_data_stream = stream;
        let mut received_quotes: HashMap<String, MarketQuote> = HashMap::new();
        let symbols_set: std::collections::HashSet<_> = symbols.iter().cloned().collect();

        let deadline = tokio::time::Instant::now() + QUOTE_TIMEOUT;

        while received_quotes.len() < symbols.len() {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                break;
            }

            match timeout(remaining, market_data_stream.next()).await {
                Ok(Some(update)) => {
                    if let MarketDataUpdate::Quote { symbol, quote } = update
                        && symbols_set.contains(&symbol)
                    {
                        let market_quote = MarketQuote {
                            symbol: symbol.clone(),
                            bid: Decimal::try_from(quote.bid_price).unwrap_or(Decimal::ZERO),
                            ask: Decimal::try_from(quote.ask_price).unwrap_or(Decimal::ZERO),
                            bid_size: i32::try_from(quote.bid_size).unwrap_or(0),
                            ask_size: i32::try_from(quote.ask_size).unwrap_or(0),
                            last: Decimal::ZERO, // WebSocket quote doesn't include last
                            last_size: 0,
                            volume: 0,
                            timestamp: Timestamp::now(),
                        };

                        // Update cache
                        {
                            let mut cache = self.quote_cache.write();
                            cache.insert(
                                symbol.clone(),
                                CachedQuote {
                                    quote: market_quote.clone(),
                                    updated_at: std::time::Instant::now(),
                                },
                            );
                        }

                        received_quotes.insert(symbol, market_quote);
                    }
                }
                Ok(None) | Err(_) => break, // Stream ended or timeout
            }
        }

        // Return quotes in order, falling back to cache for missing ones
        let mut quotes = Vec::with_capacity(symbols.len());
        for symbol in symbols {
            if let Some(quote) = received_quotes.remove(symbol) {
                quotes.push(quote);
            } else {
                // Check cache (only use if not stale)
                let cache = self.quote_cache.read();
                if let Some(cached) = cache.get(symbol)
                    && cached.updated_at.elapsed() < CACHE_MAX_AGE
                {
                    quotes.push(cached.quote.clone());
                }
            }
        }

        if quotes.is_empty() && !symbols.is_empty() {
            return Err(MarketDataError::DataUnavailable {
                message: "No quotes received for requested symbols".to_string(),
            });
        }

        Ok(quotes)
    }

    /// Fetch option chain via REST API.
    ///
    /// WebSocket doesn't support bulk option chain queries, so we use REST.
    async fn fetch_option_chain_via_rest(
        &self,
        underlying: &str,
    ) -> Result<OptionChainData, MarketDataError> {
        // First, get the underlying price
        let underlying_price = self.get_underlying_price(underlying).await?;

        // Get option contracts for the underlying
        let contracts = self.fetch_option_contracts(underlying).await?;

        if contracts.is_empty() {
            return Ok(OptionChainData {
                underlying: underlying.to_string(),
                underlying_price,
                options: vec![],
                as_of: Timestamp::now(),
            });
        }

        // Get option snapshots (quotes + Greeks)
        let contract_symbols: Vec<String> = contracts.iter().map(|c| c.symbol.clone()).collect();
        let snapshots = self.fetch_option_snapshots(&contract_symbols).await?;

        // Combine contract info with snapshots
        let mut options = Vec::with_capacity(contracts.len());
        for contract in contracts {
            let snapshot = snapshots.get(&contract.symbol);

            let quote = snapshot
                .and_then(|s| s.latest_quote.as_ref())
                .map(|q| MarketQuote {
                    symbol: contract.symbol.clone(),
                    bid: Decimal::try_from(q.bp).unwrap_or(Decimal::ZERO),
                    ask: Decimal::try_from(q.ap).unwrap_or(Decimal::ZERO),
                    bid_size: q.bs,
                    ask_size: q.ask_size,
                    last: snapshot
                        .and_then(|s| s.latest_trade.as_ref())
                        .map_or(Decimal::ZERO, |t| {
                            Decimal::try_from(t.p).unwrap_or(Decimal::ZERO)
                        }),
                    last_size: snapshot
                        .and_then(|s| s.latest_trade.as_ref())
                        .map_or(0, |t| t.s),
                    volume: 0,
                    timestamp: Timestamp::now(),
                });

            let greeks = snapshot
                .and_then(|s| s.greeks.as_ref())
                .map(|g| OptionGreeks {
                    delta: g.delta,
                    gamma: g.gamma,
                    theta: g.theta,
                    vega: g.vega,
                    rho: g.rho,
                });

            options.push(OptionQuote {
                contract: OptionContract {
                    underlying: contract.underlying_symbol,
                    expiration: contract.expiration_date,
                    strike: contract.strike_price,
                    option_type: if contract.option_type == "call" {
                        OptionType::Call
                    } else {
                        OptionType::Put
                    },
                },
                quote,
                implied_volatility: snapshot.and_then(|s| s.implied_volatility),
                greeks,
                open_interest: 0, // Not provided in snapshots
            });
        }

        Ok(OptionChainData {
            underlying: underlying.to_string(),
            underlying_price,
            options,
            as_of: Timestamp::now(),
        })
    }

    /// Fetch quotes via REST API (fallback when WebSocket has no data).
    async fn fetch_quotes_via_rest(
        &self,
        symbols: &[String],
    ) -> Result<Vec<MarketQuote>, MarketDataError> {
        if symbols.is_empty() {
            return Ok(vec![]);
        }

        let symbols_param = symbols
            .iter()
            .map(|s| s.to_uppercase())
            .collect::<Vec<_>>()
            .join(",");

        let url = format!(
            "{}/v2/stocks/quotes/latest?symbols={}",
            self.data_url, symbols_param
        );

        let response = self
            .http_client
            .get(&url)
            .header("APCA-API-KEY-ID", &self.api_key)
            .header("APCA-API-SECRET-KEY", &self.api_secret)
            .send()
            .await
            .map_err(|e| MarketDataError::ConnectionError {
                message: e.to_string(),
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(MarketDataError::ApiError {
                message: format!("Failed to get quotes via REST ({status}): {body}"),
            });
        }

        #[allow(clippy::items_after_statements)]
        #[derive(serde::Deserialize)]
        struct MultiQuoteResponse {
            quotes: HashMap<String, RestQuoteData>,
        }

        #[allow(clippy::items_after_statements)]
        #[derive(serde::Deserialize)]
        struct RestQuoteData {
            bp: f64,
            ap: f64,
            bs: i32,
            #[serde(rename = "as")]
            ask_size: i32,
        }

        let data: MultiQuoteResponse =
            response
                .json()
                .await
                .map_err(|e| MarketDataError::ApiError {
                    message: format!("Failed to parse quotes: {e}"),
                })?;

        let mut quotes = Vec::with_capacity(symbols.len());
        for symbol in symbols {
            let upper = symbol.to_uppercase();
            if let Some(q) = data.quotes.get(&upper) {
                quotes.push(MarketQuote {
                    symbol: upper,
                    bid: Decimal::try_from(q.bp).unwrap_or(Decimal::ZERO),
                    ask: Decimal::try_from(q.ap).unwrap_or(Decimal::ZERO),
                    bid_size: q.bs,
                    ask_size: q.ask_size,
                    last: Decimal::ZERO,
                    last_size: 0,
                    volume: 0,
                    timestamp: Timestamp::now(),
                });
            }
        }

        if quotes.is_empty() && !symbols.is_empty() {
            return Err(MarketDataError::DataUnavailable {
                message: "No quotes available for requested symbols".to_string(),
            });
        }

        Ok(quotes)
    }

    /// Get underlying stock price.
    async fn get_underlying_price(&self, symbol: &str) -> Result<Decimal, MarketDataError> {
        let url = format!(
            "{}/v2/stocks/{}/quotes/latest",
            self.data_url,
            symbol.to_uppercase()
        );

        let response = self
            .http_client
            .get(&url)
            .header("APCA-API-KEY-ID", &self.api_key)
            .header("APCA-API-SECRET-KEY", &self.api_secret)
            .send()
            .await
            .map_err(|e| MarketDataError::ConnectionError {
                message: e.to_string(),
            })?;

        if !response.status().is_success() {
            return Err(MarketDataError::ApiError {
                message: format!("Failed to get underlying price: {}", response.status()),
            });
        }

        #[allow(clippy::items_after_statements)]
        #[derive(serde::Deserialize)]
        struct QuoteResponse {
            quote: QuoteData,
        }

        #[allow(clippy::items_after_statements)]
        #[derive(serde::Deserialize)]
        struct QuoteData {
            bp: f64,
            ap: f64,
        }

        let data: QuoteResponse = response
            .json()
            .await
            .map_err(|e| MarketDataError::ApiError {
                message: format!("Failed to parse quote: {e}"),
            })?;

        let mid = f64::midpoint(data.quote.bp, data.quote.ap);
        Decimal::try_from(mid).map_err(|_| MarketDataError::DataUnavailable {
            message: "Invalid price data".to_string(),
        })
    }

    /// Fetch option contracts for an underlying.
    async fn fetch_option_contracts(
        &self,
        underlying: &str,
    ) -> Result<Vec<OptionContractInfo>, MarketDataError> {
        let url = format!(
            "{}/v2/options/contracts?underlying_symbols={}&limit=1000",
            self.trading_url,
            underlying.to_uppercase()
        );

        let response = self
            .http_client
            .get(&url)
            .header("APCA-API-KEY-ID", &self.api_key)
            .header("APCA-API-SECRET-KEY", &self.api_secret)
            .send()
            .await
            .map_err(|e| MarketDataError::ConnectionError {
                message: e.to_string(),
            })?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(MarketDataError::ApiError {
                message: format!("Failed to get option contracts ({status}): {body}"),
            });
        }

        #[allow(clippy::items_after_statements)]
        #[derive(serde::Deserialize)]
        struct ContractsResponse {
            option_contracts: Vec<OptionContractInfo>,
        }

        let data: ContractsResponse =
            response
                .json()
                .await
                .map_err(|e| MarketDataError::ApiError {
                    message: format!("Failed to parse contracts: {e}"),
                })?;

        Ok(data.option_contracts)
    }

    /// Fetch option snapshots (quotes + Greeks).
    async fn fetch_option_snapshots(
        &self,
        symbols: &[String],
    ) -> Result<
        HashMap<String, crate::infrastructure::broker::alpaca::api_types::AlpacaOptionSnapshot>,
        MarketDataError,
    > {
        if symbols.is_empty() {
            return Ok(HashMap::new());
        }

        // Alpaca option snapshots endpoint only accepts up to 100 symbols per request
        let mut all_snapshots = HashMap::new();

        for chunk in symbols.chunks(100) {
            let symbols_param = chunk.join(",");
            let url = format!(
                "{}/v1beta1/options/snapshots?symbols={}",
                self.data_url, symbols_param
            );

            let response = self
                .http_client
                .get(&url)
                .header("APCA-API-KEY-ID", &self.api_key)
                .header("APCA-API-SECRET-KEY", &self.api_secret)
                .send()
                .await
                .map_err(|e| MarketDataError::ConnectionError {
                    message: e.to_string(),
                })?;

            if response.status().is_success() {
                let data: AlpacaOptionSnapshotsResponse =
                    response
                        .json()
                        .await
                        .map_err(|e| MarketDataError::ApiError {
                            message: format!("Failed to parse option snapshots: {e}"),
                        })?;

                all_snapshots.extend(data.snapshots);
            }
        }

        Ok(all_snapshots)
    }
}

/// Option contract info from Alpaca.
#[derive(Debug, Clone, serde::Deserialize)]
struct OptionContractInfo {
    symbol: String,
    underlying_symbol: String,
    expiration_date: String,
    #[serde(deserialize_with = "deserialize_decimal_from_string")]
    strike_price: Decimal,
    #[serde(rename = "type")]
    option_type: String,
}

fn deserialize_decimal_from_string<'de, D>(deserializer: D) -> Result<Decimal, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let s: String = serde::Deserialize::deserialize(deserializer)?;
    s.parse().map_err(serde::de::Error::custom)
}

#[async_trait]
impl MarketDataPort for AlpacaMarketDataAdapter {
    async fn get_quotes(&self, symbols: &[String]) -> Result<Vec<MarketQuote>, MarketDataError> {
        tracing::debug!(symbols = ?symbols, "Fetching quotes via WebSocket");

        match self.fetch_quotes_via_websocket(symbols).await {
            Ok(quotes) => Ok(quotes),
            Err(ws_error) => {
                tracing::debug!(
                    error = %ws_error,
                    "WebSocket quote fetch failed, falling back to REST"
                );
                self.fetch_quotes_via_rest(symbols).await
            }
        }
    }

    async fn get_option_chain(&self, underlying: &str) -> Result<OptionChainData, MarketDataError> {
        tracing::debug!(underlying = %underlying, "Fetching option chain via REST");
        self.fetch_option_chain_via_rest(underlying).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adapter_creation_fails_without_credentials() {
        let config = AlpacaConfig::new(
            String::new(),
            "secret".to_string(),
            AlpacaEnvironment::Paper,
        );

        let result = AlpacaMarketDataAdapter::new(&config);
        assert!(result.is_err());
    }

    #[test]
    fn adapter_debug_format() {
        let config = AlpacaConfig::new(
            "key".to_string(),
            "secret".to_string(),
            AlpacaEnvironment::Paper,
        );

        let adapter = AlpacaMarketDataAdapter::new(&config).unwrap();
        let debug = format!("{adapter:?}");
        assert!(debug.contains("AlpacaMarketDataAdapter"));
    }
}
