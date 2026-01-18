//! OpenTelemetry Tracing Setup
//!
//! Initializes OpenTelemetry with OTLP exporter for OpenObserve.
//!
//! # Configuration
//!
//! - `OTEL_EXPORTER_OTLP_ENDPOINT`: OTLP gRPC endpoint (default: `http://localhost:4317`)
//! - `OTEL_ENABLED`: Set to `false` to disable OTEL tracing (uses console only)
//! - `OTEL_SERVICE_NAME`: Service name for traces (default: `cream-execution-engine`)
//!
//! # Usage
//!
//! ```rust,ignore
//! use execution_engine::telemetry::init_telemetry;
//!
//! #[tokio::main]
//! async fn main() {
//!     let _guard = init_telemetry();
//!     // ... application code
//! }
//! ```

use opentelemetry::trace::TracerProvider;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::trace::SdkTracerProvider;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter, Registry};

/// Guard that shuts down the tracer provider on drop.
pub struct TelemetryGuard {
    provider: Option<SdkTracerProvider>,
}

impl Drop for TelemetryGuard {
    fn drop(&mut self) {
        if let Some(provider) = self.provider.take() {
            if let Err(e) = provider.shutdown() {
                eprintln!("Error shutting down tracer provider: {e:?}");
            }
        }
    }
}

/// Initialize OpenTelemetry tracing with OTLP exporter.
///
/// Returns a guard that will shut down the tracer provider when dropped.
///
/// # Panics
///
/// Panics if tracing subscriber initialization fails.
#[must_use]
pub fn init_telemetry() -> TelemetryGuard {
    let otel_enabled = std::env::var("OTEL_ENABLED")
        .map(|v| v != "false")
        .unwrap_or(true);

    let is_development = std::env::var("NODE_ENV")
        .map(|v| v == "development")
        .unwrap_or(false);

    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("info"));

    if !otel_enabled {
        // Console-only tracing
        tracing_subscriber::fmt()
            .with_env_filter(env_filter)
            .with_target(!is_development)
            .with_ansi(is_development)
            .init();

        tracing::info!("OpenTelemetry disabled (OTEL_ENABLED=false), using console logging only");
        return TelemetryGuard { provider: None };
    }

    let endpoint = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
        .unwrap_or_else(|_| "http://localhost:4317".to_string());

    let service_name = std::env::var("OTEL_SERVICE_NAME")
        .unwrap_or_else(|_| "cream-execution-engine".to_string());

    // Build OTLP exporter
    let exporter = match opentelemetry_otlp::SpanExporter::builder()
        .with_tonic()
        .with_endpoint(&endpoint)
        .build()
    {
        Ok(exp) => exp,
        Err(e) => {
            eprintln!("Failed to create OTLP exporter: {e:?}, falling back to console logging");
            tracing_subscriber::fmt()
                .with_env_filter(env_filter)
                .with_target(!is_development)
                .with_ansi(is_development)
                .init();
            return TelemetryGuard { provider: None };
        }
    };

    // Build tracer provider with simple span processor for simplicity
    // (uses sync export which is fine for most use cases)
    let provider = SdkTracerProvider::builder()
        .with_simple_exporter(exporter)
        .build();

    let tracer = provider.tracer(service_name.clone());

    // Create OpenTelemetry layer
    let otel_layer = tracing_opentelemetry::layer().with_tracer(tracer);

    // Create console layer
    let fmt_layer = tracing_subscriber::fmt::layer()
        .with_target(!is_development)
        .with_ansi(is_development);

    // Combine layers
    Registry::default()
        .with(env_filter)
        .with(fmt_layer)
        .with(otel_layer)
        .init();

    tracing::info!(
        service_name = %service_name,
        endpoint = %endpoint,
        "OpenTelemetry initialized"
    );

    TelemetryGuard {
        provider: Some(provider),
    }
}
