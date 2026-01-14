/**
 * Idea Agent Service
 *
 * The Idea Agent is the first agent in the AlphaForge three-agent pattern.
 * It generates structured alpha factor hypotheses using chain-of-thought reasoning.
 *
 * Pipeline: Trigger Detection → **Idea Agent** → Implementation Agent → Validation Agent
 *
 * NOTE: This agent now uses the global model from trading_config.global_model.
 *
 * @see docs/plans/20-research-to-production-pipeline.md - Phase 1: Idea Generation
 * @see https://arxiv.org/html/2502.16789v2 - AlphaAgent paper
 */

import {
	DEFAULT_GLOBAL_MODEL,
	type Factor,
	type Hypothesis,
	type NewHypothesis,
	type ResearchTrigger,
} from "@cream/domain";
import type { FactorZooRepository } from "@cream/storage";
import {
	buildFactorZooSummary,
	buildIdeaAgentUserPrompt,
	type HypothesisMemory,
	IDEA_AGENT_SYSTEM_PROMPT,
	type IdeaContext,
} from "../prompts/idea-agent.js";

/**
 * Dependencies for the IdeaAgent
 */
export interface IdeaAgentDependencies {
	factorZoo: FactorZooRepository;
	helixClient?: HelixClient;
}

/**
 * HelixDB client interface for hypothesis memory queries
 */
export interface HelixClient {
	query<T>(query: string, params?: Record<string, unknown>): Promise<T[]>;
	vectorSearch<T>(
		collection: string,
		embedding: number[],
		options?: { limit?: number; filter?: Record<string, unknown> }
	): Promise<T[]>;
}

/**
 * LLM interface for generating hypotheses
 */
export interface LLMProvider {
	generate(params: { systemPrompt: string; userPrompt: string; model?: string }): Promise<string>;
}

/**
 * Raw hypothesis output from the LLM
 */
interface RawHypothesisOutput {
	hypothesis_id: string;
	title: string;
	economic_rationale: string;
	market_mechanism: string;
	target_regime: string;
	expected_metrics: {
		ic_target: number;
		sharpe_target: number;
		decay_half_life_days: number;
	};
	falsification_criteria: string[];
	required_features: string[];
	parameter_count: number;
	related_literature: Array<{
		title: string;
		authors: string;
		url: string | null;
		relevance: string;
	}>;
	originality_justification: string;
	similar_past_hypotheses: Array<{
		hypothesis_id: string;
		outcome: "validated" | "rejected";
		lesson: string;
	}>;
	implementation_hints: string;
}

/**
 * Result of hypothesis generation
 */
export interface IdeaGenerationResult {
	hypothesis: Hypothesis;
	context: IdeaContext;
	rawOutput: string;
	generatedAt: string;
}

/**
 * Extract JSON from LLM output that may contain thinking tags
 */
function extractJsonFromOutput(output: string): string {
	const outputMatch = output.match(/<output>\s*([\s\S]*?)\s*<\/output>/);
	if (outputMatch?.[1]) {
		return outputMatch[1].trim();
	}

	const jsonMatch = output.match(/\{[\s\S]*\}/);
	if (jsonMatch) {
		return jsonMatch[0];
	}

	throw new Error("No JSON found in LLM output");
}

/**
 * Map LLM regime output to domain regime type
 */
function mapRegime(regime: string): "bull" | "bear" | "sideways" | "volatile" | "all" | null {
	const regimeMap: Record<string, "bull" | "bear" | "sideways" | "volatile" | "all"> = {
		BULL_TREND: "bull",
		BEAR_TREND: "bear",
		RANGE: "sideways",
		HIGH_VOL: "volatile",
		LOW_VOL: "sideways",
	};
	return regimeMap[regime] ?? null;
}

/**
 * Convert raw LLM output to NewHypothesis format
 *
 * Note: Additional fields (expectedIc, expectedSharpe, requiredFeatures, relatedLiterature)
 * are stored in the raw output and can be retrieved from IdeaGenerationResult.
 * The domain schema only supports the core hypothesis fields.
 */
