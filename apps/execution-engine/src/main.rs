//! Execution Engine Binary
//!
//! Starts the Cream execution engine.
//!
//! # Usage
//!
//! ```bash
//! cargo run --bin execution-engine
//! ```
//!
//! # Environment Variables
//!
//! ## Required
//! - `ALPACA_KEY`: Broker API key
//! - `ALPACA_SECRET`: Broker API secret
//!
//! ## Optional
//! - `CREAM_ENV`: PAPER | LIVE (default: PAPER)
//! - `HTTP_PORT`: HTTP server port (default: 50051)
//! - `GRPC_PORT`: gRPC server port (default: 50053)
//! - `POSITION_MONITOR_ENABLED`: Enable position monitoring (default: true)
//! - `STREAM_PROXY_ENDPOINT`: Stream proxy gRPC endpoint (default: <http://localhost:50052>)
//! - `RUST_LOG`: Log level (default: info)

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use execution_engine::application::ports::{InMemoryRiskRepository, NoOpEventPublisher};
use execution_engine::application::services::{PositionMonitorConfig, PositionMonitorService};
use execution_engine::application::use_cases::{
    CancelOrdersUseCase, SubmitOrdersUseCase, ValidateRiskUseCase,
};
use execution_engine::infrastructure::broker::alpaca::{
    AlpacaBrokerAdapter, AlpacaConfig, AlpacaEnvironment,
};
use execution_engine::infrastructure::grpc::{
    create_execution_service, create_market_data_service,
};
use execution_engine::infrastructure::http::{AppState, create_router};
use execution_engine::infrastructure::marketdata::AlpacaMarketDataAdapter;
use execution_engine::infrastructure::persistence::InMemoryOrderRepository;
use execution_engine::infrastructure::price_feed::AlpacaPriceFeedAdapter;
use execution_engine::infrastructure::stream_proxy::{ProxyQuoteManager, ProxyQuoteManagerConfig};
use tokio::net::TcpListener;
use tokio::signal;
use tokio::sync::broadcast;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

/// Graceful shutdown timeout.
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(30);

/// Default HTTP server port.
const DEFAULT_HTTP_PORT: u16 = 50051;

/// Default gRPC server port.
const DEFAULT_GRPC_PORT: u16 = 50053;

/// Parsed configuration from environment variables.
struct EngineConfig {
    environment: AlpacaEnvironment,
    http_port: u16,
    grpc_port: u16,
    api_key: String,
    api_secret: String,
    position_monitor_enabled: bool,
    stream_proxy_endpoint: String,
}

impl EngineConfig {
    const fn environment_name(&self) -> &'static str {
        if self.environment.is_live() {
            "LIVE"
        } else {
            "PAPER"
        }
    }
}

/// Concrete type alias for the submit orders use case.
type ConcreteSubmitOrdersUseCase = SubmitOrdersUseCase<
    AlpacaBrokerAdapter,
    InMemoryRiskRepository,
    InMemoryOrderRepository,
    NoOpEventPublisher,
>;

/// Concrete type alias for the validate risk use case.
type ConcreteValidateRiskUseCase =
    ValidateRiskUseCase<InMemoryRiskRepository, InMemoryOrderRepository>;

/// Concrete type alias for the cancel orders use case.
type ConcreteCancelOrdersUseCase =
    CancelOrdersUseCase<AlpacaBrokerAdapter, InMemoryOrderRepository, NoOpEventPublisher>;

/// Application use cases wired together for dependency injection.
struct UseCases {
    submit_orders: Arc<ConcreteSubmitOrdersUseCase>,
    validate_risk: Arc<ConcreteValidateRiskUseCase>,
    cancel_orders: Arc<ConcreteCancelOrdersUseCase>,
    order_repo: Arc<InMemoryOrderRepository>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Install rustls crypto provider before any TLS operations
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    load_dotenv();
    init_tracing();

    tracing::info!("Starting Cream Execution Engine");

    let config = parse_config()?;
    log_config(&config);

    let broker = create_broker(&config)?;
    let market_data = create_market_data(&config)?;
    let price_feed = create_price_feed(&config)?;
    let use_cases = create_use_cases(&broker);
    let (shutdown_tx, _) = broadcast::channel::<()>(1);

    // Create cancellation token for graceful shutdown coordination
    let shutdown_token = CancellationToken::new();

    // Create quote provider for real-time quotes (connects to stream-proxy)
    let quote_provider = create_quote_provider(&config, shutdown_token.clone()).await?;

