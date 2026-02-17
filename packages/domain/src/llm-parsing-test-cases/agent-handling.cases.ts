import { describe, expect, it } from "bun:test";

import type { AgentType } from "../llm-parsing";
import { parseWithRetry } from "../llm-parsing";
import { SimpleSchema } from "./fixtures";

describe("parseWithRetry - agent-specific handling", () => {
	it("returns REJECT for RiskManagerAgent on failure", async () => {
		const result = await parseWithRetry("invalid", SimpleSchema, {
			agentType: "RiskManagerAgent",
		});

		expect(result.success).toBe(false);
		expect(result.agentAction).toBe("REJECT");
	});

	it("returns REJECT for CriticAgent on failure", async () => {
		const result = await parseWithRetry("invalid", SimpleSchema, {
			agentType: "CriticAgent",
		});

		expect(result.success).toBe(false);
		expect(result.agentAction).toBe("REJECT");
	});

	it("returns REJECT for TraderAgent on failure", async () => {
		const result = await parseWithRetry("invalid", SimpleSchema, {
			agentType: "TraderAgent",
		});

		expect(result.success).toBe(false);
		expect(result.agentAction).toBe("REJECT");
	});
});

describe("parseWithRetry - agent-specific handling", () => {
	it("returns SKIP for research agents on failure", async () => {
		const researchAgents: AgentType[] = [
			"TechnicalAnalyst",
			"NewsSentimentAnalyst",
			"FundamentalsMacroAnalyst",
			"BullishResearchAgent",
			"BearishResearchAgent",
		];

		for (const agentType of researchAgents) {
			const result = await parseWithRetry("invalid", SimpleSchema, { agentType });
			expect(result.success).toBe(false);
			expect(result.agentAction).toBe("SKIP");
		}
	});

	it("returns SUCCESS for all agents when parse succeeds", async () => {
		const allAgents: AgentType[] = ["TechnicalAnalyst", "RiskManagerAgent", "TraderAgent"];

		for (const agentType of allAgents) {
			const result = await parseWithRetry('{"name":"test","value":1}', SimpleSchema, {
				agentType,
			});
			expect(result.success).toBe(true);
			expect(result.agentAction).toBe("SUCCESS");
		}
	});
});
