/**
 * Parser Tests
 */

import { describe, expect, it } from "bun:test";
import type { FMPNewsArticle, FMPTranscript } from "../src/index.js";
import {
  calculateMacroSurprise,
  extractTranscriptSections,
  filterNewsBySymbols,
  filterRecentMacroReleases,
  filterRecentNews,
  groupByIndicator,
  isMacroReleaseSignificant,
  parseAlphaVantageIndicator,
  parseFMPEconomicEvents,
  parseNewsArticles,
  parseTranscript,
} from "../src/index.js";

describe("News Parser", () => {
  it("should parse valid news article", () => {
    const article: FMPNewsArticle = {
      symbol: "AAPL",
      publishedDate: "2026-01-05T10:00:00Z",
      title: "Apple Reports Record Q1 Earnings",
      site: "reuters.com",
      text: "Apple Inc. announced record quarterly earnings today, beating analyst expectations. The company reported revenue of $120 billion, driven by strong iPhone sales.",
      url: "https://reuters.com/article/apple-earnings",
    };

    const results = parseNewsArticles([article]);
    expect(results).toHaveLength(1);
    const firstResult = results[0];
    if (firstResult) {
      expect(firstResult.headline).toBe("Apple Reports Record Q1 Earnings");
      expect(firstResult.symbols).toEqual(["AAPL"]);
      expect(firstResult.source).toBe("reuters.com");
    }
  });

  it("should filter articles below minimum length", () => {
    const article: FMPNewsArticle = {
      publishedDate: "2026-01-05T10:00:00Z",
      title: "Short",
      site: "test",
      text: "Too short",
      url: "",
    };

    const results = parseNewsArticles([article], { minContentLength: 50 });
    expect(results).toHaveLength(0);
  });

  it("should filter recent news by age", () => {
    const now = new Date();
    const oldDate = new Date(now.getTime() - 48 * 60 * 60 * 1000); // 48 hours ago

    const articles = [
      {
        headline: "Recent",
        body: "test",
        publishedAt: now,
        source: "test",
      },
      {
        headline: "Old",
        body: "test",
        publishedAt: oldDate,
        source: "test",
      },
    ];

    const filtered = filterRecentNews(articles, 24);
    expect(filtered).toHaveLength(1);
    const firstFiltered = filtered[0];
    if (firstFiltered) {
      expect(firstFiltered.headline).toBe("Recent");
    }
  });

  it("should filter news by symbols", () => {
    const articles = [
      {
        headline: "Apple News",
        body: "test",
        publishedAt: new Date(),
        source: "test",
        symbols: ["AAPL"],
      },
      {
        headline: "Microsoft News",
        body: "test",
        publishedAt: new Date(),
        source: "test",
        symbols: ["MSFT"],
      },
    ];

    const filtered = filterNewsBySymbols(articles, ["AAPL"]);
    expect(filtered).toHaveLength(1);
    const firstFiltered = filtered[0];
    if (firstFiltered) {
      expect(firstFiltered.headline).toBe("Apple News");
    }
  });
});

describe("Transcript Parser", () => {
  it("should parse FMP transcript", () => {
    const transcript: FMPTranscript = {
      symbol: "AAPL",
      quarter: 1,
      year: 2026,
      date: "2026-01-05",
      content:
        "John Smith -- CEO: Welcome to our Q1 earnings call.\nJane Doe -- CFO: We are pleased to report strong results.",
    };

    const result = parseTranscript(transcript);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.symbol).toBe("AAPL");
      expect(result.quarter).toBe("Q1");
      expect(result.year).toBe(2026);
      expect(result.speakers.length).toBeGreaterThan(0);
    }
  });

  it("should extract transcript sections", () => {
    const transcript = {
      speakers: [
        { speaker: "CEO", text: "Welcome to our call." },
        { speaker: "Operator", text: "We will now begin the question and answer session." },
        { speaker: "Analyst", text: "Question about revenue?" },
      ],
      quarter: "Q1",
      year: 2026,
      symbol: "AAPL",
      date: new Date(),
    };

    const sections = extractTranscriptSections(transcript);
    expect(sections.prepared.length).toBeGreaterThan(0);
  });
});