    // Create and start position monitor
    let position_monitor = create_position_monitor(
        &config,
        Arc::clone(&broker),
        Arc::clone(&price_feed),
        Arc::clone(&quote_provider),
        shutdown_token.clone(),
    );

    // Start quote streams and position monitor
    if config.position_monitor_enabled {
        tracing::info!(
            endpoint = %config.stream_proxy_endpoint,
            "Starting quote streams via stream proxy"
        );

        // Start quote streams
        quote_provider.start_stock_stream();
        quote_provider.start_options_stream();

        // Start position monitor service
        if let Err(e) = position_monitor.start().await {
            tracing::warn!(error = %e, "Failed to start position monitor, continuing without it");
        } else {
            tracing::info!("Position monitor service started");
        }
    }

    let http_handle = start_http_server(&config, &use_cases, shutdown_tx.clone()).await?;
    let grpc_handle = start_grpc_server(
        &config,
        &use_cases,
        Arc::clone(&broker),
        Arc::clone(&market_data),
        shutdown_tx.clone(),
    );

    tracing::info!("Execution engine ready");

    await_shutdown(http_handle, grpc_handle, shutdown_token).await;

    tracing::info!("Execution engine stopped");
    Ok(())
}

/// Load .env file from current or ancestor directories.
fn load_dotenv() {
    if dotenvy::dotenv().is_err() {
        load_dotenv_from_ancestors();
    }
}

/// Initialize the tracing subscriber with environment filter.
///
/// Uses static directive strings that are compile-time constants guaranteed to parse.
#[allow(clippy::expect_used)]
fn init_tracing() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(
                    "execution_engine=info"
                        .parse()
                        .expect("static directive 'execution_engine=info' is valid"),
                )
                .add_directive(
                    "tower_http=info"
                        .parse()
                        .expect("static directive 'tower_http=info' is valid"),
                ),
        )
        .init();
}

/// Parse configuration from environment variables.
fn parse_config() -> Result<EngineConfig, Box<dyn std::error::Error>> {
    let env = std::env::var("CREAM_ENV")
        .unwrap_or_else(|_| "PAPER".to_string())
        .to_uppercase();
    let environment = match env.as_str() {
        "LIVE" => AlpacaEnvironment::Live,
        _ => AlpacaEnvironment::Paper,
    };

    let api_key = std::env::var("ALPACA_KEY").unwrap_or_default();
    let api_secret = std::env::var("ALPACA_SECRET").unwrap_or_default();

    if api_key.is_empty() || api_secret.is_empty() {
        return Err("ALPACA_KEY and ALPACA_SECRET environment variables are required".into());
    }

    let http_port: u16 = std::env::var("HTTP_PORT")
        .unwrap_or_else(|_| DEFAULT_HTTP_PORT.to_string())
        .parse()
        .unwrap_or(DEFAULT_HTTP_PORT);

    let grpc_port: u16 = std::env::var("GRPC_PORT")
        .unwrap_or_else(|_| DEFAULT_GRPC_PORT.to_string())
        .parse()
        .unwrap_or(DEFAULT_GRPC_PORT);

    let position_monitor_enabled = std::env::var("POSITION_MONITOR_ENABLED")
        .map(|v| v.to_lowercase() != "false" && v != "0")
        .unwrap_or(true);

    let stream_proxy_endpoint = std::env::var("STREAM_PROXY_ENDPOINT")
        .unwrap_or_else(|_| "http://localhost:50052".to_string());

    Ok(EngineConfig {
        environment,
        http_port,
        grpc_port,
        api_key,
        api_secret,
        position_monitor_enabled,
        stream_proxy_endpoint,
    })
}

/// Log the parsed configuration.
fn log_config(config: &EngineConfig) {
    tracing::info!(
        environment = config.environment_name(),
        http_port = config.http_port,
        grpc_port = config.grpc_port,
        position_monitor_enabled = config.position_monitor_enabled,
        "Configuration loaded"
    );
}

/// Create the Alpaca broker adapter.
fn create_broker(
    config: &EngineConfig,
) -> Result<Arc<AlpacaBrokerAdapter>, Box<dyn std::error::Error>> {
    let alpaca_config = AlpacaConfig::new(
        config.api_key.clone(),
        config.api_secret.clone(),
        config.environment,
    );

    let broker = AlpacaBrokerAdapter::new(&alpaca_config)?;

    tracing::info!(
        environment = config.environment_name(),
        "AlpacaBrokerAdapter initialized for {} trading",
        config.environment_name()
    );

    Ok(Arc::new(broker))
}

