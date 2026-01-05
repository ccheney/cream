//! Server implementation.
//!
//! This module provides the HTTP/JSON API server for the execution engine.
//! Once bead cream-z5e (Buf configuration) is complete, this will be
//! replaced with a proper gRPC server using generated protobuf code.

mod http;

pub use http::{create_router, ExecutionServer};

// Re-export for compatibility
pub use http::ExecutionServer as ExecutionServiceServer;
