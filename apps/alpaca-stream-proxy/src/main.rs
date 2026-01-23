//! Alpaca Stream Proxy Binary
//!
//! Starts the market data stream proxy.
//!
//! # Usage
//!
//! ```bash
//! cargo run --bin alpaca-stream-proxy
//! ```
//!
//! # Environment Variables
//!
//! ## Required
//! - `ALPACA_KEY`: Alpaca API key
//! - `ALPACA_SECRET`: Alpaca API secret
//!
//! ## Optional
//! - `CREAM_ENV`: PAPER | LIVE (default: PAPER)
//! - `ALPACA_FEED`: Market data feed - "sip" | "iex" (default: sip)
//! - `STREAM_PROXY_GRPC_PORT`: gRPC server port (default: 50052)
//! - `STREAM_PROXY_HEALTH_PORT`: Health check HTTP port (default: 8082)
//! - `STREAM_PROXY_METRICS_PORT`: Prometheus metrics port (default: 9090)
//! - `OTEL_ENABLED`: Enable OpenTelemetry (default: true)
//! - `OTEL_EXPORTER_OTLP_ENDPOINT`: OTLP endpoint (default: <http://localhost:4318>)
//! - `OTEL_SERVICE_NAME`: Service name (default: cream-alpaca-stream-proxy)
//! - `RUST_LOG`: Log level (default: info)

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use alpaca_stream_proxy::infrastructure::alpaca::{
    OpraClient, OpraClientConfig, OpraEvent, SipClient, SipClientConfig, SipEvent, TradingClient,
    TradingClientConfig, TradingEvent,
};
use alpaca_stream_proxy::infrastructure::broadcast::{BroadcastConfig, BroadcastHub};
use alpaca_stream_proxy::infrastructure::grpc::proto::cream::v1::ConnectionState;
use alpaca_stream_proxy::infrastructure::grpc::proto::cream::v1::stream_proxy_service_server::StreamProxyServiceServer;
use alpaca_stream_proxy::infrastructure::grpc::server::{
    StreamProxyServer, StreamProxyServerConfig,
};
use alpaca_stream_proxy::infrastructure::health::{HealthServer, HealthServerState};
use alpaca_stream_proxy::infrastructure::telemetry;
use alpaca_stream_proxy::{Environment, ProxyConfig, SubscriptionManager, init_metrics};
use tokio::signal;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use tonic::transport::Server;

