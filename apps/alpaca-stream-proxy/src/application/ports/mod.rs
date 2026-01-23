//! Port Interfaces
//!
//! Defines the interfaces (ports) for external systems following
//! the Hexagonal Architecture pattern. These are the contracts that
//! infrastructure adapters must implement.
//!
//! ## Driven Ports (Outbound)
//!
//! - `WebSocketPort`: Interface for WebSocket connections to Alpaca
//! - `BroadcastPort`: Interface for message distribution to subscribers
//!
//! ## Driver Ports (Inbound)
//!
//! - `StreamPort`: Interface exposed to gRPC clients for subscribing
