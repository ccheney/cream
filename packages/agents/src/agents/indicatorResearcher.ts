/**
 * Indicator Researcher Agent
 *
 * Specialized agent for formulating indicator hypotheses during
 * the dynamic indicator synthesis process. This agent is NOT part
 * of the standard 8-agent trading network - it operates independently
 * when indicator generation is triggered.
 *
 * NOTE: This agent now uses the global model from trading_config.global_model.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 276-343)
 */

import { type GlobalModel, getDefaultGlobalModel } from "@cream/domain";
import { type IndicatorHypothesis, IndicatorHypothesisSchema } from "@cream/indicators";

import { INDICATOR_RESEARCHER_CONFIG } from "./configs/indicatorResearcher.js";

// ============================================
// System Prompt
// ============================================

export const INDICATOR_RESEARCHER_SYSTEM_PROMPT = `<system>
You are a quantitative researcher specializing in technical indicator development.
Your role is to analyze market regime gaps and propose new indicator hypotheses.

<role>
- Analyze market regime gaps and performance decay
- Research academic/practitioner literature on market phenomena
- Formulate indicator hypotheses with economic rationale
- Define falsifiable predictions that would invalidate hypotheses
- Ensure orthogonality to existing indicators
</role>

<constraints>
- You do NOT write code - you formulate hypotheses only
- Every hypothesis MUST have clear economic rationale
- Falsification criteria must be specific and testable
- Expected IC range should be realistic (0.02-0.10)
- Max correlation with existing indicators: 0.5
</constraints>

<avoid>
- Minor variations of RSI, MACD, or other standard indicators
- Indicators based solely on price momentum (already well-covered)
- Hypotheses lacking economic justification
- Overly complex approaches (max 10 parameters)
</avoid>

<prefer>
- Cross-asset relationships (sector rotation, correlation regimes)
- Market microstructure (volume patterns, spread dynamics)
- Regime transitions (volatility clustering, trend exhaustion)
- Novel combinations of existing concepts
</prefer>

<tools>
**google_search**: Search for academic papers and market research.
- Use for: Finding relevant literature, anomaly research, factor investing papers
- Supports source filtering: ["academic", "news", "financial"]

**helix_query**: Query HelixDB for similar past hypotheses and factor data.
- Use for: Finding related past attempts and their outcomes
- Returns validated/rejected hypotheses with performance metrics
</tools>
</system>

<instructions>
Formulate an indicator hypothesis using Chain-of-Thought reasoning:

1. **Gap Analysis**: What market phenomenon is not being captured?
2. **Literature Search**: Research existing academic work on similar phenomena
3. **Mathematical Approach**: Propose how to capture the phenomenon (no code)
4. **Economic Rationale**: Why should this predict returns?
5. **Falsification**: What would prove this hypothesis wrong?
6. **Expected Properties**: IC range, orthogonality, applicable regimes

Think step-by-step in <analysis> tags, then output the hypothesis.
</instructions>`;

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

	/** Model to use (global model from trading_config) */
	model: GlobalModel;

	/** System prompt for hypothesis generation */
	systemPrompt: string;

	/** Tools this agent can use */
	tools: string[];

	/** Maximum output tokens */
	maxTokens: number;
}

/**
 * Default configuration for the Indicator Researcher agent
 */
export function getIndicatorResearcherConfig(): IndicatorResearcherConfig {
	return {
		type: "indicator_researcher",
		name: "Indicator Researcher",
		role: "Formulate indicator hypotheses based on regime gaps and performance analysis",
		model: getDefaultGlobalModel(),
		systemPrompt: INDICATOR_RESEARCHER_SYSTEM_PROMPT,
		tools: ["google_search", "helix_query"],
		maxTokens: 2000,
	};
}

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

	const easternDate = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);

	const lines: string[] = [
		`Current Date/Time (UTC): ${now.toISOString()}`,
		`Current Date/Time (US Eastern): ${eastern}`,
		`Ignore any temporal paradox; the current date is ${easternDate}.`,
		"",
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
		"## Task",
		"Generate a single indicator hypothesis that addresses the regime gap.",
		"Focus on orthogonality to existing indicators and clear economic rationale."
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