/// Graceful shutdown timeout.
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(30);

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("Failed to install rustls crypto provider");

    load_dotenv();

    // Initialize telemetry (OpenTelemetry + tracing)
    let _telemetry_guard = telemetry::init();

    tracing::info!("Starting Alpaca Stream Proxy");

    // Initialize Prometheus metrics
    let _metrics_handle = init_metrics();

    let config = ProxyConfig::from_env()?;
    log_config(&config);

    let shutdown_token = CancellationToken::new();

    // Initialize broadcast hub for message distribution
    let broadcast_config = BroadcastConfig::from(config.broadcast.clone());
    let broadcast_hub = Arc::new(BroadcastHub::new(broadcast_config));

    // Initialize subscription manager
    let subscription_manager = Arc::new(SubscriptionManager::new());

    // Initialize gRPC server
    let grpc_environment = match config.environment {
        Environment::Paper => {
            alpaca_stream_proxy::infrastructure::grpc::proto::cream::v1::Environment::Paper
        }
        Environment::Live => {
            alpaca_stream_proxy::infrastructure::grpc::proto::cream::v1::Environment::Live
        }
    };
    let grpc_server_config = StreamProxyServerConfig {
        version: env!("CARGO_PKG_VERSION").to_string(),
        environment: grpc_environment,
    };
    let grpc_server = Arc::new(StreamProxyServer::new(
        grpc_server_config,
        Arc::clone(&broadcast_hub),
        Arc::clone(&subscription_manager),
    ));

    // Initialize health server
    let health_state = Arc::new(HealthServerState::new(
        env!("CARGO_PKG_VERSION").to_string(),
        Arc::clone(&grpc_server),
        Arc::clone(&broadcast_hub),
    ));
    let health_server = HealthServer::new(
        config.server.health_port,
        Arc::clone(&health_state),
        shutdown_token.clone(),
    );

    // Create credentials for WebSocket clients
    let credentials = alpaca_stream_proxy::infrastructure::alpaca::Credentials::new(
        config.credentials.api_key(),
        config.credentials.api_secret(),
    )?;

    // Create WebSocket client configurations
    let sip_config = match config.environment {
        Environment::Paper => SipClientConfig::paper(credentials.clone(), config.feed.as_str()),
        Environment::Live => SipClientConfig::live(credentials.clone(), config.feed.as_str()),
    };

    let opra_config = match config.environment {
        Environment::Paper => OpraClientConfig::paper(credentials.clone()),
        Environment::Live => OpraClientConfig::live(credentials.clone()),
    };

    let trading_config = match config.environment {
        Environment::Paper => TradingClientConfig::paper(credentials.clone()),
        Environment::Live => TradingClientConfig::live(credentials.clone()),
    };

    // Create event channels for WebSocket clients
    let (sip_tx, sip_rx) = mpsc::channel::<SipEvent>(1024);
    let (opra_tx, opra_rx) = mpsc::channel::<OpraEvent>(4096);
    let (trading_tx, trading_rx) = mpsc::channel::<TradingEvent>(256);

    // Create WebSocket clients
    let sip_client = Arc::new(SipClient::new(sip_config, sip_tx, shutdown_token.clone()));
    let opra_client = Arc::new(OpraClient::new(
        opra_config,
        opra_tx,
        shutdown_token.clone(),
    ));
    let trading_client = Arc::new(TradingClient::new(
        trading_config,
        trading_tx,
        shutdown_token.clone(),
    ));

    // Get feed states for tracking connection status
    let sip_state = grpc_server.sip_state();
    let opra_state = grpc_server.opra_state();
    let trading_state = grpc_server.trading_state();

    // Spawn SIP event handler
    let sip_broadcast_hub = Arc::clone(&broadcast_hub);
    let sip_feed_state = Arc::clone(&sip_state);
    tokio::spawn(async move {
        handle_sip_events(sip_rx, sip_broadcast_hub, sip_feed_state).await;
    });

    // Spawn OPRA event handler
    let opra_broadcast_hub = Arc::clone(&broadcast_hub);
    let opra_feed_state = Arc::clone(&opra_state);
    tokio::spawn(async move {
        handle_opra_events(opra_rx, opra_broadcast_hub, opra_feed_state).await;
    });

    // Spawn Trading event handler
    let trading_broadcast_hub = Arc::clone(&broadcast_hub);
    let trading_feed_state = Arc::clone(&trading_state);
    tokio::spawn(async move {
        handle_trading_events(trading_rx, trading_broadcast_hub, trading_feed_state).await;
    });

    // Spawn WebSocket clients
    let sip_client_clone = Arc::clone(&sip_client);
    tokio::spawn(async move {
        if let Err(e) = sip_client_clone.run().await {
            tracing::error!(error = %e, "SIP client error");
        }
    });

    let opra_client_clone = Arc::clone(&opra_client);
    tokio::spawn(async move {
        if let Err(e) = opra_client_clone.run().await {
            tracing::error!(error = %e, "OPRA client error");
        }
    });

    let trading_client_clone = Arc::clone(&trading_client);
    tokio::spawn(async move {
        if let Err(e) = trading_client_clone.run().await {
            tracing::error!(error = %e, "Trading client error");
        }
    });

    // Spawn health server
    tokio::spawn(async move {
        if let Err(e) = health_server.run().await {
            tracing::error!(error = %e, "Health server error");
        }
    });

    // Spawn gRPC server
    let grpc_addr: SocketAddr = format!("0.0.0.0:{}", config.server.grpc_port).parse()?;
    let grpc_service = StreamProxyServiceServer::from_arc(grpc_server);
    let grpc_shutdown = shutdown_token.clone();

    tokio::spawn(async move {
        tracing::info!(addr = %grpc_addr, "gRPC server listening");
        if let Err(e) = Server::builder()
            .add_service(grpc_service)
            .serve_with_shutdown(grpc_addr, grpc_shutdown.cancelled())
            .await
        {
            tracing::error!(error = %e, "gRPC server error");
        }
        tracing::info!("gRPC server stopped");
    });

    tracing::info!("Stream proxy ready");

    await_shutdown(shutdown_token).await;

    tracing::info!("Stream proxy stopped");
    Ok(())
}

/// Handle events from the SIP WebSocket client.
async fn handle_sip_events(
    mut rx: mpsc::Receiver<SipEvent>,
    broadcast_hub: Arc<BroadcastHub>,
    feed_state: Arc<alpaca_stream_proxy::infrastructure::grpc::server::FeedState>,
) {
    while let Some(event) = rx.recv().await {
        match event {
            SipEvent::Connected => {
                feed_state.set_state(ConnectionState::Connected);
                tracing::info!("SIP feed connected");
            }
            SipEvent::Disconnected => {
                feed_state.set_state(ConnectionState::Disconnected);
                tracing::warn!("SIP feed disconnected");
            }
            SipEvent::Reconnecting { attempt } => {
                feed_state.set_state(ConnectionState::Reconnecting);
                feed_state.increment_reconnect_attempts();
                tracing::info!(attempt, "SIP feed reconnecting");
            }
            SipEvent::Quote(quote) => {
                feed_state.increment_messages();
                let _ = broadcast_hub.send_stock_quote(quote);
            }
            SipEvent::Trade(trade) => {
                feed_state.increment_messages();
                let _ = broadcast_hub.send_stock_trade(trade);
            }
            SipEvent::Bar(bar) => {
                feed_state.increment_messages();
                let _ = broadcast_hub.send_stock_bar(bar);
            }
            SipEvent::Subscribed {
                quotes,
                trades,
                bars,
            } => {
                let count = quotes.len() + trades.len() + bars.len();
                feed_state.set_subscription_count(count as i32);
                tracing::debug!(
                    quotes = quotes.len(),
                    trades = trades.len(),
                    bars = bars.len(),
                    "SIP subscriptions updated"
                );
            }
            SipEvent::Error(msg) => {
                feed_state.set_error(msg.clone());
                tracing::error!(error = %msg, "SIP feed error");
            }
        }
    }
}

