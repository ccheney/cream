//! OpenTelemetry distributed tracing for the execution engine.
//!
//! Provides distributed tracing with OTLP export for order lifecycle,
//! validation, and broker routing spans.
//!
//! # Example
//!
//! ```ignore
//! use execution_engine::observability::{init_tracing, TracingConfig};
//!
//! let config = TracingConfig::default();
//! init_tracing(&config).expect("Failed to initialize tracing");
//! ```
//!
//! # Key Spans
//!
//! - `order.submit` - Full order lifecycle
//! - `order.validate` - Constraint validation
//! - `order.route` - Broker routing
//! - `greeks.compute` - Greeks calculation
//! - `strategy.build` - Strategy construction
//! - `feed.process` - Feed message processing

use opentelemetry::KeyValue;
use opentelemetry::trace::TracerProvider as _;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::Resource;
use opentelemetry_sdk::trace::{BatchSpanProcessor, SdkTracerProvider};
use std::time::Duration;
use tracing_opentelemetry::OpenTelemetryLayer;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

/// Configuration for OpenTelemetry tracing.
#[derive(Debug, Clone)]
pub struct TracingConfig {
    /// OTLP endpoint URL (e.g., "http://localhost:4317").
    pub otlp_endpoint: String,
    /// Service name for resource attributes.
    pub service_name: String,
    /// Service version for resource attributes.
    pub service_version: String,
    /// Sampling ratio (0.0 to 1.0).
    pub sampling_ratio: f64,
    /// Maximum batch size for span export.
    pub batch_size: usize,
    /// Scheduled delay between batch exports.
    pub batch_timeout: Duration,
    /// Whether to enable console logging layer.
    pub enable_console: bool,
}

impl Default for TracingConfig {
    fn default() -> Self {
        Self {
            otlp_endpoint: "http://localhost:4317".to_string(),
            service_name: "execution-engine".to_string(),
            service_version: env!("CARGO_PKG_VERSION").to_string(),
            sampling_ratio: 1.0,
            batch_size: 512,
            batch_timeout: Duration::from_secs(5),
            enable_console: true,
        }
    }
}

impl TracingConfig {
    /// Create a new tracing configuration with a custom endpoint.
    #[must_use]
    pub fn with_endpoint(endpoint: impl Into<String>) -> Self {
        Self {
            otlp_endpoint: endpoint.into(),
            ..Default::default()
        }
    }

    /// Set the service name.
    #[must_use]
    pub fn service_name(mut self, name: impl Into<String>) -> Self {
        self.service_name = name.into();
        self
    }

    /// Disable console logging layer.
    #[must_use]
    pub fn without_console(mut self) -> Self {
        self.enable_console = false;
        self
    }
}

/// Error type for tracing operations.
#[derive(Debug, thiserror::Error)]
pub enum TracingError {
    /// Failed to create OTLP exporter.
    #[error("failed to create OTLP exporter: {0}")]
    ExporterError(String),
    /// Failed to initialize tracing subscriber.
    #[error("failed to initialize tracing subscriber: {0}")]
    SubscriberError(String),
}

/// Tracer provider handle for graceful shutdown.
pub struct TracingGuard {
    provider: SdkTracerProvider,
}

impl TracingGuard {
    /// Shutdown the tracer provider, flushing any pending spans.
    ///
    /// This should be called before the application exits to ensure
    /// all spans are exported.
    pub fn shutdown(self) {
        if let Err(e) = self.provider.shutdown() {
            tracing::error!(error = %e, "Failed to shutdown tracer provider");
        }
    }
}

/// Initialize OpenTelemetry tracing with OTLP exporter.
///
/// This sets up:
/// - OTLP gRPC exporter with batch processing
/// - Resource attributes (service name, version)
/// - tracing-subscriber with OpenTelemetry layer
/// - Optional console logging layer
///
/// # Returns
///
/// A `TracingGuard` that should be held until shutdown.
///
/// # Errors
///
/// Returns an error if the OTLP exporter or subscriber fails to initialize.
///
/// # Panics
///
/// Panics if the tracing subscriber has already been set.
pub fn init_tracing(config: &TracingConfig) -> Result<TracingGuard, TracingError> {
    // Create OTLP exporter
    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_tonic()
        .with_endpoint(&config.otlp_endpoint)
        .build()
        .map_err(|e| TracingError::ExporterError(e.to_string()))?;

    // Build resource with service attributes
    let resource = Resource::builder()
        .with_attributes([
            KeyValue::new("service.name", config.service_name.clone()),
            KeyValue::new("service.version", config.service_version.clone()),
        ])
        .build();

    // Create batch span processor
    let batch_processor = BatchSpanProcessor::builder(exporter)
        .with_batch_config(
            opentelemetry_sdk::trace::BatchConfigBuilder::default()
                .with_max_export_batch_size(config.batch_size)
                .with_scheduled_delay(config.batch_timeout)
                .build(),
        )
        .build();

    // Build tracer provider
    let provider = SdkTracerProvider::builder()
        .with_resource(resource)
        .with_span_processor(batch_processor)
        .build();

    // Get tracer for OpenTelemetry layer
    let tracer = provider.tracer(config.service_name.clone());

    // Build subscriber with layers
    let otel_layer = OpenTelemetryLayer::new(tracer);
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    if config.enable_console {
        tracing_subscriber::registry()
            .with(env_filter)
            .with(otel_layer)
            .with(tracing_subscriber::fmt::layer())
            .init();
    } else {
        tracing_subscriber::registry()
            .with(env_filter)
            .with(otel_layer)
            .init();
    }

    tracing::info!(
        endpoint = %config.otlp_endpoint,
        service = %config.service_name,
        "OpenTelemetry tracing initialized"
    );

    Ok(TracingGuard { provider })
}

