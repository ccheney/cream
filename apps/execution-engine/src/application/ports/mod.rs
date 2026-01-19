//! Application Ports (Driver and Driven)
//!
//! Ports define interfaces for interacting with external systems.
//! - **Driver Ports** (Primary/Inbound): How the world uses our application
//! - **Driven Ports** (Secondary/Outbound): How our application uses external systems

mod broker_port;
mod event_publisher_port;
mod price_feed_port;
mod risk_repository_port;

pub use broker_port::{BrokerError, BrokerPort, CancelOrderRequest, OrderAck, SubmitOrderRequest};
pub use event_publisher_port::{EventPublishError, EventPublisherPort, NoOpEventPublisher};
pub use price_feed_port::{PriceFeedError, PriceFeedPort, Quote};
pub use risk_repository_port::{InMemoryRiskRepository, RiskRepositoryPort};
