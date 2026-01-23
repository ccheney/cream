//! Error types for stream proxy client.

use thiserror::Error;

/// Errors that can occur when interacting with the stream proxy.
#[derive(Error, Debug)]
pub enum StreamProxyError {
    /// Failed to connect to the proxy server.
    #[error("connection failed: {message}")]
    ConnectionFailed {
        /// Error message describing the connection failure.
        message: String,
    },

    /// Transport error during communication.
    #[error("transport error: {0}")]
    Transport(#[from] tonic::transport::Error),

    /// gRPC status error from the server.
    #[error("grpc error: {0}")]
    Status(#[from] tonic::Status),

    /// Stream was closed unexpectedly.
    #[error("stream closed: {message}")]
    StreamClosed {
        /// Error message describing why the stream closed.
        message: String,
    },

    /// Invalid configuration.
    #[error("invalid configuration: {message}")]
    InvalidConfig {
        /// Error message describing the configuration issue.
        message: String,
    },
}