/// Create the Alpaca market data adapter.
fn create_market_data(
    config: &EngineConfig,
) -> Result<Arc<AlpacaMarketDataAdapter>, Box<dyn std::error::Error>> {
    let alpaca_config = AlpacaConfig::new(
        config.api_key.clone(),
        config.api_secret.clone(),
        config.environment,
    );

    let market_data = AlpacaMarketDataAdapter::new(&alpaca_config)?;

    tracing::info!(
        environment = config.environment_name(),
        "AlpacaMarketDataAdapter initialized for {} trading",
        config.environment_name()
    );

    Ok(Arc::new(market_data))
}

/// Create the Alpaca price feed adapter for REST fallback.
fn create_price_feed(
    config: &EngineConfig,
) -> Result<Arc<AlpacaPriceFeedAdapter>, Box<dyn std::error::Error>> {
    let alpaca_config = AlpacaConfig::new(
        config.api_key.clone(),
        config.api_secret.clone(),
        config.environment,
    );

    let price_feed = AlpacaPriceFeedAdapter::new(&alpaca_config)?;

    tracing::info!(
        environment = config.environment_name(),
        "AlpacaPriceFeedAdapter initialized for REST fallback"
    );

    Ok(Arc::new(price_feed))
}

/// Create the quote provider for real-time quotes (connects to stream-proxy).
async fn create_quote_provider(
    config: &EngineConfig,
    shutdown: CancellationToken,
) -> Result<Arc<ProxyQuoteManager>, Box<dyn std::error::Error>> {
    let proxy_config = ProxyQuoteManagerConfig {
        endpoint: config.stream_proxy_endpoint.clone(),
        enabled: config.position_monitor_enabled,
    };

    let mut manager = ProxyQuoteManager::new(proxy_config, shutdown);

    // Connect to the stream proxy
    if config.position_monitor_enabled
        && let Err(e) = manager.connect().await
    {
        tracing::warn!(
            error = %e,
            endpoint = %config.stream_proxy_endpoint,
            "Failed to connect to stream proxy, position monitoring may use REST fallback"
        );
    }

    Ok(Arc::new(manager))
}

/// Create the position monitor service.
fn create_position_monitor(
    config: &EngineConfig,
    broker: Arc<AlpacaBrokerAdapter>,
    price_feed: Arc<AlpacaPriceFeedAdapter>,
    quote_provider: Arc<ProxyQuoteManager>,
    shutdown: CancellationToken,
) -> PositionMonitorService<AlpacaBrokerAdapter, AlpacaPriceFeedAdapter, ProxyQuoteManager> {
    let monitor_config = PositionMonitorConfig {
        enabled: config.position_monitor_enabled,
        ..PositionMonitorConfig::default()
    };

    PositionMonitorService::with_config(
        monitor_config,
        broker,
        price_feed,
        quote_provider,
        shutdown,
    )
}

/// Create all application use cases with their dependencies.
fn create_use_cases(broker: &Arc<AlpacaBrokerAdapter>) -> UseCases {
    let risk_repo = Arc::new(InMemoryRiskRepository::new());
    let order_repo = Arc::new(InMemoryOrderRepository::new());
    let event_publisher = Arc::new(NoOpEventPublisher);

    let submit_orders = Arc::new(SubmitOrdersUseCase::new(
        Arc::clone(broker),
        Arc::clone(&risk_repo),
        Arc::clone(&order_repo),
        Arc::clone(&event_publisher),
    ));

    let validate_risk = Arc::new(ValidateRiskUseCase::new(
        Arc::clone(&risk_repo),
        Arc::clone(&order_repo),
    ));

    let cancel_orders = Arc::new(CancelOrdersUseCase::new(
        Arc::clone(broker),
        Arc::clone(&order_repo),
        Arc::clone(&event_publisher),
    ));

    UseCases {
        submit_orders,
        validate_risk,
        cancel_orders,
        order_repo,
    }
}

