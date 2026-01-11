/**
 * Trading Cycle Configuration
 *
 * Config loading and agent config building for the trading cycle workflow.
 */

import { type FullRuntimeConfig, RuntimeConfigError } from "@cream/config";
import type { ExecutionContext } from "@cream/domain";

import type { AgentConfigEntry } from "../../../agents/mastra-agents.js";
import { getRuntimeConfigService, type RuntimeEnvironment } from "../../../db.js";

// ============================================
// Default Timeout Configuration
// ============================================

export const DEFAULT_AGENT_TIMEOUT_MS = 1_800_000; // 30 minutes per agent (LLMs can be slow)
export const DEFAULT_TOTAL_CONSENSUS_TIMEOUT_MS = 300_000; // 5 minutes total
export const DEFAULT_MAX_CONSENSUS_ITERATIONS = 3;

// ============================================
// Agent Types
// ============================================

export type AgentType =
  | "technical_analyst"
  | "news_analyst"
  | "fundamentals_analyst"
  | "bullish_researcher"
  | "bearish_researcher"
  | "trader"
  | "risk_manager"
  | "critic";

// ============================================
// Config Loading
// ============================================

/**
 * Load runtime config from database.
 * Returns null if config not available (will use defaults).
 */
export async function loadRuntimeConfig(
  ctx: ExecutionContext,
  useDraft: boolean
): Promise<FullRuntimeConfig | null> {
  try {
    const service = await getRuntimeConfigService();
    const environment = ctx.environment as RuntimeEnvironment;

    if (useDraft) {
      return await service.getDraft(environment);
    }
    return await service.getActiveConfig(environment);
  } catch (error) {
    if (error instanceof RuntimeConfigError && error.code === "NOT_SEEDED") {
      return null;
    }
    throw error;
  }
}

/**
 * Build agent configs from runtime config for AgentContext.
 * Returns undefined if no config available.
 */
export function buildAgentConfigs(
  runtimeConfig: FullRuntimeConfig | null
): Record<AgentType, AgentConfigEntry> | undefined {
  if (!runtimeConfig?.agents) {
    return undefined;
  }

  const result: Partial<Record<AgentType, AgentConfigEntry>> = {};
  for (const [agentType, config] of Object.entries(runtimeConfig.agents)) {
    result[agentType as AgentType] = {
      enabled: config.enabled,
      systemPromptOverride: config.systemPromptOverride,
    };
  }
  return result as Record<AgentType, AgentConfigEntry>;
}
