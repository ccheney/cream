/**
 * Research Depth Scorer
 *
 * Evaluates the depth and thoroughness of research analysis.
 * Measures evidence quality, counterargument acknowledgment, and source diversity.
 *
 * @see https://mastra.ai/llms.txt for Mastra v1 patterns
 */

import { createScorer } from "@mastra/core/evals";

export const researchDepthScorer = createScorer({
	id: "research-depth",
	name: "Research Depth",
	description: "Evaluates research thoroughness including evidence quality and counterarguments",
	type: "agent",
}).generateScore(({ run }) => {
	const content = run.output[0]?.content;
	const output = String(content ?? "");

	if (!output) {
		return 0;
	}

	let score = 0;

	// Check for key research components
	if (output.includes("factor") || output.includes("evidence")) score += 0.2;
	if (output.includes("counterargument") || output.includes("however") || output.includes("risk"))
		score += 0.2;
	if (output.includes("thesis") || output.includes("conclusion")) score += 0.2;
	if (output.includes("conviction") || output.includes("confidence")) score += 0.2;
	if (output.includes("memory") || output.includes("case") || output.includes("source"))
		score += 0.2;

	return score;
});