function convertToNewHypothesis(
	raw: RawHypothesisOutput,
	_trigger: ResearchTrigger
): NewHypothesis {
	return {
		title: raw.title,
		economicRationale: raw.economic_rationale,
		marketMechanism: raw.market_mechanism,
		targetRegime: mapRegime(raw.target_regime),
		falsificationCriteria: {
			conditions: raw.falsification_criteria,
			thresholds: raw.expected_metrics
				? {
						ic_target: raw.expected_metrics.ic_target,
						sharpe_target: raw.expected_metrics.sharpe_target,
						decay_half_life_days: raw.expected_metrics.decay_half_life_days,
					}
				: undefined,
			timeHorizon: undefined,
		},
		status: "proposed",
		iteration: 1,
		parentHypothesisId: null,
	};
}

/**
 * Generate a unique hypothesis ID
 */
function _generateHypothesisId(title: string): string {
	const timestamp = Date.now();
	const shortName = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.slice(0, 20);
	return `hyp-${timestamp}-${shortName}`;
}

/**
 * Service for generating alpha factor hypotheses
 */
export class IdeaAgent {
	private factorZoo: FactorZooRepository;
	private helixClient?: HelixClient;
	private llmProvider?: LLMProvider;

	constructor(deps: IdeaAgentDependencies, llmProvider?: LLMProvider) {
		this.factorZoo = deps.factorZoo;
		this.helixClient = deps.helixClient;
		this.llmProvider = llmProvider;
	}

	/**
	 * Generate a hypothesis for a given research trigger
	 */
	async generateHypothesis(trigger: ResearchTrigger): Promise<IdeaGenerationResult> {
		const context = await this.buildContext(trigger);

		if (!this.llmProvider) {
			throw new Error("LLM provider not configured");
		}

		const userPrompt = buildIdeaAgentUserPrompt(context);
		// Use global model (caller should set via config, defaults to flash)
		const rawOutput = await this.llmProvider.generate({
			systemPrompt: IDEA_AGENT_SYSTEM_PROMPT,
			userPrompt,
			model: DEFAULT_GLOBAL_MODEL,
		});

		const jsonStr = extractJsonFromOutput(rawOutput);
		const rawHypothesis = JSON.parse(jsonStr) as RawHypothesisOutput;
		const newHypothesis = convertToNewHypothesis(rawHypothesis, trigger);
		const hypothesis = await this.factorZoo.createHypothesis(newHypothesis);

		return {
			hypothesis,
			context,
			rawOutput,
			generatedAt: new Date().toISOString(),
		};
	}

	/**
	 * Build context for hypothesis generation
	 */
	async buildContext(trigger: ResearchTrigger): Promise<IdeaContext> {
		const [stats, activeFactors, decayingFactors, memoryResults] = await Promise.all([
			this.factorZoo.getStats(),
			this.factorZoo.findActiveFactors(),
			this.factorZoo.findDecayingFactors(),
			this.querySimilarHypotheses(trigger.suggestedFocus),
		]);

		const regime = this.getCurrentRegime(trigger);
		const gaps = this.getUncoveredRegimes(trigger, activeFactors);
		const activeFactorNames = activeFactors.map((f) => f.name);

		return {
			regime,
			gaps,
			decayingFactors: decayingFactors.map((f) => ({
				id: f.factorId,
				decayRate: f.decayRate ?? 0,
			})),
			memoryResults,
			factorZooSummary: buildFactorZooSummary(stats, activeFactorNames),
			trigger,
		};
	}

	/**
	 * Get current market regime from trigger metadata
	 */
	private getCurrentRegime(trigger: ResearchTrigger): string {
		const metadata = trigger.metadata as Record<string, unknown>;
		if (metadata?.currentRegime && typeof metadata.currentRegime === "string") {
			return metadata.currentRegime;
		}
		return "UNKNOWN";
	}

