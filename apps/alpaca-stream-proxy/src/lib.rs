#![cfg_attr(
    test,
    allow(
        clippy::unwrap_used,
        clippy::expect_used,
        clippy::float_cmp,
        clippy::significant_drop_tightening,
        clippy::too_many_lines,
        clippy::match_same_arms,
        clippy::needless_pass_by_value,
        clippy::needless_collect,
        clippy::option_if_let_else,
        clippy::default_trait_access,
        clippy::items_after_statements,
        clippy::or_fun_call
    )
)]

//! Alpaca Stream Proxy - Market Data Multiplexer
//!
//! A gRPC proxy service that maintains single connections to Alpaca's
//! WebSocket feeds (SIP for stocks, OPRA for options) and multiplexes
//! market data to multiple downstream clients.
//!
//! # Layers (inside → outside)
//!
//! - **Domain**: Core streaming logic and data types
//!   - `streaming`: Market data types (quotes, trades, bars)
//!   - `subscription`: Subscription tracking and management
//!
//! - **Application**: Use cases and port definitions
//!   - `ports`: Interfaces for WebSocket clients, broadcast channels
//!   - `services`: Subscription management, health monitoring
//!
//! - **Infrastructure**: Adapters and external integrations
//!   - `alpaca`: WebSocket clients for SIP/OPRA streams
//!   - `grpc`: gRPC streaming server implementation
//!   - `broadcast`: Channel-based message distribution
//!   - `config`: Configuration and dependency injection
//!   - `health`: Health check HTTP endpoint
//!
//! # Data Flow
//!
//! ```text
//! Alpaca SIP WS ──┐
//!                 │     ┌─────────────┐     ┌─────────────┐
//!                 ├────►│  Broadcast  │────►│    gRPC     │──► Client 1
//! Alpaca OPRA WS ─┤     │   Channels  │     │   Server    │──► Client 2
//!                 │     └─────────────┘     └─────────────┘──► Client N
//! Alpaca Trade WS─┘
//! ```

#![forbid(unsafe_code)]
#![warn(missing_docs)]
#![warn(clippy::pedantic)]

// =============================================================================
// Module Declarations
// =============================================================================

/// Domain layer - Core streaming types with no external dependencies.
pub mod domain;

/// Application layer - Use cases and port definitions.
pub mod application;

/// Infrastructure layer - Adapters and external integrations.
pub mod infrastructure;

// =============================================================================
// Re-exports
// =============================================================================

// Domain types
pub use domain::subscription::{
    ConsumerId, SubscriptionChanges, SubscriptionManager, SubscriptionStats, SubscriptionType,
    Symbol, TotalSubscriptionStats,
};

// Infrastructure config
pub use infrastructure::config::{
    BroadcastSettings, ConfigError, Credentials, DataFeed, Environment, ProxyConfig,
    ServerSettings, WebSocketSettings,
};

// Health server
pub use infrastructure::health::{HealthServer, HealthServerError, HealthServerState};

// Broadcast hub (for integration tests)
pub use infrastructure::broadcast::{
    BroadcastConfig, BroadcastHub, BroadcastStats, SharedBroadcastHub,
};

// gRPC server (for integration tests)
pub use infrastructure::grpc::{
    proto::cream::v1 as proto,
    server::{FeedState, StreamProxyServer, StreamProxyServerConfig},
};

// Alpaca message types (for integration tests)
pub use infrastructure::alpaca::messages::{
    OptionQuoteMessage, OptionTradeMessage, StockBarMessage, StockQuoteMessage, StockTradeMessage,
    TradeUpdateMessage,
};

// Metrics
pub use infrastructure::metrics::{
    FeedType as MetricsFeedType, MessageType as MetricsMessageType, init_metrics,
};

// Telemetry
pub use infrastructure::telemetry::{TelemetryConfig, TelemetryGuard, init as init_telemetry};
