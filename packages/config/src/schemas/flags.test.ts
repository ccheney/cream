/**
 * Tests for Feature Flags Schema
 */

import { describe, expect, test } from "bun:test";
import {
  BUILT_IN_FLAGS,
  DEFAULT_FLAGS,
  EnvironmentOverrideSchema,
  FeatureFlagSchema,
  FeatureFlagsConfigSchema,
  FlagVariantType,
  InstrumentOverrideSchema,
  getDefaultFlagsConfig,
  mergeFlagsWithDefaults,
  validateUniqueFlags,
} from "./flags.js";

// ============================================
// FlagVariantType Tests
// ============================================

describe("FlagVariantType", () => {
  test("accepts valid variant types", () => {
    const validTypes = ["boolean", "percentage", "string"];
    for (const type of validTypes) {
      expect(FlagVariantType.parse(type)).toBe(type);
    }
  });

  test("rejects invalid variant types", () => {
    expect(() => FlagVariantType.parse("number")).toThrow();
    expect(() => FlagVariantType.parse("array")).toThrow();
  });
});

// ============================================
// EnvironmentOverrideSchema Tests
// ============================================

describe("EnvironmentOverrideSchema", () => {
  test("accepts valid environment overrides", () => {
    const override = EnvironmentOverrideSchema.parse({
      environment: "PAPER",
      value: true,
    });
    expect(override.environment).toBe("PAPER");
    expect(override.value).toBe(true);
  });

  test("accepts number values for percentage", () => {
    const override = EnvironmentOverrideSchema.parse({
      environment: "LIVE",
      value: 50,
    });
    expect(override.value).toBe(50);
  });

  test("accepts string values", () => {
    const override = EnvironmentOverrideSchema.parse({
      environment: "BACKTEST",
      value: "variant_a",
    });
    expect(override.value).toBe("variant_a");
  });

  test("rejects invalid environments", () => {
    expect(() =>
      EnvironmentOverrideSchema.parse({
        environment: "PRODUCTION",
        value: true,
      })
    ).toThrow();
  });
});

// ============================================
// InstrumentOverrideSchema Tests
// ============================================

describe("InstrumentOverrideSchema", () => {
  test("accepts valid instrument overrides", () => {
    const override = InstrumentOverrideSchema.parse({
      instruments: ["AAPL", "GOOGL"],
      value: true,
    });
    expect(override.instruments).toEqual(["AAPL", "GOOGL"]);
    expect(override.value).toBe(true);
  });

  test("rejects empty instruments array", () => {
    expect(() =>
      InstrumentOverrideSchema.parse({
        instruments: [],
        value: true,
      })
    ).toThrow();
  });

  test("rejects empty instrument strings", () => {
    expect(() =>
      InstrumentOverrideSchema.parse({
        instruments: [""],
        value: true,
      })
    ).toThrow();
  });
});

// ============================================
// FeatureFlagSchema Tests
// ============================================

