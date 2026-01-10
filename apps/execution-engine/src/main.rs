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
//! - `ALPACA_KEY`: Broker API key (required for PAPER/LIVE)
//! - `ALPACA_SECRET`: Broker API secret (required for PAPER/LIVE)
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
//!
//! # Environment-Based Adapter Selection
//!
//! - **BACKTEST**: Uses `BacktestAdapter` for deterministic order simulation
//! - **PAPER/LIVE**: Uses `AlpacaAdapter` with required credentials

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use execution_engine::{
    AlpacaAdapter, ConstraintValidator, Environment, ExecutionGateway, ExecutionServer,
    OrderStateManager, StatePersistence,
    config::{Config, load_config, validate_startup_environment},
    execution::{PortfolioRecovery, ReconciliationManager, fetch_broker_state},
    feed::FeedController,
    safety::ConnectionMonitor,
    server::{build_flight_server, build_grpc_services_with_feed, create_router},
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

    // Initialize tracing (console logging only)
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tracing::info!("Starting Cream Execution Engine");
    tracing::info!(
        environment = %config.environment.mode,
        http_port = config.server.http_port,
        grpc_port = config.server.grpc_port,
        flight_port = config.server.flight_port,
        "Configuration loaded"
    );

    // Create shutdown channel
    let (shutdown_tx, _) = broadcast::channel::<()>(1);

    // Parse environment from config
    let cream_env = config
        .environment
        .mode
        .parse::<Environment>()
        .map_err(|e| format!("Invalid environment mode: {e}"))?;

    // Validate environment configuration at startup
    match validate_startup_environment(&config, cream_env) {
        Ok(validation) => {
            for warning in &validation.warnings {
                tracing::warn!("{}", warning);
            }
        }
        Err(e) => {
            tracing::error!("{}", e);
            eprintln!("\nStartup failed: {e}");
            std::process::exit(1);
        }
    }

    // Create execution components based on environment
    let state_manager = OrderStateManager::new();
    let validator = ConstraintValidator::from_config(&config);

    // Create the appropriate broker adapter and execution server
    let components = create_execution_server(&config, cream_env, state_manager, validator).await?;

    // Spawn reconciliation background task if enabled
    let shutdown_rx = shutdown_tx.subscribe();
    if let (Some(adapter), Some(state_manager)) = (
        &components.adapter_for_reconciliation,
        &components.state_manager_for_reconciliation,
    ) {
        let recon_config = config.reconciliation.to_reconciliation_config();
        let recon_manager =
            ReconciliationManager::new(recon_config.clone(), Arc::clone(state_manager));
        let interval_secs = config.reconciliation.interval_secs;
        let adapter_clone = Arc::clone(adapter);

        tracing::info!(
            interval_secs = interval_secs,
            "Starting periodic reconciliation background task"
        );

        tokio::spawn(async move {
            reconciliation_loop(adapter_clone, recon_manager, interval_secs, shutdown_rx).await;
        });
    }

    // Spawn connection monitor for mass cancel on disconnect if enabled
    let safety_enabled = config.safety.is_enabled_for_env(&cream_env);
    if safety_enabled {
        if let (Some(adapter), Some(state_manager)) = (
            &components.adapter_for_reconciliation,
            &components.state_manager_for_reconciliation,
        ) {
            let mass_cancel_config = config.safety.to_mass_cancel_config();
            let monitor = ConnectionMonitor::new(
                Arc::clone(adapter),
                mass_cancel_config,
                Arc::clone(state_manager),
            );
            let shutdown_rx = shutdown_tx.subscribe();

            tracing::info!(
                grace_period_secs = config.safety.grace_period_seconds,
                heartbeat_interval_ms = config.safety.heartbeat_interval_ms,
                "Starting connection monitor for mass cancel on disconnect"
            );

            tokio::spawn(async move {
                monitor.run(shutdown_rx).await;
            });
        } else {
            tracing::info!(
                "Connection monitor disabled (adapter/state_manager not available in this mode)"
            );
        }
    } else {
        tracing::info!(
            environment = %cream_env,
            "Connection monitor disabled for this environment"
        );
    }

    // Create Databento feed controller (feed starts when SubscribeMarketData is called)
    let feed_controller = create_feed_controller(&config, cream_env);

    // Create HTTP router
    let app = create_router(components.execution_server);

    // Build HTTP server address
    let http_addr: SocketAddr =
        format!("{}:{}", config.server.bind_address, config.server.http_port).parse()?;

    tracing::info!(%http_addr, "HTTP server starting");
    tracing::info!("Endpoints:");
    tracing::info!("  GET  /health");
    tracing::info!("  POST /v1/check-constraints");
    tracing::info!("  POST /v1/submit-orders");
    tracing::info!("  POST /v1/order-state");

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

    // Start gRPC server for MarketDataService and ExecutionService
    let grpc_addr: SocketAddr =
        format!("{}:{}", config.server.bind_address, config.server.grpc_port).parse()?;

    tracing::info!(%grpc_addr, "gRPC server starting");
    tracing::info!("gRPC services:");
    tracing::info!("  MarketDataService - GetSnapshot, GetOptionChain, SubscribeMarketData");
    tracing::info!("  ExecutionService - CheckConstraints, SubmitOrder, GetOrderState, etc.");

    let grpc_shutdown_tx = shutdown_tx.clone();
    let feed_controller_for_grpc = feed_controller.clone();
    let grpc_handle = tokio::spawn(async move {
        let mut shutdown_rx = grpc_shutdown_tx.subscribe();

        // Build gRPC services with feed controller if available
        let (execution_service, market_data_service) = match feed_controller_for_grpc {
            Some(controller) => {
                match build_grpc_services_with_feed(controller, grpc_shutdown_tx.clone()) {
                    Ok(services) => services,
                    Err(e) => {
                        tracing::error!("Failed to build gRPC services: {e}");
                        return;
                    }
                }
            }
            None => match execution_engine::server::grpc::build_grpc_services() {
                Ok(services) => services,
                Err(e) => {
                    tracing::error!("Failed to build gRPC services: {e}");
                    return;
                }
            },
        };

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
    });

    // Start Arrow Flight server for high-performance data transport
    let flight_addr: SocketAddr = format!(
        "{}:{}",
        config.server.bind_address, config.server.flight_port
    )
    .parse()?;
    let flight_service = build_flight_server();

    tracing::info!(%flight_addr, "Arrow Flight server starting");
    tracing::info!("Flight endpoints:");
    tracing::info!("  DoGet market_data - Get market data snapshots");
    tracing::info!("  DoPut market_data - Ingest market data");
    tracing::info!("  DoAction clear_cache/health_check/get_cache_stats");

    let flight_shutdown_tx = shutdown_tx.clone();
    let flight_handle = tokio::spawn(async move {
        let mut shutdown_rx = flight_shutdown_tx.subscribe();
        let server = tonic::transport::Server::builder()
            .add_service(flight_service)
            .serve_with_shutdown(flight_addr, async move {
                let _ = shutdown_rx.recv().await;
                tracing::info!("Arrow Flight server shutting down");
            });

        if let Err(e) = server.await {
            tracing::error!("Arrow Flight server error: {e}");
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
        _ = flight_handle => {
            tracing::info!("Arrow Flight server stopped");
        }
    }

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

/// Components created during server initialization that may be needed for background tasks.
struct ServerComponents {
    execution_server: ExecutionServer,
    /// Adapter for reconciliation (None in BACKTEST mode)
    adapter_for_reconciliation: Option<Arc<AlpacaAdapter>>,
    /// State manager for reconciliation (None in BACKTEST mode)
    state_manager_for_reconciliation: Option<Arc<OrderStateManager>>,
}

/// Create execution server with the appropriate broker adapter based on environment.
///
/// - BACKTEST: Uses `AlpacaAdapter` with mock credentials (no real API calls made)
/// - PAPER/LIVE: Uses `AlpacaAdapter` with validated credentials
///
/// Returns the execution server and optional components needed for background tasks.
async fn create_execution_server(
    config: &Config,
    env: Environment,
    state_manager: OrderStateManager,
    validator: ConstraintValidator,
) -> Result<ServerComponents, Box<dyn std::error::Error>> {
    let (api_key, api_secret) = if env == Environment::Backtest {
        // In BACKTEST mode, use placeholder credentials since no real API calls are made
        tracing::info!("Using AlpacaAdapter with mock credentials for BACKTEST mode");
        ("backtest-key".to_string(), "backtest-secret".to_string())
    } else {
        let key = config.brokers.alpaca.api_key.clone();
        let secret = config.brokers.alpaca.api_secret.clone();

        // Credentials already validated by validate_startup_environment
        // but we double-check here for safety
        if key.is_empty() || secret.is_empty() {
            return Err(format!(
                "Alpaca credentials required for {env} mode. \
                 Set ALPACA_KEY and ALPACA_SECRET environment variables."
            )
            .into());
        }

        tracing::info!(
            environment = %env,
            "AlpacaAdapter initialized for {} trading",
            if env.is_live() { "LIVE" } else { "PAPER" }
        );

        (key, secret)
    };

    // Get circuit breaker config for Alpaca
    let circuit_config = config.circuit_breaker.alpaca_config();
    tracing::info!(
        failure_threshold = %circuit_config.failure_rate_threshold,
        wait_duration_secs = circuit_config.wait_duration_in_open.as_secs(),
        "Circuit breaker configured for Alpaca"
    );

    let adapter = AlpacaAdapter::new(api_key, api_secret, env)?;

    // Initialize persistence if enabled for this environment
    let persistence_enabled = config.persistence.is_enabled_for_env(&env);
    let recovery_enabled = config.recovery.is_enabled_for_env(&env);
    let reconciliation_enabled = config.reconciliation.is_enabled_for_env(&env);

    if persistence_enabled {
        let persistence =
            StatePersistence::new_local(&config.persistence.db_path, &env.to_string())
                .await
                .map_err(|e| format!("Failed to initialize persistence: {e}"))?;

        tracing::info!(
            db_path = %config.persistence.db_path,
            snapshot_interval_secs = config.persistence.snapshot_interval_secs,
            "State persistence initialized"
        );

        let persistence_arc = Arc::new(persistence);
        let state_manager_arc = Arc::new(state_manager);
        let adapter_arc = Arc::new(adapter);

        // Run crash recovery before accepting requests
        if recovery_enabled {
            tracing::info!("Starting crash recovery...");

            let recovery_config = config.recovery.to_recovery_config();
            let recovery = PortfolioRecovery::new(
                recovery_config,
                Arc::clone(&persistence_arc),
                Arc::clone(&state_manager_arc),
            );

            match recovery.recover(&adapter_arc).await {
                Ok(result) => {
                    tracing::info!(
                        orders_loaded = result.orders_loaded,
                        positions_loaded = result.positions_loaded,
                        orphans_resolved = result.orphans_resolved,
                        positions_synced = result.positions_synced,
                        duration_ms = result.duration_ms,
                        "Crash recovery completed successfully"
                    );
                    for warning in &result.warnings {
                        tracing::warn!("Recovery warning: {}", warning);
                    }
                }
                Err(e) => {
                    tracing::error!("Crash recovery failed: {}", e);

                    // In LIVE mode, refuse to start without successful recovery
                    if env.is_live() {
                        return Err(format!(
                            "LIVE mode requires successful recovery. Recovery failed: {e}"
                        )
                        .into());
                    }

                    // In PAPER mode, warn but continue
                    tracing::warn!(
                        "Continuing without successful recovery in PAPER mode. \
                         Order states may be inconsistent."
                    );
                }
            }
        } else {
            tracing::info!(
                environment = %env,
                "Crash recovery disabled (BACKTEST mode or explicitly disabled)"
            );
        }

        // Use the Arc-based constructor since we need to keep references for reconciliation
        let gateway = ExecutionGateway::with_all_arcs(
            Arc::clone(&adapter_arc),
            "Alpaca",
            Arc::clone(&state_manager_arc),
            validator,
            circuit_config,
            Arc::clone(&persistence_arc),
        );

        // Return components needed for reconciliation if enabled
        let (adapter_for_recon, state_manager_for_recon) = if reconciliation_enabled {
            (Some(adapter_arc), Some(state_manager_arc))
        } else {
            (None, None)
        };

        Ok(ServerComponents {
            execution_server: ExecutionServer::new(gateway),
            adapter_for_reconciliation: adapter_for_recon,
            state_manager_for_reconciliation: state_manager_for_recon,
        })
    } else {
        tracing::info!(
            environment = %env,
            "State persistence disabled (BACKTEST mode or explicitly disabled)"
        );
        let gateway = ExecutionGateway::new(adapter, state_manager, validator, circuit_config);
        Ok(ServerComponents {
            execution_server: ExecutionServer::new(gateway),
            adapter_for_reconciliation: None,
            state_manager_for_reconciliation: None,
        })
    }
}

/// Background task that periodically reconciles local state with broker state.
async fn reconciliation_loop(
    adapter: Arc<AlpacaAdapter>,
    recon_manager: ReconciliationManager,
    interval_secs: u64,
    mut shutdown_rx: broadcast::Receiver<()>,
) {
    let mut interval = tokio::time::interval(Duration::from_secs(interval_secs));

    // Skip the first tick (immediate) to allow server to fully start
    interval.tick().await;

    loop {
        tokio::select! {
            _ = interval.tick() => {
                tracing::debug!("Starting periodic reconciliation");

                // Fetch broker state
                let broker_state = match fetch_broker_state(&adapter).await {
                    Ok(state) => state,
                    Err(e) => {
                        tracing::error!("Failed to fetch broker state for reconciliation: {}", e);
                        continue;
                    }
                };

                // Run reconciliation
                let report = recon_manager.reconcile(broker_state).await;

                if report.has_critical() {
                    tracing::error!(
                        discrepancy_count = report.discrepancies.len(),
                        orphan_count = report.orphaned_orders.len(),
                        "Reconciliation detected critical discrepancies"
                    );
                } else if !report.discrepancies.is_empty() || !report.orphaned_orders.is_empty() {
                    tracing::warn!(
                        discrepancy_count = report.discrepancies.len(),
                        orphan_count = report.orphaned_orders.len(),
                        duration_ms = report.duration_ms,
                        "Reconciliation completed with discrepancies"
                    );
                } else {
                    tracing::info!(
                        orders_compared = report.orders_compared,
                        positions_compared = report.positions_compared,
                        duration_ms = report.duration_ms,
                        "Reconciliation completed successfully"
                    );
                }
            }
            _ = shutdown_rx.recv() => {
                tracing::info!("Reconciliation loop shutting down");
                break;
            }
        }
    }
}

/// Create a `FeedController` for managing the Databento market data feed.
///
/// The controller manages the feed lifecycle dynamically - the feed is started
/// when TypeScript calls `SubscribeMarketData` with symbols from runtime config.
///
/// # Returns
///
/// The feed controller for use by gRPC services, or None in BACKTEST mode.
fn create_feed_controller(config: &Config, env: Environment) -> Option<Arc<FeedController>> {
    // Skip feed in BACKTEST mode
    if env == Environment::Backtest {
        tracing::info!("Databento feed disabled in BACKTEST mode");
        return None;
    }

    // Create feed controller with Databento config
    let controller = Arc::new(FeedController::new(config.feeds.databento.clone()));

    // Log status based on API key availability
    if config.feeds.databento.api_key.is_empty() {
        tracing::warn!(
            "DATABENTO_KEY not set - Databento feed will not start. \
             Set the environment variable and call SubscribeMarketData."
        );
    } else {
        tracing::info!(
            dataset = %config.feeds.databento.dataset,
            "Databento feed controller ready - waiting for SubscribeMarketData call"
        );
    }

    Some(controller)
}

/// Wait for shutdown signal (SIGTERM or SIGINT).
#[allow(clippy::expect_used)] // Signal handler failure is unrecoverable; panic is appropriate
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

    // Notify all listeners about shutdown
    let _ = shutdown_tx.send(());

    tracing::info!(
        timeout_secs = SHUTDOWN_TIMEOUT.as_secs(),
        "Graceful shutdown started"
    );
}
