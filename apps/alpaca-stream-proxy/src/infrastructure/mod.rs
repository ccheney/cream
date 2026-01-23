//! Infrastructure Layer - Adapters and external integrations.
//!
//! This layer contains the concrete implementations of the port interfaces
//! defined in the application layer.

/// Alpaca WebSocket client adapters (SIP, OPRA, Trade Updates).
pub mod alpaca;

/// gRPC streaming server implementation.
pub mod grpc;

/// Broadcast channel adapters for message distribution.
pub mod broadcast;

/// Configuration and dependency injection.
pub mod config;

/// Health check HTTP endpoint.
pub mod health;

/// Prometheus metrics instrumentation.
pub mod metrics;

/// OpenTelemetry tracing integration.
pub mod telemetry;
