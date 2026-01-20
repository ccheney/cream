//! Execution Engine Binary
//!
//! Starts the Cream execution engine using Clean Architecture.
//!
//! # Usage
//!
//! ```bash
//! cargo run --bin execution-engine
//! ```
//!
//! # Environment Variables
//!
//! - `CREAM_ENV`: PAPER | LIVE (default: PAPER)
//! - `ALPACA_KEY`: Broker API key (required)
//! - `ALPACA_SECRET`: Broker API secret (required)
//! - `HTTP_PORT`: HTTP server port (default: 50051)
//! - `GRPC_PORT`: gRPC server port (default: 50052)
//! - `RUST_LOG`: Log level (default: info)

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use execution_engine::application::ports::{InMemoryRiskRepository, NoOpEventPublisher};
use execution_engine::application::use_cases::{
    CancelOrdersUseCase, SubmitOrdersUseCase, ValidateRiskUseCase,
};
use execution_engine::infrastructure::broker::alpaca::{
    AlpacaBrokerAdapter, AlpacaConfig, AlpacaEnvironment,
};
use execution_engine::infrastructure::grpc::create_execution_service;
use execution_engine::infrastructure::http::{AppState, create_router};
use execution_engine::infrastructure::persistence::InMemoryOrderRepository;
use execution_engine::infrastructure::price_feed::MockPriceFeed;
use tokio::net::TcpListener;
use tokio::signal;
use tokio::sync::broadcast;

/// Graceful shutdown timeout.
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(30);

