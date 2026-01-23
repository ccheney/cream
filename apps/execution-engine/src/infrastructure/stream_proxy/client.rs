//! Stream proxy gRPC client.
//!
//! This module provides a high-level client for connecting to the stream proxy
//! service, which provides real-time market data and order updates by proxying
//! Alpaca WebSocket connections through a single gRPC interface.

use std::sync::Arc;

use tokio::sync::RwLock;
use tonic::Streaming;
use tonic::transport::{Channel, Endpoint};

use crate::infrastructure::grpc::proto::cream::v1::{
    ConnectionStatus, GetConnectionStatusRequest, StreamBarsRequest, StreamBarsResponse,
    StreamOptionQuotesRequest, StreamOptionQuotesResponse, StreamOptionTradesRequest,
    StreamOptionTradesResponse, StreamOrderUpdatesRequest, StreamOrderUpdatesResponse,
    StreamQuotesRequest, StreamQuotesResponse, StreamTradesRequest, StreamTradesResponse,
    stream_proxy_service_client::StreamProxyServiceClient,
};

use super::config::StreamProxyConfig;
use super::error::StreamProxyError;

/// Client for the stream proxy gRPC service.
///
/// Provides real-time market data and order updates through server-side streaming.
/// The client manages the underlying gRPC channel and handles connection lifecycle.
///
/// # Example
///
/// ```ignore
/// let config = StreamProxyConfig::new("http://localhost:50051");
/// let client = StreamProxyClient::connect(&config).await?;
///
/// // Stream stock quotes
/// let mut stream = client.stream_quotes(&["AAPL", "GOOGL"]).await?;
/// while let Some(quote) = stream.message().await? {
///     println!("Quote: {:?}", quote);
/// }
/// ```
#[derive(Debug, Clone)]
pub struct StreamProxyClient {
    inner: Arc<RwLock<StreamProxyServiceClient<Channel>>>,
    config: StreamProxyConfig,
}

impl StreamProxyClient {
    /// Connect to the stream proxy service.
    ///
    /// # Errors
    ///
    /// Returns error if connection fails or configuration is invalid.
    pub async fn connect(config: &StreamProxyConfig) -> Result<Self, StreamProxyError> {
        let endpoint = Self::create_endpoint(config)?;
        let channel = endpoint.connect().await?;
        let client = StreamProxyServiceClient::new(channel);

        tracing::info!(endpoint = %config.endpoint, "Connected to stream proxy");

        Ok(Self {
            inner: Arc::new(RwLock::new(client)),
            config: config.clone(),
        })
    }

    /// Connect lazily (connection established on first request).
    ///
    /// # Errors
    ///
    /// Returns error if endpoint configuration is invalid.
    pub fn connect_lazy(config: &StreamProxyConfig) -> Result<Self, StreamProxyError> {
        let endpoint = Self::create_endpoint(config)?;
        let channel = endpoint.connect_lazy();
        let client = StreamProxyServiceClient::new(channel);

        tracing::debug!(endpoint = %config.endpoint, "Created lazy connection to stream proxy");

        Ok(Self {
            inner: Arc::new(RwLock::new(client)),
            config: config.clone(),
        })
    }

    /// Create a configured endpoint from the config.
    fn create_endpoint(config: &StreamProxyConfig) -> Result<Endpoint, StreamProxyError> {
        let endpoint = Channel::from_shared(config.endpoint.clone())
            .map_err(|e| StreamProxyError::InvalidConfig {
                message: format!("invalid endpoint: {e}"),
            })?
            .connect_timeout(config.connect_timeout)
            .timeout(config.request_timeout)
            .tcp_keepalive(Some(config.tcp_keepalive))
            .http2_keep_alive_interval(config.http2_keepalive_interval)
            .keep_alive_timeout(config.keepalive_timeout)
            .keep_alive_while_idle(true)
            .tcp_nodelay(true);

        Ok(endpoint)
    }

    /// Reconnect to the stream proxy service.
    ///
    /// # Errors
    ///
    /// Returns error if reconnection fails.
    pub async fn reconnect(&self) -> Result<(), StreamProxyError> {
        let endpoint = Self::create_endpoint(&self.config)?;
        let channel = endpoint.connect().await?;
        let new_client = StreamProxyServiceClient::new(channel);

        *self.inner.write().await = new_client;

        tracing::info!(endpoint = %self.config.endpoint, "Reconnected to stream proxy");
        Ok(())
    }

    /// Get the current connection status of the proxy.
    ///
    /// # Errors
    ///
    /// Returns error if the request fails.
    pub async fn get_connection_status(&self) -> Result<ConnectionStatus, StreamProxyError> {
        let mut client = self.inner.read().await.clone();
        let response = client
            .get_connection_status(GetConnectionStatusRequest {})
            .await?;
        response
            .into_inner()
            .status
            .ok_or_else(|| StreamProxyError::StreamClosed {
                message: "no status in response".to_string(),
            })
    }

    /// Stream real-time stock quotes (SIP feed).
    ///
    /// # Arguments
    ///
    /// * `symbols` - Stock symbols to subscribe to (empty for all symbols)
    ///
    /// # Errors
    ///
    /// Returns error if stream creation fails.
    pub async fn stream_quotes(
        &self,
        symbols: &[&str],
    ) -> Result<Streaming<StreamQuotesResponse>, StreamProxyError> {
        let mut client = self.inner.read().await.clone();
        let request = StreamQuotesRequest {
            symbols: symbols.iter().map(|s| (*s).to_string()).collect(),
        };

        tracing::debug!(symbols = ?symbols, "Starting quote stream");

        let response = client.stream_quotes(request).await?;
        Ok(response.into_inner())
    }

