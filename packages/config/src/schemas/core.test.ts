import { describe, it, expect } from "bun:test";
import {
  CreamEnvironment,
  LLMConfigSchema,
  TimeframesConfigSchema,
  CoreConfigSchema,
} from "./core";

describe("CreamEnvironment", () => {
  it("accepts valid environment values", () => {
    expect(CreamEnvironment.parse("BACKTEST")).toBe("BACKTEST");
    expect(CreamEnvironment.parse("PAPER")).toBe("PAPER");
    expect(CreamEnvironment.parse("LIVE")).toBe("LIVE");
  });

  it("rejects invalid environment values", () => {
    expect(() => CreamEnvironment.parse("PRODUCTION")).toThrow();
    expect(() => CreamEnvironment.parse("DEV")).toThrow();
  });
});

describe("LLMConfigSchema", () => {
  it("accepts valid Gemini model IDs", () => {
    const config = LLMConfigSchema.parse({
      model_id: "gemini-3-pro-preview",
    });
    expect(config.model_id).toBe("gemini-3-pro-preview");
  });

  it("accepts gemini-3-flash model", () => {
    const config = LLMConfigSchema.parse({
      model_id: "gemini-3-flash-preview",
    });
    expect(config.model_id).toBe("gemini-3-flash-preview");
  });

  it("rejects non-Gemini models", () => {
    expect(() =>
      LLMConfigSchema.parse({
        model_id: "gpt-4",
      })
    ).toThrow();
  });

  it("rejects older Gemini models", () => {
    expect(() =>
      LLMConfigSchema.parse({
        model_id: "gemini-1.5-pro",
      })
    ).toThrow();
  });

  it("applies default temperature of 0", () => {
    const config = LLMConfigSchema.parse({
      model_id: "gemini-3-pro-preview",
    });
    expect(config.temperature).toBe(0);
  });

  it("applies default max_tokens of 4096", () => {
    const config = LLMConfigSchema.parse({
      model_id: "gemini-3-pro-preview",
    });
    expect(config.max_tokens).toBe(4096);
  });

  it("validates temperature range (0-2)", () => {
    expect(() =>
      LLMConfigSchema.parse({
        model_id: "gemini-3-pro-preview",
        temperature: -0.1,
      })
    ).toThrow();

    expect(() =>
      LLMConfigSchema.parse({
        model_id: "gemini-3-pro-preview",
        temperature: 2.1,
      })
    ).toThrow();
  });

  it("validates max_tokens range (1-65536)", () => {
    expect(() =>
      LLMConfigSchema.parse({
        model_id: "gemini-3-pro-preview",
        max_tokens: 0,
      })
    ).toThrow();

    expect(() =>
      LLMConfigSchema.parse({
        model_id: "gemini-3-pro-preview",
        max_tokens: 100000,
      })
    ).toThrow();
  });
});

describe("TimeframesConfigSchema", () => {
  it("applies default primary timeframe of 1h", () => {
    const config = TimeframesConfigSchema.parse({});
    expect(config.primary).toBe("1h");
  });

  it("applies default additional timeframes", () => {
    const config = TimeframesConfigSchema.parse({});
    expect(config.additional).toEqual(["4h", "1d"]);
  });

  it("accepts custom timeframes", () => {
    const config = TimeframesConfigSchema.parse({
      primary: "15m",
      additional: ["1h", "4h"],
    });
    expect(config.primary).toBe("15m");
    expect(config.additional).toEqual(["1h", "4h"]);
  });
});

describe("CoreConfigSchema", () => {
  const validCore = {
    environment: "PAPER",
    llm: {
      model_id: "gemini-3-pro-preview",
    },
  };

  it("accepts valid core configuration", () => {
    const config = CoreConfigSchema.parse(validCore);
    expect(config.environment).toBe("PAPER");
    expect(config.llm.model_id).toBe("gemini-3-pro-preview");
  });

  it("applies default decision_timeframe of 1h", () => {
    const config = CoreConfigSchema.parse(validCore);
    expect(config.decision_timeframe).toBe("1h");
  });

  it("applies default iteration_cap of 3", () => {
    const config = CoreConfigSchema.parse(validCore);
    expect(config.iteration_cap).toBe(3);
  });

  it("validates iteration_cap range (1-10)", () => {
    expect(() =>
      CoreConfigSchema.parse({
        ...validCore,
        iteration_cap: 0,
      })
    ).toThrow();

    expect(() =>
      CoreConfigSchema.parse({
        ...validCore,
        iteration_cap: 11,
      })
    ).toThrow();
  });

  it("allows optional timeframes", () => {
    const config = CoreConfigSchema.parse(validCore);
    expect(config.timeframes).toBeUndefined();

    const configWithTimeframes = CoreConfigSchema.parse({
      ...validCore,
      timeframes: { primary: "4h" },
    });
    expect(configWithTimeframes.timeframes?.primary).toBe("4h");
  });
});
