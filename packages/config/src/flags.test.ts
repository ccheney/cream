/**
 * Tests for Feature Flags Runtime
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  areFlagsInitialized,
  BUILT_IN_FLAGS,
  createFlagEvaluator,
  getFlags,
  initializeFlags,
  isCBRMemoryEnabled,
  isDebugLoggingEnabled,
  isHITLEnabled,
  isLiveExecutionEnabled,
  isOptionsEnabled,
  resetFlags,
} from "./flags.js";
import type { FeatureFlagsConfig } from "./schemas/flags.js";

// ============================================
// Test Setup
// ============================================

beforeEach(() => {
  resetFlags();
  // Clear any flag env vars
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("CREAM_FLAG_")) {
      delete process.env[key];
    }
  }
});

afterEach(() => {
  resetFlags();
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("CREAM_FLAG_")) {
      delete process.env[key];
    }
  }
});

// ============================================
// createFlagEvaluator Tests
// ============================================

describe("createFlagEvaluator", () => {
  describe("boolean flags", () => {
    test("returns default value when no overrides", () => {
      const config: FeatureFlagsConfig = {
        flags: [
          {
            id: "test_flag",
            type: "boolean",
            default_value: true,
            allow_env_override: true,
            deprecated: false,
          },
        ],
        defaults: { allow_env_override: true },
      };
      const evaluator = createFlagEvaluator(config, "PAPER");
      expect(evaluator.isEnabled("test_flag")).toBe(true);
    });

    test("returns environment override when matching", () => {
      const config: FeatureFlagsConfig = {
        flags: [
          {
            id: "test_flag",
            type: "boolean",
            default_value: false,
            environment_overrides: [{ environment: "PAPER", value: true }],
            allow_env_override: true,
            deprecated: false,
          },
        ],
        defaults: { allow_env_override: true },
      };
      const evaluator = createFlagEvaluator(config, "PAPER");
      expect(evaluator.isEnabled("test_flag")).toBe(true);
    });

    test("returns default when environment does not match", () => {
      const config: FeatureFlagsConfig = {
        flags: [
          {
            id: "test_flag",
            type: "boolean",
            default_value: false,
            environment_overrides: [{ environment: "LIVE", value: true }],
            allow_env_override: true,
            deprecated: false,
          },
        ],
        defaults: { allow_env_override: true },
      };
      const evaluator = createFlagEvaluator(config, "PAPER");
      expect(evaluator.isEnabled("test_flag")).toBe(false);
    });

    test("returns false for unknown flags", () => {
      const evaluator = createFlagEvaluator(undefined, "PAPER");
      expect(evaluator.isEnabled("unknown_flag")).toBe(false);
    });
  });

  describe("instrument overrides", () => {
    test("returns instrument override when matching", () => {
      const config: FeatureFlagsConfig = {
        flags: [
          {
            id: "test_flag",
            type: "boolean",
            default_value: false,
            instrument_overrides: [{ instruments: ["AAPL", "GOOGL"], value: true }],
            allow_env_override: true,
            deprecated: false,
          },
        ],
        defaults: { allow_env_override: true },
      };
      const evaluator = createFlagEvaluator(config, "PAPER");

      expect(evaluator.isEnabled("test_flag", "AAPL")).toBe(true);
      expect(evaluator.isEnabled("test_flag", "GOOGL")).toBe(true);
      expect(evaluator.isEnabled("test_flag", "MSFT")).toBe(false);
    });

    test("environment override takes precedence over default", () => {
      const config: FeatureFlagsConfig = {
        flags: [
          {
            id: "test_flag",
            type: "boolean",
            default_value: false,
            environment_overrides: [{ environment: "PAPER", value: true }],
            instrument_overrides: [{ instruments: ["AAPL"], value: false }],
            allow_env_override: true,
            deprecated: false,
          },
        ],
        defaults: { allow_env_override: true },
      };
      const evaluator = createFlagEvaluator(config, "PAPER");

      // Instrument override takes precedence over environment override
      expect(evaluator.isEnabled("test_flag", "AAPL")).toBe(false);
      // Without instrument, environment override applies
      expect(evaluator.isEnabled("test_flag")).toBe(true);
    });
  });

  describe("environment variable overrides", () => {
    test("env var overrides all other values", () => {
      process.env.CREAM_FLAG_TEST_FLAG = "true";

      const config: FeatureFlagsConfig = {
        flags: [
          {
            id: "test_flag",
            type: "boolean",
            default_value: false,
            allow_env_override: true,
            deprecated: false,
          },
        ],
        defaults: { allow_env_override: true },
      };
      const evaluator = createFlagEvaluator(config, "PAPER");
      expect(evaluator.isEnabled("test_flag")).toBe(true);
    });

    test("env var respects allow_env_override=false", () => {
      process.env.CREAM_FLAG_TEST_FLAG = "true";

      const config: FeatureFlagsConfig = {
        flags: [
          {
            id: "test_flag",
            type: "boolean",
            default_value: false,
            allow_env_override: false,
            deprecated: false,
          },
        ],
        defaults: { allow_env_override: true },
      };
      const evaluator = createFlagEvaluator(config, "PAPER");
      expect(evaluator.isEnabled("test_flag")).toBe(false);
    });

    test("env var parses boolean values correctly", () => {
      const config: FeatureFlagsConfig = {
        flags: [
          {
            id: "test_flag",
            type: "boolean",
            default_value: false,
            allow_env_override: true,
            deprecated: false,
          },
        ],
        defaults: { allow_env_override: true },
      };

      const testCases = [
        { value: "true", expected: true },
        { value: "TRUE", expected: true },
        { value: "1", expected: true },
        { value: "yes", expected: true },
        { value: "false", expected: false },
        { value: "FALSE", expected: false },
        { value: "0", expected: false },
        { value: "no", expected: false },
      ];

      for (const { value, expected } of testCases) {
        process.env.CREAM_FLAG_TEST_FLAG = value;
        const evaluator = createFlagEvaluator(config, "PAPER");
        expect(evaluator.isEnabled("test_flag")).toBe(expected);
      }
    });
  });

  describe("percentage flags", () => {
    test("returns percentage value", () => {
      const config: FeatureFlagsConfig = {
        flags: [
          {
            id: "rollout_pct",
            type: "percentage",
            default_value: 50,
            allow_env_override: true,
            deprecated: false,
          },
        ],
        defaults: { allow_env_override: true },
      };
      const evaluator = createFlagEvaluator(config, "PAPER");
      expect(evaluator.getPercentage("rollout_pct")).toBe(50);
    });

    test("checkPercentage returns consistent results for same seed", () => {
      const config: FeatureFlagsConfig = {
        flags: [
          {
            id: "rollout_pct",
            type: "percentage",
            default_value: 50,
            allow_env_override: true,
            deprecated: false,
          },
        ],
        defaults: { allow_env_override: true },
      };
      const evaluator = createFlagEvaluator(config, "PAPER");

      // Same seed should return same result
      const result1 = evaluator.checkPercentage("rollout_pct", "user123");
      const result2 = evaluator.checkPercentage("rollout_pct", "user123");
      expect(result1).toBe(result2);
    });

    test("checkPercentage respects 0% and 100%", () => {
      const config: FeatureFlagsConfig = {
        flags: [
          {
            id: "zero_pct",
            type: "percentage",
            default_value: 0,
            allow_env_override: true,
            deprecated: false,
          },
          {
            id: "full_pct",
            type: "percentage",
            default_value: 100,
            allow_env_override: true,
            deprecated: false,
          },
        ],
        defaults: { allow_env_override: true },
      };
      const evaluator = createFlagEvaluator(config, "PAPER");

      expect(evaluator.checkPercentage("zero_pct", "any_seed")).toBe(false);
      expect(evaluator.checkPercentage("full_pct", "any_seed")).toBe(true);
    });
  });

  describe("string flags", () => {
    test("returns string value", () => {
      const config: FeatureFlagsConfig = {
        flags: [
          {
            id: "variant",
            type: "string",
            default_value: "control",
            allow_env_override: true,
            deprecated: false,
          },
        ],
        defaults: { allow_env_override: true },
      };
      const evaluator = createFlagEvaluator(config, "PAPER");
      expect(evaluator.getString("variant")).toBe("control");
    });
  });

  describe("evaluate with metadata", () => {
    test("returns full evaluation result", () => {
      const config: FeatureFlagsConfig = {
        flags: [
          {
            id: "test_flag",
            type: "boolean",
            default_value: true,
            allow_env_override: true,
            deprecated: false,
          },
        ],
        defaults: { allow_env_override: true },
      };
      const evaluator = createFlagEvaluator(config, "PAPER");
      const result = evaluator.evaluate<boolean>("test_flag");

      expect(result.value).toBe(true);
      expect(result.source).toBe("default");
      expect(result.deprecated).toBe(false);
    });

    test("returns env_var source when overridden", () => {
      process.env.CREAM_FLAG_TEST_FLAG = "false";

      const config: FeatureFlagsConfig = {
        flags: [
          {
            id: "test_flag",
            type: "boolean",
            default_value: true,
            allow_env_override: true,
            deprecated: false,
          },
        ],
        defaults: { allow_env_override: true },
      };
      const evaluator = createFlagEvaluator(config, "PAPER");
      const result = evaluator.evaluate<boolean>("test_flag");

      expect(result.value).toBe(false);
      expect(result.source).toBe("env_var");
    });
  });

  describe("getAllFlags", () => {
    test("returns all flag values", () => {
      const evaluator = createFlagEvaluator(undefined, "PAPER");
      const allFlags = evaluator.getAllFlags();

      expect(allFlags[BUILT_IN_FLAGS.ENABLE_OPTIONS_TRADING]).toBeDefined();
      expect(allFlags[BUILT_IN_FLAGS.ENABLE_CBR_MEMORY]).toBeDefined();
    });
  });

  describe("getEnvironment", () => {
    test("returns current environment", () => {
      const evaluator = createFlagEvaluator(undefined, "LIVE");
      expect(evaluator.getEnvironment()).toBe("LIVE");
    });
  });
});

// ============================================
// Global Singleton Tests
// ============================================

describe("Global Singleton", () => {
  test("initializeFlags creates global evaluator", () => {
    expect(areFlagsInitialized()).toBe(false);
    initializeFlags(undefined, "PAPER");
    expect(areFlagsInitialized()).toBe(true);
  });

  test("getFlags returns initialized evaluator", () => {
    initializeFlags(undefined, "PAPER");
    const flags = getFlags();
    expect(flags.getEnvironment()).toBe("PAPER");
  });

  test("getFlags throws when not initialized", () => {
    expect(() => getFlags()).toThrow();
  });

  test("resetFlags clears global evaluator", () => {
    initializeFlags(undefined, "PAPER");
    expect(areFlagsInitialized()).toBe(true);
    resetFlags();
    expect(areFlagsInitialized()).toBe(false);
  });
});

// ============================================
// Convenience Function Tests
// ============================================

describe("Convenience Functions", () => {
  beforeEach(() => {
    initializeFlags(undefined, "PAPER");
  });

  test("isOptionsEnabled checks options flag", () => {
    // PAPER environment has options enabled by default
    expect(isOptionsEnabled()).toBe(true);
  });

  test("isLiveExecutionEnabled checks live execution flag", () => {
    // PAPER environment has live execution disabled
    expect(isLiveExecutionEnabled()).toBe(false);
  });

  test("isCBRMemoryEnabled checks CBR memory flag", () => {
    expect(isCBRMemoryEnabled()).toBe(true);
  });

  test("isHITLEnabled checks HITL flag", () => {
    // PAPER environment has HITL disabled
    expect(isHITLEnabled()).toBe(false);
  });

  test("isDebugLoggingEnabled checks debug flag", () => {
    expect(isDebugLoggingEnabled()).toBe(false);
  });
});

// ============================================
// Built-in Flags Environment Tests
// ============================================

describe("Built-in Flags by Environment", () => {
  describe("BACKTEST environment", () => {
    test("has expected flag values", () => {
      const evaluator = createFlagEvaluator(undefined, "BACKTEST");

      expect(evaluator.isEnabled(BUILT_IN_FLAGS.ENABLE_OPTIONS_TRADING)).toBe(true);
      expect(evaluator.isEnabled(BUILT_IN_FLAGS.ENABLE_LIVE_EXECUTION)).toBe(false);
      expect(evaluator.isEnabled(BUILT_IN_FLAGS.ENABLE_ARROW_FLIGHT)).toBe(true);
      expect(evaluator.isEnabled(BUILT_IN_FLAGS.ENABLE_REALTIME_STREAMING)).toBe(false);
    });
  });

  describe("PAPER environment", () => {
    test("has expected flag values", () => {
      const evaluator = createFlagEvaluator(undefined, "PAPER");

      expect(evaluator.isEnabled(BUILT_IN_FLAGS.ENABLE_OPTIONS_TRADING)).toBe(true);
      expect(evaluator.isEnabled(BUILT_IN_FLAGS.ENABLE_LIVE_EXECUTION)).toBe(false);
      expect(evaluator.isEnabled(BUILT_IN_FLAGS.ENABLE_REALTIME_STREAMING)).toBe(true);
    });
  });

  describe("LIVE environment", () => {
    test("has expected flag values", () => {
      const evaluator = createFlagEvaluator(undefined, "LIVE");

      expect(evaluator.isEnabled(BUILT_IN_FLAGS.ENABLE_OPTIONS_TRADING)).toBe(false);
      expect(evaluator.isEnabled(BUILT_IN_FLAGS.ENABLE_LIVE_EXECUTION)).toBe(true);
      expect(evaluator.isEnabled(BUILT_IN_FLAGS.ENABLE_HITL_ESCALATION)).toBe(true);
      expect(evaluator.isEnabled(BUILT_IN_FLAGS.ENABLE_REALTIME_STREAMING)).toBe(true);
      expect(evaluator.getPercentage(BUILT_IN_FLAGS.TRADE_REVIEW_PERCENTAGE)).toBe(10);
    });
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  test("handles undefined config", () => {
    const evaluator = createFlagEvaluator(undefined, "PAPER");
    // Should use default flags
    expect(evaluator.isEnabled(BUILT_IN_FLAGS.ENABLE_CBR_MEMORY)).toBe(true);
  });

  test("handles empty flags array", () => {
    const config: FeatureFlagsConfig = {
      flags: [],
      defaults: { allow_env_override: true },
    };
    const evaluator = createFlagEvaluator(config, "PAPER");
    // Should still have default flags
    expect(evaluator.isEnabled(BUILT_IN_FLAGS.ENABLE_CBR_MEMORY)).toBe(true);
  });

  test("handles invalid env var values gracefully", () => {
    process.env.CREAM_FLAG_TEST_FLAG = "invalid_boolean";

    const config: FeatureFlagsConfig = {
      flags: [
        {
          id: "test_flag",
          type: "boolean",
          default_value: true,
          allow_env_override: true,
          deprecated: false,
        },
      ],
      defaults: { allow_env_override: true },
    };
    const evaluator = createFlagEvaluator(config, "PAPER");
    // Should fall back to default since env var is invalid
    expect(evaluator.isEnabled("test_flag")).toBe(true);
  });

  test("percentage distribution is roughly uniform", () => {
    const config: FeatureFlagsConfig = {
      flags: [
        {
          id: "fifty_pct",
          type: "percentage",
          default_value: 50,
          allow_env_override: true,
          deprecated: false,
        },
      ],
      defaults: { allow_env_override: true },
    };
    const evaluator = createFlagEvaluator(config, "PAPER");

    // Test with 1000 different seeds
    let enabledCount = 0;
    for (let i = 0; i < 1000; i++) {
      if (evaluator.checkPercentage("fifty_pct", `seed_${i}`)) {
        enabledCount++;
      }
    }

    // Should be roughly 50% (allow 10% margin)
    expect(enabledCount).toBeGreaterThan(400);
    expect(enabledCount).toBeLessThan(600);
  });
});
