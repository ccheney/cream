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
  extractTranscriptTool,
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
import {
  DEFAULT_GLOBAL_MODEL,
  type GlobalModel,
  getModelId as getGlobalModelId,
} from "@cream/domain";
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import type { Tool } from "@mastra/core/tools";
import type { z } from "zod";

import { log } from "../logger.js";
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
  extract_transcript: extractTranscriptTool,
  analyze_content: analyzeContentTool,
  get_prediction_signals: getPredictionSignalsTool,
  get_market_snapshots: getMarketSnapshotsTool,
};

/**
 * Get the Mastra-compatible model ID for the global model setting.
 * Falls back to default (flash) if invalid model is passed.
 */
export function getModelIdForRuntime(model: string | undefined): string {
  if (model?.includes("/")) {
    return model;
  }
  return getGlobalModelId((model as GlobalModel) ?? DEFAULT_GLOBAL_MODEL);
}

/**
 * Create a Mastra Agent from our config.
 * Uses dynamic model selection to allow runtime model override via RequestContext.
 * Resolves tool instances from TOOL_INSTANCES registry based on config.tools.
 */
export function createAgent(agentType: AgentType): Agent {
  const config = AGENT_CONFIGS[agentType];
  const systemPrompt = AGENT_PROMPTS[agentType];

  // biome-ignore lint/suspicious/noExplicitAny: Mastra tools have varying generic types
  const tools: Record<string, any> = {};

  for (const toolName of config.tools) {
    if (toolName === "google_search") {
      tools.google_search = google.tools.googleSearch({});
    } else {
      const tool = TOOL_INSTANCES[toolName];
      if (tool) {
        tools[toolName] = tool;
      } else {
        log.warn({ toolName, agentType }, "Tool not found in TOOL_INSTANCES for agent");
      }
    }
  }

  const dynamicModel = ({ requestContext }: { requestContext: RequestContext }) => {
    const runtimeModel = requestContext?.get("model") as string | undefined;
    return getModelIdForRuntime(runtimeModel);
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
export function createRequestContext(model?: string): RequestContext {
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
 * Note: providerOptions is omitted from the type but included at runtime.
 * Mastra's ProviderOptions type is complex; runtime value is type-safe through AI SDK.
 */
export interface GenerateOptions {
  structuredOutput: { schema: z.ZodType };
  requestContext: RequestContext;
  instructions?: string;
  abortSignal?: AbortSignal;
}

/**
 * Build generation options with runtime context and optional instruction override.
 * Enables Gemini 3 thinking/reasoning output at medium level.
 * Uses model's default temperature (1.0).
 *
 * Note: providerOptions is included at runtime for Gemini thinking configuration
 * but omitted from return type to satisfy Mastra's complex type constraints.
 */
export function buildGenerateOptions(
  settings: AgentRuntimeSettings,
  structuredOutput: { schema: z.ZodType }
): GenerateOptions {
  // Return type is GenerateOptions but object includes providerOptions for Gemini thinking
  // TypeScript allows extra properties when passed to functions
  return {
    structuredOutput,
    requestContext: createRequestContext(settings.model),
    instructions: settings.systemPromptOverride,
    providerOptions: {
      google: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingLevel: "medium",
        },
      },
    },
  } as GenerateOptions;
}
