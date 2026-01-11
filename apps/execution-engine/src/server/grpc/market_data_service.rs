//! MarketDataService gRPC implementation.
//!
//! Implements the `MarketDataService` gRPC service for market data
//! streaming, snapshots, and option chain queries.

use std::pin::Pin;
use std::sync::Arc;

use tokio::sync::mpsc;
use tokio_stream::{Stream, wrappers::ReceiverStream};
use tonic::{Request, Response, Status};

use super::converters::{
    decimal_to_f64, decimal_to_i32, decimal_to_i64, environment_to_proto, parse_timestamp,
};
use super::proto;
use super::proto::cream::v1::{
    Bar, GetOptionChainRequest, GetOptionChainResponse, GetSnapshotRequest, GetSnapshotResponse,
    MarketSnapshot, Quote, SubscribeMarketDataRequest, SubscribeMarketDataResponse, SymbolSnapshot,
    market_data_service_server::MarketDataService, subscribe_market_data_response,
};
use crate::models::Environment;

/// Market data service implementation.
///
/// Provides market data from Alpaca feed.
pub struct MarketDataServiceImpl {
    /// Alpaca adapter for market data queries.
    alpaca: Arc<crate::execution::AlpacaAdapter>,
    /// Trading environment.
    environment: Environment,
    /// Alpaca feed controller for real-time streaming (optional).
    feed_controller: Option<Arc<crate::feed::AlpacaController>>,
    /// Shutdown sender for feed lifecycle.
    shutdown_tx: Option<tokio::sync::broadcast::Sender<()>>,
}

impl std::fmt::Debug for MarketDataServiceImpl {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MarketDataServiceImpl")
            .field("environment", &self.environment)
            .field("has_feed_controller", &self.feed_controller.is_some())
            .finish()
    }
}

impl MarketDataServiceImpl {
    /// Create a new market data service.
    #[must_use]
    pub fn new(alpaca: crate::execution::AlpacaAdapter, environment: Environment) -> Self {
        Self {
            alpaca: Arc::new(alpaca),
            environment,
            feed_controller: None,
            shutdown_tx: None,
        }
    }

    /// Create a new market data service with an Alpaca feed controller.
    #[must_use]
    pub fn with_feed_controller(
        alpaca: crate::execution::AlpacaAdapter,
        environment: Environment,
        feed_controller: Arc<crate::feed::AlpacaController>,
        shutdown_tx: tokio::sync::broadcast::Sender<()>,
    ) -> Self {
        Self {
            alpaca: Arc::new(alpaca),
            environment,
            feed_controller: Some(feed_controller),
            shutdown_tx: Some(shutdown_tx),
        }
    }
}

#[tonic::async_trait]
impl MarketDataService for MarketDataServiceImpl {
    type SubscribeMarketDataStream =
        Pin<Box<dyn Stream<Item = Result<SubscribeMarketDataResponse, Status>> + Send>>;

    async fn subscribe_market_data(
        &self,
        request: Request<SubscribeMarketDataRequest>,
    ) -> Result<Response<Self::SubscribeMarketDataStream>, Status> {
        let req = request.into_inner();
        let symbols = req.symbols;

        tracing::info!(
            symbol_count = symbols.len(),
            symbols = ?symbols,
            "SubscribeMarketData called"
        );

        // Create a channel for streaming market data
        let (tx, rx) = mpsc::channel(128);

        // Start the Alpaca feed if we have a controller
        if let (Some(feed_controller), Some(shutdown_tx)) =
            (&self.feed_controller, &self.shutdown_tx)
        {
            let shutdown_rx = shutdown_tx.subscribe();
            let started = feed_controller.start(symbols.clone(), shutdown_rx);
            if started {
                tracing::info!("Started Alpaca feed for subscription");
            } else {
                tracing::debug!("Feed already running or unavailable");
            }

            // Spawn a task to stream microstructure updates
            let microstructure = feed_controller.microstructure();
            let stream_symbols = symbols.clone();
            tokio::spawn(async move {
                let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(100));

                loop {
                    interval.tick().await;

                    // Get snapshots for all subscribed symbols
                    let snapshots = {
                        let mut manager = microstructure.lock();
                        stream_symbols
                            .iter()
                            .filter_map(|s| manager.snapshot(s))
                            .collect::<Vec<_>>()
                    };

                    // Stream each snapshot as a Quote
                    for state in snapshots {
                        let quote = Quote {
                            symbol: state.symbol,
                            bid: decimal_to_f64(state.bid),
                            ask: decimal_to_f64(state.ask),
                            bid_size: decimal_to_i32(state.bid_depth),
                            ask_size: decimal_to_i32(state.ask_depth),
                            last: decimal_to_f64(state.last_trade),
                            last_size: 0,
                            volume: decimal_to_i64(state.volume),
                            timestamp: Some(prost_types::Timestamp::from(
                                std::time::SystemTime::now(),
                            )),
                        };

                        let response = SubscribeMarketDataResponse {
                            update: Some(subscribe_market_data_response::Update::Quote(quote)),
                        };

                        if tx.send(Ok(response)).await.is_err() {
                            tracing::debug!("Market data stream client disconnected");
                            return;
                        }
                    }
                }
            });
        } else {
            // No feed controller - just log and return empty stream
            tracing::warn!("No feed controller available - market data streaming unavailable");
            tokio::spawn(async move {
                tracing::info!(
                    symbol_count = symbols.len(),
                    "Market data stream started (no feed)"
                );
                let _ = tx;
            });
        }

