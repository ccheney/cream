/**
 * Tests for Indicator Configuration Schemas
 */

import { describe, expect, test } from "bun:test";
import {
  ATRIndicatorConfigSchema,
  ATRParamsSchema,
  BollingerBandsIndicatorConfigSchema,
  BollingerBandsParamsSchema,
  EMAIndicatorConfigSchema,
  EMAParamsSchema,
  IndicatorConfigSchema,
  IndicatorName,
  RSIIndicatorConfigSchema,
  RSIParamsSchema,
  SMAIndicatorConfigSchema,
  SMAParamsSchema,
  StochasticIndicatorConfigSchema,
  StochasticParamsSchema,
  TypedIndicatorConfigSchema,
  VolumeSMAIndicatorConfigSchema,
  VolumeSMAParamsSchema,
} from "./indicators";

// ============================================
// IndicatorName Tests
// ============================================

describe("IndicatorName", () => {
  test("accepts valid indicator names", () => {
    const validNames = ["rsi", "stochastic", "sma", "ema", "atr", "bollinger_bands", "volume_sma"];
    for (const name of validNames) {
      expect(IndicatorName.parse(name)).toBe(name);
    }
  });

  test("rejects invalid indicator names", () => {
    expect(() => IndicatorName.parse("macd")).toThrow();
    expect(() => IndicatorName.parse("unknown")).toThrow();
  });
});

// ============================================
// Indicator Parameter Schema Tests
// ============================================

describe("RSIParamsSchema", () => {
  test("applies default period of 14", () => {
    const params = RSIParamsSchema.parse({});
    expect(params.period).toBe(14);
  });

  test("accepts custom period", () => {
    const params = RSIParamsSchema.parse({ period: 21 });
    expect(params.period).toBe(21);
  });

  test("rejects non-positive period", () => {
    expect(() => RSIParamsSchema.parse({ period: 0 })).toThrow();
    expect(() => RSIParamsSchema.parse({ period: -14 })).toThrow();
  });
});

describe("StochasticParamsSchema", () => {
  test("applies default values", () => {
    const params = StochasticParamsSchema.parse({});
    expect(params.k_period).toBe(14);
    expect(params.d_period).toBe(3);
    expect(params.slow).toBe(true);
  });

  test("accepts custom values", () => {
    const params = StochasticParamsSchema.parse({
      k_period: 5,
      d_period: 5,
      slow: false,
    });
    expect(params.k_period).toBe(5);
    expect(params.d_period).toBe(5);
    expect(params.slow).toBe(false);
  });
});

describe("SMAParamsSchema", () => {
  test("applies default periods", () => {
    const params = SMAParamsSchema.parse({});
    expect(params.periods).toEqual([20, 50, 200]);
  });

  test("accepts custom periods", () => {
    const params = SMAParamsSchema.parse({ periods: [10, 30] });
    expect(params.periods).toEqual([10, 30]);
  });

  test("requires at least one period", () => {
    expect(() => SMAParamsSchema.parse({ periods: [] })).toThrow();
  });
});

describe("EMAParamsSchema", () => {
  test("applies default periods", () => {
    const params = EMAParamsSchema.parse({});
    expect(params.periods).toEqual([9, 21]);
  });

  test("accepts custom periods", () => {
    const params = EMAParamsSchema.parse({ periods: [12, 26] });
    expect(params.periods).toEqual([12, 26]);
  });
});

describe("ATRParamsSchema", () => {
  test("applies default period of 14", () => {
    const params = ATRParamsSchema.parse({});
    expect(params.period).toBe(14);
  });

  test("accepts custom period", () => {
    const params = ATRParamsSchema.parse({ period: 20 });
    expect(params.period).toBe(20);
  });
});

describe("BollingerBandsParamsSchema", () => {
  test("applies default values", () => {
    const params = BollingerBandsParamsSchema.parse({});
    expect(params.period).toBe(20);
    expect(params.std_dev).toBe(2.0);
  });

  test("accepts custom values", () => {
    const params = BollingerBandsParamsSchema.parse({
      period: 10,
      std_dev: 2.5,
    });
    expect(params.period).toBe(10);
    expect(params.std_dev).toBe(2.5);
  });

  test("rejects non-positive std_dev", () => {
    expect(() => BollingerBandsParamsSchema.parse({ std_dev: 0 })).toThrow();
    expect(() => BollingerBandsParamsSchema.parse({ std_dev: -1 })).toThrow();
  });
});

describe("VolumeSMAParamsSchema", () => {
  test("applies default period of 20", () => {
    const params = VolumeSMAParamsSchema.parse({});
    expect(params.period).toBe(20);
  });
});

// ============================================
// Generic Indicator Config Tests
// ============================================

describe("IndicatorConfigSchema", () => {
  test("validates generic indicator config", () => {
    const config = IndicatorConfigSchema.parse({
      name: "custom_indicator",
      params: { custom_param: 42 },
      timeframes: ["1h", "4h"],
    });
    expect(config.name).toBe("custom_indicator");
    expect(config.params.custom_param).toBe(42);
    expect(config.timeframes).toEqual(["1h", "4h"]);
  });

  test("requires at least one timeframe", () => {
    expect(() =>
      IndicatorConfigSchema.parse({
        name: "rsi",
        params: {},
        timeframes: [],
      })
    ).toThrow();
  });

  test("requires non-empty name", () => {
    expect(() =>
      IndicatorConfigSchema.parse({
        name: "",
        params: {},
        timeframes: ["1h"],
      })
    ).toThrow();
  });
});

