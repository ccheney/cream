//! Observability module for metrics, tracing, and logging.
//!
//! This module provides instrumentation for the execution engine,
//! including Prometheus metrics export and distributed tracing.

mod metrics;

pub use metrics::{
    init_metrics, record_circuit_breaker_failure, record_circuit_breaker_rejected,
    record_circuit_breaker_state, record_circuit_breaker_success, record_feed_gap,
    record_feed_message, record_greeks_computation, record_grpc_request,
    record_order_fill, record_order_rejection, record_order_submission,
    record_quote_staleness, record_strategy_build, update_open_orders, MetricsConfig,
};
