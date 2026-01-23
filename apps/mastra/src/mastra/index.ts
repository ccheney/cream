/**
 * Mastra v1 Configuration
 *
 * Central Mastra instance with registered agents and workflows.
 *
 * Agents: 9 trading agents (analysts, researchers, trader, approvers, grounding, routing)
 * Workflows: tradingCycle, predictionMarkets, macroWatch
 *
 * Observability: OpenObserve via OpenTelemetry for tracing agent runs,
 * LLM generations, tool calls, and workflow steps.
 *
 * @see docs/plans/53-mastra-v1-migration.md
 */

import { Mastra } from "@mastra/core";
import { Observability } from "@mastra/observability";
import { OtelExporter } from "@mastra/otel-exporter";

// Agents
import {
	bearishResearcher,
	bullishResearcher,
	critic,
	fundamentalsAnalyst,
	groundingAgent,
	newsAnalyst,
	riskManager,
	routingAgent,
	trader,
} from "./agents/index.js";

// Workflows - will be populated as migration progresses
// import * as workflows from "./workflows";

// Scorers - will be populated as migration progresses
// import * as scorers from "./scorers";

const otelEndpoint = Bun.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";
const observabilityEnabled = Bun.env.OTEL_ENABLED !== "false";

/**
 * Mastra v1 instance for the trading system.
 *
 * Registered agents (accessible via mastra.getAgent("agent_id")):
 * - grounding_agent: Real-time web search context via xAI Grok
 * - news_analyst: News & Sentiment analysis
 * - fundamentals_analyst: Fundamentals & Macro analysis
 * - bullish_researcher: Bull case construction
 * - bearish_researcher: Bear case construction
 * - trader: Decision plan synthesis
 * - risk_manager: Risk validation
 * - critic: Logical consistency check
 * - routing_agent: Multi-agent network coordinator
 *
 * Registered workflows:
 * - tradingCycleWorkflow: OODA loop trading cycle (8 steps)
 * - predictionMarketsWorkflow: Prediction market data fetching
 * - macroWatchWorkflow: Macro environment newspaper
 *
 * Observability:
 * - Traces: Agent runs, LLM generations, tool calls, workflow steps
 * - Metrics: Token usage, latency, error rates
 * - Export: OpenObserve via OTLP (configurable endpoint)
 */
export const mastra = new Mastra({
	agents: {
		groundingAgent,
		newsAnalyst,
		fundamentalsAnalyst,
		bullishResearcher,
		bearishResearcher,
		trader,
		riskManager,
		critic,
		routingAgent,
	},
	workflows: {
		// Will be populated as workflows are migrated
	},
	observability: observabilityEnabled
		? new Observability({
				configs: {
					otel: {
						serviceName: "cream-mastra",
						serializationOptions: {
							maxStringLength: 131072, // 128KB - prevents truncation of large agent prompts/outputs
							maxDepth: 10,
							maxArrayLength: 100,
							maxObjectKeys: 100,
						},
						exporters: [
							new OtelExporter({
								provider: {
									custom: {
										endpoint: `${otelEndpoint}/v1/traces`,
										protocol: "http/protobuf",
									},
								},
								timeout: 30000,
								batchSize: 100,
							}),
						],
					},
				},
			})
		: undefined,
});
