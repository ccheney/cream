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
    async fn list_flights(
        &self,
        _request: tonic::Request<arrow_flight::Criteria>,
    ) -> Result<tonic::Response<Self::ListFlightsStream>, tonic::Status> {
        Err(tonic::Status::unimplemented(
            "list_flights not yet implemented",
        ))
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

    /// Poll for flight info (not implemented).
    async fn poll_flight_info(
        &self,
        _request: tonic::Request<arrow_flight::FlightDescriptor>,
    ) -> Result<tonic::Response<PollInfo>, tonic::Status> {
        Err(tonic::Status::unimplemented(
            "poll_flight_info not yet implemented",
        ))
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
    async fn do_action(
        &self,
        _request: tonic::Request<arrow_flight::Action>,
    ) -> Result<tonic::Response<Self::DoActionStream>, tonic::Status> {
        Err(tonic::Status::unimplemented(
            "do_action not yet implemented",
        ))
    }

    /// ListActions: List available actions.
    async fn list_actions(
        &self,
        _request: tonic::Request<arrow_flight::Empty>,
    ) -> Result<tonic::Response<Self::ListActionsStream>, tonic::Status> {
        Err(tonic::Status::unimplemented(
            "list_actions not yet implemented",
        ))
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
                timestamp: 1234567890,
            },
            MarketDataSnapshot {
                symbol: "GOOGL".to_string(),
                bid_price: 2800.0,
                ask_price: 2801.0,
                last_price: 2800.5,
                volume: 500,
                timestamp: 1234567891,
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
        let timestamps: ArrayRef = Arc::new(Int64Array::from(vec![1234567890, 1234567891]));

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
                timestamp: 1234567890,
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
}