#[tokio::main]
#[allow(clippy::too_many_lines)]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Load .env file
    if dotenvy::dotenv().is_err() {
        load_dotenv_from_ancestors();
    }

    // Initialize tracing
    // Static directive strings are guaranteed to parse successfully
    #[allow(clippy::unwrap_used)]
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("execution_engine=info".parse().unwrap())
                .add_directive("tower_http=info".parse().unwrap()),
        )
        .init();

    tracing::info!("Starting Cream Execution Engine (Clean Architecture)");

    // Parse environment
    let env = std::env::var("CREAM_ENV")
        .unwrap_or_else(|_| "PAPER".to_string())
        .to_uppercase();
    let environment = match env.as_str() {
        "LIVE" => AlpacaEnvironment::Live,
        _ => AlpacaEnvironment::Paper,
    };

    // Get credentials
    let api_key = std::env::var("ALPACA_KEY").unwrap_or_default();
    let api_secret = std::env::var("ALPACA_SECRET").unwrap_or_default();

    if api_key.is_empty() || api_secret.is_empty() {
        tracing::error!("ALPACA_KEY and ALPACA_SECRET environment variables are required");
        std::process::exit(1);
    }

    // Parse ports
    let http_port: u16 = std::env::var("HTTP_PORT")
        .unwrap_or_else(|_| "50051".to_string())
        .parse()
        .unwrap_or(50051);
    let grpc_port: u16 = std::env::var("GRPC_PORT")
        .unwrap_or_else(|_| "50052".to_string())
        .parse()
        .unwrap_or(50052);

    tracing::info!(
        environment = %env,
        http_port = http_port,
        grpc_port = grpc_port,
        "Configuration loaded"
    );

    // Create shutdown channel
    let (shutdown_tx, _) = broadcast::channel::<()>(1);

    // Create Alpaca broker adapter
    let alpaca_config = AlpacaConfig::new(api_key, api_secret, environment);
    let broker = match AlpacaBrokerAdapter::new(&alpaca_config) {
        Ok(adapter) => Arc::new(adapter),
        Err(e) => {
            tracing::error!("Failed to create Alpaca adapter: {e}");
            std::process::exit(1);
        }
    };

    tracing::info!(
        environment = %env,
        "AlpacaBrokerAdapter initialized for {} trading",
        if environment.is_live() { "LIVE" } else { "PAPER" }
    );

    // Create repositories and ports
    let risk_repo = Arc::new(InMemoryRiskRepository::new());
    let order_repo = Arc::new(InMemoryOrderRepository::new());
    let event_publisher = Arc::new(NoOpEventPublisher);
    let _price_feed = Arc::new(MockPriceFeed::new());

    // Create use cases
    let submit_orders = Arc::new(SubmitOrdersUseCase::new(
        Arc::clone(&broker),
        Arc::clone(&risk_repo),
        Arc::clone(&order_repo),
        Arc::clone(&event_publisher),
    ));

    let validate_risk = Arc::new(ValidateRiskUseCase::new(
        Arc::clone(&risk_repo),
        Arc::clone(&order_repo),
    ));

    let cancel_orders = Arc::new(CancelOrdersUseCase::new(
        Arc::clone(&broker),
        Arc::clone(&order_repo),
        Arc::clone(&event_publisher),
    ));

    // Create HTTP router
    let http_state = AppState {
        submit_orders: Arc::clone(&submit_orders),
        validate_risk: Arc::clone(&validate_risk),
        cancel_orders: Arc::clone(&cancel_orders),
        order_repo: Arc::clone(&order_repo),
        version: env!("CARGO_PKG_VERSION").to_string(),
    };
    let app = create_router(http_state);

    // Build HTTP server address
    let http_addr: SocketAddr = format!("0.0.0.0:{http_port}").parse()?;

    tracing::info!(%http_addr, "HTTP server starting");
    tracing::info!("Endpoints:");
    tracing::info!("  GET  /health");
    tracing::info!("  POST /api/v1/check-constraints");
    tracing::info!("  POST /api/v1/submit-orders");
    tracing::info!("  POST /api/v1/orders");
    tracing::info!("  POST /api/v1/cancel-orders");

    // Start HTTP server with graceful shutdown
    let listener = TcpListener::bind(http_addr).await?;
    let http_server =
        axum::serve(listener, app).with_graceful_shutdown(shutdown_signal(shutdown_tx.clone()));

    // Spawn HTTP server task
    let http_handle = tokio::spawn(async move {
        if let Err(e) = http_server.await {
            tracing::error!("HTTP server error: {e}");
        }
    });

    // Start gRPC server
    let grpc_addr: SocketAddr = format!("0.0.0.0:{grpc_port}").parse()?;

    tracing::info!(%grpc_addr, "gRPC server starting");
    tracing::info!("gRPC services:");
    tracing::info!("  ExecutionService - CheckConstraints, SubmitOrder, GetOrderState, etc.");

    let grpc_shutdown_tx = shutdown_tx.clone();
    let grpc_submit = Arc::clone(&submit_orders);
    let grpc_validate = Arc::clone(&validate_risk);
    let grpc_cancel = Arc::clone(&cancel_orders);
    let grpc_order_repo = Arc::clone(&order_repo);
    let grpc_broker = Arc::clone(&broker);

    let grpc_handle = tokio::spawn(async move {
        let mut shutdown_rx = grpc_shutdown_tx.subscribe();

        let execution_service = create_execution_service(
            grpc_submit,
            grpc_validate,
            grpc_cancel,
            grpc_order_repo,
            grpc_broker,
        );

        let server = tonic::transport::Server::builder()
            .add_service(execution_service)
            .serve_with_shutdown(grpc_addr, async move {
                let _ = shutdown_rx.recv().await;
                tracing::info!("gRPC server shutting down");
            });

        if let Err(e) = server.await {
            tracing::error!("gRPC server error: {e}");
        }
    });

    tracing::info!("Execution engine ready");

    // Wait for all servers to complete
    tokio::select! {
        _ = http_handle => {
            tracing::info!("HTTP server stopped");
        }
        _ = grpc_handle => {
            tracing::info!("gRPC server stopped");
        }
    }

    tracing::info!("Execution engine stopped");
    Ok(())
}

/// Load .env file from current directory or any ancestor directory.
fn load_dotenv_from_ancestors() {
    if dotenvy::dotenv().is_ok() {
        return;
    }

    if let Ok(cwd) = std::env::current_dir() {
        let mut dir = cwd.as_path();
        while let Some(parent) = dir.parent() {
            let env_path = parent.join(".env");
            if env_path.exists() {
                let _ = dotenvy::from_path(&env_path);
                return;
            }
            dir = parent;
        }
    }
}

/// Wait for shutdown signal (SIGTERM or SIGINT).
#[allow(clippy::expect_used)]
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
        () = ctrl_c => {
            tracing::info!("Received Ctrl+C, initiating shutdown");
        }
        () = terminate => {
            tracing::info!("Received SIGTERM, initiating shutdown");
        }
    }

    let _ = shutdown_tx.send(());

    tracing::info!(
        timeout_secs = SHUTDOWN_TIMEOUT.as_secs(),
        "Graceful shutdown started"
    );
}
