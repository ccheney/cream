//! Health Check and Metrics Endpoint
//!
//! HTTP endpoint for health checks, connection status reporting, and Prometheus metrics.
//! Used by container orchestrators, load balancers, and monitoring systems.
//!
//! # Endpoints
//!
//! - `GET /health` - Returns JSON health status
//! - `GET /healthz` - Kubernetes liveness probe (simple OK)
//! - `GET /readyz` - Kubernetes readiness probe (checks connections)
//! - `GET /metrics` - Prometheus metrics in text format

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;

use axum::{Json, Router, extract::State, http::StatusCode, response::IntoResponse, routing::get};
use chrono::{DateTime, Utc};
use serde::Serialize;
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;

use crate::infrastructure::broadcast::SharedBroadcastHub;
use crate::infrastructure::grpc::proto::cream::v1::ConnectionState;
use crate::infrastructure::grpc::server::{FeedState, StreamProxyServer};
use crate::infrastructure::metrics::get_metrics_handle;

// =============================================================================
// Health Response Types
// =============================================================================

/// Health check response.
#[derive(Debug, Clone, Serialize)]
pub struct HealthResponse {
    /// Overall status: "healthy", "degraded", or "unhealthy".
    pub status: HealthStatus,
    /// Proxy version.
    pub version: String,
    /// Server uptime in seconds.
    pub uptime_secs: u64,
    /// Current time.
    pub current_time: DateTime<Utc>,
    /// Feed connection status.
    pub feeds: FeedsStatus,
    /// Active client count.
    pub clients: ClientStatus,
    /// Subscription statistics.
    pub subscriptions: SubscriptionStatus,
}

/// Overall health status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HealthStatus {
    /// All systems operational.
    Healthy,
    /// Some systems degraded but functional.
    Degraded,
    /// Critical systems unavailable.
    Unhealthy,
}

/// Feed connection status.
#[derive(Debug, Clone, Serialize)]
pub struct FeedsStatus {
    /// SIP (stock) feed status.
    pub sip: FeedInfo,
    /// OPRA (options) feed status.
    pub opra: FeedInfo,
    /// Trade updates feed status.
    pub trading: FeedInfo,
}

/// Individual feed status.
#[derive(Debug, Clone, Serialize)]
pub struct FeedInfo {
    /// Connection state.
    pub state: String,
    /// Whether this feed is connected.
    pub connected: bool,
    /// Messages received count.
    pub messages_received: u64,
    /// Current reconnect attempts (0 if connected).
    pub reconnect_attempts: i32,
}

/// Active client information.
#[derive(Debug, Clone, Serialize)]
pub struct ClientStatus {
    /// Total active gRPC clients.
    pub total: i32,
}

/// Subscription statistics.
#[derive(Debug, Clone, Serialize)]
pub struct SubscriptionStatus {
    /// Total broadcast receivers.
    pub broadcast_receivers: usize,
}

// =============================================================================
// Health Server State
// =============================================================================

/// Shared state for the health server.
pub struct HealthServerState {
    version: String,
    started_at: Instant,
    grpc_server: Arc<StreamProxyServer>,
    broadcast_hub: SharedBroadcastHub,
}

impl HealthServerState {
    /// Create new health server state.
    #[must_use]
    pub fn new(
        version: String,
        grpc_server: Arc<StreamProxyServer>,
        broadcast_hub: SharedBroadcastHub,
    ) -> Self {
        Self {
            version,
            started_at: Instant::now(),
            grpc_server,
            broadcast_hub,
        }
    }
}

// =============================================================================
// Health Server
// =============================================================================

/// Health check HTTP server.
pub struct HealthServer {
    port: u16,
    state: Arc<HealthServerState>,
    cancel: CancellationToken,
}

impl HealthServer {
    /// Create a new health server.
    #[must_use]
    pub const fn new(port: u16, state: Arc<HealthServerState>, cancel: CancellationToken) -> Self {
        Self {
            port,
            state,
            cancel,
        }
    }

    /// Run the health server until cancelled.
    ///
    /// # Errors
    ///
    /// Returns `HealthServerError` if binding fails or the HTTP server
    /// encounters a fatal error while running.
    pub async fn run(self) -> Result<(), HealthServerError> {
        let app = Router::new()
            .route("/health", get(health_handler))
            .route("/healthz", get(liveness_handler))
            .route("/readyz", get(readiness_handler))
            .route("/metrics", get(metrics_handler))
            .with_state(self.state);

        let addr = SocketAddr::from(([0, 0, 0, 0], self.port));
        let listener = TcpListener::bind(addr)
            .await
            .map_err(|e| HealthServerError::BindFailed(self.port, e.to_string()))?;

        tracing::info!(port = self.port, "Health server listening");

        axum::serve(listener, app)
            .with_graceful_shutdown(self.cancel.cancelled_owned())
            .await
            .map_err(|e| HealthServerError::ServerFailed(e.to_string()))?;

        tracing::info!("Health server stopped");
        Ok(())
    }
}

// =============================================================================
// HTTP Handlers
// =============================================================================

async fn health_handler(State(state): State<Arc<HealthServerState>>) -> impl IntoResponse {
    let response = build_health_response(&state);
    let status_code = match response.status {
        HealthStatus::Healthy | HealthStatus::Degraded => StatusCode::OK,
        HealthStatus::Unhealthy => StatusCode::SERVICE_UNAVAILABLE,
    };
    (status_code, Json(response))
}

