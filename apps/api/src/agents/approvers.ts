/**
 * Approval agents for validating trading decisions.
 *
 * Contains Risk Manager and Critic agents for plan validation.
 */

import type { IndicatorSnapshot } from "@cream/indicators";
import type { AgentType } from "@cream/mastra-kit";

import type { AnalystOutputs } from "./analysts.js";
import { buildGenerateOptions, createAgent, getAgentRuntimeSettings } from "./factory.js";
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
 * Build risk indicators summary from snapshots.
 */
function buildRiskIndicatorsSummary(indicators?: Record<string, IndicatorSnapshot>): string {
  if (!indicators || Object.keys(indicators).length === 0) {
    return "";
  }

  const lines: string[] = ["Risk-Relevant Indicators:"];

  for (const [symbol, snapshot] of Object.entries(indicators)) {
    const riskParts: string[] = [];

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

    // Liquidity risk
    if (snapshot.liquidity.bid_ask_spread_pct !== null) {
      const spreadWarning = snapshot.liquidity.bid_ask_spread_pct > 0.005 ? " [WIDE]" : "";
      riskParts.push(
        `Spread=${(snapshot.liquidity.bid_ask_spread_pct * 100).toFixed(2)}%${spreadWarning}`
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

  const prompt = `Validate this trading plan against risk constraints:

Decision Plan:
${JSON.stringify(plan, null, 2)}

Current Portfolio State:
${JSON.stringify(portfolioState ?? {}, null, 2)}

Risk Constraints:
${JSON.stringify(constraints ?? {}, null, 2)}${riskIndicatorsSummary}${decayRiskSection}
RISK VALIDATION GUIDANCE:
- High volatility (IV > 50%, RV > 30%) warrants smaller position sizes
- Wide bid-ask spreads (> 0.5%) indicate liquidity risk - reject large orders
- Short interest > 20% of float signals squeeze risk for short positions
- ATR should inform stop-loss distances (use 2-3x ATR minimum)
- Put/Call > 1.2 suggests market expects downside - validate long positions carefully`;

  const settings = getAgentRuntimeSettings("risk_manager", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: RiskManagerOutputSchema });
  options.modelSettings.temperature = 0.1;

  const response = await riskManagerAgent.generate([{ role: "user", content: prompt }], options);

  return response.object as RiskManagerOutput;
}

/**
 * Run Critic agent to check logical consistency.
 */
export async function runCritic(
  plan: DecisionPlan,
  analystOutputs: AnalystOutputs,
  debateOutputs: DebateOutputs,
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>
): Promise<CriticOutput> {
  const prompt = `Validate the logical consistency of this trading plan:

Decision Plan:
${JSON.stringify(plan, null, 2)}

Supporting Analyst Outputs:
News: ${JSON.stringify(analystOutputs.news, null, 2)}
Fundamentals: ${JSON.stringify(analystOutputs.fundamentals, null, 2)}

Debate Outputs:
Bullish: ${JSON.stringify(debateOutputs.bullish, null, 2)}
Bearish: ${JSON.stringify(debateOutputs.bearish, null, 2)}`;

  const settings = getAgentRuntimeSettings("critic", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: CriticOutputSchema });
  options.modelSettings.temperature = 0.1;

  const response = await criticAgent.generate([{ role: "user", content: prompt }], options);

  return response.object as CriticOutput;
}

/**
 * Run both approval agents in parallel.
 * Passes Factor Zoo context and indicators to Risk Manager for comprehensive validation.
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
    runCritic(plan, analystOutputs, debateOutputs, agentConfigs),
  ]);

  return { riskManager, critic };
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
 * Run Risk Manager agent with streaming.
 */
export async function runRiskManagerStreaming(
  plan: DecisionPlan,
  onChunk: OnStreamChunk,
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

  const prompt = `Validate this trading plan against risk constraints:

Decision Plan:
${JSON.stringify(plan, null, 2)}

Current Portfolio State:
${JSON.stringify(portfolioState ?? {}, null, 2)}

Risk Constraints:
${JSON.stringify(constraints ?? {}, null, 2)}${riskIndicatorsSummary}${decayRiskSection}
RISK VALIDATION GUIDANCE:
- High volatility (IV > 50%, RV > 30%) warrants smaller position sizes
- Wide bid-ask spreads (> 0.5%) indicate liquidity risk - reject large orders
- Short interest > 20% of float signals squeeze risk for short positions
- ATR should inform stop-loss distances (use 2-3x ATR minimum)
- Put/Call > 1.2 suggests market expects downside - validate long positions carefully`;

  const settings = getAgentRuntimeSettings("risk_manager", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: RiskManagerOutputSchema });
  options.modelSettings.temperature = 0.1;

  const stream = await riskManagerAgent.stream([{ role: "user", content: prompt }], options);

  for await (const chunk of stream.fullStream) {
    processStreamChunk(
      chunk as { type: string; payload: Record<string, unknown> },
      "risk_manager",
      onChunk
    );
  }

  return (await stream.object) as RiskManagerOutput;
}

/**
 * Run Critic agent with streaming.
 */
export async function runCriticStreaming(
  plan: DecisionPlan,
  analystOutputs: AnalystOutputs,
  debateOutputs: DebateOutputs,
  onChunk: OnStreamChunk,
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>
): Promise<CriticOutput> {
  const prompt = `Validate the logical consistency of this trading plan:

Decision Plan:
${JSON.stringify(plan, null, 2)}

Supporting Analyst Outputs:
News: ${JSON.stringify(analystOutputs.news, null, 2)}
Fundamentals: ${JSON.stringify(analystOutputs.fundamentals, null, 2)}

Debate Outputs:
Bullish: ${JSON.stringify(debateOutputs.bullish, null, 2)}
Bearish: ${JSON.stringify(debateOutputs.bearish, null, 2)}`;

  const settings = getAgentRuntimeSettings("critic", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: CriticOutputSchema });
  options.modelSettings.temperature = 0.1;

  const stream = await criticAgent.stream([{ role: "user", content: prompt }], options);

  for await (const chunk of stream.fullStream) {
    processStreamChunk(
      chunk as { type: string; payload: Record<string, unknown> },
      "critic",
      onChunk
    );
  }

  return (await stream.object) as CriticOutput;
}

/**
 * Run both approval agents in parallel with streaming.
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
  indicators?: Record<string, IndicatorSnapshot>
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
      indicators
    ),
    runCriticStreaming(plan, analystOutputs, debateOutputs, onChunk, agentConfigs),
  ]);

  return { riskManager, critic };
}
