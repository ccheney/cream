import { describe, expect, it } from "bun:test";
import { AgentType, CHANNELS, Channel, CyclePhase } from "./index.js";

describe("Channel Enum", () => {
	it("includes all expected channels", () => {
		expect(CHANNELS).toContain("quotes");
		expect(CHANNELS).toContain("trades");
		expect(CHANNELS).toContain("orders");
		expect(CHANNELS).toContain("decisions");
		expect(CHANNELS).toContain("agents");
		expect(CHANNELS).toContain("cycles");
		expect(CHANNELS).toContain("alerts");
		expect(CHANNELS).toContain("system");
		expect(CHANNELS).toContain("portfolio");
		expect(CHANNELS).toContain("scanner");
	});

	it("validates valid and invalid channels", () => {
		expect(Channel.safeParse("quotes").success).toBe(true);
		expect(Channel.safeParse("invalid").success).toBe(false);
	});
});

describe("AgentType Enum", () => {
	it("accepts abbreviated websocket agent types", () => {
		const validTypes = ["news", "fundamentals", "bullish", "bearish", "trader", "risk", "critic"];
		for (const type of validTypes) {
			expect(AgentType.safeParse(type).success).toBe(true);
		}
	});

	it("rejects invalid agent types", () => {
		expect(AgentType.safeParse("unknown_agent").success).toBe(false);
		expect(AgentType.safeParse("news_analyst").success).toBe(false);
	});
});

describe("CyclePhase Enum", () => {
	it("accepts OODA phases", () => {
		const phases = ["observe", "orient", "decide", "act", "complete", "error"];
		for (const phase of phases) {
			expect(CyclePhase.safeParse(phase).success).toBe(true);
		}
	});
});
