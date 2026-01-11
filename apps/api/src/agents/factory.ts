/**
 * Agent factory and utilities for creating Mastra agents.
 *
 * Contains the agent factory, tool registry, and runtime configuration utilities.
 */

import {
  DEFAULT_GLOBAL_MODEL,
  type GlobalModel,
  getModelId as getGlobalModelId,
} from "@cream/domain";
import {
  AGENT_CONFIGS,
  AGENT_PROMPTS,
  type AgentType,
  analyzeContentTool,
  economicCalendarTool,
  extractNewsContextTool,
  extractTranscriptTool,
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
  webSearchTool,
} from "@cream/mastra-kit";
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import type { Tool } from "@mastra/core/tools";
import type { z } from "zod";

import { log } from "../logger.js";
import type { AgentConfigEntry, AgentRuntimeSettings } from "./types.js";

/**
 * Default temperature for agent generation (deterministic outputs for trading decisions).
 * Not configurable - hardcoded for consistency and safety.
 */
export const DEFAULT_TEMPERATURE = 0.3;

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
  economic_calendar: economicCalendarTool,
  news_search: newsSearchTool,
  graphrag_query: graphragQueryTool,
  helix_query: helixQueryTool,
  web_search: webSearchTool,
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
  const tools: Record<string, Tool<any, any>> = {};
  for (const toolName of config.tools) {
    const tool = TOOL_INSTANCES[toolName];
    if (tool) {
      tools[toolName] = tool;
    } else {
      log.warn({ toolName, agentType }, "Tool not found in TOOL_INSTANCES for agent");
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
 * Build generation options with model settings, runtime context, and optional instruction override.
 * Uses fixed temperature (0.3) and model's natural max tokens.
 */
export function buildGenerateOptions(
  settings: AgentRuntimeSettings,
  structuredOutput: { schema: z.ZodType }
): {
  structuredOutput: { schema: z.ZodType };
  modelSettings: { temperature: number };
  requestContext: RequestContext;
  instructions?: string;
} {
  const options: {
    structuredOutput: { schema: z.ZodType };
    modelSettings: { temperature: number };
    requestContext: RequestContext;
    instructions?: string;
  } = {
    structuredOutput,
    modelSettings: {
      temperature: DEFAULT_TEMPERATURE,
    },
    requestContext: createRequestContext(settings.model),
  };

  if (settings.systemPromptOverride) {
    options.instructions = settings.systemPromptOverride;
  }

  return options;
}
