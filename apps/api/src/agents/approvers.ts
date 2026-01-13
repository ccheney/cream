/**
 * Approval agents for validating trading decisions.
 *
 * Contains Risk Manager and Critic agents for plan validation.
 */

import type { AgentType } from "@cream/agents";
import type { IndicatorSnapshot } from "@cream/indicators";

import type { AnalystOutputs } from "./analysts.js";
import { buildGenerateOptions, createAgent, getAgentRuntimeSettings } from "./factory.js";
import { buildDatetimeContext, buildIndicatorSummary } from "./prompts.js";
import { CriticOutputSchema, RiskManagerOutputSchema } from "./schemas.js";
import type { DebateOutputs } from "./trader.js";
import type {
  AgentConfigEntry,
  AgentContext,
  AgentStreamChunk,
  CriticOutput,
  DecisionPlan,
  OnStreamChunk,
  RiskManagerOutput,
} from "./types.js";

// Re-export for convenience
export type { AnalystOutputs, DebateOutputs };

// ============================================
// Agent Instances
// ============================================

/** Risk Manager - Validates against constraints */
export const riskManagerAgent = createAgent("risk_manager");

/** Critic - Checks logical consistency */
export const criticAgent = createAgent("critic");

// ============================================
// Execution Functions
// ============================================

/**
 * Spread threshold configuration by trading session.
 * Pre/post-market naturally have wider spreads due to lower liquidity.
 */
const SPREAD_THRESHOLDS = {
  RTH: 0.005, // 0.5% during regular trading hours
  PRE_MARKET: 0.03, // 3% during pre-market (expected to be wider)
  AFTER_HOURS: 0.03, // 3% during after-hours
  CLOSED: 0.05, // 5% when market is closed (stale quotes)
} as const;

/**
 * Build risk indicators summary from snapshots.
 * Session-aware spread checks use appropriate thresholds for pre/post-market.
 */
function buildRiskIndicatorsSummary(indicators?: Record<string, IndicatorSnapshot>): string {
  if (!indicators || Object.keys(indicators).length === 0) {
    return "";
  }

  const lines: string[] = ["Risk-Relevant Indicators:"];

  for (const [symbol, snapshot] of Object.entries(indicators)) {
    const riskParts: string[] = [];
    const session = snapshot.metadata.trading_session ?? "RTH";

    // Volatility metrics
    if (snapshot.price.realized_vol_20d !== null) {
      riskParts.push(`RV=${(snapshot.price.realized_vol_20d * 100).toFixed(1)}%`);
    }
    if (snapshot.options.atm_iv !== null) {
      riskParts.push(`IV=${(snapshot.options.atm_iv * 100).toFixed(1)}%`);
    }
    if (snapshot.price.atr_14 !== null) {
      riskParts.push(`ATR=${snapshot.price.atr_14.toFixed(2)}`);
    }

    // Liquidity risk - session-aware thresholds
    if (snapshot.liquidity.bid_ask_spread_pct !== null) {
      const threshold = SPREAD_THRESHOLDS[session];
      const isWide = snapshot.liquidity.bid_ask_spread_pct > threshold;
      const sessionTag = session !== "RTH" ? ` (${session})` : "";
      const spreadWarning = isWide ? " [WIDE]" : "";
      riskParts.push(
        `Spread=${(snapshot.liquidity.bid_ask_spread_pct * 100).toFixed(2)}%${sessionTag}${spreadWarning}`
      );
    }

    // Short squeeze risk
    if (
      snapshot.short_interest.short_pct_float !== null &&
      snapshot.short_interest.short_pct_float > 0.1
    ) {
      riskParts.push(
        `SI=${(snapshot.short_interest.short_pct_float * 100).toFixed(1)}% [ELEVATED]`
      );
    }

    // Options sentiment
    if (snapshot.options.put_call_ratio_volume !== null) {
      const pcSignal =
        snapshot.options.put_call_ratio_volume > 1.2
          ? " [BEARISH]"
          : snapshot.options.put_call_ratio_volume < 0.7
            ? " [BULLISH]"
            : "";
      riskParts.push(`P/C=${snapshot.options.put_call_ratio_volume.toFixed(2)}${pcSignal}`);
    }

    if (riskParts.length > 0) {
      lines.push(`- ${symbol}: ${riskParts.join(", ")}`);
    }
  }

  return lines.length > 1 ? `\n${lines.join("\n")}\n` : "";
}

/**
 * Run Risk Manager agent to validate plan.
 * Considers Factor Zoo decay alerts and risk indicators.
 */
