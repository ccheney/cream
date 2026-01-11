/**
 * Research agents for constructing bullish and bearish cases.
 *
 * Contains Bullish and Bearish researcher agents for the debate phase.
 */

import type { AgentType } from "@cream/mastra-kit";
import { z } from "zod";

import type { AnalystOutputs } from "./analysts.js";
import { buildGenerateOptions, createAgent, getAgentRuntimeSettings } from "./factory.js";
import { BearishResearchSchema, BullishResearchSchema } from "./schemas.js";
import type {
  AgentConfigEntry,
  AgentContext,
  AgentStreamChunk,
  BearishResearchOutput,
  BullishResearchOutput,
  OnStreamChunk,
} from "./types.js";

// Re-export for convenience
export type { AnalystOutputs };

// ============================================
// Agent Instances
// ============================================

/** Bullish Researcher - Constructs the long case */
export const bullishResearcherAgent = createAgent("bullish_researcher");

/** Bearish Researcher - Constructs the short/avoid case */
export const bearishResearcherAgent = createAgent("bearish_researcher");

// ============================================
// Execution Functions
// ============================================

/**
 * Run Bullish Researcher agent.
 */
export async function runBullishResearcher(
  context: AgentContext,
  analystOutputs: AnalystOutputs
): Promise<BullishResearchOutput[]> {
  const prompt = `Construct the bullish case for the following instruments based on analyst outputs:

News & Sentiment Analysis:
${JSON.stringify(analystOutputs.news, null, 2)}

Fundamentals Analysis:
${JSON.stringify(analystOutputs.fundamentals, null, 2)}

Memory context (similar historical cases):
${JSON.stringify(context.memory ?? {}, null, 2)}

Symbols: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}`;

  const settings = getAgentRuntimeSettings("bullish_researcher", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(BullishResearchSchema) });

  const response = await bullishResearcherAgent.generate(
    [{ role: "user", content: prompt }],
    options
  );

  const result = response.object as BullishResearchOutput[] | undefined;
  return result ?? [];
}

/**
 * Run Bearish Researcher agent.
 */
export async function runBearishResearcher(
  context: AgentContext,
  analystOutputs: AnalystOutputs
): Promise<BearishResearchOutput[]> {
  const prompt = `Construct the bearish case for the following instruments based on analyst outputs:

News & Sentiment Analysis:
${JSON.stringify(analystOutputs.news, null, 2)}

Fundamentals Analysis:
${JSON.stringify(analystOutputs.fundamentals, null, 2)}

Memory context (similar historical cases):
${JSON.stringify(context.memory ?? {}, null, 2)}

Symbols: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}`;

  const settings = getAgentRuntimeSettings("bearish_researcher", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(BearishResearchSchema) });

  const response = await bearishResearcherAgent.generate(
    [{ role: "user", content: prompt }],
    options
  );

  const result = response.object as BearishResearchOutput[] | undefined;
  return result ?? [];
}

/**
 * Run both research agents in parallel (debate phase).
 */
export async function runDebateParallel(
  context: AgentContext,
  analystOutputs: AnalystOutputs
): Promise<{
  bullish: BullishResearchOutput[];
  bearish: BearishResearchOutput[];
}> {
  const [bullish, bearish] = await Promise.all([
    runBullishResearcher(context, analystOutputs),
    runBearishResearcher(context, analystOutputs),
  ]);

  return { bullish, bearish };
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
 * Run Bullish Researcher agent with streaming.
 */
export async function runBullishResearcherStreaming(
  context: AgentContext,
  analystOutputs: AnalystOutputs,
  onChunk: OnStreamChunk
): Promise<BullishResearchOutput[]> {
  const prompt = `Construct the bullish case for the following instruments based on analyst outputs:

News & Sentiment Analysis:
${JSON.stringify(analystOutputs.news, null, 2)}

Fundamentals Analysis:
${JSON.stringify(analystOutputs.fundamentals, null, 2)}

Memory context (similar historical cases):
${JSON.stringify(context.memory ?? {}, null, 2)}

Symbols: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}`;

  const settings = getAgentRuntimeSettings("bullish_researcher", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(BullishResearchSchema) });

  const stream = await bullishResearcherAgent.stream([{ role: "user", content: prompt }], options);

  for await (const chunk of stream.fullStream) {
    processStreamChunk(
      chunk as { type: string; payload: Record<string, unknown> },
      "bullish_researcher",
      onChunk
    );
  }

  const result = (await stream.object) as BullishResearchOutput[] | undefined;
  return result ?? [];
}

/**
 * Run Bearish Researcher agent with streaming.
 */
