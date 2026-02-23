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

function normalizeOtlpTraceUrl(endpoint: string): string {
	const trimmed = endpoint.replace(/\/+$/, "");
	return trimmed.endsWith("/v1/traces") ? trimmed : `${trimmed}/v1/traces`;
}

function resolveOtlpHeaders(): Record<string, string> | undefined {
	const token = Bun.env.ZO_AUTH_TOKEN?.trim();
	if (!token) {
		return undefined;
	}
	const hasScheme = /^basic\s+|^bearer\s+/i.test(token);
	return {
		Authorization: hasScheme ? token : `Basic ${token}`,
	};
}

export function initTracing(): void {
	if (!otelEnabled) {
		return;
	}

	const exporter = new OTLPTraceExporter({
		url: normalizeOtlpTraceUrl(otelEndpoint),
		headers: resolveOtlpHeaders(),
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

	try {
		sdk.start();
	} catch (error) {
		// biome-ignore lint/suspicious/noConsole: logger unavailable during tracing bootstrap
		console.error(
			`[tracing] Failed to initialize OpenTelemetry for ${serviceName}: ${error instanceof Error ? error.message : String(error)}`,
		);
		sdk = null;
	}
}

export async function shutdownTracing(): Promise<void> {
	if (sdk) {
		try {
			await sdk.shutdown();
		} catch (error) {
			// biome-ignore lint/suspicious/noConsole: logger unavailable during tracing shutdown
			console.error(
				`[tracing] Failed to shutdown OpenTelemetry for ${serviceName}: ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			sdk = null;
		}
	}
}
