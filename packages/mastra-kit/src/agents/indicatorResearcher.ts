/**
 * Indicator Researcher Agent
 *
 * Specialized agent for formulating indicator hypotheses during
 * the dynamic indicator synthesis process. This agent is NOT part
 * of the standard 8-agent trading network - it operates independently
 * when indicator generation is triggered.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 276-343)
 */

import { type IndicatorHypothesis, IndicatorHypothesisSchema } from "@cream/indicators";

// ============================================
// Model Configuration
// ============================================

/**
 * Specialized agent models (separate from trading network)
 */
export const SPECIALIZED_AGENT_MODELS = {
  /** Claude Sonnet for balanced quality/speed */
  sonnet: "claude-sonnet-4-20250514",
  /** Claude Opus for complex reasoning */
  opus: "claude-opus-4-20250514",
} as const;

export type SpecializedAgentModel =
  (typeof SPECIALIZED_AGENT_MODELS)[keyof typeof SPECIALIZED_AGENT_MODELS];

// ============================================
// System Prompt
// ============================================

export const INDICATOR_RESEARCHER_SYSTEM_PROMPT = `
You are a quantitative researcher specializing in technical indicator development.
Your role is to analyze market regime gaps and propose new indicator hypotheses.

CRITICAL: You do NOT write code. You formulate hypotheses.

When analyzing a regime gap:
1. Identify what market phenomenon is not being captured
2. Research existing academic/practitioner literature on similar phenomena
3. Propose a mathematical approach to capture the phenomenon
4. Articulate why this indicator would work (economic rationale)
5. Define falsifiable predictions that would invalidate the hypothesis

Your output must include:
- Hypothesis: One clear statement of what the indicator measures
- Economic Rationale: Why this phenomenon should predict returns
- Mathematical Approach: High-level description (not code)
- Falsification Criteria: What evidence would disprove this hypothesis
- Expected Properties: Orthogonality to existing indicators, expected IC range

DO NOT propose indicators that are:
- Minor variations of RSI, MACD, or other standard indicators
- Based solely on price momentum (already well-covered)
- Lacking economic justification

PREFER indicators that:
- Capture cross-asset relationships (e.g., sector rotation, correlation regimes)
- Incorporate market microstructure (volume patterns, spread dynamics)
- Measure regime transitions (volatility clustering, trend exhaustion)
`;

// ============================================
// Agent Configuration
// ============================================

/**
 * Configuration for the Indicator Researcher agent
 */
export interface IndicatorResearcherConfig {
  /** Agent type identifier */
  type: "indicator_researcher";

  /** Display name */
  name: string;

  /** Role description */
  role: string;

  /** Model to use (Claude Sonnet recommended) */
  model: SpecializedAgentModel;

  /** System prompt for hypothesis generation */
  systemPrompt: string;

  /** Tools this agent can use */
  tools: string[];

  /** Generation temperature (0.7 for creativity) */
  temperature: number;

  /** Maximum output tokens */
  maxTokens: number;
}

/**
 * Default configuration for the Indicator Researcher agent
 */
export const INDICATOR_RESEARCHER_CONFIG: IndicatorResearcherConfig = {
  type: "indicator_researcher",
  name: "Indicator Researcher",
  role: "Formulate indicator hypotheses based on regime gaps and performance analysis",
  model: SPECIALIZED_AGENT_MODELS.sonnet,
  systemPrompt: INDICATOR_RESEARCHER_SYSTEM_PROMPT,
  tools: ["web_search", "helix_query"],
  temperature: 0.7,
  maxTokens: 2000,
};

// ============================================
// Input/Output Types
// ============================================

/**
 * Input context for hypothesis generation
 */
export interface ResearcherInput {
  /** Current market regime identifier */
  currentRegime: string;

  /** Details about the regime gap */
  regimeGapDetails: string;

  /** Rolling IC of existing indicators */
  rollingIC: number;

  /** Days of IC decay */
  icDecayDays: number;

