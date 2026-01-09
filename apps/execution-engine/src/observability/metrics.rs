//! Prometheus metrics for the execution engine.
//!
//! Provides comprehensive metrics for order execution, market data feeds,
//! Greeks computation, gRPC services, and circuit breakers.
//!
//! # Example
//!
//! ```ignore
//! use execution_engine::observability::{init_metrics, MetricsConfig};
//! use std::net::SocketAddr;
//!
//! let config = MetricsConfig::default();
//! init_metrics(&config).expect("Failed to initialize metrics");
//!
//! // Record an order submission
//! record_order_submission("alpaca", "submitted", "limit", 0.015);
//! ```

use metrics::{counter, gauge, histogram};
use metrics_exporter_prometheus::PrometheusBuilder;
use std::net::SocketAddr;

/// Configuration for the metrics exporter.
#[derive(Debug, Clone)]
pub struct MetricsConfig {
    /// Address to bind the metrics HTTP listener.
    pub listen_addr: SocketAddr,
    /// Histogram buckets for latency measurements (in seconds).
    pub latency_buckets: Vec<f64>,
    /// Histogram buckets for message size measurements (in bytes).
    pub size_buckets: Vec<f64>,
    /// Histogram buckets for iteration counts.
    pub iteration_buckets: Vec<f64>,
}

impl Default for MetricsConfig {
    fn default() -> Self {
        Self {
            listen_addr: "0.0.0.0:9090".parse().expect("valid default address"),
            // Latency buckets from 100us to 1s
            latency_buckets: vec![
                0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0,
            ],
            // Size buckets from 64B to 1MB
            size_buckets: vec![
                64.0,
                256.0,
                1024.0,
                4096.0,
                16384.0,
                65536.0,
                262_144.0,
                1_048_576.0,
            ],
            // Iteration buckets from 1 to 100
            iteration_buckets: vec![1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0],
        }
    }
}

impl MetricsConfig {
    /// Create a new metrics configuration with custom address.
    #[must_use]
    pub fn with_addr(addr: SocketAddr) -> Self {
        Self {
            listen_addr: addr,
            ..Default::default()
        }
    }
}

/// Initialize the Prometheus metrics exporter.
///
/// This starts an HTTP server that exposes metrics at `/metrics`.
///
/// # Errors
///
/// Returns an error if the metrics exporter fails to start (e.g., port already in use).
pub fn init_metrics(config: &MetricsConfig) -> Result<(), MetricsError> {
    PrometheusBuilder::new()
        .with_http_listener(config.listen_addr)
        .set_buckets(&config.latency_buckets)
        .map_err(|e| MetricsError::Configuration(e.to_string()))?
        .install()
        .map_err(|e| MetricsError::Installation(e.to_string()))?;

    tracing::info!(
        addr = %config.listen_addr,
        "Prometheus metrics exporter started"
    );

    Ok(())
}

/// Error type for metrics operations.
#[derive(Debug, thiserror::Error)]
pub enum MetricsError {
    /// Failed to configure metrics exporter.
    #[error("metrics configuration error: {0}")]
    Configuration(String),
    /// Failed to install metrics exporter.
    #[error("metrics installation error: {0}")]
    Installation(String),
}

// ============================================================================
// Order Execution Metrics
// ============================================================================

/// Record an order submission.
///
/// # Arguments
///
/// * `broker` - Broker name (e.g., "alpaca", "ibkr")
/// * `status` - Submission status (e.g., "submitted", "rejected", "error")
/// * `order_type` - Order type (e.g., "market", "limit", "stop")
/// * `latency_seconds` - Time from submit to ACK in seconds
pub fn record_order_submission(broker: &str, status: &str, order_type: &str, latency_seconds: f64) {
    counter!(
        "order_submissions_total",
        "broker" => broker.to_string(),
        "status" => status.to_string(),
        "order_type" => order_type.to_string()
    )
    .increment(1);

    histogram!(
        "order_latency_seconds",
        "broker" => broker.to_string(),
        "order_type" => order_type.to_string()
    )
    .record(latency_seconds);
}

/// Record an order fill.
///
/// # Arguments
///
/// * `broker` - Broker name
/// * `order_type` - Order type
/// * `latency_seconds` - Time from submit to fill in seconds
pub fn record_order_fill(broker: &str, order_type: &str, latency_seconds: f64) {
    histogram!(
        "order_fill_latency_seconds",
        "broker" => broker.to_string(),
        "order_type" => order_type.to_string()
    )
    .record(latency_seconds);
}

/// Record an order rejection.
///
/// # Arguments
///
/// * `broker` - Broker name
/// * `reason` - Rejection reason (e.g., `"insufficient_funds"`, `"invalid_symbol"`)
pub fn record_order_rejection(broker: &str, reason: &str) {
    counter!(
        "order_rejection_total",
        "broker" => broker.to_string(),
        "reason" => reason.to_string()
    )
    .increment(1);
}

