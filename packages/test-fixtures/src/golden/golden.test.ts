/**
 * Golden Dataset Infrastructure Tests
 */

import { describe, expect, it } from "bun:test";
import {
  checkGoldenStaleness,
  getAllGoldenCaseIds,
  getGoldenDatasetStats,
  hasGoldenDataset,
  loadGoldenCase,
  loadGoldenInput,
  loadGoldenMetadata,
  loadGoldenOutput,
} from "./loader.js";
import {
  checkStaleness,
  GoldenAgentType,
  GoldenCaseMetadataSchema,
  GoldenDatasetMetadataSchema,
  MarketRegime,
  ScenarioCategory,
} from "./schema.js";

// ============================================
// Schema Tests
// ============================================

describe("GoldenAgentType", () => {
  it("should validate all agent types", () => {
    const agents = [
      "trader",
      "technical_analyst",
      "news_analyst",
      "fundamentals_analyst",
      "bullish_research",
      "bearish_research",
      "risk_manager",
      "critic",
    ];

    for (const agent of agents) {
      expect(() => GoldenAgentType.parse(agent)).not.toThrow();
    }
  });

  it("should reject invalid agent types", () => {
    expect(() => GoldenAgentType.parse("invalid")).toThrow();
  });
});

describe("MarketRegime", () => {
  it("should validate all regimes", () => {
    const regimes = [
      "bull_trend",
      "bear_trend",
      "range",
      "high_vol",
      "low_vol",
      "crash",
      "recovery",
    ];

    for (const regime of regimes) {
      expect(() => MarketRegime.parse(regime)).not.toThrow();
    }
  });
});

describe("ScenarioCategory", () => {
  it("should validate all scenarios", () => {
    const scenarios = [
      "momentum",
      "mean_reversion",
      "breakout",
      "earnings",
      "macro_event",
      "sector_rotation",
      "risk_off",
      "adversarial",
    ];

    for (const scenario of scenarios) {
      expect(() => ScenarioCategory.parse(scenario)).not.toThrow();
    }
  });
});

describe("GoldenCaseMetadataSchema", () => {
  it("should validate a valid case", () => {
    const validCase = {
      id: "trader_001",
      agent: "trader",
      scenario: "momentum",
      regime: "bull_trend",
      created: "2026-01",
      refreshed: "2026-01",
      tags: ["high_confidence"],
      adversarial: false,
    };

    expect(() => GoldenCaseMetadataSchema.parse(validCase)).not.toThrow();
  });

  it("should reject invalid case id", () => {
    const invalidCase = {
      id: "",
      agent: "trader",
      scenario: "momentum",
      regime: "bull_trend",
      created: "2026-01",
      refreshed: "2026-01",
    };

    expect(() => GoldenCaseMetadataSchema.parse(invalidCase)).toThrow();
  });

  it("should accept date with full precision", () => {
    const fullDateCase = {
      id: "trader_001",
      agent: "trader",
      scenario: "momentum",
      regime: "bull_trend",
      created: "2026-01-04",
      refreshed: "2026-01-04",
    };

    expect(() => GoldenCaseMetadataSchema.parse(fullDateCase)).not.toThrow();
  });
});

describe("GoldenDatasetMetadataSchema", () => {
  it("should validate metadata with cases", () => {
    const metadata = {
      dataset_version: "1.0.0",
      created: "2026-01-04",
      last_refreshed: "2026-01-04",
      cases: [
        {
          id: "trader_001",
          agent: "trader",
          scenario: "momentum",
          regime: "bull_trend",
          created: "2026-01",
          refreshed: "2026-01",
        },
      ],
    };

    expect(() => GoldenDatasetMetadataSchema.parse(metadata)).not.toThrow();
  });

  it("should require valid version format", () => {
    const invalidMetadata = {
      dataset_version: "1.0",
      created: "2026-01-04",
      last_refreshed: "2026-01-04",
      cases: [],
    };

    expect(() => GoldenDatasetMetadataSchema.parse(invalidMetadata)).toThrow();
  });
});

