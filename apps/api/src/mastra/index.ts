/**
 * Mastra Configuration
 *
 * Central Mastra instance with registered agents and workflows.
 *
 * Agents: All 9 trading agents (analysts, researchers, trader, approvers, idea/indicator)
 * Workflows: tradingCycle, predictionMarkets
 *
 * Observability: OpenObserve via OpenTelemetry for tracing agent runs,
 * LLM generations, tool calls, and workflow steps.
 *
 * @see docs/plans/21-mastra-workflow-refactor.md
 */

import { Mastra } from "@mastra/core";
import { Observability } from "@mastra/observability";
import { OtelExporter } from "@mastra/otel-exporter";

import { mastraAgents } from "./agents/mastra-agents.js";
import { predictionMarketsWorkflow } from "./workflows/prediction-markets.js";
import { tradingCycleWorkflow } from "./workflows/trading-cycle/index.js";

const otelEndpoint = Bun.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";
const observabilityEnabled = Bun.env.OTEL_ENABLED !== "false";

/**
 * Mastra instance for the trading system.
 *
 * Registered agents (accessible via mastra.getAgent("agent_id")):
 * - grounding_agent: Real-time web search context via Gemini grounding
 * - news_analyst: News & Sentiment analysis
 * - fundamentals_analyst: Fundamentals & Macro analysis
 * - bullish_researcher: Bull case construction
 * - bearish_researcher: Bear case construction
 * - trader: Decision plan synthesis
 * - risk_manager: Risk validation
 * - critic: Logical consistency check
 * - idea_agent: Alpha factor hypothesis generation
 *
 * Registered workflows:
 * - tradingCycleWorkflow: OODA loop trading cycle
 * - predictionMarketsWorkflow: Prediction market data fetching
 *
 * Observability:
 * - Traces: Agent runs, LLM generations, tool calls, workflow steps
 * - Metrics: Token usage, latency, error rates
 * - Export: OpenObserve via OTLP (configurable endpoint)
 */
export const mastra = new Mastra({
	agents: mastraAgents,
	workflows: {
		tradingCycleWorkflow,
		predictionMarketsWorkflow,
	},
	observability: observabilityEnabled
		? new Observability({
				configs: {
					otel: {
						serviceName: "cream-api",
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

// Exports
export { predictionMarketsWorkflow, tradingCycleWorkflow };
