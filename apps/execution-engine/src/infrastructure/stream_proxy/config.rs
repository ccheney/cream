//! Configuration for stream proxy client.

use std::time::Duration;

/// Configuration for connecting to the stream proxy service.
#[derive(Debug, Clone)]
pub struct StreamProxyConfig {
    /// Proxy server endpoint (e.g., `http://localhost:50051`).
    pub endpoint: String,

    /// Connection timeout.
    pub connect_timeout: Duration,

    /// Request timeout.
    pub request_timeout: Duration,

    /// TCP keepalive interval.
    pub tcp_keepalive: Duration,

    /// HTTP/2 keepalive interval.
    pub http2_keepalive_interval: Duration,

    /// Keepalive timeout.
    pub keepalive_timeout: Duration,

    /// Whether to use TLS.
    pub use_tls: bool,
}

impl Default for StreamProxyConfig {
    fn default() -> Self {
        Self {
            endpoint: "http://localhost:50051".to_string(),
            connect_timeout: Duration::from_secs(10),
            request_timeout: Duration::from_secs(30),
            tcp_keepalive: Duration::from_secs(60),
            http2_keepalive_interval: Duration::from_secs(75),
            keepalive_timeout: Duration::from_secs(20),
            use_tls: false,
        }
    }
}

impl StreamProxyConfig {
    /// Create a new configuration with the given endpoint.
    #[must_use]
    pub fn new(endpoint: impl Into<String>) -> Self {
        Self {
            endpoint: endpoint.into(),
            ..Default::default()
        }
    }

    /// Set the connection timeout.
    #[must_use]
    pub const fn with_connect_timeout(mut self, timeout: Duration) -> Self {
        self.connect_timeout = timeout;
        self
    }

    /// Set the request timeout.
    #[must_use]
    pub const fn with_request_timeout(mut self, timeout: Duration) -> Self {
        self.request_timeout = timeout;
        self
    }

    /// Enable TLS.
    #[must_use]
    pub const fn with_tls(mut self) -> Self {
        self.use_tls = true;
        self
    }
}
