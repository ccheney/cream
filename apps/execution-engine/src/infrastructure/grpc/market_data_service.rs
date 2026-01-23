//! gRPC `MarketDataService` implementation.

use std::pin::Pin;
use std::sync::Arc;

use tokio::sync::mpsc;
use tokio_stream::{Stream, wrappers::ReceiverStream};
use tonic::{Request, Response, Status};

use super::proto::cream::v1::{
    GetOptionChainRequest, GetOptionChainResponse, GetSnapshotRequest, GetSnapshotResponse,
    MarketSnapshot, MarketStatus, OptionChain, Quote, SubscribeMarketDataRequest,
    SubscribeMarketDataResponse, SymbolSnapshot,
    market_data_service_server::{MarketDataService, MarketDataServiceServer},
};

use crate::application::ports::{MarketDataPort, MarketQuote, OptionType};

/// gRPC `MarketDataService` adapter.
pub struct MarketDataServiceAdapter<M>
where
    M: MarketDataPort,
{
    market_data: Arc<M>,
}

impl<M> MarketDataServiceAdapter<M>
where
    M: MarketDataPort,
{
    /// Create a new `MarketDataService` adapter.
    pub const fn new(market_data: Arc<M>) -> Self {
        Self { market_data }
    }
}

/// Create a `MarketDataService` gRPC server.
pub fn create_market_data_service<M>(
    market_data: Arc<M>,
) -> MarketDataServiceServer<MarketDataServiceAdapter<M>>
where
    M: MarketDataPort + 'static,
{
    let service = MarketDataServiceAdapter::new(market_data);
    MarketDataServiceServer::new(service)
}

#[tonic::async_trait]
impl<M> MarketDataService for MarketDataServiceAdapter<M>
where
    M: MarketDataPort + 'static,
{
    type SubscribeMarketDataStream =
        Pin<Box<dyn Stream<Item = Result<SubscribeMarketDataResponse, Status>> + Send>>;

    async fn subscribe_market_data(
        &self,
        request: Request<SubscribeMarketDataRequest>,
    ) -> Result<Response<Self::SubscribeMarketDataStream>, Status> {
        let req = request.into_inner();
        let symbols = req.symbols;

        tracing::info!(symbols = ?symbols, "Market data subscription started");

        let (tx, rx) = mpsc::channel(128);
        let market_data = Arc::clone(&self.market_data);

        tokio::spawn(async move {
            match market_data.get_quotes(&symbols).await {
                Ok(quotes) => {
                    for quote in quotes {
                        let response = SubscribeMarketDataResponse {
                            update: Some(
                                super::proto::cream::v1::subscribe_market_data_response::Update::Quote(
                                    convert_quote(&quote),
                                ),
                            ),
                        };
                        if tx.send(Ok(response)).await.is_err() {
                            break;
                        }
                    }
                }
                Err(e) => {
                    tracing::warn!(error = %e, "Failed to fetch quotes for stream");
                    let _ = tx
                        .send(Err(Status::internal(format!("Market data error: {e}"))))
                        .await;
                }
            }
        });

        let stream = ReceiverStream::new(rx);
        Ok(Response::new(Box::pin(stream)))
    }

    async fn get_snapshot(
        &self,
        request: Request<GetSnapshotRequest>,
    ) -> Result<Response<GetSnapshotResponse>, Status> {
        let req = request.into_inner();
        let symbols = req.symbols;

        tracing::debug!(symbols = ?symbols, "Getting market snapshot");

        let quotes = self
            .market_data
            .get_quotes(&symbols)
            .await
            .map_err(|e| Status::internal(format!("Failed to get quotes: {e}")))?;

        let symbol_snapshots: Vec<SymbolSnapshot> = quotes
            .iter()
            .map(|q| SymbolSnapshot {
                symbol: q.symbol.clone(),
                quote: Some(convert_quote(q)),
                bars: vec![],
                market_status: MarketStatus::Open.into(),
                day_high: 0.0,
                day_low: 0.0,
                prev_close: 0.0,
                open: 0.0,
                as_of: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
            })
            .collect();

        let snapshot = MarketSnapshot {
            environment: super::proto::cream::v1::Environment::Paper.into(),
            as_of: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
            market_status: MarketStatus::Open.into(),
            regime: super::proto::cream::v1::Regime::Unspecified.into(),
            symbols: symbol_snapshots,
        };

        Ok(Response::new(GetSnapshotResponse {
            snapshot: Some(snapshot),
        }))
    }

    async fn get_option_chain(
        &self,
        request: Request<GetOptionChainRequest>,
    ) -> Result<Response<GetOptionChainResponse>, Status> {
        let req = request.into_inner();
        let underlying = req.underlying;

        tracing::debug!(underlying = %underlying, "Getting option chain");

        let chain_data = self
            .market_data
            .get_option_chain(&underlying)
            .await
            .map_err(|e| Status::internal(format!("Failed to get option chain: {e}")))?;

        let underlying_price: f64 = chain_data
            .underlying_price
            .to_string()
            .parse()
            .unwrap_or(0.0);

        let options: Vec<super::proto::cream::v1::OptionQuote> = chain_data
            .options
            .iter()
            .map(|opt| {
                let contract = super::proto::cream::v1::OptionContract {
                    underlying: opt.contract.underlying.clone(),
                    expiration: opt.contract.expiration.clone(),
                    strike: opt.contract.strike.to_string().parse().unwrap_or(0.0),
                    option_type: match opt.contract.option_type {
                        OptionType::Call => super::proto::cream::v1::OptionType::Call.into(),
                        OptionType::Put => super::proto::cream::v1::OptionType::Put.into(),
                    },
                };

                let quote = opt.quote.as_ref().map(convert_quote);

                super::proto::cream::v1::OptionQuote {
                    contract: Some(contract),
                    quote,
                    implied_volatility: opt.implied_volatility,
                    delta: opt.greeks.as_ref().and_then(|g| g.delta),
                    gamma: opt.greeks.as_ref().and_then(|g| g.gamma),
                    theta: opt.greeks.as_ref().and_then(|g| g.theta),
                    vega: opt.greeks.as_ref().and_then(|g| g.vega),
                    rho: opt.greeks.as_ref().and_then(|g| g.rho),
                    open_interest: opt.open_interest,
                }
            })
            .collect();

        let chain = OptionChain {
            underlying: chain_data.underlying,
            underlying_price,
            options,
            as_of: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
        };

        Ok(Response::new(GetOptionChainResponse { chain: Some(chain) }))
    }
}

