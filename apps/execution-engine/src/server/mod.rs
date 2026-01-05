//! Server implementation.
//!
//! This module provides HTTP/JSON, gRPC, and Arrow Flight API servers for the execution engine.
//!
//! - **HTTP/JSON**: REST API for basic operations (port 50051)
//! - **gRPC**: ExecutionService and MarketDataService (port 50051)
//! - **Arrow Flight**: High-performance data transport (port 50052)

mod arrow_flight;
// TODO: Fix grpc module (requires generated protobuf code)
// mod grpc;
mod http;

pub use arrow_flight::{build_flight_server, CreamFlightService};
// pub use grpc::{ExecutionServiceImpl, MarketDataServiceImpl, build_grpc_services, run_grpc_server};
pub use http::{ExecutionServer, create_router};

// Re-export for compatibility
pub use http::ExecutionServer as ExecutionServiceServer;