export async function runRiskManager(
  plan: DecisionPlan,
  portfolioState?: Record<string, unknown>,
  constraints?: Record<string, unknown>,
  factorZooContext?: AgentContext["factorZoo"],
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>,
  indicators?: Record<string, IndicatorSnapshot>
): Promise<RiskManagerOutput> {
  const decayRiskSection = factorZooContext?.decayAlerts.length
    ? `
Factor Zoo Risk Alerts:
${factorZooContext.decayAlerts.map((a) => `- ${a.factorId}: ${a.alertType} (${a.severity}) - ${a.recommendation}`).join("\n")}

NOTE: Decaying factors indicate reduced signal reliability. Consider this when validating positions that rely on quantitative signals.`
    : "";

  const riskIndicatorsSummary = buildRiskIndicatorsSummary(indicators);

  const prompt = `${buildDatetimeContext()}Validate this trading plan against risk constraints:

Decision Plan:
${JSON.stringify(plan, null, 2)}

Current Portfolio State:
${JSON.stringify(portfolioState ?? {}, null, 2)}

Risk Constraints:
${JSON.stringify(constraints ?? {}, null, 2)}${riskIndicatorsSummary}${decayRiskSection}
RISK VALIDATION GUIDANCE:
- High volatility (IV > 50%, RV > 30%) warrants smaller position sizes
- Bid-ask spread thresholds are session-aware: RTH > 0.5% is wide, pre/post-market > 3% is wide
- Pre-market and after-hours spreads are naturally wider - only flag as liquidity risk if exceeding session threshold
- Short interest > 20% of float signals squeeze risk for short positions
- ATR should inform stop-loss distances (use 2-3x ATR minimum)
- Put/Call > 1.2 suggests market expects downside - validate long positions carefully`;

  const settings = getAgentRuntimeSettings("risk_manager", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: RiskManagerOutputSchema });

  const response = await riskManagerAgent.generate([{ role: "user", content: prompt }], options);

  return response.object as RiskManagerOutput;
}

/**
 * Run Critic agent to check logical consistency.
 * Validates that plan claims are supported by indicator signals.
 */
export async function runCritic(
  plan: DecisionPlan,
  analystOutputs: AnalystOutputs,
  debateOutputs: DebateOutputs,
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>,
  indicators?: Record<string, IndicatorSnapshot>
): Promise<CriticOutput> {
  const indicatorSummary = buildIndicatorSummary(indicators);

  const prompt = `${buildDatetimeContext()}Validate the logical consistency of this trading plan:

Decision Plan:
${JSON.stringify(plan, null, 2)}

Supporting Analyst Outputs:
News: ${JSON.stringify(analystOutputs.news, null, 2)}
Fundamentals: ${JSON.stringify(analystOutputs.fundamentals, null, 2)}

Debate Outputs:
Bullish: ${JSON.stringify(debateOutputs.bullish, null, 2)}
Bearish: ${JSON.stringify(debateOutputs.bearish, null, 2)}
${indicatorSummary ? `\n${indicatorSummary}` : ""}
CONSISTENCY VALIDATION GUIDANCE:
- Verify bullish claims align with technical signals (RSI, MACD, trend)
- Check if bearish concerns are reflected in options sentiment (P/C ratio, IV)
- Ensure position direction matches the weight of evidence from indicators
- Flag contradictions between plan rationale and quantitative signals
- Verify that size/conviction aligns with signal strength and agreement`;

  const settings = getAgentRuntimeSettings("critic", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: CriticOutputSchema });

  const response = await criticAgent.generate([{ role: "user", content: prompt }], options);

  return response.object as CriticOutput;
}

/**
 * Run both approval agents in parallel.
 * Passes Factor Zoo context and indicators to both Risk Manager and Critic for comprehensive validation.
 */
export async function runApprovalParallel(
  plan: DecisionPlan,
  analystOutputs: AnalystOutputs,
  debateOutputs: DebateOutputs,
  portfolioState?: Record<string, unknown>,
  constraints?: Record<string, unknown>,
  factorZooContext?: AgentContext["factorZoo"],
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>,
  indicators?: Record<string, IndicatorSnapshot>
): Promise<{
  riskManager: RiskManagerOutput;
  critic: CriticOutput;
}> {
  const [riskManager, critic] = await Promise.all([
    runRiskManager(plan, portfolioState, constraints, factorZooContext, agentConfigs, indicators),
    runCritic(plan, analystOutputs, debateOutputs, agentConfigs, indicators),
  ]);

  return { riskManager, critic };
}

// ============================================
// Streaming Functions
// ============================================

/**
 * Process stream chunks and emit via callback.
 * Handles Gemini grounding sources as google_search tool calls for UI visibility.
 */