// ============================================
// Typed Indicator Config Tests
// ============================================

describe("RSIIndicatorConfigSchema", () => {
  test("validates RSI config with defaults", () => {
    const config = RSIIndicatorConfigSchema.parse({
      name: "rsi",
      params: {},
      timeframes: ["1h"],
    });
    expect(config.name).toBe("rsi");
    expect(config.params.period).toBe(14);
    expect(config.timeframes).toEqual(["1h"]);
  });

  test("rejects wrong name literal", () => {
    expect(() =>
      RSIIndicatorConfigSchema.parse({
        name: "sma",
        params: {},
        timeframes: ["1h"],
      })
    ).toThrow();
  });
});

describe("StochasticIndicatorConfigSchema", () => {
  test("validates stochastic config with defaults", () => {
    const config = StochasticIndicatorConfigSchema.parse({
      name: "stochastic",
      params: {},
      timeframes: ["1h", "4h"],
    });
    expect(config.name).toBe("stochastic");
    expect(config.params.k_period).toBe(14);
    expect(config.params.d_period).toBe(3);
    expect(config.params.slow).toBe(true);
  });
});

describe("SMAIndicatorConfigSchema", () => {
  test("validates SMA config with defaults", () => {
    const config = SMAIndicatorConfigSchema.parse({
      name: "sma",
      params: {},
      timeframes: ["1d"],
    });
    expect(config.name).toBe("sma");
    expect(config.params.periods).toEqual([20, 50, 200]);
  });

  test("accepts custom periods", () => {
    const config = SMAIndicatorConfigSchema.parse({
      name: "sma",
      params: { periods: [10, 20, 50] },
      timeframes: ["1h"],
    });
    expect(config.params.periods).toEqual([10, 20, 50]);
  });
});

describe("EMAIndicatorConfigSchema", () => {
  test("validates EMA config with defaults", () => {
    const config = EMAIndicatorConfigSchema.parse({
      name: "ema",
      params: {},
      timeframes: ["1h"],
    });
    expect(config.params.periods).toEqual([9, 21]);
  });
});

describe("ATRIndicatorConfigSchema", () => {
  test("validates ATR config with defaults", () => {
    const config = ATRIndicatorConfigSchema.parse({
      name: "atr",
      params: {},
      timeframes: ["1h"],
    });
    expect(config.params.period).toBe(14);
  });
});

describe("BollingerBandsIndicatorConfigSchema", () => {
  test("validates Bollinger Bands config with defaults", () => {
    const config = BollingerBandsIndicatorConfigSchema.parse({
      name: "bollinger_bands",
      params: {},
      timeframes: ["1h"],
    });
    expect(config.params.period).toBe(20);
    expect(config.params.std_dev).toBe(2.0);
  });
});

describe("VolumeSMAIndicatorConfigSchema", () => {
  test("validates Volume SMA config with defaults", () => {
    const config = VolumeSMAIndicatorConfigSchema.parse({
      name: "volume_sma",
      params: {},
      timeframes: ["1h"],
    });
    expect(config.params.period).toBe(20);
  });
});

// ============================================
// TypedIndicatorConfigSchema Union Tests
// ============================================

describe("TypedIndicatorConfigSchema", () => {
  test("accepts RSI config", () => {
    const config = TypedIndicatorConfigSchema.parse({
      name: "rsi",
      params: { period: 14 },
      timeframes: ["1h"],
    });
    expect(config.name).toBe("rsi");
  });

  test("accepts SMA config", () => {
    const config = TypedIndicatorConfigSchema.parse({
      name: "sma",
      params: { periods: [20, 50] },
      timeframes: ["1h"],
    });
    expect(config.name).toBe("sma");
  });

  test("accepts Bollinger Bands config", () => {
    const config = TypedIndicatorConfigSchema.parse({
      name: "bollinger_bands",
      params: { period: 20, std_dev: 2.0 },
      timeframes: ["1h"],
    });
    expect(config.name).toBe("bollinger_bands");
  });

  test("validates params match indicator type", () => {
    // RSI with wrong params structure should still work (default applied)
    const config = TypedIndicatorConfigSchema.parse({
      name: "rsi",
      params: {},
      timeframes: ["1h"],
    });
    expect(config.name).toBe("rsi");
    // The params should have the default period
    if (config.name === "rsi") {
      expect(config.params.period).toBe(14);
    }
  });
});

// ============================================
// Wilder Standard Defaults Tests
// ============================================

describe("Wilder Standard Defaults", () => {
  test("RSI uses Wilder's standard 14 period", () => {
    const config = RSIIndicatorConfigSchema.parse({
      name: "rsi",
      params: {},
      timeframes: ["1h"],
    });
    expect(config.params.period).toBe(14);
  });

  test("ATR uses Wilder's standard 14 period", () => {
    const config = ATRIndicatorConfigSchema.parse({
      name: "atr",
      params: {},
      timeframes: ["1h"],
    });
    expect(config.params.period).toBe(14);
  });

  test("Bollinger Bands uses standard 20 period, 2 std dev", () => {
    const config = BollingerBandsIndicatorConfigSchema.parse({
      name: "bollinger_bands",
      params: {},
      timeframes: ["1h"],
    });
    expect(config.params.period).toBe(20);
    expect(config.params.std_dev).toBe(2.0);
  });
});
