/**
 * Trader agent for synthesizing trading decisions.
 *
 * Synthesizes bullish and bearish research into concrete DecisionPlans.
 */

import type { AgentType } from "@cream/mastra-kit";

import { buildGenerateOptions, createAgent, getAgentRuntimeSettings } from "./factory.js";
import { buildFactorZooContext, buildIndicatorContext } from "./prompts.js";
import { DecisionPlanSchema } from "./schemas.js";
import type {
  AgentConfigEntry,
  AgentContext,
  AgentStreamChunk,
  BearishResearchOutput,
  BullishResearchOutput,
  DecisionPlan,
  FundamentalsAnalysisOutput,
  OnStreamChunk,
  SentimentAnalysisOutput,
} from "./types.js";

// ============================================
// Agent Instance
// ============================================

/** Trader - Synthesizes into DecisionPlan */
export const traderAgent = createAgent("trader");

// ============================================
// Types
// ============================================

export interface DebateOutputs {
  bullish: BullishResearchOutput[];
  bearish: BearishResearchOutput[];
}

// ============================================
// Execution Functions
// ============================================

/**
 * Run Trader agent to synthesize DecisionPlan.
 * Incorporates Factor Zoo signals (Mega-Alpha) and comprehensive indicators when available.
 */
export async function runTrader(
  context: AgentContext,
  debateOutputs: DebateOutputs,
  portfolioState?: Record<string, unknown>
): Promise<DecisionPlan> {
  const factorZooContext = buildFactorZooContext(context.factorZoo);
  const indicatorContext = buildIndicatorContext(context.indicators);

  const prompt = `Synthesize the debate into a concrete trading plan:

Bullish Research:
${JSON.stringify(debateOutputs.bullish, null, 2)}

Bearish Research:
${JSON.stringify(debateOutputs.bearish, null, 2)}
${factorZooContext}${indicatorContext}
Current Portfolio State:
${JSON.stringify(portfolioState ?? {}, null, 2)}

Cycle ID: ${context.cycleId}
Timestamp: ${new Date().toISOString()}

POSITION SIZING GUIDANCE from indicators:
- Use ATR for stop-loss distance calculations (ATR multiples)
- Consider volatility (realized_vol, ATM IV) for position sizing
- Liquidity metrics (bid_ask_spread, volume_ratio) inform execution
- Short interest > 20% signals potential squeeze risk
${
  context.factorZoo
    ? `
FACTOR ZOO SIGNALS:
- Mega-Alpha signal (${context.factorZoo.megaAlpha.toFixed(3)}) represents ${context.factorZoo.stats.activeCount} active factors
- Use Mega-Alpha direction to inform overall market stance
- Weight position sizing by signal strength
- Be cautious of factors showing decay (IC degradation)`
    : ""
}`;

  const settings = getAgentRuntimeSettings("trader", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: DecisionPlanSchema });

  const response = await traderAgent.generate([{ role: "user", content: prompt }], options);

  return response.object as DecisionPlan;
}

// ============================================
// Streaming Functions
// ============================================

/**
 * Process stream chunks and emit via callback.
 */
function processStreamChunk(
  chunk: { type: string; payload: Record<string, unknown> },
  agentType: AgentType,
  onChunk: OnStreamChunk
): void {
  const streamChunk: AgentStreamChunk = {
    type: chunk.type as AgentStreamChunk["type"],
    agentType,
    payload: {},
    timestamp: new Date().toISOString(),
  };

  switch (chunk.type) {
    case "text-delta":
      streamChunk.payload.text = chunk.payload.text as string;
      onChunk(streamChunk);
      break;
    case "tool-call":
      streamChunk.payload.toolName = chunk.payload.toolName as string;
      streamChunk.payload.toolArgs = chunk.payload.args as Record<string, unknown>;
      streamChunk.payload.toolCallId = chunk.payload.toolCallId as string;
      onChunk(streamChunk);
      break;
    case "tool-result":
      streamChunk.payload.toolCallId = chunk.payload.toolCallId as string;
      streamChunk.payload.result = chunk.payload.result;
      streamChunk.payload.success = true;
      onChunk(streamChunk);
      break;
    case "reasoning-delta":
      streamChunk.payload.text = chunk.payload.text as string;
      onChunk(streamChunk);
      break;
    case "error":
      streamChunk.payload.error =
        chunk.payload.error instanceof Error
          ? chunk.payload.error.message
          : String(chunk.payload.error);
      onChunk(streamChunk);
      break;
  }
}