  /** Names of existing indicators for orthogonality consideration */
  existingIndicators: string[];

  /** Optional context from previous hypotheses */
  previousHypotheses?: Array<{
    name: string;
    status: string;
    rejectionReason?: string;
  }>;
}

/**
 * Output from the Researcher agent
 */
export interface ResearcherOutput {
  /** Generated hypothesis (validated against schema) */
  hypothesis: IndicatorHypothesis;

  /** Agent's confidence in this hypothesis (0-1) */
  confidence: number;

  /** Brief explanation of research process */
  researchSummary: string;

  /** Academic references consulted */
  academicReferences: string[];
}

// ============================================
// Prompt Builder
// ============================================

/**
 * Build the user prompt for hypothesis generation
 *
 * @param input - Research context and constraints
 * @returns Formatted user prompt
 */
export function buildResearcherPrompt(input: ResearcherInput): string {
  const lines: string[] = [
    "## Regime Gap Analysis Request",
    "",
    `**Current Regime:** ${input.currentRegime}`,
    `**Gap Description:** ${input.regimeGapDetails}`,
    "",
    "## Performance Context",
    `- Rolling 30-day IC: ${input.rollingIC.toFixed(4)}`,
    `- IC Decay Days: ${input.icDecayDays}`,
    "",
    "## Existing Indicators (for orthogonality)",
    ...input.existingIndicators.slice(0, 20).map((i) => `- ${i}`),
  ];

  if (input.previousHypotheses && input.previousHypotheses.length > 0) {
    lines.push("", "## Previous Hypotheses (avoid similar approaches)");
    for (const h of input.previousHypotheses.slice(0, 5)) {
      const reason = h.rejectionReason
        ? ` - Rejected: ${h.rejectionReason}`
        : ` - Status: ${h.status}`;
      lines.push(`- ${h.name}${reason}`);
    }
  }

  lines.push(
    "",
    "## Output Requirements",
    "Generate a single indicator hypothesis following the schema.",
    "Your response must be valid JSON matching the IndicatorHypothesis schema:",
    "- name: snake_case, 3-50 chars",
    '- category: one of ["momentum", "trend", "volatility", "volume", "correlation", "regime", "microstructure"]',
    "- hypothesis: 50-500 chars",
    "- economicRationale: 100-1000 chars",
    "- mathematicalApproach: 50-500 chars (NO CODE)",
    "- falsificationCriteria: array of 1-5 strings",
    "- expectedProperties:",
    "  - expectedICRange: [min, max] between -1 and 1",
    "  - maxCorrelationWithExisting: 0-0.5",
    '  - targetTimeframe: one of ["1h", "4h", "1d", "1w"]',
    "  - applicableRegimes: array of regime names",
    "- relatedAcademicWork: optional array of paper titles/authors"
  );

  return lines.join("\n");
}

// ============================================
// Response Parser
// ============================================

/**
 * Parse and validate agent response into IndicatorHypothesis
 *
 * @param response - Raw response from LLM
 * @returns Validated hypothesis or throws error
 */
export function parseResearcherResponse(response: string): IndicatorHypothesis {
  // Extract JSON from response (may be wrapped in markdown code block)
  let jsonStr = response;

  // Handle markdown code blocks
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch?.[1]) {
    jsonStr = jsonMatch[1];
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr.trim());
  } catch (e) {
    throw new Error(
      `Failed to parse researcher response as JSON: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  // Validate against schema
  const result = IndicatorHypothesisSchema.safeParse(parsed);
  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid hypothesis schema: ${errors}`);
  }

  return result.data;
}

// ============================================
// Exports
// ============================================

export const indicatorResearcher = {
  config: INDICATOR_RESEARCHER_CONFIG,
  systemPrompt: INDICATOR_RESEARCHER_SYSTEM_PROMPT,
  buildPrompt: buildResearcherPrompt,
  parseResponse: parseResearcherResponse,
};

export default indicatorResearcher;