function processStreamChunk(
  chunk: { type: string; payload?: Record<string, unknown>; [key: string]: unknown },
  agentType: AgentType,
  onChunk: OnStreamChunk
): void {
  const timestamp = new Date().toISOString();

  // Handle Gemini grounding source chunks as google_search tool calls
  if (chunk.type === "source" && chunk.sourceType === "url") {
    const sourceId = (chunk.id as string) ?? `source-${Date.now()}`;

    onChunk({
      type: "tool-call",
      agentType,
      payload: {
        toolName: "google_search",
        toolCallId: sourceId,
        toolArgs: { query: chunk.title as string },
      },
      timestamp,
    });

    onChunk({
      type: "tool-result",
      agentType,
      payload: {
        toolCallId: sourceId,
        toolName: "google_search",
        result: { title: chunk.title, url: chunk.url, sourceType: chunk.sourceType },
        success: true,
      },
      timestamp,
    });
    return;
  }

  const payload = chunk.payload ?? {};
  const streamChunk: AgentStreamChunk = {
    type: chunk.type as AgentStreamChunk["type"],
    agentType,
    payload: {},
    timestamp,
  };

  switch (chunk.type) {
    case "text-delta":
      streamChunk.payload.text = payload.text as string;
      onChunk(streamChunk);
      break;
    case "tool-call":
      streamChunk.payload.toolName = payload.toolName as string;
      streamChunk.payload.toolArgs = payload.args as Record<string, unknown>;
      streamChunk.payload.toolCallId = payload.toolCallId as string;
      onChunk(streamChunk);
      break;
    case "tool-result":
      streamChunk.payload.toolCallId = payload.toolCallId as string;
      streamChunk.payload.result = payload.result;
      streamChunk.payload.success = true;
      onChunk(streamChunk);
      break;
    case "reasoning-delta":
      streamChunk.payload.text = payload.text as string;
      onChunk(streamChunk);
      break;
    case "error":
      streamChunk.payload.error =
        payload.error instanceof Error ? payload.error.message : String(payload.error);
      onChunk(streamChunk);
      break;
  }
}

/**
 * Run Risk Manager agent with streaming.
 */
export async function runRiskManagerStreaming(
  plan: DecisionPlan,
  onChunk: OnStreamChunk,
  portfolioState?: Record<string, unknown>,
  constraints?: Record<string, unknown>,
  factorZooContext?: AgentContext["factorZoo"],
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>,
  indicators?: Record<string, IndicatorSnapshot>,
  abortSignal?: AbortSignal
): Promise<RiskManagerOutput> {
  const decayRiskSection = factorZooContext?.decayAlerts.length
    ? `
Factor Zoo Risk Alerts:
${factorZooContext.decayAlerts.map((a) => `- ${a.factorId}: ${a.alertType} (${a.severity}) - ${a.recommendation}`).join("\n")}

NOTE: Decaying factors indicate reduced signal reliability. Consider this when validating positions that rely on quantitative signals.`
    : "";

  const riskIndicatorsSummary = buildRiskIndicatorsSummary(indicators);

  const prompt = `${buildDatetimeContext()}Validate this trading plan against risk constraints:

Decision Plan:
${JSON.stringify(plan, null, 2)}

Current Portfolio State:
${JSON.stringify(portfolioState ?? {}, null, 2)}

Risk Constraints:
${JSON.stringify(constraints ?? {}, null, 2)}${riskIndicatorsSummary}${decayRiskSection}
RISK VALIDATION GUIDANCE:
- High volatility (IV > 50%, RV > 30%) warrants smaller position sizes
- Bid-ask spread thresholds are session-aware: RTH > 0.5% is wide, pre/post-market > 3% is wide
- Pre-market and after-hours spreads are naturally wider - only flag as liquidity risk if exceeding session threshold
- Short interest > 20% of float signals squeeze risk for short positions
- ATR should inform stop-loss distances (use 2-3x ATR minimum)
- Put/Call > 1.2 suggests market expects downside - validate long positions carefully`;

  const settings = getAgentRuntimeSettings("risk_manager", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: RiskManagerOutputSchema });

  // Add abortSignal to options if provided
  if (abortSignal) {
    options.abortSignal = abortSignal;
  }

  let stream: Awaited<ReturnType<typeof riskManagerAgent.stream>>;
  try {
    stream = await riskManagerAgent.stream([{ role: "user", content: prompt }], options);
  } catch (err) {
    console.error("[risk_manager] Failed to create stream:", err);
    throw err;
  }

  try {
    for await (const chunk of stream.fullStream) {
      // Check if aborted during streaming
      if (abortSignal?.aborted) {
        throw new Error("AbortError: Risk Manager streaming was aborted");
      }
      processStreamChunk(
        chunk as { type: string; payload: Record<string, unknown> },
        "risk_manager",
        onChunk
      );
    }
  } catch (err) {
    console.error("[risk_manager] Error during stream iteration:", err);
    throw err;
  }

  let result: RiskManagerOutput | undefined;
  try {
    result = (await stream.object) as RiskManagerOutput | undefined;
  } catch (err) {
    console.error("[risk_manager] Error awaiting stream.object:", err);
  }

  if (!result) {
    console.error("[risk_manager] Structured output undefined after streaming");
    console.error("[risk_manager] Stream text:", await stream.text);
    console.error("[risk_manager] Stream usage:", await stream.usage);
    // Check if there's a finishReason or other metadata
    const response = await stream.response;
    console.error("[risk_manager] Stream response headers:", response?.headers);
  }
  return result as RiskManagerOutput;
}

