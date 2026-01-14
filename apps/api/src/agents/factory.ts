/**
 * Agent factory and utilities for creating Mastra agents.
 *
 * Contains the agent factory, tool registry, and runtime configuration utilities.
 */

import { google } from "@ai-sdk/google";
import {
	AGENT_CONFIGS,
	AGENT_PROMPTS,
	type AgentType,
	analyzeContentTool,
	extractNewsContextTool,
	fredEconomicCalendarTool,
	getGreeksTool,
	getMarketSnapshotsTool,
	getOptionChainTool,
	getPortfolioStateTool,
	getPredictionSignalsTool,
	getQuotesTool,
	graphragQueryTool,
	helixQueryTool,
	newsSearchTool,
	recalcIndicatorTool,
} from "@cream/agents";
import { type GlobalModel, getFullModelId, getModelId as getGlobalModelId } from "@cream/domain";
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import type { Tool } from "@mastra/core/tools";
import { wrapLanguageModel } from "ai";
import type { z } from "zod";
import { log } from "../logger.js";
import { geminiThoughtSignatureMiddleware } from "./gemini-middleware.js";
import type { AgentConfigEntry, AgentRuntimeSettings } from "./types.js";

/**
 * Maps config tool names to actual Mastra tool instances.
 * Tools not in this registry will be logged as warnings but won't fail agent creation.
 */
// biome-ignore lint/suspicious/noExplicitAny: Mastra tools have varying generic types
const TOOL_INSTANCES: Record<string, Tool<any, any>> = {
	get_quotes: getQuotesTool,
	get_portfolio_state: getPortfolioStateTool,
	option_chain: getOptionChainTool,
	get_greeks: getGreeksTool,
	recalc_indicator: recalcIndicatorTool,
	fred_economic_calendar: fredEconomicCalendarTool,
	news_search: newsSearchTool,
	graphrag_query: graphragQueryTool,
	helix_query: helixQueryTool,
	extract_news_context: extractNewsContextTool,
	analyze_content: analyzeContentTool,
	get_prediction_signals: getPredictionSignalsTool,
	get_market_snapshots: getMarketSnapshotsTool,
};

/**
 * Get the Mastra-compatible model ID for the global model setting.
 * Uses env var model if no model is specified.
 */
export function getModelIdForRuntime(model: string | undefined): string {
	if (model?.includes("/")) {
		return model;
	}
	// If model is provided, use it; otherwise use env var default
	return model ? getGlobalModelId(model as GlobalModel) : getFullModelId();
}

/**
 * Extract the model name from a Mastra model ID.
 * e.g., "google/gemini-3-flash-preview" -> "gemini-3-flash-preview"
 */
function extractModelName(modelId: string): string {
	const parts = modelId.split("/");
	const modelName = parts[1];
	return modelName ?? modelId;
}

/**
 * Create a Google model instance wrapped with thought signature middleware.
 * This is required for Gemini 3 models which need thought signatures during
 * multi-turn tool calling.
 *
 * @see https://ai.google.dev/gemini-api/docs/thought-signatures
 */
function createWrappedGoogleModel(modelId: string) {
	const modelName = extractModelName(modelId);
	const baseModel = google(modelName);

	return wrapLanguageModel({
		model: baseModel,
		middleware: geminiThoughtSignatureMiddleware,
	});
}

/**
 * Create a Mastra Agent from our config.
 * Uses dynamic model selection to allow runtime model override via RequestContext.
 * Resolves tool instances from TOOL_INSTANCES registry based on config.tools.
 *
 * The model is wrapped with thought signature middleware for Gemini 3 compatibility.
 * @see https://ai.google.dev/gemini-api/docs/thought-signatures
 */
