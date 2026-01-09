//! Arrow Flight server implementation.
//!
//! Provides high-performance data transport for market data, positions, and orders
//! using Apache Arrow Flight protocol.
//!
//! # Endpoints
//!
//! ## DoGet (Data Retrieval)
//! - `positions` - Current positions (symbol, quantity, avg_price, market_value)
//! - `orders` - Order history and status
//! - `market_data/{symbol}` - Market data snapshots
//!
//! ## DoPut (Data Ingestion)
//! - `market_data` - Ingest market data updates (quotes, trades)
//!
//! # Usage
//!
//! ```bash
//! # Start server on port 50052 (separate from gRPC on 50051)
//! ARROW_FLIGHT_PORT=50052 cargo run --bin execution-engine
//! ```
//!
//! # Note
//!
//! This implementation uses arrow-flight 54.x which depends on tonic 0.12.x.
//! The main execution engine uses tonic 0.14.x for gRPC. These versions are
//! compatible at runtime but require careful type handling to avoid conflicts.

use std::collections::HashMap;
use std::pin::Pin;
use std::sync::Arc;

use arrow::array::{ArrayRef, Float64Array, Int64Array, RecordBatch, StringArray, UInt64Array};
use arrow::datatypes::{DataType, Field, Schema, SchemaRef};
use arrow_flight::{
    FlightInfo, IpcMessage, PollInfo, SchemaAsIpc, Ticket, encode::FlightDataEncoderBuilder,
    flight_service_server::FlightServiceServer,
};
use futures::{Stream, StreamExt, stream};
use tokio::sync::RwLock;

/// Flight service implementation for high-performance data transport.
#[derive(Clone)]
pub struct CreamFlightService {
    /// In-memory market data cache (symbol -> latest quote)
    market_data: Arc<RwLock<HashMap<String, MarketDataSnapshot>>>,
}

/// Market data snapshot.
#[derive(Debug, Clone)]
struct MarketDataSnapshot {
    symbol: String,
    bid_price: f64,
    ask_price: f64,
    last_price: f64,
    volume: u64,
    timestamp: i64,
}