export async function runBearishResearcherStreaming(
  context: AgentContext,
  analystOutputs: AnalystOutputs,
  onChunk: OnStreamChunk
): Promise<BearishResearchOutput[]> {
  const prompt = `Construct the bearish case for the following instruments based on analyst outputs:

News & Sentiment Analysis:
${JSON.stringify(analystOutputs.news, null, 2)}

Fundamentals Analysis:
${JSON.stringify(analystOutputs.fundamentals, null, 2)}

Memory context (similar historical cases):
${JSON.stringify(context.memory ?? {}, null, 2)}

Symbols: ${context.symbols.join(", ")}
Cycle ID: ${context.cycleId}`;

  const settings = getAgentRuntimeSettings("bearish_researcher", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: z.array(BearishResearchSchema) });

  const stream = await bearishResearcherAgent.stream([{ role: "user", content: prompt }], options);

  for await (const chunk of stream.fullStream) {
    processStreamChunk(
      chunk as { type: string; payload: Record<string, unknown> },
      "bearish_researcher",
      onChunk
    );
  }

  const result = (await stream.object) as BearishResearchOutput[] | undefined;
  return result ?? [];
}

/**
 * Run both research agents in parallel with streaming (debate phase).
 */
export async function runDebateParallelStreaming(
  context: AgentContext,
  analystOutputs: AnalystOutputs,
  onChunk: OnStreamChunk
): Promise<{
  bullish: BullishResearchOutput[];
  bearish: BearishResearchOutput[];
}> {
  const [bullish, bearish] = await Promise.all([
    runBullishResearcherStreaming(context, analystOutputs, onChunk),
    runBearishResearcherStreaming(context, analystOutputs, onChunk),
  ]);

  return { bullish, bearish };
}

// ============================================
// Idea Agent
// ============================================

import type { IndicatorHypothesis } from "@cream/indicators";
import { IndicatorHypothesisSchema } from "@cream/indicators";
import type { ResearcherInput } from "@cream/mastra-kit";
import { buildResearcherPrompt } from "@cream/mastra-kit";

import { type IdeaAgentOutput, IdeaAgentOutputSchema } from "./schemas.js";
import type { IdeaAgentContext } from "./types.js";

/** Idea Agent - Generates alpha factor hypotheses */
export const ideaAgentAgent = createAgent("idea_agent");

/** Indicator Researcher - Formulates indicator hypotheses */
export const indicatorResearcherAgent = createAgent("indicator_researcher");

/**
 * Run Idea Agent to generate alpha factor hypotheses.
 */
export async function runIdeaAgent(context: IdeaAgentContext): Promise<IdeaAgentOutput> {
  const decayingInfo =
    context.decayingFactors.length > 0
      ? context.decayingFactors
          .map((f) => `${f.id} (decay rate: ${f.decayRate.toFixed(4)}/day)`)
          .join(", ")
      : "None currently decaying";

  const memoryInfo =
    context.memoryResults && context.memoryResults.length > 0
      ? JSON.stringify(
          context.memoryResults.map((h) => ({
            id: h.hypothesisId,
            title: h.title,
            status: h.status,
            regime: h.targetRegime,
            ic: h.ic,
            lessons: h.lessonsLearned,
          })),
          null,
          2
        )
      : "No similar past hypotheses found";

  const prompt = `<context>
<trigger>
Type: ${context.trigger.type}
Severity: ${context.trigger.severity}
Suggested Focus: ${context.trigger.suggestedFocus}
Affected Factors: ${context.trigger.affectedFactors.join(", ") || "None specifically"}
Detected At: ${context.trigger.detectedAt}
</trigger>

<market_state>
Current Regime: ${context.regime}
Uncovered Regimes: ${context.gaps.length > 0 ? context.gaps.join(", ") : "All regimes covered"}
Decaying Factors: ${decayingInfo}
</market_state>

<factor_zoo>
${context.factorZooSummary}
</factor_zoo>

<memory_context>
Similar Past Hypotheses:
${memoryInfo}
</memory_context>
</context>

<task>
Generate a novel alpha factor hypothesis that addresses the research trigger.

Requirements:
1. Target the ${context.trigger.type === "REGIME_GAP" ? `uncovered ${context.regime} regime` : "current market conditions"}
2. ${context.trigger.type === "ALPHA_DECAY" ? `Consider replacing or improving on: ${context.trigger.affectedFactors.join(", ")}` : "Focus on novel alpha sources"}
3. Use web search to find supporting academic research
4. Ensure the hypothesis is sufficiently different from existing factors

Output a complete hypothesis.
</task>`;

  const settings = getAgentRuntimeSettings("idea_agent", context.agentConfigs);
  const options = buildGenerateOptions(settings, { schema: IdeaAgentOutputSchema });

  const response = await ideaAgentAgent.generate([{ role: "user", content: prompt }], options);

  return response.object as IdeaAgentOutput;
}

/**
 * Run Indicator Researcher agent to formulate indicator hypotheses.
 */
export async function runIndicatorResearcher(
  input: ResearcherInput,
  agentConfigs?: Partial<Record<AgentType, AgentConfigEntry>>
): Promise<IndicatorHypothesis> {
  const prompt = buildResearcherPrompt(input);

  const settings = getAgentRuntimeSettings("indicator_researcher", agentConfigs);
  const options = buildGenerateOptions(settings, { schema: IndicatorHypothesisSchema });

  const response = await indicatorResearcherAgent.generate(
    [{ role: "user", content: prompt }],
    options
  );

  return response.object as IndicatorHypothesis;
}