/**
 * Run Critic agent with streaming.
 * Validates that plan claims are supported by indicator signals.
 */
export async function runCriticStreaming(
  plan: DecisionPlan,
  analystOutputs: AnalystOutputs,
  debateOutputs: DebateOutputs,
  onChunk: OnStreamChunk,
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>,
  indicators?: Record<string, IndicatorSnapshot>,
  abortSignal?: AbortSignal
): Promise<CriticOutput> {
  const indicatorSummary = buildIndicatorSummary(indicators);

  const prompt = `${buildDatetimeContext()}Validate the logical consistency of this trading plan:

Decision Plan:
${JSON.stringify(plan, null, 2)}

Supporting Analyst Outputs:
News: ${JSON.stringify(analystOutputs.news, null, 2)}
Fundamentals: ${JSON.stringify(analystOutputs.fundamentals, null, 2)}

Debate Outputs:
Bullish: ${JSON.stringify(debateOutputs.bullish, null, 2)}
Bearish: ${JSON.stringify(debateOutputs.bearish, null, 2)}
${indicatorSummary ? `\n${indicatorSummary}` : ""}
CONSISTENCY VALIDATION GUIDANCE:
- Verify bullish claims align with technical signals (RSI, MACD, trend)
- Check if bearish concerns are reflected in options sentiment (P/C ratio, IV)
- Ensure position direction matches the weight of evidence from indicators
- Flag contradictions between plan rationale and quantitative signals
- Verify that size/conviction aligns with signal strength and agreement`;

  const settings = getAgentRuntimeSettings("critic", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: CriticOutputSchema });

  // Add abortSignal to options if provided
  if (abortSignal) {
    options.abortSignal = abortSignal;
  }

  let stream: Awaited<ReturnType<typeof criticAgent.stream>>;
  try {
    stream = await criticAgent.stream([{ role: "user", content: prompt }], options);
  } catch (err) {
    console.error("[critic] Failed to create stream:", err);
    throw err;
  }

  try {
    for await (const chunk of stream.fullStream) {
      // Check if aborted during streaming
      if (abortSignal?.aborted) {
        throw new Error("AbortError: Critic streaming was aborted");
      }
      processStreamChunk(
        chunk as { type: string; payload: Record<string, unknown> },
        "critic",
        onChunk
      );
    }
  } catch (err) {
    console.error("[critic] Error during stream iteration:", err);
    throw err;
  }

  let result: CriticOutput | undefined;
  try {
    result = (await stream.object) as CriticOutput | undefined;
  } catch (err) {
    console.error("[critic] Error awaiting stream.object:", err);
  }

  if (!result) {
    console.error("[critic] Structured output undefined after streaming");
    console.error("[critic] Stream text:", await stream.text);
    console.error("[critic] Stream usage:", await stream.usage);
    // Check if there's a finishReason or other metadata
    const response = await stream.response;
    console.error("[critic] Stream response headers:", response?.headers);
  }
  return result as CriticOutput;
}

/**
 * Run both approval agents in parallel with streaming.
 * Passes indicators to both Risk Manager and Critic for comprehensive validation.
 */
export async function runApprovalParallelStreaming(
  plan: DecisionPlan,
  analystOutputs: AnalystOutputs,
  debateOutputs: DebateOutputs,
  onChunk: OnStreamChunk,
  portfolioState?: Record<string, unknown>,
  constraints?: Record<string, unknown>,
  factorZooContext?: AgentContext["factorZoo"],
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>,
  indicators?: Record<string, IndicatorSnapshot>,
  abortSignal?: AbortSignal
): Promise<{
  riskManager: RiskManagerOutput;
  critic: CriticOutput;
}> {
  const [riskManager, critic] = await Promise.all([
    runRiskManagerStreaming(
      plan,
      onChunk,
      portfolioState,
      constraints,
      factorZooContext,
      agentConfigs,
      indicators,
      abortSignal
    ),
    runCriticStreaming(
      plan,
      analystOutputs,
      debateOutputs,
      onChunk,
      agentConfigs,
      indicators,
      abortSignal
    ),
  ]);

  return { riskManager, critic };
}