/// Create a tracing configuration from environment variables.
///
/// Reads the following environment variables:
/// - `OTEL_EXPORTER_OTLP_ENDPOINT` - OTLP endpoint (default: http://localhost:4317)
/// - `OTEL_SERVICE_NAME` - Service name (default: execution-engine)
/// - `OTEL_TRACES_SAMPLER_ARG` - Sampling ratio (default: 1.0)
#[must_use]
pub fn config_from_env() -> TracingConfig {
    let endpoint = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
        .unwrap_or_else(|_| "http://localhost:4317".to_string());
    let service_name =
        std::env::var("OTEL_SERVICE_NAME").unwrap_or_else(|_| "execution-engine".to_string());
    let sampling_ratio = std::env::var("OTEL_TRACES_SAMPLER_ARG")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(1.0);

    TracingConfig {
        otlp_endpoint: endpoint,
        service_name,
        sampling_ratio,
        ..Default::default()
    }
}

// ============================================================================
// Span attribute helpers
// ============================================================================

/// Common span attribute keys for order operations.
pub mod span_attrs {
    /// Order ID attribute key.
    pub const ORDER_ID: &str = "order.id";
    /// Symbol attribute key.
    pub const SYMBOL: &str = "order.symbol";
    /// Order side attribute key (BUY/SELL).
    pub const SIDE: &str = "order.side";
    /// Order quantity attribute key.
    pub const QUANTITY: &str = "order.quantity";
    /// Broker name attribute key.
    pub const BROKER: &str = "order.broker";
    /// Order type attribute key (MARKET/LIMIT/etc).
    pub const ORDER_TYPE: &str = "order.type";
    /// Constraint check count attribute key.
    pub const CONSTRAINT_CHECKS: &str = "order.constraint_checks";
    /// Route type attribute key.
    pub const ROUTE_TYPE: &str = "order.route_type";
    /// Pricing model attribute key.
    pub const MODEL: &str = "greeks.model";
    /// Contract count attribute key.
    pub const CONTRACT_COUNT: &str = "greeks.contract_count";
    /// Strategy type attribute key.
    pub const STRATEGY_TYPE: &str = "strategy.type";
    /// Underlying symbol attribute key.
    pub const UNDERLYING: &str = "strategy.underlying";
    /// Data provider attribute key.
    pub const PROVIDER: &str = "feed.provider";
    /// Message type attribute key.
    pub const MESSAGE_TYPE: &str = "feed.message_type";
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = TracingConfig::default();
        assert_eq!(config.otlp_endpoint, "http://localhost:4317");
        assert_eq!(config.service_name, "execution-engine");
        assert!((config.sampling_ratio - 1.0).abs() < f64::EPSILON);
        assert_eq!(config.batch_size, 512);
        assert!(config.enable_console);
    }

    #[test]
    fn test_config_with_endpoint() {
        let config = TracingConfig::with_endpoint("http://otel:4317");
        assert_eq!(config.otlp_endpoint, "http://otel:4317");
    }

    #[test]
    fn test_config_builder() {
        let config = TracingConfig::with_endpoint("http://custom:4317")
            .service_name("my-service")
            .without_console();

        assert_eq!(config.otlp_endpoint, "http://custom:4317");
        assert_eq!(config.service_name, "my-service");
        assert!(!config.enable_console);
    }

    #[test]
    fn test_config_from_env_defaults() {
        // This test validates the default fallback behavior.
        // Since we can't safely clear env vars in Rust 2024 edition,
        // we just validate that config_from_env() produces valid config.
        let config = config_from_env();
        // Should have a non-empty endpoint
        assert!(!config.otlp_endpoint.is_empty());
        // Should have a non-empty service name
        assert!(!config.service_name.is_empty());
        // Sampling ratio should be valid (0.0 to 1.0)
        assert!(config.sampling_ratio >= 0.0 && config.sampling_ratio <= 1.0);
    }

    #[test]
    fn test_span_attr_constants() {
        assert_eq!(span_attrs::ORDER_ID, "order.id");
        assert_eq!(span_attrs::SYMBOL, "order.symbol");
        assert_eq!(span_attrs::BROKER, "order.broker");
        assert_eq!(span_attrs::MODEL, "greeks.model");
        assert_eq!(span_attrs::STRATEGY_TYPE, "strategy.type");
        assert_eq!(span_attrs::PROVIDER, "feed.provider");
    }

    #[test]
    fn test_tracing_error_display() {
        let err = TracingError::ExporterError("connection refused".to_string());
        assert!(err.to_string().contains("connection refused"));

        let err = TracingError::SubscriberError("already initialized".to_string());
        assert!(err.to_string().contains("already initialized"));
    }
}
