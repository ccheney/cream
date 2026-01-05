//! Server implementation.
//!
//! This module provides both HTTP/JSON and gRPC API servers for the execution engine.
//!
//! The gRPC server implements the ExecutionService and MarketDataService
//! defined in the protobuf schema.

mod grpc;
mod http;

pub use grpc::{ExecutionServiceImpl, MarketDataServiceImpl, build_grpc_services, run_grpc_server};
pub use http::{ExecutionServer, create_router};

// Re-export for compatibility
pub use http::ExecutionServer as ExecutionServiceServer;