/// Update the open orders gauge.
///
/// # Arguments
///
/// * `broker` - Broker name
/// * `count` - Current number of open orders
pub fn update_open_orders(broker: &str, count: i64) {
    #[allow(clippy::cast_precision_loss)]
    gauge!("open_orders", "broker" => broker.to_string()).set(count as f64);
}

// ============================================================================
// Market Data Metrics
// ============================================================================

/// Record a market data feed message.
///
/// # Arguments
///
/// * `provider` - Data provider (e.g., "databento", "polygon")
/// * `message_type` - Message type (e.g., "quote", "trade", "ohlcv")
/// * `latency_seconds` - Exchange-to-receipt latency in seconds
pub fn record_feed_message(provider: &str, message_type: &str, latency_seconds: f64) {
    counter!(
        "feed_messages_total",
        "provider" => provider.to_string(),
        "message_type" => message_type.to_string()
    )
    .increment(1);

    histogram!(
        "feed_latency_seconds",
        "provider" => provider.to_string()
    )
    .record(latency_seconds);
}

/// Record a feed sequence gap.
///
/// # Arguments
///
/// * `provider` - Data provider
pub fn record_feed_gap(provider: &str) {
    counter!(
        "feed_gaps_total",
        "provider" => provider.to_string()
    )
    .increment(1);
}

/// Update quote staleness gauge.
///
/// # Arguments
///
/// * `symbol` - Symbol (e.g., "AAPL", "SPY")
/// * `staleness_seconds` - Age of the latest quote in seconds
pub fn record_quote_staleness(symbol: &str, staleness_seconds: f64) {
    gauge!(
        "quote_staleness_seconds",
        "symbol" => symbol.to_string()
    )
    .set(staleness_seconds);
}

// ============================================================================
// Greeks Computation Metrics
// ============================================================================

/// Record a Greeks computation.
///
/// # Arguments
///
/// * `model` - Pricing model (e.g., `"black_scholes"`, `"binomial"`)
/// * `status` - Computation status (e.g., "success", "error", "timeout")
/// * `duration_seconds` - Computation time in seconds
/// * `iterations` - Number of iterations (for IV solver)
pub fn record_greeks_computation(
    model: &str,
    status: &str,
    duration_seconds: f64,
    iterations: u32,
) {
    histogram!(
        "greeks_computation_seconds",
        "model" => model.to_string()
    )
    .record(duration_seconds);

    counter!(
        "greeks_computations_total",
        "model" => model.to_string(),
        "status" => status.to_string()
    )
    .increment(1);

    histogram!(
        "iv_solver_iterations",
        "model" => model.to_string()
    )
    .record(f64::from(iterations));
}

/// Record strategy build time.
///
/// # Arguments
///
/// * `strategy_type` - Strategy type (e.g., `"iron_condor"`, `"vertical_spread"`)
/// * `duration_seconds` - Build time in seconds
pub fn record_strategy_build(strategy_type: &str, duration_seconds: f64) {
    histogram!(
        "strategy_build_seconds",
        "strategy_type" => strategy_type.to_string()
    )
    .record(duration_seconds);
}

// ============================================================================
// gRPC Service Metrics
// ============================================================================

/// Record a gRPC request.
///
/// # Arguments
///
/// * `method` - RPC method name (e.g., `"CheckConstraints"`, `"SubmitOrders"`)
/// * `status` - gRPC status code (e.g., `"OK"`, `"INVALID_ARGUMENT"`)
/// * `duration_seconds` - Request duration in seconds
/// * `request_size` - Request message size in bytes
/// * `response_size` - Response message size in bytes
pub fn record_grpc_request(
    method: &str,
    status: &str,
    duration_seconds: f64,
    request_size: usize,
    response_size: usize,
) {
    counter!(
        "grpc_requests_total",
        "method" => method.to_string(),
        "status" => status.to_string()
    )
    .increment(1);

    histogram!(
        "grpc_request_duration_seconds",
        "method" => method.to_string()
    )
    .record(duration_seconds);

    #[allow(clippy::cast_precision_loss)]
    {
        histogram!(
            "grpc_message_size_bytes",
            "method" => method.to_string(),
            "direction" => "request".to_string()
        )
        .record(request_size as f64);

        histogram!(
            "grpc_message_size_bytes",
            "method" => method.to_string(),
            "direction" => "response".to_string()
        )
        .record(response_size as f64);
    }
}

// ============================================================================
// Circuit Breaker Metrics
// ============================================================================

/// Circuit breaker state values for the gauge.
#[allow(dead_code)]
pub mod circuit_breaker_state {
    /// Circuit is closed (healthy).
    pub const CLOSED: f64 = 0.0;
    /// Circuit is open (failing).
    pub const OPEN: f64 = 1.0;
    /// Circuit is half-open (testing).
    pub const HALF_OPEN: f64 = 2.0;
}

