/**
 * Tests for Feature/Transform Configuration Schemas
 */

import { describe, test, expect } from "bun:test";
import {
  TransformName,
  ReturnsParamsSchema,
  ZScoreParamsSchema,
  PercentileRankParamsSchema,
  VolatilityScaleParamsSchema,
  TransformConfigSchema,
  NormalizationConfigSchema,
} from "./features";

// ============================================
// TransformName Tests
// ============================================

describe("TransformName", () => {
  test("accepts valid transform names", () => {
    const validNames = ["returns", "zscore", "percentile_rank", "volatility_scale"];
    for (const name of validNames) {
      expect(TransformName.parse(name)).toBe(name);
    }
  });

  test("rejects invalid transform names", () => {
    expect(() => TransformName.parse("minmax")).toThrow();
    expect(() => TransformName.parse("normalize")).toThrow();
  });
});

// ============================================
// Transform Parameter Schema Tests
// ============================================

describe("ReturnsParamsSchema", () => {
  test("validates periods array", () => {
    const params = ReturnsParamsSchema.parse({ periods: [1, 5, 20] });
    expect(params.periods).toEqual([1, 5, 20]);
  });

  test("requires at least one period", () => {
    expect(() => ReturnsParamsSchema.parse({ periods: [] })).toThrow();
  });

  test("requires positive periods", () => {
    expect(() => ReturnsParamsSchema.parse({ periods: [0] })).toThrow();
    expect(() => ReturnsParamsSchema.parse({ periods: [-1] })).toThrow();
  });
});

describe("ZScoreParamsSchema", () => {
  test("applies default lookback of 100", () => {
    const params = ZScoreParamsSchema.parse({});
    expect(params.lookback).toBe(100);
  });

  test("accepts custom lookback", () => {
    const params = ZScoreParamsSchema.parse({ lookback: 50 });
    expect(params.lookback).toBe(50);
  });

  test("requires positive lookback", () => {
    expect(() => ZScoreParamsSchema.parse({ lookback: 0 })).toThrow();
    expect(() => ZScoreParamsSchema.parse({ lookback: -10 })).toThrow();
  });
});

describe("PercentileRankParamsSchema", () => {
  test("applies default lookback of 252", () => {
    const params = PercentileRankParamsSchema.parse({});
    expect(params.lookback).toBe(252);
  });

  test("accepts custom lookback", () => {
    const params = PercentileRankParamsSchema.parse({ lookback: 100 });
    expect(params.lookback).toBe(100);
  });
});

describe("VolatilityScaleParamsSchema", () => {
  test("applies default vol_window of 20", () => {
    const params = VolatilityScaleParamsSchema.parse({});
    expect(params.vol_window).toBe(20);
  });

  test("accepts custom vol_window", () => {
    const params = VolatilityScaleParamsSchema.parse({ vol_window: 30 });
    expect(params.vol_window).toBe(30);
  });
});

// ============================================
// TransformConfigSchema Tests
// ============================================

describe("TransformConfigSchema", () => {
  describe("input/inputs validation", () => {
    test("accepts single input", () => {
      const config = TransformConfigSchema.parse({
        name: "returns",
        input: "close",
        params: { periods: [1, 5] },
        output_prefix: "return",
      });
      expect(config.input).toBe("close");
      expect(config.inputs).toBeUndefined();
    });

    test("accepts multiple inputs", () => {
      const config = TransformConfigSchema.parse({
        name: "zscore",
        inputs: ["rsi_14", "atr_14"],
        params: { lookback: 100 },
        output_suffix: "_zscore",
      });
      expect(config.inputs).toEqual(["rsi_14", "atr_14"]);
      expect(config.input).toBeUndefined();
    });

    test("rejects when neither input nor inputs provided", () => {
      expect(() =>
        TransformConfigSchema.parse({
          name: "zscore",
          params: { lookback: 100 },
        })
      ).toThrow();
    });

    test("rejects when both input and inputs provided", () => {
      expect(() =>
        TransformConfigSchema.parse({
          name: "zscore",
          input: "close",
          inputs: ["rsi_14"],
          params: {},
        })
      ).toThrow();
    });
  });

  describe("output naming", () => {
    test("accepts output_prefix", () => {
      const config = TransformConfigSchema.parse({
        name: "returns",
        input: "close",
        params: {},
        output_prefix: "return",
      });
      expect(config.output_prefix).toBe("return");
    });

    test("accepts output_suffix", () => {
      const config = TransformConfigSchema.parse({
        name: "zscore",
        inputs: ["rsi"],
        params: {},
        output_suffix: "_zscore",
      });
      expect(config.output_suffix).toBe("_zscore");
    });

    test("allows both prefix and suffix", () => {
      const config = TransformConfigSchema.parse({
        name: "custom",
        input: "value",
        params: {},
        output_prefix: "norm_",
        output_suffix: "_scaled",
      });
      expect(config.output_prefix).toBe("norm_");
      expect(config.output_suffix).toBe("_scaled");
    });
  });

  describe("params validation", () => {
    test("accepts arbitrary params", () => {
      const config = TransformConfigSchema.parse({
        name: "custom_transform",
        input: "value",
        params: { custom_param: 42, another: "value" },
      });
      expect(config.params.custom_param).toBe(42);
      expect(config.params.another).toBe("value");
    });

    test("requires params object", () => {
      expect(() =>
        TransformConfigSchema.parse({
          name: "zscore",
          inputs: ["rsi"],
          // missing params
        })
      ).toThrow();
    });
  });
});

