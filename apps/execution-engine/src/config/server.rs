//! Server configuration for HTTP, gRPC, and Arrow Flight endpoints.

use serde::{Deserialize, Serialize};

/// Server configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    /// HTTP server port for REST endpoints (/health, /v1/*).
    #[serde(default = "default_http_port")]
    pub http_port: u16,
    /// gRPC server port for MarketDataService and ExecutionService.
    #[serde(default = "default_grpc_port")]
    pub grpc_port: u16,
    /// Arrow Flight server port.
    #[serde(default = "default_flight_port")]
    pub flight_port: u16,
    /// Bind address.
    #[serde(default = "default_bind_address")]
    pub bind_address: String,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            http_port: default_http_port(),
            grpc_port: default_grpc_port(),
            flight_port: default_flight_port(),
            bind_address: default_bind_address(),
        }
    }
}

pub(crate) const fn default_http_port() -> u16 {
    50051
}

pub(crate) const fn default_grpc_port() -> u16 {
    50053
}

pub(crate) const fn default_flight_port() -> u16 {
    50052
}

pub(crate) fn default_bind_address() -> String {
    "0.0.0.0".to_string()
}