// ============================================
// Staleness Tests
// ============================================

describe("checkStaleness", () => {
  it("should return fresh for recent dataset", () => {
    const today = new Date().toISOString().split("T")[0];
    if (!today) {
      throw new Error("Failed to get today's date");
    }
    const result = checkStaleness(today);

    expect(result.isStale).toBe(false);
    expect(result.isCritical).toBe(false);
    expect(result.ageMonths).toBe(0);
  });

  it("should warn for dataset older than 6 months", () => {
    const sevenMonthsAgo = new Date();
    sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);
    const dateStr = sevenMonthsAgo.toISOString().split("T")[0];
    if (!dateStr) {
      throw new Error("Failed to get date string");
    }

    const result = checkStaleness(dateStr);

    expect(result.isStale).toBe(true);
    expect(result.isCritical).toBe(false);
    expect(result.ageMonths).toBe(7);
  });

  it("should mark critical for dataset older than 12 months", () => {
    const thirteenMonthsAgo = new Date();
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
    const dateStr = thirteenMonthsAgo.toISOString().split("T")[0];
    if (!dateStr) {
      throw new Error("Failed to get date string");
    }

    const result = checkStaleness(dateStr);

    expect(result.isStale).toBe(true);
    expect(result.isCritical).toBe(true);
    expect(result.ageMonths).toBe(13);
  });
});

// ============================================
// Loader Tests
// ============================================

describe("loadGoldenMetadata", () => {
  it("should load and validate metadata", () => {
    const metadata = loadGoldenMetadata();

    expect(metadata.dataset_version).toBe("1.0.0");
    expect(metadata.cases.length).toBeGreaterThan(0);
  });
});

describe("loadGoldenInput", () => {
  it("should load trader input", () => {
    const input = loadGoldenInput("trader", "001");

    expect(input).toBeDefined();
    expect((input as { symbol: string }).symbol).toBe("AAPL");
  });

  it("should throw for non-existent input", () => {
    expect(() => loadGoldenInput("trader", "999")).toThrow();
  });
});

describe("loadGoldenOutput", () => {
  it("should load trader output", () => {
    const output = loadGoldenOutput("trader", "001");

    expect(output).toBeDefined();
    expect((output as { decision: { action: string } }).decision.action).toBe("BUY");
  });
});

describe("loadGoldenCase", () => {
  it("should load both input and output", () => {
    const { input, output, metadata } = loadGoldenCase("trader", "001");

    expect(input).toBeDefined();
    expect(output).toBeDefined();
    expect(metadata?.id).toBe("trader_001");
  });
});

describe("getAllGoldenCaseIds", () => {
  it("should return case IDs for trader", () => {
    const caseIds = getAllGoldenCaseIds("trader");

    expect(caseIds).toContain("001");
  });

  it("should return empty for agent with no cases", () => {
    const caseIds = getAllGoldenCaseIds("news_analyst");

    expect(caseIds).toHaveLength(0);
  });
});

describe("hasGoldenDataset", () => {
  it("should return true for trader", () => {
    expect(hasGoldenDataset("trader")).toBe(true);
  });

  it("should return false for empty agent directory", () => {
    expect(hasGoldenDataset("news_analyst")).toBe(false);
  });
});

describe("checkGoldenStaleness", () => {
  it("should return staleness check result", () => {
    const result = checkGoldenStaleness();

    expect(result).toBeDefined();
    expect(typeof result.isStale).toBe("boolean");
    expect(typeof result.isCritical).toBe("boolean");
    expect(typeof result.ageMonths).toBe("number");
  });
});

describe("getGoldenDatasetStats", () => {
  it("should return dataset statistics", () => {
    const stats = getGoldenDatasetStats();

    expect(stats.totalCases).toBeGreaterThan(0);
    expect(stats.byAgent.trader).toBeGreaterThan(0);
    expect(stats.byRegime.bull_trend).toBeGreaterThan(0);
  });
});