describe("Macro Parser", () => {
  it("should parse Alpha Vantage indicator", () => {
    const response = {
      name: "Real GDP",
      interval: "quarterly",
      unit: "billions USD",
      data: [
        { date: "2026-01-01", value: "28000" },
        { date: "2025-10-01", value: "27500" },
      ],
    };

    const results = parseAlphaVantageIndicator(response);
    expect(results).toHaveLength(2);
    const firstResult = results[0];
    if (firstResult) {
      expect(firstResult.indicator).toBe("Real GDP");
      expect(firstResult.value).toBe(28000);
      expect(firstResult.previousValue).toBe(27500);
    }
  });

  it("should parse FMP economic events", () => {
    const events = [
      {
        date: "2026-01-05",
        country: "US",
        event: "Non-Farm Payrolls",
        actual: 250000,
        previous: 200000,
        estimate: 220000,
      },
    ];

    const results = parseFMPEconomicEvents(events);
    expect(results).toHaveLength(1);
    const firstResult = results[0];
    if (firstResult) {
      expect(firstResult.indicator).toBe("Non-Farm Payrolls");
      expect(firstResult.value).toBe(250000);
    }
  });

  it("should calculate macro surprise", () => {
    // Beat
    expect(calculateMacroSurprise(110, 100)).toBeGreaterThan(0);
    // Miss
    expect(calculateMacroSurprise(90, 100)).toBeLessThan(0);
    // Inline
    expect(calculateMacroSurprise(100, 100)).toBe(0);
  });

  it("should detect significant macro releases", () => {
    const significant = {
      indicator: "GDP",
      value: 3.5,
      previousValue: 3.0,
      date: new Date(),
      source: "test",
    };
    const insignificant = {
      indicator: "GDP",
      value: 3.01,
      previousValue: 3.0,
      date: new Date(),
      source: "test",
    };

    expect(isMacroReleaseSignificant(significant, 0.5)).toBe(true);
    expect(isMacroReleaseSignificant(insignificant, 0.5)).toBe(false);
  });

  it("should group by indicator", () => {
    const releases = [
      { indicator: "GDP", value: 3.0, date: new Date(), source: "test" },
      { indicator: "CPI", value: 2.5, date: new Date(), source: "test" },
      { indicator: "GDP", value: 2.8, date: new Date(Date.now() - 100000), source: "test" },
    ];

    const groups = groupByIndicator(releases);
    expect(groups.size).toBe(2);
    const gdpGroup = groups.get("GDP");
    const cpiGroup = groups.get("CPI");
    if (gdpGroup && cpiGroup) {
      expect(gdpGroup).toHaveLength(2);
      expect(cpiGroup).toHaveLength(1);
    }
  });

  it("should return empty array for empty Alpha Vantage data", () => {
    const response = {
      name: "Real GDP",
      interval: "quarterly",
      unit: "billions USD",
      data: [],
    };

    const results = parseAlphaVantageIndicator(response);
    expect(results).toHaveLength(0);
  });

  it("should return empty array for null/undefined Alpha Vantage data", () => {
    const response = {
      name: "Real GDP",
      interval: "quarterly",
      unit: "billions USD",
      data: undefined as unknown as { date: string; value: string }[],
    };

    const results = parseAlphaVantageIndicator(response);
    expect(results).toHaveLength(0);
  });

  it("should skip Alpha Vantage entries with invalid dates", () => {
    const response = {
      name: "Real GDP",
      interval: "quarterly",
      unit: "billions USD",
      data: [
        { date: "", value: "28000" },
        { date: "2026-01-01", value: "27500" },
      ],
    };

    const results = parseAlphaVantageIndicator(response);
    expect(results).toHaveLength(1);
    expect(results[0]?.value).toBe(27500);
  });

  it("should skip FMP events with null actual values", () => {
    const events = [
      {
        date: "2026-01-05",
        country: "US",
        event: "Non-Farm Payrolls",
        actual: null,
        previous: 200000,
      },
      {
        date: "2026-01-06",
        country: "US",
        event: "Unemployment Rate",
        actual: 3.7,
        previous: 3.8,
      },
    ];

    const results = parseFMPEconomicEvents(events);
    expect(results).toHaveLength(1);
    expect(results[0]?.indicator).toBe("Unemployment Rate");
  });

  it("should calculate surprise using previous when estimate is 0", () => {
    // When estimate is 0, should fall back to previous-based calculation
    const result = calculateMacroSurprise(110, 0, 100);
    // Should use previous-based: (110-100)/100 * 0.5 = 0.05
    expect(result).toBeCloseTo(0.05, 2);
  });

  it("should calculate surprise using previous when estimate is undefined", () => {
    const result = calculateMacroSurprise(110, undefined, 100);
    // (110-100)/100 * 0.5 = 0.05
    expect(result).toBeCloseTo(0.05, 2);
  });

  it("should return 0 surprise when no baseline available", () => {
    const result = calculateMacroSurprise(110, undefined, undefined);
    expect(result).toBe(0);
  });

  it("should return 0 surprise when previous is 0 and no estimate", () => {
    const result = calculateMacroSurprise(110, undefined, 0);
    expect(result).toBe(0);
  });

  it("should cap surprise at 1 for large beats", () => {
    const result = calculateMacroSurprise(200, 100);
    expect(result).toBe(1);
  });

  it("should cap surprise at -1 for large misses", () => {
    const result = calculateMacroSurprise(0, 100);
    expect(result).toBe(-1);
  });

  it("should consider release significant when previousValue is undefined", () => {
    const release = {
      indicator: "GDP",
      value: 3.5,
      previousValue: undefined,
      date: new Date(),
      source: "test",
    };

    expect(isMacroReleaseSignificant(release)).toBe(true);
  });

  it("should filter recent macro releases by age", () => {
    const now = new Date();
    const recentDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const oldDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // 14 days ago

    const releases = [
      { indicator: "GDP", value: 3.0, date: recentDate, source: "test" },
      { indicator: "CPI", value: 2.5, date: oldDate, source: "test" },
      { indicator: "Jobs", value: 250000, date: now, source: "test" },
    ];

    const filtered = filterRecentMacroReleases(releases, 7);
    expect(filtered).toHaveLength(2);
    expect(filtered.some((r) => r.indicator === "GDP")).toBe(true);
    expect(filtered.some((r) => r.indicator === "Jobs")).toBe(true);
    expect(filtered.some((r) => r.indicator === "CPI")).toBe(false);
  });

  it("should filter all old macro releases", () => {
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    const releases = [
      { indicator: "GDP", value: 3.0, date: oldDate, source: "test" },
      { indicator: "CPI", value: 2.5, date: oldDate, source: "test" },
    ];

    const filtered = filterRecentMacroReleases(releases, 7);
    expect(filtered).toHaveLength(0);
  });
});
