//! Infrastructure Layer
//!
//! This module contains all adapters (implementations) for the ports defined
//! in the application layer. Following hexagonal architecture:
//!
//! - **Driven Adapters (Outbound)**: Implement ports for external systems
//!   - `persistence/`: Database adapters (PostgreSQL)
//!   - `broker/`: Broker API adapters (Alpaca)
//!   - `price_feed/`: Market data adapters
//!   - `messaging/`: Event publishing adapters
//!
//! - **Driver Adapters (Inbound)**: Expose application to external world
//!   - `http/`: REST API controllers
//!   - `grpc/`: gRPC service implementations
//!
//! - **Resilience**: Cross-cutting infrastructure concerns
//!   - `resilience/`: Retry policies, circuit breakers, rate limiters

pub mod broker;
pub mod config;
pub mod persistence;
pub mod price_feed;
