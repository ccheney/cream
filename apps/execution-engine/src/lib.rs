// Allow unwrap/expect in tests - tests should panic on unexpected errors
// Allow test-specific patterns and pedantic lints in test code
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

//! Execution Engine - Rust Core Library
//!
//! Deterministic execution engine for the Cream trading system.
//!
//! # Architecture (Clean Architecture + DDD + Hexagonal)
//!
//! The execution engine follows Clean Architecture principles with Domain-Driven Design:
//!
//! ## Layers (inside → outside)
//!
//! - **Domain**: Core business logic (aggregates, value objects, domain events)
//!   - `order_execution`: Order aggregate, status lifecycle, fills
//!   - `risk_management`: Risk policies, validation, constraints
//!   - `execution_tactics`: TWAP, VWAP, Iceberg execution strategies
//!   - `stop_enforcement`: Price monitoring, stop/target triggers
//!   - `option_position`: Options spreads, Greeks, position tracking
//!
//! - **Application**: Use cases and orchestration
//!   - `ports`: Interfaces for external systems (`BrokerPort`, `PriceFeedPort`)
//!   - `use_cases`: `SubmitOrders`, `ValidateRisk`, `CancelOrders`, `MonitorStops`, Reconcile
//!   - `dto`: Data transfer objects for API boundaries
//!
//! - **Infrastructure**: Adapters (implementations)
//!   - `broker`: Alpaca broker adapter
//!   - `persistence`: Order repository (in-memory, `PostgreSQL`)
//!   - `price_feed`: Market data adapters
//!   - `config`: Dependency injection container
//!
//! # Coverage
//!
//! Coverage threshold: 90% (Critical tier)
//! See: docs/plans/14-testing.md

#![forbid(unsafe_code)]
#![warn(missing_docs)]
#![warn(clippy::pedantic)]

// =============================================================================
// Clean Architecture Layers
// =============================================================================

/// Domain layer - Core business logic with no external dependencies.
pub mod domain;

/// Application layer - Use cases and port definitions.
pub mod application;

/// Infrastructure layer - Adapters and external integrations.
pub mod infrastructure;

// =============================================================================
// Re-exports from Clean Architecture
// =============================================================================

// Domain re-exports
pub use domain::order_execution::{
    aggregate::Order,
    value_objects::{OrderPurpose, OrderSide, OrderStatus, OrderType, TimeInForce},
};
pub use domain::risk_management::services::RiskValidationService;
pub use domain::shared::{BrokerId, InstrumentId, Money, OrderId, Quantity, Symbol, Timestamp};

// Application re-exports
pub use application::dto::{CreateOrderDto, OrderDto, SubmitOrdersRequestDto};
pub use application::ports::{
    BrokerError, BrokerPort, EventPublisherPort, InMemoryRiskRepository, NoOpEventPublisher,
    PriceFeedPort, RiskRepositoryPort,
};
pub use application::use_cases::{
    CancelOrdersUseCase, MonitorStopsUseCase, ReconcileUseCase, SubmitOrdersUseCase,
    ValidateRiskUseCase,
};

// Infrastructure re-exports
pub use infrastructure::broker::alpaca::{
    AlpacaBrokerAdapter, AlpacaConfig, AlpacaEnvironment, AlpacaError,
};
pub use infrastructure::config::Container;
pub use infrastructure::grpc::{ExecutionServiceAdapter, create_execution_service};
pub use infrastructure::http::{AppState, create_router};
pub use infrastructure::persistence::InMemoryOrderRepository;
pub use infrastructure::price_feed::{AlpacaPriceFeedAdapter, MockPriceFeed};
