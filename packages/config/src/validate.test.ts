import { describe, expect, it } from "bun:test";
import {
  CreamConfigSchema,
  validateAtStartup,
  validateConfig,
  validateConfigOrThrow,
} from "./validate";

describe("CreamConfigSchema", () => {
  const minimalValidConfig = {
    core: {
      environment: "PAPER",
      llm: {
        model_id: "gemini-3-pro-preview",
      },
    },
  };

  it("accepts minimal valid configuration", () => {
    const config = CreamConfigSchema.parse(minimalValidConfig);
    expect(config.core.environment).toBe("PAPER");
  });

  it("allows optional sections to be undefined", () => {
    const config = CreamConfigSchema.parse(minimalValidConfig);
    // Optional sections can be undefined
    expect(config.constraints).toBeUndefined();
    expect(config.memory).toBeUndefined();
    expect(config.agents).toBeUndefined();
    expect(config.execution).toBeUndefined();
    expect(config.metrics).toBeUndefined();
  });

  it("rejects missing core section", () => {
    expect(() => CreamConfigSchema.parse({})).toThrow();
  });

  it("rejects invalid environment", () => {
    expect(() =>
      CreamConfigSchema.parse({
        core: {
          environment: "INVALID",
          llm: { model_id: "gemini-3-pro-preview" },
        },
      })
    ).toThrow();
  });
});

describe("validateConfig", () => {
  const validConfig = {
    core: {
      environment: "PAPER",
      llm: {
        model_id: "gemini-3-pro-preview",
      },
    },
  };

  it("returns success for valid config", () => {
    const result = validateConfig(validConfig);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it("returns errors for invalid config", () => {
    const result = validateConfig({});
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.data).toBeUndefined();
  });

  it("includes path in error messages", () => {
    const result = validateConfig({
      core: {
        environment: "INVALID",
        llm: { model_id: "gemini-3-pro-preview" },
      },
    });
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("core.environment"))).toBe(true);
  });
});

describe("validateConfigOrThrow", () => {
  it("returns config for valid input", () => {
    const config = validateConfigOrThrow({
      core: {
        environment: "PAPER",
        llm: { model_id: "gemini-3-pro-preview" },
      },
    });
    expect(config.core.environment).toBe("PAPER");
  });

  it("throws for invalid input", () => {
    expect(() => validateConfigOrThrow({})).toThrow();
  });
});

describe("validateAtStartup", () => {
  const baseConfig = {
    core: {
      environment: "PAPER",
      llm: { model_id: "gemini-3-pro-preview" },
    },
  };

  it("returns success with empty warnings for valid PAPER config", () => {
    const result = validateAtStartup(baseConfig);
    expect(result.success).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns about LIVE environment without universe", () => {
    const result = validateAtStartup({
      core: {
        environment: "LIVE",
        llm: { model_id: "gemini-3-pro-preview" },
      },
    });
    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.includes("universe"))).toBe(true);
  });

  it("warns about flash model in LIVE environment", () => {
    const result = validateAtStartup({
      core: {
        environment: "LIVE",
        llm: { model_id: "gemini-3-flash-preview" },
      },
      universe: {
        compose_mode: "union",
        sources: [{ type: "static", name: "test", tickers: ["SPY"] }],
      },
    });
    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.includes("flash model"))).toBe(true);
  });

  it("warns about high per-instrument concentration in LIVE", () => {
    const result = validateAtStartup({
      core: {
        environment: "LIVE",
        llm: { model_id: "gemini-3-pro-preview" },
      },
      constraints: {
        per_instrument: {
          max_pct_equity: 0.25, // 25% > 20% threshold
        },
      },
      universe: {
        compose_mode: "union",
        sources: [{ type: "static", name: "test", tickers: ["SPY"] }],
      },
    });
    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.includes("max_pct_equity"))).toBe(true);
  });

  it("warns about high leverage in LIVE", () => {
    const result = validateAtStartup({
      core: {
        environment: "LIVE",
        llm: { model_id: "gemini-3-pro-preview" },
      },
      constraints: {
        portfolio: {
          max_gross_pct_equity: 4.0, // 4x > 3x threshold
        },
      },
      universe: {
        compose_mode: "union",
        sources: [{ type: "static", name: "test", tickers: ["SPY"] }],
      },
    });
    expect(result.success).toBe(true);
    expect(result.warnings.some((w) => w.includes("leverage"))).toBe(true);
  });
});
