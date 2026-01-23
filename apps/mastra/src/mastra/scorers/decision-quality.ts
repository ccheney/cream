/**
 * Decision Quality Scorer
 *
 * Evaluates the quality of trading decisions made by agents.
 * Measures logical consistency, risk assessment, and rationale clarity.
 *
 * @see https://mastra.ai/llms.txt for Mastra v1 patterns
 */

import { createScorer } from "@mastra/core/evals";

export const decisionQualityScorer = createScorer({
	id: "decision-quality",
	name: "Decision Quality",
	description: "Evaluates trading decision quality including risk assessment and rationale",
	type: "agent",
}).generateScore(({ run }) => {
	const content = run.output[0]?.content;
	const output = String(content ?? "");

	if (!output) {
		return 0;
	}

	let score = 0;

	// Check for key decision components
	if (output.includes("rationale") || output.includes("reasoning")) score += 0.25;
	if (output.includes("risk") || output.includes("stop")) score += 0.25;
	if (output.includes("confidence") || output.includes("conviction")) score += 0.25;
	if (output.includes("size") || output.includes("position")) score += 0.25;

	return score;
});
