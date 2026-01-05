//! Execution Engine Binary
//!
//! Starts the HTTP/JSON API server for the execution engine.
//!
//! # Usage
//!
//! ```bash
//! cargo run --bin execution-engine
//! ```
//!
//! # Environment Variables
//!
//! - `CREAM_ENV`: BACKTEST | PAPER | LIVE (default: PAPER)
//! - `PORT`: Port for HTTP server (default: 50051)
//! - `ALPACA_KEY`: Broker API key
//! - `ALPACA_SECRET`: Broker API secret
//! - `RUST_LOG`: Log level (default: info)
//!
//! # Endpoints
//!
//! - `GET /health` - Health check
//! - `POST /v1/check-constraints` - Validate decision plan constraints
//! - `POST /v1/submit-orders` - Submit orders from decision plan
//! - `POST /v1/order-state` - Get current order states
//!
//! # Note
//!
//! This uses HTTP/JSON API. Once bead cream-z5e (Buf configuration) is complete,
//! the server will support proper gRPC via generated protobuf code.

use std::env;
use std::net::SocketAddr;

use execution_engine::{
    server::create_router, AlpacaAdapter, ConstraintValidator, Environment, ExecutionGateway,
    ExecutionServer, OrderStateManager,
};
use tokio::net::TcpListener;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

/// Default HTTP port.
const DEFAULT_PORT: u16 = 50051;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "execution_engine=info,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting Cream Execution Engine");

    // Parse environment
    let cream_env = env::var("CREAM_ENV")
        .unwrap_or_else(|_| "PAPER".to_string())
        .parse::<Environment>()
        .map_err(|e| format!("Invalid CREAM_ENV: {e}"))?;

    tracing::info!(environment = %cream_env, "Environment configured");

    // Parse port
    let port: u16 = env::var("PORT")
        .unwrap_or_else(|_| DEFAULT_PORT.to_string())
        .parse()
        .map_err(|e| format!("Invalid PORT: {e}"))?;

    // Get Alpaca credentials
    let alpaca_key = env::var("ALPACA_KEY").unwrap_or_default();
    let alpaca_secret = env::var("ALPACA_SECRET").unwrap_or_default();

    // Create Alpaca adapter
    let alpaca = if alpaca_key.is_empty() || alpaca_secret.is_empty() {
        tracing::warn!("Alpaca credentials not set - using mock adapter");
        AlpacaAdapter::new("mock-key".to_string(), "mock-secret".to_string(), cream_env)?
    } else {
        AlpacaAdapter::new(alpaca_key, alpaca_secret, cream_env)?
    };

    // Create components
    let state_manager = OrderStateManager::new();
    let validator = ConstraintValidator::with_defaults();
    let gateway = ExecutionGateway::new(alpaca, state_manager, validator);
    let execution_server = ExecutionServer::new(gateway);

    // Create router
    let app = create_router(execution_server);

    // Build address
    let addr: SocketAddr = format!("0.0.0.0:{port}").parse()?;

    tracing::info!(%addr, "HTTP server starting");
    tracing::info!("Endpoints:");
    tracing::info!("  GET  /health");
    tracing::info!("  POST /v1/check-constraints");
    tracing::info!("  POST /v1/submit-orders");
    tracing::info!("  POST /v1/order-state");

    // Start server
    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