    /// Stream real-time stock trades (SIP feed).
    ///
    /// # Arguments
    ///
    /// * `symbols` - Stock symbols to subscribe to (empty for all symbols)
    ///
    /// # Errors
    ///
    /// Returns error if stream creation fails.
    pub async fn stream_trades(
        &self,
        symbols: &[&str],
    ) -> Result<Streaming<StreamTradesResponse>, StreamProxyError> {
        let mut client = self.inner.read().await.clone();
        let request = StreamTradesRequest {
            symbols: symbols.iter().map(|s| (*s).to_string()).collect(),
        };

        tracing::debug!(symbols = ?symbols, "Starting trade stream");

        let response = client.stream_trades(request).await?;
        Ok(response.into_inner())
    }

    /// Stream real-time stock bars (SIP feed).
    ///
    /// # Arguments
    ///
    /// * `symbols` - Stock symbols to subscribe to (empty for all symbols)
    ///
    /// # Errors
    ///
    /// Returns error if stream creation fails.
    pub async fn stream_bars(
        &self,
        symbols: &[&str],
    ) -> Result<Streaming<StreamBarsResponse>, StreamProxyError> {
        let mut client = self.inner.read().await.clone();
        let request = StreamBarsRequest {
            symbols: symbols.iter().map(|s| (*s).to_string()).collect(),
        };

        tracing::debug!(symbols = ?symbols, "Starting bar stream");

        let response = client.stream_bars(request).await?;
        Ok(response.into_inner())
    }

    /// Stream real-time option quotes (OPRA feed).
    ///
    /// # Arguments
    ///
    /// * `symbols` - OCC option symbols to subscribe to
    /// * `underlyings` - Subscribe to all options for these underlying symbols
    ///
    /// # Errors
    ///
    /// Returns error if stream creation fails.
    pub async fn stream_option_quotes(
        &self,
        symbols: &[&str],
        underlyings: &[&str],
    ) -> Result<Streaming<StreamOptionQuotesResponse>, StreamProxyError> {
        let mut client = self.inner.read().await.clone();
        let request = StreamOptionQuotesRequest {
            symbols: symbols.iter().map(|s| (*s).to_string()).collect(),
            underlyings: underlyings.iter().map(|s| (*s).to_string()).collect(),
        };

        tracing::debug!(
            symbols = ?symbols,
            underlyings = ?underlyings,
            "Starting option quote stream"
        );

        let response = client.stream_option_quotes(request).await?;
        Ok(response.into_inner())
    }

    /// Stream real-time option trades (OPRA feed).
    ///
    /// # Arguments
    ///
    /// * `symbols` - OCC option symbols to subscribe to
    /// * `underlyings` - Subscribe to all options for these underlying symbols
    ///
    /// # Errors
    ///
    /// Returns error if stream creation fails.
    pub async fn stream_option_trades(
        &self,
        symbols: &[&str],
        underlyings: &[&str],
    ) -> Result<Streaming<StreamOptionTradesResponse>, StreamProxyError> {
        let mut client = self.inner.read().await.clone();
        let request = StreamOptionTradesRequest {
            symbols: symbols.iter().map(|s| (*s).to_string()).collect(),
            underlyings: underlyings.iter().map(|s| (*s).to_string()).collect(),
        };

        tracing::debug!(
            symbols = ?symbols,
            underlyings = ?underlyings,
            "Starting option trade stream"
        );

        let response = client.stream_option_trades(request).await?;
        Ok(response.into_inner())
    }

    /// Stream real-time order updates (trade updates).
    ///
    /// # Arguments
    ///
    /// * `order_ids` - Filter by specific order IDs (empty for all orders)
    /// * `symbols` - Filter by symbols (empty for all symbols)
    ///
    /// # Errors
    ///
    /// Returns error if stream creation fails.
    pub async fn stream_order_updates(
        &self,
        order_ids: &[&str],
        symbols: &[&str],
    ) -> Result<Streaming<StreamOrderUpdatesResponse>, StreamProxyError> {
        let mut client = self.inner.read().await.clone();
        let request = StreamOrderUpdatesRequest {
            order_ids: order_ids.iter().map(|s| (*s).to_string()).collect(),
            symbols: symbols.iter().map(|s| (*s).to_string()).collect(),
        };

        tracing::debug!(
            order_ids = ?order_ids,
            symbols = ?symbols,
            "Starting order update stream"
        );

        let response = client.stream_order_updates(request).await?;
        Ok(response.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_default_values() {
        let config = StreamProxyConfig::default();
        assert_eq!(config.endpoint, "http://localhost:50051");
        assert!(!config.use_tls);
    }

    #[test]
    fn config_builder_pattern() {
        let config = StreamProxyConfig::new("http://proxy:8080")
            .with_tls()
            .with_connect_timeout(std::time::Duration::from_secs(5));

        assert_eq!(config.endpoint, "http://proxy:8080");
        assert!(config.use_tls);
        assert_eq!(config.connect_timeout, std::time::Duration::from_secs(5));
    }
}
