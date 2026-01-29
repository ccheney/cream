/**
 * OpenTelemetry Instrumentation
 *
 * Sets up the OTEL SDK before any application code runs.
 * This file MUST be preloaded via --preload flag to properly initialize tracing.
 *
 * Exports traces to OpenObserve via OTLP HTTP/protobuf protocol.
 */

import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";

const endpoint = Bun.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const authToken = Bun.env.ZO_AUTH_TOKEN;
const enabled = Bun.env.OTEL_ENABLED !== "false" && endpoint !== undefined;

if (enabled && endpoint) {
	const exporter = new OTLPTraceExporter({
		url: endpoint,
		headers: authToken ? { Authorization: `Basic ${authToken}` } : undefined,
	});

	const sdk = new NodeSDK({
		serviceName: "cream-mastra",
		spanProcessors: [new BatchSpanProcessor(exporter)],
		textMapPropagator: new W3CTraceContextPropagator(),
	});

	sdk.start();

	process.on("SIGTERM", async () => {
		await sdk.shutdown();
		process.exit(0);
	});

	process.on("SIGINT", async () => {
		await sdk.shutdown();
		process.exit(0);
	});

	console.log(`[instrumentation] OTEL tracing enabled, exporting to ${endpoint}`);
} else {
	console.log("[instrumentation] OTEL tracing disabled");
}