export function createAgent(agentType: AgentType): Agent {
	const config = AGENT_CONFIGS[agentType];
	const systemPrompt = AGENT_PROMPTS[agentType];

	// biome-ignore lint/suspicious/noExplicitAny: Mastra tools have varying generic types
	const tools: Record<string, any> = {};
	const shouldEnableNativeGoogleSearch =
		config.tools.includes("google_search") &&
		config.tools.filter((t) => t !== "google_search").length === 0;

	if (config.tools.includes("google_search") && !shouldEnableNativeGoogleSearch) {
		// Gemini does not support combining provider-defined tools (google_search, url_context, etc.)
		// with custom function tools in the same request. The Google provider drops function tools
		// when any provider tool is present, which makes agents appear to "never call tools".
		//
		// See: https://github.com/vercel/ai/issues/8258
		log.warn(
			{ agentType },
			"Skipping native google_search tool because it cannot be combined with function tools on Gemini"
		);
	}

	for (const toolName of config.tools) {
		if (toolName === "google_search") {
			if (shouldEnableNativeGoogleSearch) {
				tools.google_search = google.tools.googleSearch({});
			}
		} else {
			const tool = TOOL_INSTANCES[toolName];
			if (tool) {
				tools[toolName] = tool;
			} else {
				log.warn({ toolName, agentType }, "Tool not found in TOOL_INSTANCES for agent");
			}
		}
	}

	const toolNames = Object.keys(tools);
	log.info({ agentType, toolNames, toolCount: toolNames.length }, "Creating agent with tools");

	// Dynamic model selection with thought signature middleware for Gemini 3
	const dynamicModel = ({ requestContext }: { requestContext: RequestContext }) => {
		const runtimeModel = requestContext?.get("model") as string | undefined;
		const modelId = getModelIdForRuntime(runtimeModel);

		// Only wrap Google models with middleware
		if (modelId.startsWith("google/")) {
			return createWrappedGoogleModel(modelId);
		}

		// Non-Google models return as-is
		return modelId;
	};

	return new Agent({
		id: config.type,
		name: config.name,
		instructions: systemPrompt,
		model: dynamicModel,
		tools: Object.keys(tools).length > 0 ? tools : undefined,
	});
}

/**
 * Create a RequestContext with model configuration for runtime model selection.
 */
export function createRequestContext(model?: string | null): RequestContext {
	const ctx = new RequestContext();
	if (model) {
		ctx.set("model", model);
	}
	return ctx;
}

/**
 * Get runtime settings for an agent from context config.
 */
export function getAgentRuntimeSettings(
	agentType: AgentType,
	agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>
): AgentRuntimeSettings {
	const config = agentConfigs?.[agentType];
	if (config) {
		return {
			systemPromptOverride: config.systemPromptOverride,
		};
	}
	return {};
}

/**
 * Options returned by buildGenerateOptions.
 */
export interface GenerateOptions {
	structuredOutput: {
		schema: z.ZodType;
		model?: string;
	};
	requestContext: RequestContext;
	instructions?: string;
	abortSignal?: AbortSignal;
	maxSteps?: number;
	/**
	 * Provider-specific options for the underlying AI SDK model call.
	 * Used to enable Gemini 3 thinking (reasoning) streaming.
	 */
	providerOptions?: {
		google?: {
			thinkingConfig?: {
				includeThoughts?: boolean;
				thinkingLevel?: "minimal" | "low" | "medium" | "high";
			};
		};
	};
}

/**
 * Build generation options with runtime context and optional instruction override.
 * Uses model's default temperature (1.0).
 *
 * structuredOutput.model: Two-step approach for combining tools with structured output.
 * The main agent runs with tools and generates natural language. A secondary model
 * (Gemini Flash) then extracts structured data from that response.
 * This is required because Gemini doesn't support combining response_format with tools.
 * @see https://mastra.ai/docs/agents/structured-output
 *
 * Note: Gemini 3 thinking is enabled to stream reasoning ("thoughts") to the UI.
 * Gemini 3 also requires thought_signature handling for multi-turn tool calling when
 * thinking is enabled. We handle this via middleware that injects a bypass signature
 * into missing tool-call thought signatures (until upstream fixes land).
 * @see https://ai.google.dev/gemini-api/docs/thought-signatures
 */
export function buildGenerateOptions(
	settings: AgentRuntimeSettings,
	structuredOutput: { schema: z.ZodType }
): GenerateOptions {
	return {
		structuredOutput: {
			...structuredOutput,
			model: getFullModelId(),
		},
		requestContext: createRequestContext(settings.model),
		instructions: settings.systemPromptOverride ?? undefined,
		providerOptions: {
			google: {
				thinkingConfig: {
					includeThoughts: true,
					thinkingLevel: "medium",
				},
			},
		},
	};
}