describe("FeatureFlagSchema", () => {
  describe("id validation", () => {
    test("accepts valid snake_case ids", () => {
      const flag = FeatureFlagSchema.parse({
        id: "enable_feature",
        type: "boolean",
        default_value: true,
      });
      expect(flag.id).toBe("enable_feature");
    });

    test("accepts ids with numbers", () => {
      const flag = FeatureFlagSchema.parse({
        id: "feature_v2",
        type: "boolean",
        default_value: true,
      });
      expect(flag.id).toBe("feature_v2");
    });

    test("rejects uppercase ids", () => {
      expect(() =>
        FeatureFlagSchema.parse({
          id: "ENABLE_FEATURE",
          type: "boolean",
          default_value: true,
        })
      ).toThrow();
    });

    test("rejects ids starting with numbers", () => {
      expect(() =>
        FeatureFlagSchema.parse({
          id: "2feature",
          type: "boolean",
          default_value: true,
        })
      ).toThrow();
    });

    test("rejects hyphenated ids", () => {
      expect(() =>
        FeatureFlagSchema.parse({
          id: "enable-feature",
          type: "boolean",
          default_value: true,
        })
      ).toThrow();
    });
  });

  describe("type validation", () => {
    test("boolean flag requires boolean default_value", () => {
      const flag = FeatureFlagSchema.parse({
        id: "test_flag",
        type: "boolean",
        default_value: true,
      });
      expect(flag.default_value).toBe(true);
    });

    test("boolean flag rejects number default_value", () => {
      expect(() =>
        FeatureFlagSchema.parse({
          id: "test_flag",
          type: "boolean",
          default_value: 50,
        })
      ).toThrow();
    });

    test("percentage flag requires number default_value", () => {
      const flag = FeatureFlagSchema.parse({
        id: "test_flag",
        type: "percentage",
        default_value: 50,
      });
      expect(flag.default_value).toBe(50);
    });

    test("percentage flag rejects values > 100", () => {
      expect(() =>
        FeatureFlagSchema.parse({
          id: "test_flag",
          type: "percentage",
          default_value: 150,
        })
      ).toThrow();
    });

    test("percentage flag rejects negative values", () => {
      expect(() =>
        FeatureFlagSchema.parse({
          id: "test_flag",
          type: "percentage",
          default_value: -10,
        })
      ).toThrow();
    });

    test("string flag requires string default_value", () => {
      const flag = FeatureFlagSchema.parse({
        id: "test_flag",
        type: "string",
        default_value: "variant_a",
      });
      expect(flag.default_value).toBe("variant_a");
    });
  });

  describe("deprecation validation", () => {
    test("deprecated flag requires deprecation_message", () => {
      expect(() =>
        FeatureFlagSchema.parse({
          id: "old_flag",
          type: "boolean",
          default_value: true,
          deprecated: true,
        })
      ).toThrow();
    });

    test("deprecated flag with message is valid", () => {
      const flag = FeatureFlagSchema.parse({
        id: "old_flag",
        type: "boolean",
        default_value: true,
        deprecated: true,
        deprecation_message: "Use new_flag instead",
      });
      expect(flag.deprecated).toBe(true);
      expect(flag.deprecation_message).toBe("Use new_flag instead");
    });
  });

  describe("overrides", () => {
    test("accepts environment overrides", () => {
      const flag = FeatureFlagSchema.parse({
        id: "test_flag",
        type: "boolean",
        default_value: false,
        environment_overrides: [
          { environment: "PAPER", value: true },
          { environment: "LIVE", value: false },
        ],
      });
      expect(flag.environment_overrides).toHaveLength(2);
    });

    test("accepts instrument overrides", () => {
      const flag = FeatureFlagSchema.parse({
        id: "test_flag",
        type: "boolean",
        default_value: false,
        instrument_overrides: [
          { instruments: ["AAPL", "GOOGL"], value: true },
        ],
      });
      expect(flag.instrument_overrides).toHaveLength(1);
    });
  });

  describe("defaults", () => {
    test("allow_env_override defaults to true", () => {
      const flag = FeatureFlagSchema.parse({
        id: "test_flag",
        type: "boolean",
        default_value: true,
      });
      expect(flag.allow_env_override).toBe(true);
    });

    test("deprecated defaults to false", () => {
      const flag = FeatureFlagSchema.parse({
        id: "test_flag",
        type: "boolean",
        default_value: true,
      });
      expect(flag.deprecated).toBe(false);
    });
  });
});

// ============================================
// FeatureFlagsConfigSchema Tests
// ============================================

describe("FeatureFlagsConfigSchema", () => {
  test("accepts valid config", () => {
    const config = FeatureFlagsConfigSchema.parse({
      flags: [
        {
          id: "feature_a",
          type: "boolean",
          default_value: true,
        },
        {
          id: "feature_b",
          type: "percentage",
          default_value: 50,
        },
      ],
    });
    expect(config.flags).toHaveLength(2);
  });

  test("accepts empty flags array", () => {
    const config = FeatureFlagsConfigSchema.parse({
      flags: [],
    });
    expect(config.flags).toEqual([]);
  });

  test("applies default values", () => {
    const config = FeatureFlagsConfigSchema.parse({});
    expect(config.flags).toEqual([]);
    expect(config.defaults.allow_env_override).toBe(true);
  });

  test("validates each flag in array", () => {
    expect(() =>
      FeatureFlagsConfigSchema.parse({
        flags: [
          {
            id: "InvalidId",
            type: "boolean",
            default_value: true,
          },
        ],
      })
    ).toThrow();
  });
});

// ============================================
// Built-in Flags Tests
// ============================================

