//! Infrastructure Layer
//!
//! This module contains all adapters (implementations) for the ports defined
//! in the application layer.
//!
//! - **Driven Adapters (Outbound)**: Implement ports for external systems
//!   - `persistence/`: Database adapters (PostgreSQL)
//!   - `broker/`: Broker API adapters (Alpaca)
//!   - `price_feed/`: Market data adapters
//!   - `messaging/`: Event publishing adapters
//!   - `websocket/`: Real-time market data WebSocket streams
//!
//! - **Driver Adapters (Inbound)**: Expose application to external world
//!   - `http/`: REST API controllers
//!   - `grpc/`: gRPC service implementations
//!
//! - **Resilience**: Cross-cutting infrastructure concerns
//!   - `resilience/`: Retry policies, circuit breakers, rate limiters

pub mod broker;
pub mod config;
pub mod grpc;
pub mod http;
pub mod marketdata;
pub mod persistence;
pub mod price_feed;
pub mod stream_proxy;
pub mod websocket;
