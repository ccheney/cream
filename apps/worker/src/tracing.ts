/**
 * OpenTelemetry Tracing Setup
 *
 * Initializes OpenTelemetry with OTLP exporter for OpenObserve.
 * Must be imported before any other modules to ensure proper instrumentation.
 *
 * Configuration:
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP endpoint (default: http://localhost:4318)
 * - OTEL_ENABLED: Set to "false" to disable tracing
 * - OTEL_SERVICE_NAME: Service name for traces (default: cream-worker)
 */

import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";

const otelEnabled = Bun.env.OTEL_ENABLED !== "false";
const otelEndpoint = Bun.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";
const serviceName = Bun.env.OTEL_SERVICE_NAME ?? "cream-worker";

let sdk: NodeSDK | null = null;

export function initTracing(): void {
	if (!otelEnabled) {
		console.log("[tracing] OpenTelemetry disabled (OTEL_ENABLED=false)");
		return;
	}

	const exporter = new OTLPTraceExporter({
		url: `${otelEndpoint}/v1/traces`,
	});

	sdk = new NodeSDK({
		serviceName,
		spanProcessors: [new BatchSpanProcessor(exporter)],
		instrumentations: [
			getNodeAutoInstrumentations({
				"@opentelemetry/instrumentation-fs": { enabled: false },
				"@opentelemetry/instrumentation-dns": { enabled: false },
			}),
		],
		textMapPropagator: new W3CTraceContextPropagator(),
	});

	sdk.start();
	console.log(`[tracing] OpenTelemetry initialized: ${serviceName} -> ${otelEndpoint}`);
}

export function shutdownTracing(): Promise<void> {
	if (sdk) {
		return sdk.shutdown();
	}
	return Promise.resolve();
}
