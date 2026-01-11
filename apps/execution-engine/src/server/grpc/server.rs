//! Server builder functions for gRPC services.
//!
//! Provides functions to build and run the gRPC server with
//! the ExecutionService and MarketDataService.

use std::sync::Arc;

use super::execution_service::ExecutionServiceImpl;
use super::market_data_service::MarketDataServiceImpl;
use super::proto::cream::v1::{
    execution_service_server::ExecutionServiceServer,
    market_data_service_server::MarketDataServiceServer,
};
use crate::models::Environment;

/// Run the gRPC server on the specified address (without TLS).
///
/// # Errors
///
/// Returns an error if the execution service fails to initialize or
/// the server fails to bind to the address.
pub async fn run_grpc_server(addr: std::net::SocketAddr) -> anyhow::Result<()> {
    tracing::info!(%addr, "Starting gRPC server (no TLS)");

    let execution_service = ExecutionServiceImpl::with_defaults()?;

    // Create adapter for market data service
    let market_data_alpaca = crate::execution::AlpacaAdapter::new(
        std::env::var("ALPACA_KEY").unwrap_or_else(|_| "paper-key".to_string()),
        std::env::var("ALPACA_SECRET").unwrap_or_else(|_| "paper-secret".to_string()),
        Environment::Paper,
    )?;
    let market_data_service = MarketDataServiceImpl::new(market_data_alpaca, Environment::Paper);

    let router = tonic::transport::Server::builder()
        .add_service(ExecutionServiceServer::new(execution_service))
        .add_service(MarketDataServiceServer::new(market_data_service));

    router.serve(addr).await?;
    Ok(())
}

/// Run the gRPC server with TLS support.
///
/// TLS configuration is loaded from the provided `TlsConfig`.
/// If TLS config is `None`, the server runs without TLS (equivalent to `run_grpc_server`).
///
/// # Errors
///
/// Returns an error if:
/// - TLS configuration fails to build (invalid certificates or keys)
/// - The server fails to bind to the address
/// - A transport error occurs during operation
///
/// # Example
///
/// ```ignore
/// use execution_engine::server::{TlsConfigBuilder, run_grpc_server_with_tls};
///
/// // Load TLS config from environment
/// let tls_config = TlsConfigBuilder::from_env().build()?;
///
/// // Start server with or without TLS based on config
/// let addr = "0.0.0.0:50051".parse()?;
/// run_grpc_server_with_tls(addr, tls_config).await?;
/// ```
pub async fn run_grpc_server_with_tls(
    addr: std::net::SocketAddr,
    tls_config: Option<crate::server::tls::TlsConfig>,
) -> anyhow::Result<()> {
    let execution_service = ExecutionServiceImpl::with_defaults()?;

    // Create adapter for market data service
    let market_data_alpaca = crate::execution::AlpacaAdapter::new(
        std::env::var("ALPACA_KEY").unwrap_or_else(|_| "paper-key".to_string()),
        std::env::var("ALPACA_SECRET").unwrap_or_else(|_| "paper-secret".to_string()),
        Environment::Paper,
    )?;
    let market_data_service = MarketDataServiceImpl::new(market_data_alpaca, Environment::Paper);

    if let Some(tls) = tls_config {
        tracing::info!(
            %addr,
            client_auth = tls.client_auth_required,
            "Starting gRPC server with TLS"
        );

        let server_tls_config = tls.build_server_config().map_err(|e| {
            tracing::error!(error = %e, "Failed to build TLS config");
            e
        })?;

        tonic::transport::Server::builder()
            .tls_config(server_tls_config)?
            .add_service(ExecutionServiceServer::new(execution_service))
            .add_service(MarketDataServiceServer::new(market_data_service))
            .serve(addr)
            .await?;
    } else {
        tracing::info!(%addr, "Starting gRPC server (no TLS)");

        tonic::transport::Server::builder()
            .add_service(ExecutionServiceServer::new(execution_service))
            .add_service(MarketDataServiceServer::new(market_data_service))
            .serve(addr)
            .await?;
    }

    Ok(())
}

/// Build the gRPC services for testing or custom server setup.
///
/// # Errors
///
/// Returns an error if the execution service fails to initialize.
pub fn build_grpc_services() -> Result<
    (
        ExecutionServiceServer<ExecutionServiceImpl>,
        MarketDataServiceServer<MarketDataServiceImpl>,
    ),
    crate::execution::AlpacaError,
> {
    let execution_service = ExecutionServiceImpl::with_defaults()?;

    // Create adapter for market data service
    let market_data_alpaca = crate::execution::AlpacaAdapter::new(
        std::env::var("ALPACA_KEY").unwrap_or_else(|_| "paper-key".to_string()),
        std::env::var("ALPACA_SECRET").unwrap_or_else(|_| "paper-secret".to_string()),
        Environment::Paper,
    )?;
    let market_data_service = MarketDataServiceImpl::new(market_data_alpaca, Environment::Paper);

    Ok((
        ExecutionServiceServer::new(execution_service),
        MarketDataServiceServer::new(market_data_service),
    ))
}

/// Build gRPC services with an Alpaca feed controller for streaming.
///
/// # Arguments
///
/// * `feed_controller` - Alpaca feed controller for real-time market data
/// * `shutdown_tx` - Shutdown broadcast sender for feed lifecycle
///
/// # Errors
///
/// Returns an error if the execution service fails to initialize.
pub fn build_grpc_services_with_feed(
    feed_controller: Arc<crate::feed::AlpacaController>,
    shutdown_tx: tokio::sync::broadcast::Sender<()>,
) -> Result<
    (
        ExecutionServiceServer<ExecutionServiceImpl>,
        MarketDataServiceServer<MarketDataServiceImpl>,
    ),
    crate::execution::AlpacaError,
> {
    let execution_service = ExecutionServiceImpl::with_defaults()?;

    // Create adapter for market data service
    let market_data_alpaca = crate::execution::AlpacaAdapter::new(
        std::env::var("ALPACA_KEY").unwrap_or_else(|_| "paper-key".to_string()),
        std::env::var("ALPACA_SECRET").unwrap_or_else(|_| "paper-secret".to_string()),
        Environment::Paper,
    )?;
    let market_data_service = MarketDataServiceImpl::with_feed_controller(
        market_data_alpaca,
        Environment::Paper,
        feed_controller,
        shutdown_tx,
    );

    Ok((
        ExecutionServiceServer::new(execution_service),
        MarketDataServiceServer::new(market_data_service),
    ))
}
