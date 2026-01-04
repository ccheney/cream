import { describe, expect, it } from "bun:test";
import {
  ClassifierType,
  HMMConfigSchema,
  RegimeConfigSchema,
  RegimeLabel,
  RuleBasedConfigSchema,
} from "./regime";

describe("ClassifierType", () => {
  it("accepts valid classifier types", () => {
    expect(ClassifierType.parse("rule_based")).toBe("rule_based");
    expect(ClassifierType.parse("hmm")).toBe("hmm");
    expect(ClassifierType.parse("ml_model")).toBe("ml_model");
  });

  it("rejects invalid classifier types", () => {
    expect(() => ClassifierType.parse("random_forest")).toThrow();
  });
});

describe("RegimeLabel", () => {
  it("accepts valid regime labels", () => {
    expect(RegimeLabel.parse("BULL_TREND")).toBe("BULL_TREND");
    expect(RegimeLabel.parse("BEAR_TREND")).toBe("BEAR_TREND");
    expect(RegimeLabel.parse("RANGE")).toBe("RANGE");
    expect(RegimeLabel.parse("HIGH_VOL")).toBe("HIGH_VOL");
    expect(RegimeLabel.parse("LOW_VOL")).toBe("LOW_VOL");
  });

  it("rejects invalid regime labels", () => {
    expect(() => RegimeLabel.parse("SIDEWAYS")).toThrow();
  });
});

describe("RuleBasedConfigSchema", () => {
  it("applies default values", () => {
    const config = RuleBasedConfigSchema.parse({});
    expect(config.trend_ma_fast).toBe(20);
    expect(config.trend_ma_slow).toBe(50);
    expect(config.volatility_percentile_high).toBe(80);
    expect(config.volatility_percentile_low).toBe(20);
  });

  it("accepts custom values", () => {
    const config = RuleBasedConfigSchema.parse({
      trend_ma_fast: 10,
      trend_ma_slow: 30,
      volatility_percentile_high: 90,
      volatility_percentile_low: 10,
    });
    expect(config.trend_ma_fast).toBe(10);
    expect(config.volatility_percentile_high).toBe(90);
  });

  it("validates percentile range (0-100)", () => {
    expect(() =>
      RuleBasedConfigSchema.parse({
        volatility_percentile_high: 110,
      })
    ).toThrow();
  });
});

describe("HMMConfigSchema", () => {
  it("applies default values", () => {
    const config = HMMConfigSchema.parse({});
    expect(config.n_states).toBe(5);
    expect(config.retrain_frequency).toBe("weekly");
    expect(config.covariance_type).toBe("full");
    expect(config.n_iter).toBe(100);
  });

  it("validates n_states range (2-10)", () => {
    expect(() =>
      HMMConfigSchema.parse({
        n_states: 1,
      })
    ).toThrow();

    expect(() =>
      HMMConfigSchema.parse({
        n_states: 11,
      })
    ).toThrow();
  });

  it("validates retrain_frequency enum", () => {
    expect(HMMConfigSchema.parse({ retrain_frequency: "daily" }).retrain_frequency).toBe("daily");
    expect(HMMConfigSchema.parse({ retrain_frequency: "monthly" }).retrain_frequency).toBe(
      "monthly"
    );
  });

  it("validates covariance_type enum", () => {
    const types = ["full", "diag", "tied", "spherical"] as const;
    for (const type of types) {
      expect(HMMConfigSchema.parse({ covariance_type: type }).covariance_type).toBe(type);
    }
  });
});

describe("RegimeConfigSchema", () => {
  it("validates rule_based classifier requires rule_based config", () => {
    expect(() =>
      RegimeConfigSchema.parse({
        classifier_type: "rule_based",
      })
    ).toThrow();

    const config = RegimeConfigSchema.parse({
      classifier_type: "rule_based",
      rule_based: {},
    });
    expect(config.classifier_type).toBe("rule_based");
    expect(config.rule_based).toBeDefined();
  });

  it("validates hmm classifier requires hmm config", () => {
    expect(() =>
      RegimeConfigSchema.parse({
        classifier_type: "hmm",
      })
    ).toThrow();

    const config = RegimeConfigSchema.parse({
      classifier_type: "hmm",
      hmm: {},
    });
    expect(config.classifier_type).toBe("hmm");
    expect(config.hmm).toBeDefined();
  });

  it("validates ml_model classifier requires ml_model config", () => {
    expect(() =>
      RegimeConfigSchema.parse({
        classifier_type: "ml_model",
      })
    ).toThrow();

    const config = RegimeConfigSchema.parse({
      classifier_type: "ml_model",
      ml_model: {
        model_path: "/models/regime_classifier.pkl",
        features: ["return_5h", "atr_14"],
      },
    });
    expect(config.classifier_type).toBe("ml_model");
  });

  it("applies default labels", () => {
    const config = RegimeConfigSchema.parse({
      classifier_type: "rule_based",
      rule_based: {},
    });
    expect(config.labels).toEqual(["BULL_TREND", "BEAR_TREND", "RANGE", "HIGH_VOL", "LOW_VOL"]);
  });
});