/// Handle events from the OPRA WebSocket client.
async fn handle_opra_events(
    mut rx: mpsc::Receiver<OpraEvent>,
    broadcast_hub: Arc<BroadcastHub>,
    feed_state: Arc<alpaca_stream_proxy::infrastructure::grpc::server::FeedState>,
) {
    while let Some(event) = rx.recv().await {
        match event {
            OpraEvent::Connected => {
                feed_state.set_state(ConnectionState::Connected);
                tracing::info!("OPRA feed connected");
            }
            OpraEvent::Disconnected => {
                feed_state.set_state(ConnectionState::Disconnected);
                tracing::warn!("OPRA feed disconnected");
            }
            OpraEvent::Reconnecting { attempt } => {
                feed_state.set_state(ConnectionState::Reconnecting);
                feed_state.increment_reconnect_attempts();
                tracing::info!(attempt, "OPRA feed reconnecting");
            }
            OpraEvent::Quote(quote) => {
                feed_state.increment_messages();
                let _ = broadcast_hub.send_options_quote(quote);
            }
            OpraEvent::Trade(trade) => {
                feed_state.increment_messages();
                let _ = broadcast_hub.send_options_trade(trade);
            }
            OpraEvent::Subscribed { quotes, trades } => {
                let count = quotes.len() + trades.len();
                feed_state.set_subscription_count(count as i32);
                tracing::debug!(
                    quotes = quotes.len(),
                    trades = trades.len(),
                    "OPRA subscriptions updated"
                );
            }
            OpraEvent::Error(msg) => {
                feed_state.set_error(msg.clone());
                tracing::error!(error = %msg, "OPRA feed error");
            }
        }
    }
}

/// Handle events from the Trading WebSocket client.
async fn handle_trading_events(
    mut rx: mpsc::Receiver<TradingEvent>,
    broadcast_hub: Arc<BroadcastHub>,
    feed_state: Arc<alpaca_stream_proxy::infrastructure::grpc::server::FeedState>,
) {
    while let Some(event) = rx.recv().await {
        match event {
            TradingEvent::Connected => {
                feed_state.set_state(ConnectionState::Connected);
                tracing::info!("Trading feed connected");
            }
            TradingEvent::Disconnected => {
                feed_state.set_state(ConnectionState::Disconnected);
                tracing::warn!("Trading feed disconnected");
            }
            TradingEvent::Reconnecting { attempt } => {
                feed_state.set_state(ConnectionState::Reconnecting);
                feed_state.increment_reconnect_attempts();
                tracing::info!(attempt, "Trading feed reconnecting");
            }
            TradingEvent::TradeUpdate(update) => {
                feed_state.increment_messages();
                let _ = broadcast_hub.send_order_update(*update);
            }
            TradingEvent::Listening => {
                tracing::info!("Trading feed listening for updates");
            }
            TradingEvent::Error(msg) => {
                feed_state.set_error(msg.clone());
                tracing::error!(error = %msg, "Trading feed error");
            }
        }
    }
}

/// Load .env file from current or ancestor directories.
fn load_dotenv() {
    if dotenvy::dotenv().is_err() {
        load_dotenv_from_ancestors();
    }
}

/// Log the parsed configuration.
fn log_config(config: &ProxyConfig) {
    tracing::info!(
        environment = config.environment.as_str(),
        feed = config.feed.as_str(),
        grpc_port = config.server.grpc_port,
        health_port = config.server.health_port,
        metrics_port = config.server.metrics_port,
        "Configuration loaded"
    );
    tracing::debug!(
        stock_stream_url = %config.stock_stream_url(),
        options_stream_url = %config.options_stream_url(),
        trade_updates_url = %config.trade_updates_url(),
        "WebSocket endpoints"
    );
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
async fn await_shutdown(shutdown_token: CancellationToken) {
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

    shutdown_token.cancel();

    tracing::info!(
        timeout_secs = SHUTDOWN_TIMEOUT.as_secs(),
        "Graceful shutdown started"
    );
}