/// Update circuit breaker state gauge.
///
/// # Arguments
///
/// * `service` - Service name (e.g., "alpaca", "databento")
/// * `state` - Numeric state (0=closed, 1=open, 2=`half_open`)
pub fn record_circuit_breaker_state(service: &str, state: f64) {
    gauge!(
        "circuit_breaker_state",
        "service" => service.to_string()
    )
    .set(state);
}

/// Record a circuit breaker failure.
///
/// # Arguments
///
/// * `service` - Service name
pub fn record_circuit_breaker_failure(service: &str) {
    counter!(
        "circuit_breaker_failures_total",
        "service" => service.to_string()
    )
    .increment(1);
}

/// Record a circuit breaker success.
///
/// # Arguments
///
/// * `service` - Service name
pub fn record_circuit_breaker_success(service: &str) {
    counter!(
        "circuit_breaker_success_total",
        "service" => service.to_string()
    )
    .increment(1);
}

/// Record a circuit breaker rejection (call rejected due to open circuit).
///
/// # Arguments
///
/// * `service` - Service name
pub fn record_circuit_breaker_rejected(service: &str) {
    counter!(
        "circuit_breaker_rejected_total",
        "service" => service.to_string()
    )
    .increment(1);
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = MetricsConfig::default();
        assert_eq!(config.listen_addr.port(), 9090);
        assert!(!config.latency_buckets.is_empty());
        assert!(!config.size_buckets.is_empty());
        assert!(!config.iteration_buckets.is_empty());
    }

    #[test]
    fn test_config_with_addr() {
        let addr: SocketAddr = "127.0.0.1:8080".parse().unwrap();
        let config = MetricsConfig::with_addr(addr);
        assert_eq!(config.listen_addr.port(), 8080);
    }

    #[test]
    fn test_latency_buckets_in_seconds() {
        let config = MetricsConfig::default();
        // All buckets should be less than or equal to 1 second
        for bucket in &config.latency_buckets {
            assert!(*bucket <= 1.0, "Latency bucket {bucket} exceeds 1 second");
        }
        // Smallest bucket should be 100 microseconds
        assert!(
            (config.latency_buckets[0] - 0.0001).abs() < f64::EPSILON,
            "First bucket should be 100 microseconds"
        );
    }

    #[test]
    fn test_record_order_submission() {
        // This test verifies the function doesn't panic
        // Actual metric recording requires an installed recorder
        record_order_submission("alpaca", "submitted", "limit", 0.015);
    }

    #[test]
    fn test_record_order_fill() {
        record_order_fill("alpaca", "limit", 0.250);
    }

    #[test]
    fn test_record_order_rejection() {
        record_order_rejection("alpaca", "insufficient_funds");
    }

    #[test]
    fn test_update_open_orders() {
        update_open_orders("alpaca", 5);
    }

    #[test]
    fn test_record_feed_message() {
        record_feed_message("databento", "quote", 0.0001);
    }

    #[test]
    fn test_record_feed_gap() {
        record_feed_gap("polygon");
    }

    #[test]
    fn test_record_quote_staleness() {
        record_quote_staleness("AAPL", 0.5);
    }

    #[test]
    fn test_record_greeks_computation() {
        record_greeks_computation("black_scholes", "success", 0.001, 5);
    }

    #[test]
    fn test_record_strategy_build() {
        record_strategy_build("iron_condor", 0.005);
    }

    #[test]
    fn test_record_grpc_request() {
        record_grpc_request("CheckConstraints", "OK", 0.010, 1024, 512);
    }

    #[test]
    fn test_circuit_breaker_state_constants() {
        assert!((circuit_breaker_state::CLOSED - 0.0).abs() < f64::EPSILON);
        assert!((circuit_breaker_state::OPEN - 1.0).abs() < f64::EPSILON);
        assert!((circuit_breaker_state::HALF_OPEN - 2.0).abs() < f64::EPSILON);
    }

    #[test]
    fn test_record_circuit_breaker_state() {
        record_circuit_breaker_state("alpaca", circuit_breaker_state::CLOSED);
        record_circuit_breaker_state("alpaca", circuit_breaker_state::OPEN);
        record_circuit_breaker_state("alpaca", circuit_breaker_state::HALF_OPEN);
    }

    #[test]
    fn test_record_circuit_breaker_failure() {
        record_circuit_breaker_failure("alpaca");
    }

    #[test]
    fn test_record_circuit_breaker_success() {
        record_circuit_breaker_success("alpaca");
    }

    #[test]
    fn test_record_circuit_breaker_rejected() {
        record_circuit_breaker_rejected("alpaca");
    }
}
