//! gRPC Streaming Server
//!
//! Implements the StreamProxy gRPC service that exposes market data
//! streams to downstream clients.
//!
//! # Architecture
//!
//! The gRPC server bridges the broadcast channels (fed by WebSocket clients)
//! to downstream gRPC clients. Each streaming RPC:
//!
//! 1. Registers the client's subscriptions with the SubscriptionManager
//! 2. Subscribes to the appropriate broadcast channel
//! 3. Filters messages by the client's requested symbols
//! 4. Streams matching messages to the client
//! 5. Cleans up subscriptions on disconnect

pub mod server;

// Allow clippy warnings and missing docs in generated code
#[allow(
    missing_docs,
    clippy::all,
    clippy::pedantic,
    clippy::nursery,
    clippy::unwrap_used,
    clippy::expect_used
)]
pub mod proto {
    pub mod cream {
        pub mod v1 {
            include!(concat!(env!("OUT_DIR"), "/cream.v1.rs"));
        }
    }
}

pub use server::{StreamProxyServer, StreamProxyServerConfig};