describe("Built-in Flags", () => {
  test("BUILT_IN_FLAGS contains expected flags", () => {
    expect(BUILT_IN_FLAGS.ENABLE_OPTIONS_TRADING).toBe("enable_options_trading");
    expect(BUILT_IN_FLAGS.ENABLE_LIVE_EXECUTION).toBe("enable_live_execution");
    expect(BUILT_IN_FLAGS.ENABLE_CBR_MEMORY).toBe("enable_cbr_memory");
    expect(BUILT_IN_FLAGS.ENABLE_HITL_ESCALATION).toBe("enable_hitl_escalation");
  });

  test("DEFAULT_FLAGS are all valid", () => {
    for (const flag of DEFAULT_FLAGS) {
      expect(() => FeatureFlagSchema.parse(flag)).not.toThrow();
    }
  });

  test("DEFAULT_FLAGS have unique IDs", () => {
    expect(validateUniqueFlags(DEFAULT_FLAGS)).toBe(true);
  });

  test("getDefaultFlagsConfig returns valid config", () => {
    const config = getDefaultFlagsConfig();
    expect(() => FeatureFlagsConfigSchema.parse(config)).not.toThrow();
  });
});

// ============================================
// Utility Function Tests
// ============================================

describe("Utility Functions", () => {
  describe("mergeFlagsWithDefaults", () => {
    test("returns defaults when no user flags", () => {
      const merged = mergeFlagsWithDefaults([]);
      expect(merged.length).toBe(DEFAULT_FLAGS.length);
    });

    test("user flags override defaults", () => {
      const userFlags = [
        {
          id: "enable_options_trading",
          type: "boolean" as const,
          default_value: true, // Override default false
          allow_env_override: true,
          deprecated: false,
        },
      ];
      const merged = mergeFlagsWithDefaults(userFlags);

      const optionsFlag = merged.find(
        (f) => f.id === "enable_options_trading"
      );
      expect(optionsFlag?.default_value).toBe(true);
    });

    test("user flags can add new flags", () => {
      const userFlags = [
        {
          id: "custom_flag",
          type: "boolean" as const,
          default_value: true,
          allow_env_override: true,
          deprecated: false,
        },
      ];
      const merged = mergeFlagsWithDefaults(userFlags);

      const customFlag = merged.find((f) => f.id === "custom_flag");
      expect(customFlag).toBeDefined();
      expect(merged.length).toBe(DEFAULT_FLAGS.length + 1);
    });
  });

  describe("validateUniqueFlags", () => {
    test("returns true for unique flags", () => {
      const flags = [
        { id: "flag_a", type: "boolean" as const, default_value: true, allow_env_override: true, deprecated: false },
        { id: "flag_b", type: "boolean" as const, default_value: false, allow_env_override: true, deprecated: false },
      ];
      expect(validateUniqueFlags(flags)).toBe(true);
    });

    test("returns false for duplicate flags", () => {
      const flags = [
        { id: "flag_a", type: "boolean" as const, default_value: true, allow_env_override: true, deprecated: false },
        { id: "flag_a", type: "boolean" as const, default_value: false, allow_env_override: true, deprecated: false },
      ];
      expect(validateUniqueFlags(flags)).toBe(false);
    });
  });
});

// ============================================
// Real-World Configuration Tests
// ============================================

describe("Real-World Configurations", () => {
  test("validates typical gradual rollout config", () => {
    const config = FeatureFlagsConfigSchema.parse({
      flags: [
        {
          id: "new_algorithm",
          description: "New trading algorithm for improved returns",
          type: "percentage",
          default_value: 0,
          environment_overrides: [
            { environment: "BACKTEST", value: 100 },
            { environment: "PAPER", value: 50 },
            { environment: "LIVE", value: 10 },
          ],
        },
      ],
    });
    expect(config.flags[0].environment_overrides).toHaveLength(3);
  });

  test("validates instrument-specific feature config", () => {
    const config = FeatureFlagsConfigSchema.parse({
      flags: [
        {
          id: "enable_high_vol_strategy",
          description: "Enable high-volatility strategy for select instruments",
          type: "boolean",
          default_value: false,
          instrument_overrides: [
            { instruments: ["TSLA", "NVDA", "AMD"], value: true },
          ],
        },
      ],
    });
    expect(config.flags[0].instrument_overrides?.[0].instruments).toHaveLength(3);
  });
});