impl CreamFlightService {
    /// Create a new Flight service.
    pub fn new() -> Self {
        Self {
            market_data: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Get the market data schema.
    fn market_data_schema() -> SchemaRef {
        Arc::new(Schema::new(vec![
            Field::new("symbol", DataType::Utf8, false),
            Field::new("bid_price", DataType::Float64, false),
            Field::new("ask_price", DataType::Float64, false),
            Field::new("last_price", DataType::Float64, false),
            Field::new("volume", DataType::UInt64, false),
            Field::new("timestamp", DataType::Int64, false),
        ]))
    }

    /// Convert market data to Arrow RecordBatch.
    fn market_data_to_record_batch(
        snapshots: Vec<MarketDataSnapshot>,
    ) -> Result<RecordBatch, arrow_flight::error::FlightError> {
        let schema = Self::market_data_schema();

        let symbols: ArrayRef = Arc::new(StringArray::from(
            snapshots
                .iter()
                .map(|s| s.symbol.as_str())
                .collect::<Vec<_>>(),
        ));
        let bid_prices: ArrayRef = Arc::new(Float64Array::from(
            snapshots.iter().map(|s| s.bid_price).collect::<Vec<_>>(),
        ));
        let ask_prices: ArrayRef = Arc::new(Float64Array::from(
            snapshots.iter().map(|s| s.ask_price).collect::<Vec<_>>(),
        ));
        let last_prices: ArrayRef = Arc::new(Float64Array::from(
            snapshots.iter().map(|s| s.last_price).collect::<Vec<_>>(),
        ));
        let volumes: ArrayRef = Arc::new(UInt64Array::from(
            snapshots.iter().map(|s| s.volume).collect::<Vec<_>>(),
        ));
        let timestamps: ArrayRef = Arc::new(Int64Array::from(
            snapshots.iter().map(|s| s.timestamp).collect::<Vec<_>>(),
        ));

        RecordBatch::try_new(
            schema,
            vec![
                symbols,
                bid_prices,
                ask_prices,
                last_prices,
                volumes,
                timestamps,
            ],
        )
        .map_err(|e| arrow_flight::error::FlightError::from(e))
    }

    /// Parse market data from Arrow RecordBatch.
    fn parse_market_data_batch(
        batch: &RecordBatch,
    ) -> Result<Vec<MarketDataSnapshot>, arrow_flight::error::FlightError> {
        let symbols = batch
            .column(0)
            .as_any()
            .downcast_ref::<StringArray>()
            .ok_or_else(|| {
                arrow_flight::error::FlightError::DecodeError("Invalid symbol column".to_string())
            })?;

        let bid_prices = batch
            .column(1)
            .as_any()
            .downcast_ref::<Float64Array>()
            .ok_or_else(|| {
                arrow_flight::error::FlightError::DecodeError(
                    "Invalid bid_price column".to_string(),
                )
            })?;

        let ask_prices = batch
            .column(2)
            .as_any()
            .downcast_ref::<Float64Array>()
            .ok_or_else(|| {
                arrow_flight::error::FlightError::DecodeError(
                    "Invalid ask_price column".to_string(),
                )
            })?;

        let last_prices = batch
            .column(3)
            .as_any()
            .downcast_ref::<Float64Array>()
            .ok_or_else(|| {
                arrow_flight::error::FlightError::DecodeError(
                    "Invalid last_price column".to_string(),
                )
            })?;

        let volumes = batch
            .column(4)
            .as_any()
            .downcast_ref::<UInt64Array>()
            .ok_or_else(|| {
                arrow_flight::error::FlightError::DecodeError("Invalid volume column".to_string())
            })?;

        let timestamps = batch
            .column(5)
            .as_any()
            .downcast_ref::<Int64Array>()
            .ok_or_else(|| {
                arrow_flight::error::FlightError::DecodeError(
                    "Invalid timestamp column".to_string(),
                )
            })?;

        let mut snapshots = Vec::with_capacity(batch.num_rows());
        for i in 0..batch.num_rows() {
            snapshots.push(MarketDataSnapshot {
                symbol: symbols.value(i).to_string(),
                bid_price: bid_prices.value(i),
                ask_price: ask_prices.value(i),
                last_price: last_prices.value(i),
                volume: volumes.value(i),
                timestamp: timestamps.value(i),
            });
        }

        Ok(snapshots)
    }
}

impl Default for CreamFlightService {
    fn default() -> Self {
        Self::new()
    }
}

#[tonic::async_trait]
impl arrow_flight::flight_service_server::FlightService for CreamFlightService {
    type HandshakeStream =
        Pin<Box<dyn Stream<Item = Result<arrow_flight::HandshakeResponse, tonic::Status>> + Send>>;
    type ListFlightsStream = Pin<Box<dyn Stream<Item = Result<FlightInfo, tonic::Status>> + Send>>;
    type DoGetStream =
        Pin<Box<dyn Stream<Item = Result<arrow_flight::FlightData, tonic::Status>> + Send>>;
    type DoPutStream =
        Pin<Box<dyn Stream<Item = Result<arrow_flight::PutResult, tonic::Status>> + Send>>;
    type DoActionStream =
        Pin<Box<dyn Stream<Item = Result<arrow_flight::Result, tonic::Status>> + Send>>;
    type ListActionsStream =
        Pin<Box<dyn Stream<Item = Result<arrow_flight::ActionType, tonic::Status>> + Send>>;
    type DoExchangeStream =
        Pin<Box<dyn Stream<Item = Result<arrow_flight::FlightData, tonic::Status>> + Send>>;

    /// Handshake for authentication (not implemented yet).
    async fn handshake(
        &self,
        _request: tonic::Request<tonic::Streaming<arrow_flight::HandshakeRequest>>,
    ) -> Result<tonic::Response<Self::HandshakeStream>, tonic::Status> {
        let output = stream::iter(vec![Ok(arrow_flight::HandshakeResponse {
            protocol_version: 0,
            payload: vec![].into(),
        })]);
        Ok(tonic::Response::new(Box::pin(output)))
    }

    /// List available flights.
    ///
    /// Returns metadata for all available data streams:
    /// - market_data: Real-time market data snapshots (quotes, last price, volume)
    async fn list_flights(
        &self,
        _request: tonic::Request<arrow_flight::Criteria>,
    ) -> Result<tonic::Response<Self::ListFlightsStream>, tonic::Status> {
        let schema = Self::market_data_schema();

        // Create FlightInfo for market_data stream
        let market_data_flight = FlightInfo::new()
            .try_with_schema(&schema)
            .map_err(|e| tonic::Status::internal(format!("Failed to set schema: {e}")))?
            .with_descriptor(arrow_flight::FlightDescriptor::new_path(vec![
                "market_data".to_string(),
            ]));

        let flights = vec![Ok(market_data_flight)];
        let output = stream::iter(flights);
        Ok(tonic::Response::new(Box::pin(output)))
    }

    /// Get flight info (schema and metadata).
    async fn get_flight_info(
        &self,
        request: tonic::Request<arrow_flight::FlightDescriptor>,
    ) -> Result<tonic::Response<FlightInfo>, tonic::Status> {
        let descriptor = request.into_inner();
        let path = descriptor
            .path
            .first()
            .ok_or_else(|| tonic::Status::invalid_argument("Missing path"))?;

        match path.as_str() {
            "market_data" => {
                let schema = Self::market_data_schema();

                let info = FlightInfo::new()
                    .try_with_schema(&schema)
                    .map_err(|e| tonic::Status::internal(format!("Failed to set schema: {e}")))?
                    .with_descriptor(descriptor);

                Ok(tonic::Response::new(info))
            }
            _ => Err(tonic::Status::not_found(format!("Unknown flight: {path}"))),
        }
    }

    /// Poll for flight info.
    ///
    /// Returns status of a flight request. Since our data is always ready
    /// (no async preparation needed), this returns the flight info immediately.
    async fn poll_flight_info(
        &self,
        request: tonic::Request<arrow_flight::FlightDescriptor>,
    ) -> Result<tonic::Response<PollInfo>, tonic::Status> {
        // Get the flight info (reuse existing logic)
        let flight_info = self.get_flight_info(request).await?.into_inner();

        // Return PollInfo indicating data is ready
        let poll_info = PollInfo {
            info: Some(flight_info),
            flight_descriptor: None,
            progress: None,
            expiration_time: None,
        };

        Ok(tonic::Response::new(poll_info))
    }

    /// Get schema for a flight.
    async fn get_schema(
        &self,
        request: tonic::Request<arrow_flight::FlightDescriptor>,
    ) -> Result<tonic::Response<arrow_flight::SchemaResult>, tonic::Status> {
        let descriptor = request.into_inner();
        let path = descriptor
            .path
            .first()
            .ok_or_else(|| tonic::Status::invalid_argument("Missing path"))?;

        match path.as_str() {
            "market_data" => {
                let schema = Self::market_data_schema();
                let ipc_message =
                    IpcMessage::try_from(SchemaAsIpc::new(&schema, &Default::default())).map_err(
                        |e| tonic::Status::internal(format!("Failed to encode schema: {e}")),
                    )?;

                Ok(tonic::Response::new(arrow_flight::SchemaResult {
                    schema: ipc_message.0,
                }))
            }
            _ => Err(tonic::Status::not_found(format!("Unknown flight: {path}"))),
        }
    }

    /// DoGet: Retrieve data.
    async fn do_get(
        &self,
        request: tonic::Request<Ticket>,
    ) -> Result<tonic::Response<Self::DoGetStream>, tonic::Status> {
        let ticket = request.into_inner();
        let path = String::from_utf8(ticket.ticket.to_vec())
            .map_err(|e| tonic::Status::invalid_argument(format!("Invalid ticket: {e}")))?;

        tracing::info!(path = %path, "DoGet request");

        match path.as_str() {
            "market_data" => {
                // Return all cached market data
                let data = self.market_data.read().await;
                let snapshots: Vec<MarketDataSnapshot> = data.values().cloned().collect();
                drop(data);

                let batch = Self::market_data_to_record_batch(snapshots)
                    .map_err(|e| tonic::Status::internal(format!("Failed to create batch: {e}")))?;

                // Convert RecordBatch to FlightData stream using FlightDataEncoder
                let schema = batch.schema();
                let batches = vec![batch];

                let flight_data_stream = FlightDataEncoderBuilder::new()
                    .with_schema(schema)
                    .build(futures::stream::iter(
                        batches
                            .into_iter()
                            .map(Ok::<_, arrow_flight::error::FlightError>),
                    ))
                    .map(|result| {
                        result.map_err(|e| tonic::Status::internal(format!("Encoding error: {e}")))
                    });

                Ok(tonic::Response::new(Box::pin(flight_data_stream)))
            }
            _ => Err(tonic::Status::not_found(format!("Unknown ticket: {path}"))),
        }
    }

    /// DoPut: Ingest data.
    async fn do_put(
        &self,
        request: tonic::Request<tonic::Streaming<arrow_flight::FlightData>>,
    ) -> Result<tonic::Response<Self::DoPutStream>, tonic::Status> {
        let stream = request.into_inner();

        tracing::info!("DoPut request");

        // Decode the FlightData stream into RecordBatches
        let mapped_stream =
            stream.map(|result| result.map_err(arrow_flight::error::FlightError::from));
        let mut decoder =
            arrow_flight::decode::FlightRecordBatchStream::new_from_flight_data(mapped_stream);

        let mut total_rows = 0;

        // Process each batch
        while let Some(batch_result) = decoder.next().await {
            let batch = batch_result
                .map_err(|e| tonic::Status::internal(format!("Failed to decode batch: {e}")))?;

            // Parse and store market data
            let snapshots = Self::parse_market_data_batch(&batch)
                .map_err(|e| tonic::Status::internal(format!("Failed to parse batch: {e}")))?;

            let mut data = self.market_data.write().await;
            for snapshot in snapshots {
                data.insert(snapshot.symbol.clone(), snapshot);
                total_rows += 1;
            }
            drop(data);
        }

        tracing::info!(rows = total_rows, "DoPut completed");

        // Return success
        let result = arrow_flight::PutResult {
            app_metadata: format!("Inserted {total_rows} rows").into(),
        };
        let output = stream::iter(vec![Ok(result)]);
        Ok(tonic::Response::new(Box::pin(output)))
    }

    /// DoExchange: Bidirectional streaming (not implemented).
    async fn do_exchange(
        &self,
        _request: tonic::Request<tonic::Streaming<arrow_flight::FlightData>>,
    ) -> Result<tonic::Response<Self::DoExchangeStream>, tonic::Status> {
        Err(tonic::Status::unimplemented(
            "do_exchange not yet implemented",
        ))
    }

    /// DoAction: Perform an action.
    ///
    /// Available actions:
    /// - `clear_cache`: Clear the market data cache
    /// - `health_check`: Return service health status
    /// - `get_cache_stats`: Return cache statistics
    async fn do_action(
        &self,
        request: tonic::Request<arrow_flight::Action>,
    ) -> Result<tonic::Response<Self::DoActionStream>, tonic::Status> {
        let action = request.into_inner();
        let action_type = action.r#type.as_str();

        tracing::info!(action = %action_type, "DoAction request");

        match action_type {
            "clear_cache" => {
                let mut data = self.market_data.write().await;
                let count = data.len();
                data.clear();
                drop(data);

                let result = arrow_flight::Result {
                    body: format!("Cleared {} cached entries", count).into(),
                };
                let output = stream::iter(vec![Ok(result)]);
                Ok(tonic::Response::new(Box::pin(output)))
            }
            "health_check" => {
                let data = self.market_data.read().await;
                let cache_size = data.len();
                drop(data);

                let result = arrow_flight::Result {
                    body: format!(r#"{{"status":"healthy","cache_size":{}}}"#, cache_size).into(),
                };
                let output = stream::iter(vec![Ok(result)]);
                Ok(tonic::Response::new(Box::pin(output)))
            }
            "get_cache_stats" => {
                let data = self.market_data.read().await;
                let symbols: Vec<String> = data.keys().cloned().collect();
                let cache_size = data.len();
                drop(data);

                let result = arrow_flight::Result {
                    body: format!(r#"{{"cache_size":{},"symbols":{:?}}}"#, cache_size, symbols)
                        .into(),
                };
                let output = stream::iter(vec![Ok(result)]);
                Ok(tonic::Response::new(Box::pin(output)))
            }
            _ => Err(tonic::Status::invalid_argument(format!(
                "Unknown action: {}",
                action_type
            ))),
        }
    }

    /// ListActions: List available actions.
    async fn list_actions(
        &self,
        _request: tonic::Request<arrow_flight::Empty>,
    ) -> Result<tonic::Response<Self::ListActionsStream>, tonic::Status> {
        let actions = vec![
            Ok(arrow_flight::ActionType {
                r#type: "clear_cache".to_string(),
                description: "Clear the market data cache".to_string(),
            }),
            Ok(arrow_flight::ActionType {
                r#type: "health_check".to_string(),
                description: "Return service health status".to_string(),
            }),
            Ok(arrow_flight::ActionType {
                r#type: "get_cache_stats".to_string(),
                description: "Return cache statistics including symbols".to_string(),
            }),
        ];

        let output = stream::iter(actions);
        Ok(tonic::Response::new(Box::pin(output)))
    }
}

/// Create Arrow Flight server.
pub fn build_flight_server() -> FlightServiceServer<CreamFlightService> {
    FlightServiceServer::new(CreamFlightService::new())
}

#[cfg(test)]
mod tests {
    use super::*;
    use arrow::array::{Float64Array, Int64Array, StringArray, UInt64Array};
    use std::sync::Arc;

    #[test]
    fn test_market_data_to_record_batch() {
        let snapshots = vec![
            MarketDataSnapshot {
                symbol: "AAPL".to_string(),
                bid_price: 150.0,
                ask_price: 150.5,
                last_price: 150.25,
                volume: 1000,
                timestamp: 1_234_567_890,
            },
            MarketDataSnapshot {
                symbol: "GOOGL".to_string(),
                bid_price: 2800.0,
                ask_price: 2801.0,
                last_price: 2800.5,
                volume: 500,
                timestamp: 1_234_567_891,
            },
        ];

        let batch = CreamFlightService::market_data_to_record_batch(snapshots.clone()).unwrap();

        assert_eq!(batch.num_rows(), 2);
        assert_eq!(batch.num_columns(), 6);

        // Verify symbols
        let symbols = batch
            .column(0)
            .as_any()
            .downcast_ref::<StringArray>()
            .unwrap();
        assert_eq!(symbols.value(0), "AAPL");
        assert_eq!(symbols.value(1), "GOOGL");

        // Verify bid prices
        let bid_prices = batch
            .column(1)
            .as_any()
            .downcast_ref::<Float64Array>()
            .unwrap();
        assert_eq!(bid_prices.value(0), 150.0);
        assert_eq!(bid_prices.value(1), 2800.0);

        // Verify volumes
        let volumes = batch
            .column(4)
            .as_any()
            .downcast_ref::<UInt64Array>()
            .unwrap();
        assert_eq!(volumes.value(0), 1000);
        assert_eq!(volumes.value(1), 500);
    }

    #[test]
    fn test_parse_market_data_batch() {
        let schema = Arc::new(Schema::new(vec![
            Field::new("symbol", DataType::Utf8, false),
            Field::new("bid_price", DataType::Float64, false),
            Field::new("ask_price", DataType::Float64, false),
            Field::new("last_price", DataType::Float64, false),
            Field::new("volume", DataType::UInt64, false),
            Field::new("timestamp", DataType::Int64, false),
        ]));

        let symbols: ArrayRef = Arc::new(StringArray::from(vec!["AAPL", "GOOGL"]));
        let bid_prices: ArrayRef = Arc::new(Float64Array::from(vec![150.0, 2800.0]));
        let ask_prices: ArrayRef = Arc::new(Float64Array::from(vec![150.5, 2801.0]));
        let last_prices: ArrayRef = Arc::new(Float64Array::from(vec![150.25, 2800.5]));
        let volumes: ArrayRef = Arc::new(UInt64Array::from(vec![1000, 500]));
        let timestamps: ArrayRef = Arc::new(Int64Array::from(vec![1_234_567_890, 1_234_567_891]));

        let batch = RecordBatch::try_new(
            schema,
            vec![
                symbols,
                bid_prices,
                ask_prices,
                last_prices,
                volumes,
                timestamps,
            ],
        )
        .unwrap();

        let snapshots = CreamFlightService::parse_market_data_batch(&batch).unwrap();

        assert_eq!(snapshots.len(), 2);
        assert_eq!(snapshots[0].symbol, "AAPL");
        assert_eq!(snapshots[0].bid_price, 150.0);
        assert_eq!(snapshots[0].volume, 1000);
        assert_eq!(snapshots[1].symbol, "GOOGL");
        assert_eq!(snapshots[1].ask_price, 2801.0);
    }

    #[tokio::test]
    async fn test_service_creation() {
        let service = CreamFlightService::new();

        // Verify service is created with empty data
        let data = service.market_data.read().await;
        assert_eq!(data.len(), 0);
    }

    #[tokio::test]
    async fn test_market_data_storage() {
        let service = CreamFlightService::new();

        // Insert test data
        let mut data = service.market_data.write().await;
        data.insert(
            "AAPL".to_string(),
            MarketDataSnapshot {
                symbol: "AAPL".to_string(),
                bid_price: 150.0,
                ask_price: 150.5,
                last_price: 150.25,
                volume: 1000,
                timestamp: 1_234_567_890,
            },
        );
        drop(data);

        // Verify data is stored
        let data = service.market_data.read().await;
        assert_eq!(data.len(), 1);
        assert!(data.contains_key("AAPL"));

        let aapl = data.get("AAPL").unwrap();
        assert_eq!(aapl.bid_price, 150.0);
        assert_eq!(aapl.volume, 1000);
    }

    #[tokio::test]
    async fn test_list_flights() {
        use arrow_flight::flight_service_server::FlightService;

        let service = CreamFlightService::new();
        let request = tonic::Request::new(arrow_flight::Criteria::default());

        let response = service.list_flights(request).await.unwrap();
        let mut stream = response.into_inner();

        // Should have at least market_data flight
        let flight = stream.next().await.unwrap().unwrap();
        assert!(flight.flight_descriptor.is_some());

        let descriptor = flight.flight_descriptor.unwrap();
        assert_eq!(descriptor.path.first().unwrap(), "market_data");
    }

    #[tokio::test]
    async fn test_list_actions() {
        use arrow_flight::flight_service_server::FlightService;

        let service = CreamFlightService::new();
        let request = tonic::Request::new(arrow_flight::Empty::default());

        let response = service.list_actions(request).await.unwrap();
        let mut stream = response.into_inner();

        // Collect all actions
        let mut action_types = Vec::new();
        while let Some(action) = stream.next().await {
            action_types.push(action.unwrap().r#type);
        }

        assert!(action_types.contains(&"clear_cache".to_string()));
        assert!(action_types.contains(&"health_check".to_string()));
        assert!(action_types.contains(&"get_cache_stats".to_string()));
    }

    #[tokio::test]
    async fn test_do_action_health_check() {
        use arrow_flight::flight_service_server::FlightService;

        let service = CreamFlightService::new();
        let action = arrow_flight::Action {
            r#type: "health_check".to_string(),
            body: vec![].into(),
        };
        let request = tonic::Request::new(action);

        let response = service.do_action(request).await.unwrap();
        let mut stream = response.into_inner();

        let result = stream.next().await.unwrap().unwrap();
        let body = String::from_utf8(result.body.to_vec()).unwrap();

        assert!(body.contains("healthy"));
        assert!(body.contains("cache_size"));
    }

    #[tokio::test]
    async fn test_do_action_clear_cache() {
        use arrow_flight::flight_service_server::FlightService;

        let service = CreamFlightService::new();

        // Add some data first
        {
            let mut data = service.market_data.write().await;
            data.insert(
                "AAPL".to_string(),
                MarketDataSnapshot {
                    symbol: "AAPL".to_string(),
                    bid_price: 150.0,
                    ask_price: 150.5,
                    last_price: 150.25,
                    volume: 1000,
                    timestamp: 1_234_567_890,
                },
            );
        }

        // Verify data is present
        assert_eq!(service.market_data.read().await.len(), 1);

        // Clear cache
        let action = arrow_flight::Action {
            r#type: "clear_cache".to_string(),
            body: vec![].into(),
        };
        let request = tonic::Request::new(action);

        let response = service.do_action(request).await.unwrap();
        let mut stream = response.into_inner();
        let _ = stream.next().await.unwrap().unwrap();

        // Verify cache is cleared
        assert_eq!(service.market_data.read().await.len(), 0);
    }

    #[tokio::test]
    async fn test_do_action_unknown() {
        use arrow_flight::flight_service_server::FlightService;

        let service = CreamFlightService::new();
        let action = arrow_flight::Action {
            r#type: "unknown_action".to_string(),
            body: vec![].into(),
        };
        let request = tonic::Request::new(action);

        let result = service.do_action(request).await;
        assert!(result.is_err());

        let status = result.err().unwrap();
        assert_eq!(status.code(), tonic::Code::InvalidArgument);
    }

    #[tokio::test]
    async fn test_poll_flight_info() {
        use arrow_flight::flight_service_server::FlightService;

        let service = CreamFlightService::new();
        let descriptor = arrow_flight::FlightDescriptor::new_path(vec!["market_data".to_string()]);
        let request = tonic::Request::new(descriptor);

        let response = service.poll_flight_info(request).await.unwrap();
        let poll_info = response.into_inner();

        // poll_info should contain flight info
        assert!(poll_info.info.is_some());
    }
}
