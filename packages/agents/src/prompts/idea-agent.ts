/**
 * Idea Agent Prompt Templates
 *
 * The Idea Agent is the first agent in the AlphaForge three-agent pattern.
 * It generates structured alpha factor hypotheses based on:
 * - Current market regime and uncovered gaps
 * - Academic literature and market research
 * - Historical hypothesis performance from memory
 *
 * @see docs/plans/20-research-to-production-pipeline.md - Phase 1: Idea Generation
 * @see https://arxiv.org/html/2502.16789v2 - AlphaAgent paper
 * @see https://arxiv.org/html/2406.18394v1 - AlphaForge three-agent architecture
 */

import type { FactorZooStats, ResearchTrigger } from "@cream/domain";

export interface IdeaContext {
  /** Current market regime classification */
  regime: string;
  /** Market regimes not covered by active factors */
  gaps: string[];
  /** Factors currently experiencing alpha decay */
  decayingFactors: Array<{ id: string; decayRate: number }>;
  /** Similar past hypotheses from HelixDB memory */
  memoryResults: HypothesisMemory[];
  /** Summary statistics of the Factor Zoo */
  factorZooSummary: string;
  /** The research trigger that initiated this request */
  trigger: ResearchTrigger;
}

export interface HypothesisMemory {
  hypothesisId: string;
  title: string;
  status: "validated" | "rejected";
  targetRegime: string;
  ic?: number;
  sharpe?: number;
  lessonsLearned?: string;
}

export const IDEA_AGENT_SYSTEM_PROMPT = `<system>
You are a Quantitative Research Analyst at a systematic trading firm. Your role is to generate novel alpha factor hypotheses that can be transformed into tradeable signals.

<role>
- Generate structured hypotheses for alpha factor research
- Identify market inefficiencies with clear economic rationale
- Specify falsification criteria (what would prove the hypothesis wrong)
- Reference academic literature and existing research
- Ensure hypotheses target uncovered market regimes or replace decaying factors
- Differentiate from existing Factor Zoo entries
</role>

<constraints>
- Every hypothesis MUST have a clear economic rationale explaining WHY this alpha exists
- Must specify falsification criteria (testable conditions that would prove it wrong)
- Target either an uncovered regime OR replace a decaying factor
- Complexity budget: maximum 8 features, maximum 10 parameters
- Originality: must demonstrably differ from existing Factor Zoo factors
- Reference at least one academic paper or established market anomaly
- Expected IC should be 0.03-0.10, expected Sharpe 1.0-2.5
</constraints>

<tools>
You have access to:
- **helix_query**: Query HelixDB for similar past hypotheses and their outcomes
</tools>

</system>

<instructions>
Generate a novel alpha factor hypothesis using Chain-of-Thought reasoning:

1. **Trigger Analysis**: Understand why research was triggered
   - What regime gap or factor decay prompted this?
   - What specific problem needs solving?

2. **Memory Query**: Use helix_query to find similar past attempts
   - What hypotheses have we tried before?
   - What worked and what failed?
   - What lessons can we apply?

3. **Factor Zoo Check**: Review the Factor Zoo context provided
   - What factors are currently active?
   - How does your hypothesis differ?
   - Are you targeting an uncovered regime?

4. **Hypothesis Construction**: Build a structured hypothesis
   - Clear economic rationale (the WHY)
   - Specific falsification criteria (how to prove it wrong)
   - Realistic performance expectations
   - Appropriate complexity constraints

5. **Quality Check**: Verify your hypothesis meets requirements
   - Does it have economic rationale?
   - Are falsification criteria testable?
   - Is it sufficiently different from existing factors?
   - Is complexity within budget?
</instructions>`;

export function buildIdeaAgentUserPrompt(context: IdeaContext): string {
  const { regime, gaps, decayingFactors, memoryResults, factorZooSummary, trigger } = context;

  // Format datetime for prompt
  const now = new Date();
  const eastern = now.toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const decayingInfo =
    decayingFactors.length > 0
      ? decayingFactors.map((f) => `${f.id} (decay rate: ${f.decayRate.toFixed(4)}/day)`).join(", ")
      : "None currently decaying";

  const memoryInfo =
    memoryResults.length > 0
      ? JSON.stringify(
          memoryResults.map((h) => ({
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

  return `Current Date/Time (UTC): ${now.toISOString()}
Current Date/Time (US Eastern): ${eastern}

<context>
<trigger>
Type: ${trigger.type}
Severity: ${trigger.severity}
Suggested Focus: ${trigger.suggestedFocus}
Affected Factors: ${trigger.affectedFactors.join(", ") || "None specifically"}
Detected At: ${trigger.detectedAt}
</trigger>

<market_state>
Current Regime: ${regime}
Uncovered Regimes: ${gaps.length > 0 ? gaps.join(", ") : "All regimes covered"}
Decaying Factors: ${decayingInfo}
</market_state>

<factor_zoo>
${factorZooSummary}
</factor_zoo>

<memory_context>
Similar Past Hypotheses:
${memoryInfo}
</memory_context>
</context>

<task>
Generate a novel alpha factor hypothesis that addresses the research trigger.

Requirements:
1. Target the ${trigger.type === "REGIME_GAP" ? `uncovered ${regime} regime` : "current market conditions"}
2. ${trigger.type === "ALPHA_DECAY" ? `Consider replacing or improving on: ${trigger.affectedFactors.join(", ")}` : "Focus on novel alpha sources"}
3. Use web search to find supporting academic research
4. Query HelixDB for similar past attempts and their outcomes
5. Ensure the hypothesis is sufficiently different from existing factors

Output a complete hypothesis in the specified JSON format.
</task>`;
}

export function buildFactorZooSummary(stats: FactorZooStats, activeFactorNames: string[]): string {
  return `Total Factors: ${stats.totalFactors}
Active Factors: ${stats.activeFactors}
Decaying Factors: ${stats.decayingFactors}
Research In Progress: ${stats.researchFactors}
Retired Factors: ${stats.retiredFactors}
Average IC: ${stats.averageIc?.toFixed(4) ?? "N/A"}
Total Weight: ${stats.totalWeight?.toFixed(2) ?? "N/A"}
Validated Hypotheses: ${stats.hypothesesValidated}
Rejected Hypotheses: ${stats.hypothesesRejected}

Active Factor Names: ${activeFactorNames.length > 0 ? activeFactorNames.join(", ") : "None"}`;
}
