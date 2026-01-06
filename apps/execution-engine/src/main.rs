//! Execution Engine Binary
//!
//! Starts the Cream execution engine with proper service initialization,
//! observability, and graceful shutdown.
//!
//! # Usage
//!
//! ```bash
//! cargo run --bin execution-engine
//! cargo run --bin execution-engine -- --config /path/to/config.yaml
//! ```
//!
//! # Environment Variables
//!
//! - `CREAM_ENV`: BACKTEST | PAPER | LIVE (default: PAPER)
//! - `ALPACA_KEY`: Broker API key
//! - `ALPACA_SECRET`: Broker API secret
//! - `DATABENTO_KEY`: Market data API key
//! - `RUST_LOG`: Log level (default: info)
//!
//! # Endpoints
//!
//! - HTTP (default 50051):
//!   - `GET /health` - Health check
//!   - `POST /v1/check-constraints` - Validate decision plan constraints
//!   - `POST /v1/submit-orders` - Submit orders from decision plan
//!   - `POST /v1/order-state` - Get current order states

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use execution_engine::{
    AlpacaAdapter, ConstraintValidator, Environment, ExecutionGateway, ExecutionServer,
    OrderStateManager,
    config::{Config, load_config},
    observability::{MetricsConfig, TracingConfig, init_metrics, init_tracing},
    server::create_router,
};
use tokio::net::TcpListener;
use tokio::signal;
use tokio::sync::broadcast;

/// Graceful shutdown timeout.
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(30);

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Parse command line arguments
    let args: Vec<String> = std::env::args().collect();
    let config_path = parse_config_path(&args);

    // Load configuration
    let config = match load_config(config_path) {
        Ok(cfg) => Arc::new(cfg),
        Err(e) => {
            eprintln!("Failed to load configuration: {e}");
            eprintln!("Hint: Ensure config.yaml exists or use --config <path>");
            std::process::exit(1);
        }
    };

    // Initialize tracing first (so we can log everything else)
    let tracing_config = TracingConfig::default().service_name("execution-engine");
    let _tracing_guard = match init_tracing(&tracing_config) {
        Ok(guard) => guard,
        Err(e) => {
            eprintln!("Failed to initialize tracing: {e}");
            std::process::exit(1);
        }
    };

    tracing::info!("Starting Cream Execution Engine");
    tracing::info!(
        environment = %config.environment.mode,
        grpc_port = config.server.grpc_port,
        flight_port = config.server.flight_port,
        "Configuration loaded"
    );

    // Initialize metrics
    let metrics_config = MetricsConfig::default();
    if let Err(e) = init_metrics(&metrics_config) {
        tracing::warn!("Failed to initialize metrics: {e}");
        // Non-fatal - continue without metrics
    } else {
        tracing::info!(endpoint = %metrics_config.listen_addr, "Metrics endpoint initialized");
    }

    // Create shutdown channel
    let (shutdown_tx, _) = broadcast::channel::<()>(1);

    // Parse environment from config
    let cream_env = config
        .environment
        .mode
        .parse::<Environment>()
        .map_err(|e| format!("Invalid environment mode: {e}"))?;

    // Create Alpaca adapter
    let alpaca = create_alpaca_adapter(&config, cream_env)?;

    // Create execution components
    let state_manager = OrderStateManager::new();
    let validator = ConstraintValidator::from_config(&config);
    let gateway = ExecutionGateway::new(alpaca, state_manager, validator);
    let execution_server = ExecutionServer::new(gateway);

    // Create HTTP router
    let app = create_router(execution_server);

    // Build server address
    let addr: SocketAddr =
        format!("{}:{}", config.server.bind_address, config.server.grpc_port).parse()?;

    tracing::info!(%addr, "HTTP server starting");
    tracing::info!("Endpoints:");
    tracing::info!("  GET  /health");
    tracing::info!("  POST /v1/check-constraints");
    tracing::info!("  POST /v1/submit-orders");
    tracing::info!("  POST /v1/order-state");

    // Start server with graceful shutdown
    let listener = TcpListener::bind(addr).await?;
    let server =
        axum::serve(listener, app).with_graceful_shutdown(shutdown_signal(shutdown_tx.clone()));

    // Spawn server task
    let server_handle = tokio::spawn(async move {
        if let Err(e) = server.await {
            tracing::error!("Server error: {e}");
        }
    });

    tracing::info!("Execution engine ready");

    // Wait for server to complete
    let _ = server_handle.await;

    tracing::info!("Execution engine stopped");
    Ok(())
}

/// Parse config path from command line arguments.
fn parse_config_path(args: &[String]) -> Option<&str> {
    for (i, arg) in args.iter().enumerate() {
        if (arg == "--config" || arg == "-c") && i + 1 < args.len() {
            return Some(&args[i + 1]);
        }
    }
    None
}

/// Create Alpaca adapter from configuration.
fn create_alpaca_adapter(
    config: &Config,
    env: Environment,
) -> Result<AlpacaAdapter, Box<dyn std::error::Error>> {
    let api_key = &config.brokers.alpaca.api_key;
    let api_secret = &config.brokers.alpaca.api_secret;

    if api_key.is_empty() || api_secret.is_empty() {
        tracing::warn!("Alpaca credentials not configured - using mock adapter");
        Ok(AlpacaAdapter::new(
            "mock-key".to_string(),
            "mock-secret".to_string(),
            env,
        )?)
    } else {
        tracing::info!("Alpaca adapter initialized");
        Ok(AlpacaAdapter::new(
            api_key.clone(),
            api_secret.clone(),
            env,
        )?)
    }
}

/// Wait for shutdown signal (SIGTERM or SIGINT).
async fn shutdown_signal(shutdown_tx: broadcast::Sender<()>) {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("Failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("Failed to install SIGTERM handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {
            tracing::info!("Received Ctrl+C, initiating shutdown");
        }
        _ = terminate => {
            tracing::info!("Received SIGTERM, initiating shutdown");
        }
    }

    // Notify all listeners about shutdown
    let _ = shutdown_tx.send(());

    tracing::info!(
        timeout_secs = SHUTDOWN_TIMEOUT.as_secs(),
        "Graceful shutdown started"
    );
}
