//! Domain Layer - Core streaming types and business logic.
//!
//! This layer contains the core domain types for market data streaming
//! with no external dependencies. All types here are pure Rust with
//! serialization support.

/// Market data streaming types (quotes, trades, bars).
pub mod streaming;

/// Scanner domain types and signal detection logic.
pub mod scanner;

/// Subscription tracking and management.
pub mod subscription;