// ============================================
// NormalizationConfigSchema Tests
// ============================================

describe("NormalizationConfigSchema", () => {
  test("validates array of transforms", () => {
    const config = NormalizationConfigSchema.parse({
      transforms: [
        {
          name: "returns",
          input: "close",
          params: { periods: [1, 5, 20] },
          output_prefix: "return",
        },
        {
          name: "zscore",
          inputs: ["rsi_14", "atr_14"],
          params: { lookback: 100 },
          output_suffix: "_zscore",
        },
      ],
    });
    expect(config.transforms).toHaveLength(2);
    expect(config.transforms[0].name).toBe("returns");
    expect(config.transforms[1].name).toBe("zscore");
  });

  test("accepts empty transforms array", () => {
    const config = NormalizationConfigSchema.parse({
      transforms: [],
    });
    expect(config.transforms).toEqual([]);
  });

  test("validates each transform in array", () => {
    expect(() =>
      NormalizationConfigSchema.parse({
        transforms: [
          {
            name: "zscore",
            // missing input/inputs
            params: {},
          },
        ],
      })
    ).toThrow();
  });
});

// ============================================
// Real-World Configuration Tests
// ============================================

describe("Real-World Configurations", () => {
  test("validates typical returns transform", () => {
    const config = TransformConfigSchema.parse({
      name: "returns",
      input: "close",
      params: { periods: [1, 5, 20] },
      output_prefix: "return",
    });
    expect(config.name).toBe("returns");
    expect(config.output_prefix).toBe("return");
  });

  test("validates typical z-score transform", () => {
    const config = TransformConfigSchema.parse({
      name: "zscore",
      inputs: ["rsi_14", "atr_14", "volume_sma_20"],
      params: { lookback: 100 },
      output_suffix: "_zscore",
    });
    expect(config.inputs).toHaveLength(3);
    expect(config.output_suffix).toBe("_zscore");
  });

  test("validates typical percentile rank transform", () => {
    const config = TransformConfigSchema.parse({
      name: "percentile_rank",
      inputs: ["close", "volume"],
      params: { lookback: 252 },
      output_suffix: "_pct",
    });
    expect(config.output_suffix).toBe("_pct");
  });

  test("validates typical volatility scale transform", () => {
    const config = TransformConfigSchema.parse({
      name: "volatility_scale",
      inputs: ["return_1h"],
      params: { vol_window: 20 },
      output_suffix: "_volscaled",
    });
    expect(config.output_suffix).toBe("_volscaled");
  });
});

// ============================================
// Best Practices Validation Tests
// ============================================

describe("Best Practices", () => {
  test("z-score lookback of 100 provides sufficient history", () => {
    const params = ZScoreParamsSchema.parse({});
    expect(params.lookback).toBeGreaterThanOrEqual(50);
  });

  test("percentile rank lookback of 252 approximates one year of hourly bars", () => {
    const params = PercentileRankParamsSchema.parse({});
    // ~252 trading days in a year, so 252 is a reasonable default
    expect(params.lookback).toBe(252);
  });

  test("volatility window of 20 is standard", () => {
    const params = VolatilityScaleParamsSchema.parse({});
    expect(params.vol_window).toBe(20);
  });
});