        let stream = ReceiverStream::new(rx);
        Ok(Response::new(Box::pin(stream)))
    }

    async fn get_snapshot(
        &self,
        request: Request<GetSnapshotRequest>,
    ) -> Result<Response<GetSnapshotResponse>, Status> {
        let req = request.into_inner();

        tracing::debug!(
            symbols = ?req.symbols,
            include_bars = req.include_bars,
            bar_timeframes = ?req.bar_timeframes,
            "Getting market snapshot"
        );

        // Skip API call if no symbols requested
        if req.symbols.is_empty() {
            return Ok(Response::new(GetSnapshotResponse {
                snapshot: Some(MarketSnapshot {
                    environment: environment_to_proto(self.environment),
                    as_of: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
                    market_status: 0, // UNSPECIFIED
                    regime: 0,        // UNSPECIFIED
                    symbols: vec![],
                }),
            }));
        }

        // Map timeframe from minutes to Alpaca format
        let timeframe_minutes = req.bar_timeframes.first().copied().unwrap_or(60);
        let timeframe = match timeframe_minutes {
            1 => "1Min",
            5 => "5Min",
            15 => "15Min",
            60 => "1Hour",
            240 => "4Hour",
            1440 => "1Day",
            _ => "1Hour",
        };

        // Calculate how far back to fetch based on timeframe.
        // Technical indicators need varying amounts of historical data:
        // - Bollinger Bands: 20 periods (default)
        // - RSI: 14 periods
        // - SMA/EMA: commonly 20-200 periods
        // We fetch 100 bars minimum to support most indicators with some buffer.
        // For hourly bars, a trading day has ~6.5 hours, so 100 bars = ~15 trading days.
        // We go back extra calendar days to account for weekends/holidays.
        let (bars_needed, calendar_days_back): (u32, i64) = match timeframe_minutes {
            1 => (100, 2),      // 1-min bars: 2 days covers ~780 market minutes
            5 => (100, 5),      // 5-min bars: 5 days covers ~390 bars
            15 => (100, 14),    // 15-min bars: 2 weeks covers ~260 bars
            60 => (100, 30),    // 1-hour bars: 30 days covers ~130 bars
            240 => (100, 90),   // 4-hour bars: 90 days covers ~90 bars
            1440 => (150, 180), // Daily bars: 180 days covers ~125 trading days
            _ => (100, 30),     // Default to 30 days
        };
        let start_date = chrono::Utc::now() - chrono::Duration::days(calendar_days_back);
        let start_str = start_date.format("%Y-%m-%dT00:00:00Z").to_string();

        // Fetch bars from Alpaca data API
        let bars_response = self
            .alpaca
            .get_bars(
                &req.symbols,
                timeframe,
                Some(&start_str),
                None,
                Some(bars_needed),
            )
            .await
            .map_err(|e| {
                tracing::error!(error = %e, "Failed to fetch bars from Alpaca");
                Status::internal(format!("Failed to fetch market data: {e}"))
            })?;

        // Fetch quotes from Alpaca data API
        let quotes_response = self
            .alpaca
            .get_quotes(&req.symbols)
            .await
            .map_err(|e| {
                tracing::warn!(error = %e, "Failed to fetch quotes from Alpaca, continuing without quotes");
                e
            })
            .ok();

        // Convert to proto SymbolSnapshots
        let symbol_snapshots: Vec<SymbolSnapshot> = req
            .symbols
            .iter()
            .map(|symbol| {
                let bars = bars_response
                    .bars
                    .get(symbol)
                    .map(|alpaca_bars| {
                        alpaca_bars
                            .iter()
                            .map(|ab| Bar {
                                symbol: symbol.clone(),
                                timestamp: parse_timestamp(&ab.t),
                                timeframe_minutes: req
                                    .bar_timeframes
                                    .first()
                                    .copied()
                                    .unwrap_or(60),
                                open: ab.o,
                                high: ab.h,
                                low: ab.l,
                                close: ab.c,
                                volume: ab.v,
                                vwap: ab.vw,
                                trade_count: ab.n,
                            })
                            .collect()
                    })
                    .unwrap_or_default();

                // Build quote from Alpaca response if available
                let quote = quotes_response
                    .as_ref()
                    .and_then(|qr| qr.quotes.get(symbol))
                    .map(|aq| proto::cream::v1::Quote {
                        symbol: symbol.clone(),
                        bid: aq.bp,
                        ask: aq.ap,
                        bid_size: aq.bs,
                        ask_size: aq.ask_size,
                        last: 0.0,    // Not provided in latest quotes endpoint
                        last_size: 0, // Not provided in latest quotes endpoint
                        volume: 0,    // Not provided in latest quotes endpoint
                        timestamp: parse_timestamp(&aq.t),
                    });

                SymbolSnapshot {
                    symbol: symbol.clone(),
                    quote,
                    bars,
                    market_status: 0, // UNSPECIFIED
                    day_high: 0.0,
                    day_low: 0.0,
                    prev_close: 0.0,
                    open: 0.0,
                    as_of: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
                }
            })
            .collect();

        tracing::info!(
            symbol_count = symbol_snapshots.len(),
            total_bars = symbol_snapshots.iter().map(|s| s.bars.len()).sum::<usize>(),
            "Market snapshot fetched"
        );

        Ok(Response::new(GetSnapshotResponse {
            snapshot: Some(MarketSnapshot {
                environment: environment_to_proto(self.environment),
                as_of: Some(prost_types::Timestamp::from(std::time::SystemTime::now())),
                market_status: 0, // UNSPECIFIED - would need market hours check
                regime: 0,        // UNSPECIFIED - would need regime detection
                symbols: symbol_snapshots,
            }),
        }))
    }

    async fn get_option_chain(
        &self,
        request: Request<GetOptionChainRequest>,
    ) -> Result<Response<GetOptionChainResponse>, Status> {
        let req = request.into_inner();

        tracing::debug!(
            underlying = %req.underlying,
            "Getting option chain"
        );

        // Return empty chain for now
        // Real implementation would query option chain data
        Ok(Response::new(GetOptionChainResponse { chain: None }))
    }
}