async fn liveness_handler() -> impl IntoResponse {
    (StatusCode::OK, "OK")
}

async fn readiness_handler(State(state): State<Arc<HealthServerState>>) -> impl IntoResponse {
    let response = build_health_response(&state);

    // Ready if at least one feed is connected
    let is_ready = response.feeds.sip.connected
        || response.feeds.opra.connected
        || response.feeds.trading.connected;

    if is_ready {
        (StatusCode::OK, "READY")
    } else {
        (StatusCode::SERVICE_UNAVAILABLE, "NOT READY")
    }
}

async fn metrics_handler() -> impl IntoResponse {
    get_metrics_handle().map_or_else(
        || {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                [("content-type", "text/plain")],
                "Metrics not initialized".to_string(),
            )
        },
        |handle| {
            let body = handle.render();
            (
                StatusCode::OK,
                [("content-type", "text/plain; version=0.0.4; charset=utf-8")],
                body,
            )
        },
    )
}

fn build_health_response(state: &HealthServerState) -> HealthResponse {
    let sip_state = state.grpc_server.sip_state();
    let opra_state = state.grpc_server.opra_state();
    let trading_state = state.grpc_server.trading_state();

    let sip_info = feed_state_to_info(&sip_state);
    let opra_info = feed_state_to_info(&opra_state);
    let trading_info = feed_state_to_info(&trading_state);

    let feeds = FeedsStatus {
        sip: sip_info.clone(),
        opra: opra_info.clone(),
        trading: trading_info.clone(),
    };

    let status = determine_health_status(&sip_info, &opra_info, &trading_info);
    let broadcast_stats = state.broadcast_hub.stats();

    HealthResponse {
        status,
        version: state.version.clone(),
        uptime_secs: state.started_at.elapsed().as_secs(),
        current_time: Utc::now(),
        feeds,
        clients: ClientStatus {
            total: 0, // Will be updated when we have proper client tracking
        },
        subscriptions: SubscriptionStatus {
            broadcast_receivers: broadcast_stats.total_receivers(),
        },
    }
}

fn feed_state_to_info(state: &FeedState) -> FeedInfo {
    let connection_state = state.get_state();
    let connected = connection_state == ConnectionState::Connected;

    FeedInfo {
        state: connection_state_to_string(connection_state),
        connected,
        messages_received: state.get_messages_received(),
        reconnect_attempts: state.get_reconnect_attempts(),
    }
}

fn connection_state_to_string(state: ConnectionState) -> String {
    match state {
        ConnectionState::Unspecified => "unspecified".to_string(),
        ConnectionState::Disconnected => "disconnected".to_string(),
        ConnectionState::Connecting => "connecting".to_string(),
        ConnectionState::Authenticating => "authenticating".to_string(),
        ConnectionState::Connected => "connected".to_string(),
        ConnectionState::Reconnecting => "reconnecting".to_string(),
        ConnectionState::Error => "error".to_string(),
    }
}

fn determine_health_status(sip: &FeedInfo, opra: &FeedInfo, trading: &FeedInfo) -> HealthStatus {
    let connected_count = [sip.connected, opra.connected, trading.connected]
        .iter()
        .filter(|&&c| c)
        .count();

    match connected_count {
        3 => HealthStatus::Healthy,
        1 | 2 => HealthStatus::Degraded,
        _ => HealthStatus::Unhealthy,
    }
}

// =============================================================================
// Errors
// =============================================================================

/// Health server errors.
#[derive(Debug, thiserror::Error)]
pub enum HealthServerError {
    /// Failed to bind to port.
    #[error("failed to bind to port {0}: {1}")]
    BindFailed(u16, String),

    /// Server error.
    #[error("server error: {0}")]
    ServerFailed(String),
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn health_status_serialization() {
        assert_eq!(
            serde_json::to_string(&HealthStatus::Healthy).unwrap(),
            "\"healthy\""
        );
        assert_eq!(
            serde_json::to_string(&HealthStatus::Degraded).unwrap(),
            "\"degraded\""
        );
        assert_eq!(
            serde_json::to_string(&HealthStatus::Unhealthy).unwrap(),
            "\"unhealthy\""
        );
    }

    #[test]
    fn determine_status_all_connected() {
        let connected = FeedInfo {
            state: "connected".to_string(),
            connected: true,
            messages_received: 100,
            reconnect_attempts: 0,
        };

        let status = determine_health_status(&connected, &connected, &connected);
        assert_eq!(status, HealthStatus::Healthy);
    }

    #[test]
    fn determine_status_partial() {
        let connected = FeedInfo {
            state: "connected".to_string(),
            connected: true,
            messages_received: 100,
            reconnect_attempts: 0,
        };
        let disconnected = FeedInfo {
            state: "disconnected".to_string(),
            connected: false,
            messages_received: 0,
            reconnect_attempts: 5,
        };

        let status = determine_health_status(&connected, &disconnected, &disconnected);
        assert_eq!(status, HealthStatus::Degraded);
    }

    #[test]
    fn determine_status_none_connected() {
        let disconnected = FeedInfo {
            state: "disconnected".to_string(),
            connected: false,
            messages_received: 0,
            reconnect_attempts: 5,
        };

        let status = determine_health_status(&disconnected, &disconnected, &disconnected);
        assert_eq!(status, HealthStatus::Unhealthy);
    }
}
