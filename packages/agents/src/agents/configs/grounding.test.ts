/**
 * Tests for Grounding Agent Configuration
 *
 * Verifies that the grounding agent is properly configured to use ONLY
 * google_search (native Gemini grounding) without any other tools.
 */

import { describe, expect, test } from "bun:test";

import { GROUNDING_AGENT_CONFIG } from "./groundingAgent.js";
import {
  BEARISH_RESEARCHER_CONFIG,
  BULLISH_RESEARCHER_CONFIG,
  FUNDAMENTALS_ANALYST_CONFIG,
  NEWS_ANALYST_CONFIG,
} from "./index.js";

describe("Grounding Agent Configuration", () => {
  test("grounding agent has ONLY google_search tool", () => {
    expect(GROUNDING_AGENT_CONFIG.tools).toEqual(["google_search"]);
    expect(GROUNDING_AGENT_CONFIG.tools).toHaveLength(1);
  });

  test("grounding agent type is grounding_agent", () => {
    expect(GROUNDING_AGENT_CONFIG.type).toBe("grounding_agent");
  });

  test("grounding agent has name and role", () => {
    expect(GROUNDING_AGENT_CONFIG.name).toBe("Web Grounding Agent");
    expect(GROUNDING_AGENT_CONFIG.role).toContain("web searches");
  });
});

describe("Other Agents Do NOT Have google_search", () => {
  test("news_analyst does not have google_search", () => {
    expect(NEWS_ANALYST_CONFIG.tools).not.toContain("google_search");
  });

  test("fundamentals_analyst does not have google_search", () => {
    expect(FUNDAMENTALS_ANALYST_CONFIG.tools).not.toContain("google_search");
  });

  test("bullish_researcher does not have google_search", () => {
    expect(BULLISH_RESEARCHER_CONFIG.tools).not.toContain("google_search");
  });

  test("bearish_researcher does not have google_search", () => {
    expect(BEARISH_RESEARCHER_CONFIG.tools).not.toContain("google_search");
  });
});

describe("Tool Separation Constraint", () => {
  test("no agent mixes google_search with other tools", () => {
    const configs = [
      NEWS_ANALYST_CONFIG,
      FUNDAMENTALS_ANALYST_CONFIG,
      BULLISH_RESEARCHER_CONFIG,
      BEARISH_RESEARCHER_CONFIG,
    ];

    for (const config of configs) {
      const hasGoogleSearch = config.tools.includes("google_search");
      const hasOtherTools = config.tools.filter((t) => t !== "google_search").length > 0;

      // If an agent has google_search, it must NOT have other tools
      // If an agent has other tools, it must NOT have google_search
      if (hasGoogleSearch && hasOtherTools) {
        throw new Error(
          `Agent ${config.type} mixes google_search with other tools. ` +
            `This is not allowed due to Gemini's native grounding limitation.`
        );
      }
    }
  });

  test("grounding_agent is the only agent with google_search", () => {
    const configsWithGoogleSearch = [
      NEWS_ANALYST_CONFIG,
      FUNDAMENTALS_ANALYST_CONFIG,
      BULLISH_RESEARCHER_CONFIG,
      BEARISH_RESEARCHER_CONFIG,
      GROUNDING_AGENT_CONFIG,
    ].filter((config) => config.tools.includes("google_search"));

    // Only grounding_agent should have google_search
    expect(configsWithGoogleSearch).toHaveLength(1);
    expect(configsWithGoogleSearch[0]?.type).toBe("grounding_agent");
  });
});
