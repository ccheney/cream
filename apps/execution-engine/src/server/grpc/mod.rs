//! gRPC service implementation for the execution engine.
//!
//! Implements the `ExecutionService` and `MarketDataService` gRPC services
//! defined in the protobuf schema.
//!
//! # Module Structure
//!
//! - `cache`: Caching for Alpaca API responses
//! - `converters`: Type conversion functions between proto and internal types
//! - `execution_service`: ExecutionService gRPC implementation
//! - `market_data_service`: MarketDataService gRPC implementation
//! - `server`: Server builder functions

mod cache;
mod converters;
mod execution_service;
mod market_data_service;
mod server;

// Re-export proto module for external consumers
/// Include generated protobuf code.
/// The generated code is in packages/schema-gen/rust/cream/v1/
/// cream.v1.rs includes cream.v1.tonic.rs at the end
#[allow(
    dead_code,
    missing_docs,
    clippy::all,
    clippy::pedantic,
    clippy::nursery,
    clippy::unwrap_used,
    clippy::expect_used
)]
pub mod proto {
    pub mod cream {
        pub mod v1 {
            include!(concat!(env!("OUT_DIR"), "/cream.v1.rs"));
        }
    }
}

// Re-export public items for backwards compatibility
pub use execution_service::ExecutionServiceImpl;
pub use market_data_service::MarketDataServiceImpl;
pub use server::{
    build_grpc_services, build_grpc_services_with_feed, run_grpc_server, run_grpc_server_with_tls,
};
