//! OpenTelemetry Tracing Integration
//!
//! Configures OpenTelemetry with OTLP exporter for distributed tracing.
//! Integrates with OpenObserve or any OTLP-compatible backend.
//!
//! # Environment Variables
//!
//! - `OTEL_ENABLED`: Set to "false" to disable tracing (default: true)
//! - `OTEL_EXPORTER_OTLP_ENDPOINT`: OTLP endpoint (default: http://localhost:4318)
//! - `OTEL_SERVICE_NAME`: Service name for traces (default: cream-alpaca-stream-proxy)
//!
//! # Usage
//!
//! ```ignore
//! use alpaca_stream_proxy::infrastructure::telemetry;
//!
//! // Initialize at startup (returns guard that must be kept alive)
//! let _guard = telemetry::init();
//!
//! // Add spans to your code
//! #[tracing::instrument]
//! fn process_message() {
//!     tracing::info!("Processing message");
//! }
//! ```

use opentelemetry::trace::TracerProvider as _;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::trace::SdkTracerProvider;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

/// Service name for OpenTelemetry traces.
const DEFAULT_SERVICE_NAME: &str = "cream-alpaca-stream-proxy";

/// Default OTLP endpoint.
const DEFAULT_OTLP_ENDPOINT: &str = "http://localhost:4318";

/// Guard that shuts down OpenTelemetry when dropped.
pub struct TelemetryGuard {
    tracer_provider: Option<SdkTracerProvider>,
}

impl Drop for TelemetryGuard {
    fn drop(&mut self) {
        if let Some(provider) = self.tracer_provider.take()
            && let Err(e) = provider.shutdown()
        {
            eprintln!("Failed to shutdown OpenTelemetry tracer provider: {e}");
        }
    }
}

/// Telemetry configuration.
#[derive(Debug, Clone)]
pub struct TelemetryConfig {
    /// Whether OpenTelemetry is enabled.
    pub enabled: bool,
    /// OTLP exporter endpoint.
    pub otlp_endpoint: String,
    /// Service name for traces.
    pub service_name: String,
}

impl Default for TelemetryConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            otlp_endpoint: DEFAULT_OTLP_ENDPOINT.to_string(),
            service_name: DEFAULT_SERVICE_NAME.to_string(),
        }
    }
}

impl TelemetryConfig {
    /// Create configuration from environment variables.
    #[must_use]
    pub fn from_env() -> Self {
        let enabled = std::env::var("OTEL_ENABLED")
            .map(|v| v.to_lowercase() != "false")
            .unwrap_or(true);

        let otlp_endpoint = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
            .unwrap_or_else(|_| DEFAULT_OTLP_ENDPOINT.to_string());

        let service_name =
            std::env::var("OTEL_SERVICE_NAME").unwrap_or_else(|_| DEFAULT_SERVICE_NAME.to_string());

        Self {
            enabled,
            otlp_endpoint,
            service_name,
        }
    }
}

/// Initialize telemetry with default configuration from environment.
///
/// Returns a guard that must be kept alive for the duration of the program.
/// When the guard is dropped, OpenTelemetry will be properly shut down.
#[must_use]
pub fn init() -> TelemetryGuard {
    init_with_config(TelemetryConfig::from_env())
}

/// Initialize telemetry with custom configuration.
///
/// Returns a guard that must be kept alive for the duration of the program.
#[must_use]
#[allow(clippy::expect_used)]
pub fn init_with_config(config: TelemetryConfig) -> TelemetryGuard {
    let env_filter = EnvFilter::from_default_env()
        .add_directive(
            "alpaca_stream_proxy=info"
                .parse()
                .expect("static directive 'alpaca_stream_proxy=info' is valid"),
        )
        .add_directive(
            "tower_http=info"
                .parse()
                .expect("static directive 'tower_http=info' is valid"),
        )
        .add_directive(
            "h2=warn"
                .parse()
                .expect("static directive 'h2=warn' is valid"),
        )
        .add_directive(
            "hyper=warn"
                .parse()
                .expect("static directive 'hyper=warn' is valid"),
        );

    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_target(true)
        .with_thread_ids(false)
        .with_file(false)
        .with_line_number(false);

    if !config.enabled {
        tracing_subscriber::registry()
            .with(env_filter)
            .with(fmt_layer)
            .init();

        return TelemetryGuard {
            tracer_provider: None,
        };
    }

    // Configure OTLP exporter
    let otlp_exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_tonic()
        .with_endpoint(&config.otlp_endpoint)
        .build()
        .expect("Failed to create OTLP exporter");

    // Build tracer provider
    let tracer_provider = SdkTracerProvider::builder()
        .with_batch_exporter(otlp_exporter)
        .with_resource(
            opentelemetry_sdk::Resource::builder()
                .with_service_name(config.service_name.clone())
                .build(),
        )
        .build();

    // Create tracing layer from tracer
    let tracer = tracer_provider.tracer(config.service_name);
    let otel_layer = tracing_opentelemetry::layer().with_tracer(tracer);

    // Initialize subscriber with both fmt and otel layers
    tracing_subscriber::registry()
        .with(env_filter)
        .with(fmt_layer)
        .with(otel_layer)
        .init();

    TelemetryGuard {
        tracer_provider: Some(tracer_provider),
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config() {
        let config = TelemetryConfig::default();
        assert!(config.enabled);
        assert_eq!(config.otlp_endpoint, DEFAULT_OTLP_ENDPOINT);
        assert_eq!(config.service_name, DEFAULT_SERVICE_NAME);
    }

    #[test]
    fn telemetry_config_clone() {
        let config = TelemetryConfig::default();
        let cloned = config.clone();
        assert_eq!(config.enabled, cloned.enabled);
        assert_eq!(config.otlp_endpoint, cloned.otlp_endpoint);
        assert_eq!(config.service_name, cloned.service_name);
    }
}