/// Helper function to create a test market data service.
#[cfg(test)]
fn create_test_market_data_service() -> Result<MarketDataServiceImpl, crate::execution::AlpacaError>
{
    let alpaca = crate::execution::AlpacaAdapter::new(
        std::env::var("ALPACA_KEY").unwrap_or_else(|_| "paper-key".to_string()),
        std::env::var("ALPACA_SECRET").unwrap_or_else(|_| "paper-secret".to_string()),
        Environment::Paper,
    )?;
    Ok(MarketDataServiceImpl::new(alpaca, Environment::Paper))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_market_data_service_creation() {
        let service = match create_test_market_data_service() {
            Ok(s) => s,
            Err(e) => panic!("should create service: {e}"),
        };
        // Just verify it can be created
        let _ = service;
    }

    #[tokio::test]
    async fn test_get_snapshot() {
        // Skip if no credentials are available
        if std::env::var("ALPACA_KEY").is_err() {
            eprintln!("Skipping test_get_snapshot: ALPACA_KEY not set");
            return;
        }

        let service = match create_test_market_data_service() {
            Ok(s) => s,
            Err(e) => panic!("should create service: {e}"),
        };
        let request = Request::new(GetSnapshotRequest {
            symbols: vec!["AAPL".to_string()],
            include_bars: true,
            bar_timeframes: vec![60], // 1 hour bars
        });

        let response = match service.get_snapshot(request).await {
            Ok(r) => r,
            Err(e) => {
                // API call may fail if market data is not available
                eprintln!("Skipping test_get_snapshot: API error: {e}");
                return;
            }
        };
        let snapshot = response.into_inner();
        assert!(snapshot.snapshot.is_some(), "snapshot should be present");
    }

    #[tokio::test]
    async fn test_get_option_chain() {
        let service = match create_test_market_data_service() {
            Ok(s) => s,
            Err(e) => panic!("should create service: {e}"),
        };
        let request = Request::new(GetOptionChainRequest {
            underlying: "AAPL".to_string(),
            expirations: vec![],
            min_strike: None,
            max_strike: None,
        });

        let response = match service.get_option_chain(request).await {
            Ok(r) => r,
            Err(e) => panic!("get_option_chain should succeed: {e}"),
        };
        // Response should be valid (chain may be None for now)
        let _chain = response.into_inner();
    }
}