/// Convert a `MarketQuote` to a proto `Quote`.
fn convert_quote(quote: &MarketQuote) -> Quote {
    Quote {
        symbol: quote.symbol.clone(),
        bid: quote.bid.to_string().parse().unwrap_or(0.0),
        ask: quote.ask.to_string().parse().unwrap_or(0.0),
        bid_size: quote.bid_size,
        ask_size: quote.ask_size,
        last: quote.last.to_string().parse().unwrap_or(0.0),
        last_size: quote.last_size,
        volume: quote.volume,
        timestamp: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::application::ports::{
        MarketDataError, OptionChainData, OptionContract, OptionGreeks, OptionQuote,
    };
    use async_trait::async_trait;
    use rust_decimal::Decimal;

    struct MockMarketData;

    #[async_trait]
    impl MarketDataPort for MockMarketData {
        async fn get_quotes(
            &self,
            symbols: &[String],
        ) -> Result<Vec<MarketQuote>, MarketDataError> {
            Ok(symbols
                .iter()
                .map(|s| MarketQuote {
                    symbol: s.clone(),
                    bid: Decimal::new(150, 0),
                    ask: Decimal::new(151, 0),
                    bid_size: 100,
                    ask_size: 200,
                    last: Decimal::new(15050, 2),
                    last_size: 10,
                    volume: 1_000_000,
                    timestamp: crate::domain::shared::Timestamp::now(),
                })
                .collect())
        }

        async fn get_option_chain(
            &self,
            underlying: &str,
        ) -> Result<OptionChainData, MarketDataError> {
            Ok(OptionChainData {
                underlying: underlying.to_string(),
                underlying_price: Decimal::new(150, 0),
                options: vec![OptionQuote {
                    contract: OptionContract {
                        underlying: underlying.to_string(),
                        expiration: "2025-01-17".to_string(),
                        strike: Decimal::new(150, 0),
                        option_type: OptionType::Call,
                    },
                    quote: Some(MarketQuote {
                        symbol: format!("{underlying}250117C00150000"),
                        bid: Decimal::new(500, 2),
                        ask: Decimal::new(510, 2),
                        bid_size: 10,
                        ask_size: 20,
                        last: Decimal::new(505, 2),
                        last_size: 5,
                        volume: 1000,
                        timestamp: crate::domain::shared::Timestamp::now(),
                    }),
                    implied_volatility: Some(0.25),
                    greeks: Some(OptionGreeks {
                        delta: Some(0.5),
                        gamma: Some(0.05),
                        theta: Some(-0.02),
                        vega: Some(0.15),
                        rho: Some(0.01),
                    }),
                    open_interest: 500,
                }],
                as_of: crate::domain::shared::Timestamp::now(),
            })
        }
    }

    #[test]
    fn convert_quote_test() {
        let quote = MarketQuote {
            symbol: "AAPL".to_string(),
            bid: Decimal::new(150, 0),
            ask: Decimal::new(151, 0),
            bid_size: 100,
            ask_size: 200,
            last: Decimal::new(15050, 2),
            last_size: 10,
            volume: 1_000_000,
            timestamp: crate::domain::shared::Timestamp::now(),
        };

        let proto_quote = convert_quote(&quote);
        assert_eq!(proto_quote.symbol, "AAPL");
        assert!((proto_quote.bid - 150.0).abs() < f64::EPSILON);
        assert!((proto_quote.ask - 151.0).abs() < f64::EPSILON);
        assert_eq!(proto_quote.bid_size, 100);
        assert_eq!(proto_quote.ask_size, 200);
    }

    #[tokio::test]
    async fn get_snapshot_success() {
        let market_data = Arc::new(MockMarketData);
        let service = MarketDataServiceAdapter::new(market_data);

        let request = Request::new(GetSnapshotRequest {
            symbols: vec!["AAPL".to_string(), "MSFT".to_string()],
            include_bars: false,
            bar_timeframes: vec![],
        });

        let response = service.get_snapshot(request).await.unwrap();
        let inner = response.into_inner();

        assert!(inner.snapshot.is_some());
        let snapshot = inner.snapshot.unwrap();
        assert_eq!(snapshot.symbols.len(), 2);
    }

    #[tokio::test]
    async fn get_option_chain_success() {
        let market_data = Arc::new(MockMarketData);
        let service = MarketDataServiceAdapter::new(market_data);

        let request = Request::new(GetOptionChainRequest {
            underlying: "AAPL".to_string(),
            expirations: vec![],
            min_strike: None,
            max_strike: None,
        });

        let response = service.get_option_chain(request).await.unwrap();
        let inner = response.into_inner();

        assert!(inner.chain.is_some());
        let chain = inner.chain.unwrap();
        assert_eq!(chain.underlying, "AAPL");
        assert!(!chain.options.is_empty());
    }

    struct FailingMarketData;

    #[async_trait]
    impl MarketDataPort for FailingMarketData {
        async fn get_quotes(
            &self,
            _symbols: &[String],
        ) -> Result<Vec<MarketQuote>, MarketDataError> {
            Err(MarketDataError::ConnectionError {
                message: "Connection failed".to_string(),
            })
        }

        async fn get_option_chain(
            &self,
            _underlying: &str,
        ) -> Result<OptionChainData, MarketDataError> {
            Err(MarketDataError::DataUnavailable {
                message: "No data available".to_string(),
            })
        }
    }

    #[tokio::test]
    async fn get_snapshot_error() {
        let market_data = Arc::new(FailingMarketData);
        let service = MarketDataServiceAdapter::new(market_data);

        let request = Request::new(GetSnapshotRequest {
            symbols: vec!["AAPL".to_string()],
            include_bars: false,
            bar_timeframes: vec![],
        });

        let result = service.get_snapshot(request).await;
        assert!(result.is_err());
        let status = result.unwrap_err();
        assert_eq!(status.code(), tonic::Code::Internal);
    }

    #[tokio::test]
    async fn get_option_chain_error() {
        let market_data = Arc::new(FailingMarketData);
        let service = MarketDataServiceAdapter::new(market_data);

        let request = Request::new(GetOptionChainRequest {
            underlying: "AAPL".to_string(),
            expirations: vec![],
            min_strike: None,
            max_strike: None,
        });

        let result = service.get_option_chain(request).await;
        assert!(result.is_err());
        let status = result.unwrap_err();
        assert_eq!(status.code(), tonic::Code::Internal);
    }

    #[test]
    fn create_market_data_service_test() {
        let market_data = Arc::new(MockMarketData);
        let _server = create_market_data_service(market_data);
    }
}