	/**
	 * Get uncovered market regimes based on active factors' targetRegimes
	 */
	private getUncoveredRegimes(trigger: ResearchTrigger, activeFactors: Factor[]): string[] {
		// Map domain regime labels to factor target regimes
		const regimeMap: Record<string, string> = {
			BULL_TREND: "bull",
			BEAR_TREND: "bear",
			RANGE: "sideways",
			HIGH_VOL: "volatile",
			LOW_VOL: "sideways", // LOW_VOL is typically range/sideways behavior
		};

		const allRegimeLabels = ["BULL_TREND", "BEAR_TREND", "RANGE", "HIGH_VOL", "LOW_VOL"];
		const coveredTargetRegimes = new Set<string>();

		for (const factor of activeFactors) {
			const regimes = factor.targetRegimes ?? [];
			for (const regime of regimes) {
				if (regime === "all") {
					// "all" covers everything
					return [];
				}
				coveredTargetRegimes.add(regime);
			}
		}

		// Find regime labels that have no coverage
		const uncovered: string[] = [];
		for (const label of allRegimeLabels) {
			const targetRegime = regimeMap[label];
			if (targetRegime && !coveredTargetRegimes.has(targetRegime)) {
				uncovered.push(label);
			}
		}

		// Check if trigger metadata provides explicit uncovered regimes
		const metadata = trigger.metadata as Record<string, unknown>;
		if (metadata?.uncoveredRegimes && Array.isArray(metadata.uncoveredRegimes)) {
			return metadata.uncoveredRegimes as string[];
		}

		// If trigger is REGIME_GAP, the current regime is the gap
		if (trigger.type === "REGIME_GAP") {
			const currentRegime = this.getCurrentRegime(trigger);
			return [currentRegime];
		}

		return uncovered;
	}

	/**
	 * Query HelixDB for similar past hypotheses
	 */
	async querySimilarHypotheses(_focus: string): Promise<HypothesisMemory[]> {
		if (!this.helixClient) {
			return [];
		}

		try {
			const results = await this.helixClient.query<{
				hypothesis_id: string;
				title: string;
				status: string;
				target_regime: string;
				ic?: number;
				sharpe?: number;
				lessons_learned?: string;
			}>(`
        MATCH (h:Hypothesis)
        WHERE h.status IN ['validated', 'rejected']
        RETURN h.hypothesis_id, h.title, h.status, h.target_regime, h.ic, h.sharpe, h.lessons_learned
        ORDER BY h.created_at DESC
        LIMIT 5
      `);

			return results.map((r) => ({
				hypothesisId: r.hypothesis_id,
				title: r.title,
				status: r.status as "validated" | "rejected",
				targetRegime: r.target_regime,
				ic: r.ic,
				sharpe: r.sharpe,
				lessonsLearned: r.lessons_learned,
			}));
		} catch {
			return [];
		}
	}

	/**
	 * Validate a hypothesis against the Factor Zoo for originality
	 */
	async validateOriginality(hypothesis: NewHypothesis): Promise<{
		isOriginal: boolean;
		similarFactors: Array<{ factorId: string; similarity: number }>;
	}> {
		const activeFactors = await this.factorZoo.findActiveFactors();
		const similarFactors: Array<{ factorId: string; similarity: number }> = [];

		for (const factor of activeFactors) {
			const similarity = this.calculateTitleSimilarity(hypothesis.title, factor.name);
			if (similarity > 0.7) {
				similarFactors.push({ factorId: factor.factorId, similarity });
			}
		}

		return {
			isOriginal: similarFactors.length === 0,
			similarFactors,
		};
	}

	/**
	 * Calculate simple title similarity (Jaccard similarity of words)
	 */
	private calculateTitleSimilarity(title1: string, title2: string): number {
		const words1 = new Set(title1.toLowerCase().split(/\s+/));
		const words2 = new Set(title2.toLowerCase().split(/\s+/));

		const intersection = new Set([...words1].filter((w) => words2.has(w)));
		const union = new Set([...words1, ...words2]);

		return intersection.size / union.size;
	}
}

/**
 * Create an IdeaAgent with the given dependencies
 */
export function createIdeaAgent(deps: IdeaAgentDependencies, llmProvider?: LLMProvider): IdeaAgent {
	return new IdeaAgent(deps, llmProvider);
}
