//! gRPC Adapter (Driver Adapter)
//!
//! Tonic-based gRPC service that delegates to application use cases.

mod service;

pub use service::{ExecutionServiceAdapter, create_execution_service};

/// Include generated protobuf code.
#[allow(
    dead_code,
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
