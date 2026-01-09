//! Server implementation.
//!
//! This module provides HTTP/JSON, gRPC, and Arrow Flight API servers for the execution engine.
//!
//! - **HTTP/JSON**: REST API for basic operations (port 50051)
//! - **gRPC**: `ExecutionService` and `MarketDataService` (port 50051)
//! - **Arrow Flight**: High-performance data transport (port 50052)
//!
//! # TLS Support
//!
//! TLS is configured via environment variables:
//! - `GRPC_TLS_ENABLED`: Enable TLS (default: false)
//! - `GRPC_TLS_CERT_PATH`: Path to server certificate
//! - `GRPC_TLS_KEY_PATH`: Path to server private key
//! - `GRPC_TLS_CA_PATH`: Path to CA certificate for mTLS
//!
//! See the `tls` module for more details.

mod arrow_flight;
pub mod grpc;
mod http;
pub mod tls;

pub use arrow_flight::{CreamFlightService, build_flight_server};
pub use grpc::{
    ExecutionServiceImpl, MarketDataServiceImpl, build_grpc_services, run_grpc_server,
    run_grpc_server_with_tls,
};
pub use http::{ExecutionServer, create_router};
pub use tls::{
    TlsConfig, TlsConfigBuilder, TlsError, get_tls_config, init_tls_config, is_tls_enabled,
};

// Re-export for compatibility
pub use http::ExecutionServer as ExecutionServiceServer;