/// Start the HTTP server with graceful shutdown support.
async fn start_http_server(
    config: &EngineConfig,
    use_cases: &UseCases,
    shutdown_tx: broadcast::Sender<()>,
) -> Result<JoinHandle<()>, Box<dyn std::error::Error>> {
    let http_state = AppState {
        submit_orders: Arc::clone(&use_cases.submit_orders),
        validate_risk: Arc::clone(&use_cases.validate_risk),
        cancel_orders: Arc::clone(&use_cases.cancel_orders),
        order_repo: Arc::clone(&use_cases.order_repo),
        version: env!("CARGO_PKG_VERSION").to_string(),
    };
    let app = create_router(http_state);

    let http_addr: SocketAddr = format!("0.0.0.0:{}", config.http_port).parse()?;

    tracing::info!(%http_addr, "HTTP server starting");
    tracing::info!("Endpoints:");
    tracing::info!("  GET  /health");
    tracing::info!("  POST /api/v1/check-constraints");
    tracing::info!("  POST /api/v1/submit-orders");
    tracing::info!("  POST /api/v1/orders");
    tracing::info!("  POST /api/v1/cancel-orders");

    let listener = TcpListener::bind(http_addr).await?;
    let http_server =
        axum::serve(listener, app).with_graceful_shutdown(shutdown_signal(shutdown_tx));

    let handle = tokio::spawn(async move {
        if let Err(e) = http_server.await {
            tracing::error!("HTTP server error: {e}");
        }
    });

    Ok(handle)
}

/// Start the gRPC server with graceful shutdown support.
///
/// # Panics
///
/// Panics if the address format is invalid. The format `0.0.0.0:{port}` is a static
/// pattern with a validated port number, so this cannot fail in practice.
#[allow(clippy::expect_used)]
fn start_grpc_server(
    config: &EngineConfig,
    use_cases: &UseCases,
    broker: Arc<AlpacaBrokerAdapter>,
    market_data: Arc<AlpacaMarketDataAdapter>,
    shutdown_tx: broadcast::Sender<()>,
) -> JoinHandle<()> {
    let grpc_addr: SocketAddr = format!("0.0.0.0:{}", config.grpc_port)
        .parse()
        .expect("static address format '0.0.0.0:{port}' with u16 port is always valid");

    tracing::info!(%grpc_addr, "gRPC server starting");
    tracing::info!("gRPC services:");
    tracing::info!("  ExecutionService - CheckConstraints, SubmitOrder, GetOrderState, etc.");
    tracing::info!("  MarketDataService - GetSnapshot, GetOptionChain, SubscribeMarketData");

    let grpc_submit = Arc::clone(&use_cases.submit_orders);
    let grpc_validate = Arc::clone(&use_cases.validate_risk);
    let grpc_cancel = Arc::clone(&use_cases.cancel_orders);
    let grpc_order_repo = Arc::clone(&use_cases.order_repo);

    tokio::spawn(async move {
        let mut shutdown_rx = shutdown_tx.subscribe();

        let execution_service = create_execution_service(
            grpc_submit,
            grpc_validate,
            grpc_cancel,
            grpc_order_repo,
            broker,
        );

        let market_data_service = create_market_data_service(market_data);

        let server = tonic::transport::Server::builder()
            .add_service(execution_service)
            .add_service(market_data_service)
            .serve_with_shutdown(grpc_addr, async move {
                let _ = shutdown_rx.recv().await;
                tracing::info!("gRPC server shutting down");
            });

        if let Err(e) = server.await {
            tracing::error!("gRPC server error: {e}");
        }
    })
}

/// Wait for either server to stop.
async fn await_shutdown(
    http_handle: JoinHandle<()>,
    grpc_handle: JoinHandle<()>,
    shutdown_token: CancellationToken,
) {
    tokio::select! {
        _ = http_handle => {
            tracing::info!("HTTP server stopped");
        }
        _ = grpc_handle => {
            tracing::info!("gRPC server stopped");
        }
    }

    // Cancel WebSocket streams and position monitor
    shutdown_token.cancel();
    tracing::info!("Cancellation token triggered for background services");
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
///
/// # Panics
///
/// Panics if signal handlers cannot be installed. This is intentional because:
/// - Signal handlers are critical for graceful shutdown
/// - Failure to install handlers means the process cannot respond to termination signals
/// - It is better to fail fast during startup than to have an unresponsive process
#[allow(clippy::expect_used)]
async fn shutdown_signal(shutdown_tx: broadcast::Sender<()>) {
    let ctrl_c = async {
        signal::ctrl_c()
            .await
            .expect("signal handler installation is critical for graceful shutdown");
    };

    #[cfg(unix)]
    let terminate = async {
        signal::unix::signal(signal::unix::SignalKind::terminate())
            .expect("SIGTERM handler installation is critical for graceful shutdown")
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
