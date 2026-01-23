//! Application Layer - Use cases and port definitions.
//!
//! This layer contains the application services and port interfaces
//! that define how the domain interacts with external systems.

/// Port interfaces for external systems (WebSocket, broadcast, etc.).
pub mod ports;

/// Application services for subscription and health management.
pub mod services;