/**
 * Run Trader agent with streaming.
 */
export async function runTraderStreaming(
  context: AgentContext,
  debateOutputs: DebateOutputs,
  onChunk: OnStreamChunk,
  portfolioState?: Record<string, unknown>
): Promise<DecisionPlan> {
  const factorZooContext = buildFactorZooContext(context.factorZoo);
  const indicatorContext = buildIndicatorContext(context.indicators);

  const prompt = `Synthesize the debate into a concrete trading plan:

Bullish Research:
${JSON.stringify(debateOutputs.bullish, null, 2)}

Bearish Research:
${JSON.stringify(debateOutputs.bearish, null, 2)}
${factorZooContext}${indicatorContext}
Current Portfolio State:
${JSON.stringify(portfolioState ?? {}, null, 2)}

Cycle ID: ${context.cycleId}
Timestamp: ${new Date().toISOString()}

POSITION SIZING GUIDANCE from indicators:
- Use ATR for stop-loss distance calculations (ATR multiples)
- Consider volatility (realized_vol, ATM IV) for position sizing
- Liquidity metrics (bid_ask_spread, volume_ratio) inform execution
- Short interest > 20% signals potential squeeze risk
${
  context.factorZoo
    ? `
FACTOR ZOO SIGNALS:
- Mega-Alpha signal (${context.factorZoo.megaAlpha.toFixed(3)}) represents ${context.factorZoo.stats.activeCount} active factors
- Use Mega-Alpha direction to inform overall market stance
- Weight position sizing by signal strength
- Be cautious of factors showing decay (IC degradation)`
    : ""
}`;

  const settings = getAgentRuntimeSettings("trader", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: DecisionPlanSchema });

  const stream = await traderAgent.stream([{ role: "user", content: prompt }], options);

  for await (const chunk of stream.fullStream) {
    processStreamChunk(
      chunk as { type: string; payload: Record<string, unknown> },
      "trader",
      onChunk
    );
  }

  return (await stream.object) as DecisionPlan;
}

// ============================================
// Plan Revision
// ============================================

export interface AnalystOutputs {
  news: SentimentAnalysisOutput[];
  fundamentals: FundamentalsAnalysisOutput[];
}

/**
 * Revise a plan based on rejection feedback.
 */
export async function revisePlan(
  originalPlan: DecisionPlan,
  rejectionReasons: string[],
  _analystOutputs: AnalystOutputs,
  debateOutputs: DebateOutputs,
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>,
  abortSignal?: AbortSignal
): Promise<DecisionPlan> {
  const prompt = `Revise the following trading plan based on the rejection feedback:

Original Plan:
${JSON.stringify(originalPlan, null, 2)}

Rejection Reasons:
${rejectionReasons.map((r) => `- ${r}`).join("\n")}

Supporting Context (for reference):
Bullish Research: ${JSON.stringify(debateOutputs.bullish, null, 2)}
Bearish Research: ${JSON.stringify(debateOutputs.bearish, null, 2)}

Please address ALL rejection reasons and produce a revised plan that:
1. Fixes all constraint violations
2. Addresses all logical inconsistencies
3. Removes any unsupported claims
4. Maintains proper stop-loss and take-profit levels`;

  const settings = getAgentRuntimeSettings("trader", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: DecisionPlanSchema });

  // Add abortSignal to options if provided
  if (abortSignal) {
    options.abortSignal = abortSignal;
  }

  const response = await traderAgent.generate([{ role: "user", content: prompt }], options);

  return response.object as DecisionPlan;
}
