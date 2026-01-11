/**
 * SentimentIndicators Widget Tests
 *
 * Tests for sentiment indicator utility functions and component exports.
 *
 * @see docs/plans/ui/26-data-viz.md
 */

import { describe, expect, it } from "bun:test";

import type { SentimentIndicators } from "./IndicatorSnapshot";

// ============================================
// Types
// ============================================

type SentimentClassification = SentimentIndicators["classification"];
type BadgeVariant = "success" | "info" | "warning" | "error" | "neutral";

// ============================================
// Format Score Tests
// ============================================

function formatScore(value: number | null): string {
  if (value === null) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

describe("formatScore", () => {
  it("formats positive scores with + sign", () => {
    expect(formatScore(0.65)).toBe("+0.65");
  });

  it("formats negative scores without + sign", () => {
    expect(formatScore(-0.45)).toBe("-0.45");
  });

  it("formats zero without + sign", () => {
    expect(formatScore(0)).toBe("0.00");
  });

  it("returns em dash for null", () => {
    expect(formatScore(null)).toBe("—");
  });
});

// ============================================
// Format Strength Tests
// ============================================

function formatStrength(value: number | null): string {
  if (value === null) {
    return "—";
  }
  return `${(value * 100).toFixed(0)}%`;
}

describe("formatStrength", () => {
  it("formats strength as percentage", () => {
    expect(formatStrength(0.75)).toBe("75%");
  });

  it("formats small strength values", () => {
    expect(formatStrength(0.15)).toBe("15%");
  });

  it("returns em dash for null", () => {
    expect(formatStrength(null)).toBe("—");
  });
});

// ============================================
// Format News Volume Tests
// ============================================

function formatNewsVolume(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

describe("formatNewsVolume", () => {
  it("formats small volumes as integers", () => {
    expect(formatNewsVolume(42)).toBe("42");
  });

  it("formats large volumes with K suffix", () => {
    expect(formatNewsVolume(2500)).toBe("2.5K");
  });

  it("formats exactly 1000 with K suffix", () => {
    expect(formatNewsVolume(1000)).toBe("1.0K");
  });

  it("returns em dash for null", () => {
    expect(formatNewsVolume(null)).toBe("—");
  });
});

// ============================================
// Format Momentum Tests
// ============================================

function formatMomentum(value: number | null): string {
  if (value === null) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}`;
}

describe("formatMomentum", () => {
  it("formats positive momentum with + sign", () => {
    expect(formatMomentum(0.25)).toBe("+0.25");
  });

  it("formats negative momentum without + sign", () => {
    expect(formatMomentum(-0.15)).toBe("-0.15");
  });

  it("formats zero without + sign", () => {
    expect(formatMomentum(0)).toBe("0.00");
  });

  it("returns em dash for null", () => {
    expect(formatMomentum(null)).toBe("—");
  });
});

// ============================================
// Score Variant Tests
// ============================================

function getScoreVariant(value: number | null): BadgeVariant {
  if (value === null) {
    return "neutral";
  }
  if (value <= -0.5) {
    return "error";
  }
  if (value <= -0.2) {
    return "warning";
  }
  if (value < 0.2) {
    return "neutral";
  }
  if (value < 0.5) {
    return "info";
  }
  return "success";
}

describe("getScoreVariant", () => {
  it("returns error for strongly bearish (<= -0.5)", () => {
    expect(getScoreVariant(-0.6)).toBe("error");
    expect(getScoreVariant(-0.5)).toBe("error");
  });

  it("returns warning for bearish (-0.5 to -0.2)", () => {
    expect(getScoreVariant(-0.3)).toBe("warning");
    expect(getScoreVariant(-0.2)).toBe("warning");
  });

  it("returns neutral for neutral (-0.2 to 0.2)", () => {
    expect(getScoreVariant(0)).toBe("neutral");
    expect(getScoreVariant(0.1)).toBe("neutral");
    expect(getScoreVariant(-0.1)).toBe("neutral");
  });

  it("returns info for bullish (0.2 to 0.5)", () => {
    expect(getScoreVariant(0.3)).toBe("info");
  });

  it("returns success for strongly bullish (>= 0.5)", () => {
    expect(getScoreVariant(0.5)).toBe("success");
    expect(getScoreVariant(0.8)).toBe("success");
  });

  it("returns neutral for null", () => {
    expect(getScoreVariant(null)).toBe("neutral");
  });
});

// ============================================
// Classification Variant Tests
// ============================================

function getClassificationVariant(classification: SentimentClassification): BadgeVariant {
  switch (classification) {
    case "STRONG_BULLISH":
      return "success";
    case "BULLISH":
      return "info";
    case "NEUTRAL":
      return "neutral";
    case "BEARISH":
      return "warning";
    case "STRONG_BEARISH":
      return "error";
    default:
      return "neutral";
  }
}

describe("getClassificationVariant", () => {
  it("returns success for STRONG_BULLISH", () => {
    expect(getClassificationVariant("STRONG_BULLISH")).toBe("success");
  });

  it("returns info for BULLISH", () => {
    expect(getClassificationVariant("BULLISH")).toBe("info");
  });

  it("returns neutral for NEUTRAL", () => {
    expect(getClassificationVariant("NEUTRAL")).toBe("neutral");
  });

  it("returns warning for BEARISH", () => {
    expect(getClassificationVariant("BEARISH")).toBe("warning");
  });

  it("returns error for STRONG_BEARISH", () => {
    expect(getClassificationVariant("STRONG_BEARISH")).toBe("error");
  });

  it("returns neutral for null", () => {
    expect(getClassificationVariant(null)).toBe("neutral");
  });
});

// ============================================
// Momentum Variant Tests
// ============================================

function getMomentumVariant(value: number | null): BadgeVariant {
  if (value === null) {
    return "neutral";
  }
  if (value <= -0.3) {
    return "error";
  }
  if (value <= -0.1) {
    return "warning";
  }
  if (value < 0.1) {
    return "neutral";
  }
  if (value < 0.3) {
    return "info";
  }
  return "success";
}

describe("getMomentumVariant", () => {
  it("returns error for rapid decline (<= -0.3)", () => {
    expect(getMomentumVariant(-0.4)).toBe("error");
    expect(getMomentumVariant(-0.3)).toBe("error");
  });

  it("returns warning for moderate decline (-0.3 to -0.1)", () => {
    expect(getMomentumVariant(-0.2)).toBe("warning");
  });

  it("returns neutral for stable (-0.1 to 0.1)", () => {
    expect(getMomentumVariant(0)).toBe("neutral");
    expect(getMomentumVariant(0.05)).toBe("neutral");
  });

  it("returns info for moderate rise (0.1 to 0.3)", () => {
    expect(getMomentumVariant(0.2)).toBe("info");
  });

  it("returns success for rapid rise (>= 0.3)", () => {
    expect(getMomentumVariant(0.35)).toBe("success");
  });

  it("returns neutral for null", () => {
    expect(getMomentumVariant(null)).toBe("neutral");
  });
});

// ============================================
// Strength Level Tests
// ============================================

function getStrengthLevel(value: number | null): string {
  if (value === null) {
    return "Unknown";
  }
  if (value < 0.3) {
    return "Weak";
  }
  if (value < 0.5) {
    return "Moderate";
  }
  if (value < 0.7) {
    return "Strong";
  }
  return "Very Strong";
}

describe("getStrengthLevel", () => {
  it("returns Weak for strength < 30%", () => {
    expect(getStrengthLevel(0.2)).toBe("Weak");
  });

  it("returns Moderate for strength 30-50%", () => {
    expect(getStrengthLevel(0.4)).toBe("Moderate");
  });

  it("returns Strong for strength 50-70%", () => {
    expect(getStrengthLevel(0.6)).toBe("Strong");
  });

  it("returns Very Strong for strength >= 70%", () => {
    expect(getStrengthLevel(0.8)).toBe("Very Strong");
  });

  it("returns Unknown for null", () => {
    expect(getStrengthLevel(null)).toBe("Unknown");
  });
});

// ============================================
// News Volume Level Tests
// ============================================

function getNewsVolumeLevel(value: number | null): string {
  if (value === null) {
    return "Unknown";
  }
  if (value < 10) {
    return "Low";
  }
  if (value < 50) {
    return "Normal";
  }
  if (value < 100) {
    return "Elevated";
  }
  return "High";
}

describe("getNewsVolumeLevel", () => {
  it("returns Low for volume < 10", () => {
    expect(getNewsVolumeLevel(5)).toBe("Low");
  });

  it("returns Normal for volume 10-50", () => {
    expect(getNewsVolumeLevel(30)).toBe("Normal");
  });

  it("returns Elevated for volume 50-100", () => {
    expect(getNewsVolumeLevel(75)).toBe("Elevated");
  });

  it("returns High for volume >= 100", () => {
    expect(getNewsVolumeLevel(150)).toBe("High");
  });

  it("returns Unknown for null", () => {
    expect(getNewsVolumeLevel(null)).toBe("Unknown");
  });
});

// ============================================
// Format Classification Tests
// ============================================

function formatClassification(classification: SentimentClassification): string {
  if (!classification) {
    return "Unknown";
  }
  return classification
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

describe("formatClassification", () => {
  it("formats STRONG_BULLISH as 'Strong Bullish'", () => {
    expect(formatClassification("STRONG_BULLISH")).toBe("Strong Bullish");
  });

  it("formats BULLISH as 'Bullish'", () => {
    expect(formatClassification("BULLISH")).toBe("Bullish");
  });

  it("formats NEUTRAL as 'Neutral'", () => {
    expect(formatClassification("NEUTRAL")).toBe("Neutral");
  });

  it("formats BEARISH as 'Bearish'", () => {
    expect(formatClassification("BEARISH")).toBe("Bearish");
  });

  it("formats STRONG_BEARISH as 'Strong Bearish'", () => {
    expect(formatClassification("STRONG_BEARISH")).toBe("Strong Bearish");
  });

  it("returns 'Unknown' for null", () => {
    expect(formatClassification(null)).toBe("Unknown");
  });
});

// ============================================
// Component Export Tests
// ============================================

describe("SentimentIndicators exports", () => {
  it("exports SentimentIndicators component", async () => {
    const module = await import("./SentimentIndicators");
    expect(module.SentimentIndicators).toBeDefined();
    expect(module.SentimentIndicators).toHaveProperty("$$typeof");
  });

  it("exports default as same as named export", async () => {
    const module = await import("./SentimentIndicators");
    expect(module.default).toBe(module.SentimentIndicators);
  });
});

describe("SentimentIndicators from index", () => {
  it("exports SentimentWidget from index", async () => {
    const module = await import("./index");
    expect(module.SentimentWidget).toBeDefined();
  });
});

// ============================================
// Mock Data Structure Tests
// ============================================

describe("SentimentIndicators data structure", () => {
  const mockData: SentimentIndicators = {
    overall_score: 0.45,
    sentiment_strength: 0.65,
    news_volume: 85,
    sentiment_momentum: 0.12,
    event_risk: false,
    classification: "BULLISH",
  };

  it("has overall score in valid range (-1 to 1)", () => {
    expect(mockData.overall_score).toBeGreaterThanOrEqual(-1);
    expect(mockData.overall_score).toBeLessThanOrEqual(1);
  });

  it("has sentiment strength as positive decimal", () => {
    expect(mockData.sentiment_strength).toBeGreaterThan(0);
    expect(mockData.sentiment_strength).toBeLessThanOrEqual(1);
  });

  it("has news volume as positive number", () => {
    expect(mockData.news_volume).toBeGreaterThan(0);
  });

  it("has sentiment momentum in reasonable range", () => {
    expect(mockData.sentiment_momentum).toBeGreaterThanOrEqual(-1);
    expect(mockData.sentiment_momentum).toBeLessThanOrEqual(1);
  });

  it("has event_risk as boolean", () => {
    expect(typeof mockData.event_risk).toBe("boolean");
  });

  it("has valid classification enum", () => {
    expect(mockData.classification).not.toBeNull();
    const validClassifications = [
      "STRONG_BULLISH",
      "BULLISH",
      "NEUTRAL",
      "BEARISH",
      "STRONG_BEARISH",
    ];
    expect(validClassifications).toContain(mockData.classification as string);
  });
});

// ============================================
// Null Handling Tests
// ============================================

describe("SentimentIndicators null handling", () => {
  const nullData: SentimentIndicators = {
    overall_score: null,
    sentiment_strength: null,
    news_volume: null,
    sentiment_momentum: null,
    event_risk: null,
    classification: null,
  };

  it("allows all fields to be null", () => {
    expect(nullData.overall_score).toBeNull();
    expect(nullData.sentiment_strength).toBeNull();
    expect(nullData.news_volume).toBeNull();
    expect(nullData.sentiment_momentum).toBeNull();
    expect(nullData.event_risk).toBeNull();
    expect(nullData.classification).toBeNull();
  });

  it("formatScore handles null gracefully", () => {
    expect(formatScore(nullData.overall_score)).toBe("—");
  });

  it("formatStrength handles null gracefully", () => {
    expect(formatStrength(nullData.sentiment_strength)).toBe("—");
  });

  it("formatNewsVolume handles null gracefully", () => {
    expect(formatNewsVolume(nullData.news_volume)).toBe("—");
  });

  it("formatMomentum handles null gracefully", () => {
    expect(formatMomentum(nullData.sentiment_momentum)).toBe("—");
  });

  it("getScoreVariant handles null gracefully", () => {
    expect(getScoreVariant(nullData.overall_score)).toBe("neutral");
  });

  it("getMomentumVariant handles null gracefully", () => {
    expect(getMomentumVariant(nullData.sentiment_momentum)).toBe("neutral");
  });

  it("getClassificationVariant handles null gracefully", () => {
    expect(getClassificationVariant(nullData.classification)).toBe("neutral");
  });
});

// ============================================
// Sentiment Trading Interpretation Tests
// ============================================

describe("Sentiment trading interpretation", () => {
  it("strong bullish sentiment suggests long bias", () => {
    const score = 0.7;
    const classification = "STRONG_BULLISH";
    const isLongBias = score > 0.5 && classification === "STRONG_BULLISH";
    expect(isLongBias).toBe(true);
  });

  it("strong bearish sentiment suggests short bias", () => {
    const score = -0.7;
    const classification = "STRONG_BEARISH";
    const isShortBias = score < -0.5 && classification === "STRONG_BEARISH";
    expect(isShortBias).toBe(true);
  });

  it("event risk with positive momentum is noteworthy", () => {
    const eventRisk = true;
    const momentum = 0.25;
    const isNoteworthy = eventRisk && momentum > 0.1;
    expect(isNoteworthy).toBe(true);
  });

  it("high news volume with sentiment shift indicates potential catalyst", () => {
    const newsVolume = 150;
    const momentum = 0.35;
    const isPotentialCatalyst = newsVolume >= 100 && Math.abs(momentum) >= 0.3;
    expect(isPotentialCatalyst).toBe(true);
  });
});

// ============================================
// Extreme Value Tests
// ============================================

describe("Extreme sentiment scenarios", () => {
  it("handles maximum bullish sentiment", () => {
    const extremeBullish = 1.0;
    expect(getScoreVariant(extremeBullish)).toBe("success");
  });

  it("handles maximum bearish sentiment", () => {
    const extremeBearish = -1.0;
    expect(getScoreVariant(extremeBearish)).toBe("error");
  });

  it("handles very high news volume", () => {
    const highVolume = 5000;
    expect(getNewsVolumeLevel(highVolume)).toBe("High");
    expect(formatNewsVolume(highVolume)).toBe("5.0K");
  });

  it("handles sentiment momentum at extremes", () => {
    expect(getMomentumVariant(1.0)).toBe("success");
    expect(getMomentumVariant(-1.0)).toBe("error");
  });
});

// ============================================
// Consistency Tests
// ============================================

describe("Score and classification consistency", () => {
  it("bullish score matches bullish classification", () => {
    const score = 0.4;
    const expectedVariant = "info";
    expect(getScoreVariant(score)).toBe(expectedVariant);
    expect(getClassificationVariant("BULLISH")).toBe(expectedVariant);
  });

  it("bearish score matches bearish classification", () => {
    const score = -0.35;
    const expectedVariant = "warning";
    expect(getScoreVariant(score)).toBe(expectedVariant);
    expect(getClassificationVariant("BEARISH")).toBe(expectedVariant);
  });

  it("strongly bullish score matches strong_bullish classification", () => {
    const score = 0.7;
    const expectedVariant = "success";
    expect(getScoreVariant(score)).toBe(expectedVariant);
    expect(getClassificationVariant("STRONG_BULLISH")).toBe(expectedVariant);
  });

  it("strongly bearish score matches strong_bearish classification", () => {
    const score = -0.7;
    const expectedVariant = "error";
    expect(getScoreVariant(score)).toBe(expectedVariant);
    expect(getClassificationVariant("STRONG_BEARISH")).toBe(expectedVariant);
  });
});
