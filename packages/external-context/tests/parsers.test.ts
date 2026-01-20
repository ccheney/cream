/**
 * Parser Tests
 */

import { describe, expect, it } from "bun:test";
import type { NewsArticle, TranscriptInput } from "../src/index.js";
import {
	calculateMacroSurprise,
	extractTranscriptSections,
	type FREDEconomicEvent,
	type FREDLatestValues,
	filterNewsBySymbols,
	filterRecentMacroReleases,
	filterRecentNews,
	filterSignificantFREDEvents,
	getExecutiveComments,
	groupByIndicator,
	isMacroReleaseSignificant,
	parseEconomicCalendarEvents,
	parseFREDObservations,
	parseFREDReleaseDates,
	parseNewsArticles,
	parseTranscript,
	sortFREDEventsByDateAndImpact,
} from "../src/index.js";

describe("News Parser", () => {
	it("should parse valid news article", () => {
		const article: NewsArticle = {
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
		const article: NewsArticle = {
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
	it("should parse transcript", () => {
		const transcript: TranscriptInput = {
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

	it("should return null for transcript with no content", () => {
		const transcript: TranscriptInput = {
			symbol: "AAPL",
			quarter: 1,
			year: 2026,
			date: "2026-01-05",
			content: "",
		};

		const result = parseTranscript(transcript);
		expect(result).toBeNull();
	});

	it("should return null for transcript with no symbol", () => {
		const transcript: TranscriptInput = {
			symbol: "",
			quarter: 1,
			year: 2026,
			date: "2026-01-05",
			content: "Some content",
		};

		const result = parseTranscript(transcript);
		expect(result).toBeNull();
	});

	it("should return null for transcript with invalid date", () => {
		const transcript: TranscriptInput = {
			symbol: "AAPL",
			quarter: 1,
			year: 2026,
			date: "invalid-date",
			content: "Some content",
		};

		const result = parseTranscript(transcript);
		expect(result).toBeNull();
	});

	it("should return null for transcript with empty date", () => {
		const transcript: TranscriptInput = {
			symbol: "AAPL",
			quarter: 1,
			year: 2026,
			date: "",
			content: "Some content",
		};

		const result = parseTranscript(transcript);
		expect(result).toBeNull();
	});

	it("should truncate very long content", () => {
		const longContent = `John Smith -- CEO: ${"A".repeat(60000)}`;
		const transcript: TranscriptInput = {
			symbol: "AAPL",
			quarter: 1,
			year: 2026,
			date: "2026-01-05",
			content: longContent,
		};

		const result = parseTranscript(transcript, { maxContentLength: 1000 });
		expect(result).not.toBeNull();
		if (result) {
			// Content should be truncated
			expect(result.speakers[0]?.text.length).toBeLessThanOrEqual(1000);
		}
	});

	it("should parse simple speaker pattern", () => {
		const transcript: TranscriptInput = {
			symbol: "AAPL",
			quarter: 1,
			year: 2026,
			date: "2026-01-05",
			content: "John Smith: Hello everyone.\nJane Doe: Thank you for joining.",
		};

		const result = parseTranscript(transcript);
		expect(result).not.toBeNull();
		if (result) {
			expect(result.speakers.length).toBe(2);
			expect(result.speakers[0]?.speaker).toBe("John Smith");
			expect(result.speakers[1]?.speaker).toBe("Jane Doe");
		}
	});

	it("should handle continuation lines", () => {
		const transcript: TranscriptInput = {
			symbol: "AAPL",
			quarter: 1,
			year: 2026,
			date: "2026-01-05",
			content: "John Smith: Line one.\nContinuation line.\nAnother continuation.",
		};

		const result = parseTranscript(transcript);
		expect(result).not.toBeNull();
		if (result) {
			expect(result.speakers.length).toBe(1);
			expect(result.speakers[0]?.text).toContain("Line one");
			expect(result.speakers[0]?.text).toContain("Continuation");
		}
	});

	it("should handle content with no speaker pattern", () => {
		const transcript: TranscriptInput = {
			symbol: "AAPL",
			quarter: 1,
			year: 2026,
			date: "2026-01-05",
			content: "This is just plain content without any speaker pattern.\nAnother line of content.",
		};

		const result = parseTranscript(transcript);
		expect(result).not.toBeNull();
		if (result) {
			expect(result.speakers.length).toBe(1);
			expect(result.speakers[0]?.speaker).toBe("Unknown");
		}
	});

	it("should filter short segments", () => {
		const transcript: TranscriptInput = {
			symbol: "AAPL",
			quarter: 1,
			year: 2026,
			date: "2026-01-05",
			content:
				"John Smith: Hi.\nJane Doe: This is a longer piece of content that should be included.",
		};

		const result = parseTranscript(transcript, { minSegmentLength: 20 });
		expect(result).not.toBeNull();
		if (result) {
			// First speaker's text "Hi." is too short, should be empty
			expect(result.speakers[0]?.text).toBe("");
			// Second speaker's text should be included
			expect(result.speakers[1]?.text.length).toBeGreaterThan(20);
		}
	});

	it("should skip empty lines", () => {
		const transcript: TranscriptInput = {
			symbol: "AAPL",
			quarter: 1,
			year: 2026,
			date: "2026-01-05",
			content: "John Smith: Hello.\n\n\nJane Doe: World.",
		};

		const result = parseTranscript(transcript);
		expect(result).not.toBeNull();
		if (result) {
			expect(result.speakers.length).toBe(2);
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

	it("should find Q&A section by alternative markers", () => {
		const transcript = {
			speakers: [
				{ speaker: "CEO", text: "Welcome to our call." },
				{ speaker: "CFO", text: "Now let us move to questions and answers." },
				{ speaker: "Analyst", text: "What about margins?" },
			],
			quarter: "Q1",
			year: 2026,
			symbol: "AAPL",
			date: new Date(),
		};

		const sections = extractTranscriptSections(transcript);
		expect(sections.qa.length).toBeGreaterThan(0);
	});

	it("should return all as prepared when no Q&A found", () => {
		const transcript = {
			speakers: [
				{ speaker: "CEO", text: "Welcome to our call." },
				{ speaker: "CFO", text: "Here are the results." },
			],
			quarter: "Q1",
			year: 2026,
			symbol: "AAPL",
			date: new Date(),
		};

		const sections = extractTranscriptSections(transcript);
		expect(sections.prepared).toHaveLength(2);
		expect(sections.qa).toHaveLength(0);
	});

	it("should return all as prepared when Q&A is first", () => {
		const transcript = {
			speakers: [
				{ speaker: "Operator", text: "We will begin the question and answer session." },
				{ speaker: "Analyst", text: "Question?" },
			],
			quarter: "Q1",
			year: 2026,
			symbol: "AAPL",
			date: new Date(),
		};

		const sections = extractTranscriptSections(transcript);
		expect(sections.prepared).toHaveLength(2);
		expect(sections.qa).toHaveLength(0);
	});

	it("should extract executive comments", () => {
		const transcript = {
			speakers: [
				{ speaker: "John Smith", role: "CEO", text: "Welcome to our call." },
				{ speaker: "Analyst", text: "Question about revenue?" },
				{ speaker: "Jane Doe", role: "CFO", text: "Great question about revenue." },
				{ speaker: "Bob Wilson", role: "COO", text: "Operations are strong." },
				{ speaker: "Alice Brown", role: "President", text: "Strategic updates." },
				{ speaker: "Tom Jones", role: "Chief Technology Officer", text: "Tech roadmap." },
				{ speaker: "Operator", text: "Next question please." },
			],
			quarter: "Q1",
			year: 2026,
			symbol: "AAPL",
			date: new Date(),
		};

		const executives = getExecutiveComments(transcript);
		expect(executives).toHaveLength(5);
		expect(executives.some((e) => e.role === "CEO")).toBe(true);
		expect(executives.some((e) => e.role === "CFO")).toBe(true);
		expect(executives.some((e) => e.role === "COO")).toBe(true);
		expect(executives.some((e) => e.role === "President")).toBe(true);
		expect(executives.some((e) => e.role === "Chief Technology Officer")).toBe(true);
	});

	it("should return empty array when no executives in transcript", () => {
		const transcript = {
			speakers: [
				{ speaker: "Analyst", text: "Question?" },
				{ speaker: "Operator", text: "Next question." },
			],
			quarter: "Q1",
			year: 2026,
			symbol: "AAPL",
			date: new Date(),
		};

		const executives = getExecutiveComments(transcript);
		expect(executives).toHaveLength(0);
	});
});

describe("Macro Parser", () => {
	it("should parse economic calendar events", () => {
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

		const results = parseEconomicCalendarEvents(events);
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

	it("should skip events with null actual values", () => {
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

		const results = parseEconomicCalendarEvents(events);
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

describe("FRED Parser", () => {
	describe("parseFREDReleaseDates", () => {
		it("should parse valid release dates", () => {
			const releaseDates = [
				{ release_id: 10, release_name: "Consumer Price Index", date: "2025-01-15" },
			];

			const events = parseFREDReleaseDates(releaseDates);

			expect(events).toHaveLength(1);
			const event = events[0];
			if (event) {
				expect(event.id).toBe("fred-10-2025-01-15");
				expect(event.name).toBe("Consumer Price Index");
				expect(event.date).toBe("2025-01-15");
				expect(event.impact).toBe("high"); // CPI is high impact
				expect(event.releaseId).toBe(10);
				expect(event.time).toBe("08:30:00"); // Default release time
				expect(event.forecast).toBeNull();
			}
		});

		it("should parse release dates with string release_id", () => {
			const releaseDates = [{ release_id: "50" as unknown as number, date: "2025-01-10" }];

			const events = parseFREDReleaseDates(releaseDates);

			expect(events).toHaveLength(1);
			const event = events[0];
			if (event) {
				expect(event.id).toBe("fred-50-2025-01-10");
				expect(event.impact).toBe("high"); // Employment is high impact
			}
		});

		it("should populate previous and actual from latestValues", () => {
			const releaseDates = [{ release_id: 10, date: "2025-01-15" }];
			const latestValues = new Map<number, FREDLatestValues>([
				[10, { previous: 315.5, actual: 316.2 }],
			]);

			const events = parseFREDReleaseDates(releaseDates, latestValues);

			expect(events).toHaveLength(1);
			const event = events[0];
			if (event) {
				expect(event.previous).toBe("315.5");
				expect(event.actual).toBe("316.2");
			}
		});

		it("should handle null values in latestValues", () => {
			const releaseDates = [{ release_id: 10, date: "2025-01-15" }];
			const latestValues = new Map<number, FREDLatestValues>([
				[10, { previous: null, actual: null }],
			]);

			const events = parseFREDReleaseDates(releaseDates, latestValues);

			expect(events).toHaveLength(1);
			const event = events[0];
			if (event) {
				expect(event.previous).toBeNull();
				expect(event.actual).toBeNull();
			}
		});

		it("should return empty array for empty input", () => {
			const events = parseFREDReleaseDates([]);
			expect(events).toHaveLength(0);
		});

		it("should use special release time for FOMC", () => {
			const releaseDates = [
				{ release_id: 101, release_name: "FOMC Press Release", date: "2025-01-29" },
			];

			const events = parseFREDReleaseDates(releaseDates);

			expect(events).toHaveLength(1);
			const event = events[0];
			if (event) {
				expect(event.time).toBe("14:00:00"); // FOMC at 2pm ET
				expect(event.impact).toBe("high");
			}
		});

		it("should fallback to release name when not in registry", () => {
			const releaseDates = [
				{ release_id: 99999, release_name: "Unknown Release", date: "2025-01-15" },
			];

			const events = parseFREDReleaseDates(releaseDates);

			expect(events).toHaveLength(1);
			const event = events[0];
			if (event) {
				expect(event.name).toBe("Unknown Release");
				expect(event.impact).toBe("low"); // Not in high/medium list
			}
		});

		it("should generate fallback name when no release_name", () => {
			const releaseDates = [{ release_id: 99999, date: "2025-01-15" }];

			const events = parseFREDReleaseDates(releaseDates);

			expect(events).toHaveLength(1);
			const event = events[0];
			if (event) {
				expect(event.name).toBe("FRED Release 99999");
			}
		});
	});

	describe("parseFREDObservations", () => {
		it("should parse valid observations", () => {
			const observations = [
				{ date: "2024-12-01", value: "315.605" },
				{ date: "2024-11-01", value: "314.123" },
			];

			const releases = parseFREDObservations("CPIAUCSL", observations);

			expect(releases).toHaveLength(2);
			const first = releases[0];
			if (first) {
				expect(first.indicator).toBe("CPI All Urban Consumers");
				expect(first.value).toBe(315.605);
				expect(first.previousValue).toBe(314.123);
				expect(first.source).toBe("FRED:CPIAUCSL");
				expect(first.unit).toBe("index");
			}
		});

		it("should use custom metadata when provided", () => {
			const observations = [{ date: "2024-12-01", value: "100.5" }];

			const releases = parseFREDObservations("CUSTOM", observations, {
				name: "Custom Indicator",
				unit: "custom_unit",
			});

			expect(releases).toHaveLength(1);
			const first = releases[0];
			if (first) {
				expect(first.indicator).toBe("Custom Indicator");
				expect(first.unit).toBe("custom_unit");
			}
		});

		it("should skip missing values marked with '.'", () => {
			const observations = [
				{ date: "2024-12-01", value: "." },
				{ date: "2024-11-01", value: "314.123" },
			];

			const releases = parseFREDObservations("CPIAUCSL", observations);

			expect(releases).toHaveLength(1);
			const first = releases[0];
			if (first) {
				expect(first.value).toBe(314.123);
			}
		});

		it("should skip empty string values", () => {
			const observations = [
				{ date: "2024-12-01", value: "" },
				{ date: "2024-11-01", value: "314.123" },
			];

			const releases = parseFREDObservations("CPIAUCSL", observations);

			expect(releases).toHaveLength(1);
		});

		it("should skip NaN values", () => {
			const observations = [
				{ date: "2024-12-01", value: "not-a-number" },
				{ date: "2024-11-01", value: "314.123" },
			];

			const releases = parseFREDObservations("CPIAUCSL", observations);

			expect(releases).toHaveLength(1);
			expect(releases[0]?.value).toBe(314.123);
		});

		it("should return empty array for empty observations", () => {
			const releases = parseFREDObservations("CPIAUCSL", []);
			expect(releases).toHaveLength(0);
		});

		it("should handle single observation without previousValue", () => {
			const observations = [{ date: "2024-12-01", value: "315.605" }];

			const releases = parseFREDObservations("CPIAUCSL", observations);

			expect(releases).toHaveLength(1);
			const first = releases[0];
			if (first) {
				expect(first.value).toBe(315.605);
				expect(first.previousValue).toBeUndefined();
			}
		});

		it("should skip to next valid observation for previousValue", () => {
			const observations = [
				{ date: "2024-12-01", value: "316.0" },
				{ date: "2024-11-01", value: "." }, // Skip this
				{ date: "2024-10-01", value: "314.0" },
			];

			const releases = parseFREDObservations("CPIAUCSL", observations);

			expect(releases).toHaveLength(2);
			const first = releases[0];
			if (first) {
				expect(first.value).toBe(316.0);
				expect(first.previousValue).toBe(314.0); // Should skip '.' and use 314.0
			}
		});

		it("should use seriesId when no metadata found", () => {
			const observations = [{ date: "2024-12-01", value: "100" }];

			const releases = parseFREDObservations("UNKNOWN_SERIES", observations);

			expect(releases).toHaveLength(1);
			const first = releases[0];
			if (first) {
				expect(first.indicator).toBe("UNKNOWN_SERIES");
				expect(first.unit).toBeUndefined();
			}
		});
	});

	describe("filterSignificantFREDEvents", () => {
		it("should filter to only high and medium impact events", () => {
			const events: FREDEconomicEvent[] = [
				{
					id: "fred-10-2025-01-15",
					name: "CPI",
					date: "2025-01-15",
					time: "08:30:00",
					impact: "high",
					forecast: null,
					previous: null,
					actual: null,
					releaseId: 10,
				},
				{
					id: "fred-13-2025-01-16",
					name: "Industrial Production",
					date: "2025-01-16",
					time: "08:30:00",
					impact: "medium",
					forecast: null,
					previous: null,
					actual: null,
					releaseId: 13,
				},
				{
					id: "fred-999-2025-01-17",
					name: "Minor Release",
					date: "2025-01-17",
					time: "08:30:00",
					impact: "low",
					forecast: null,
					previous: null,
					actual: null,
					releaseId: 999,
				},
			];

			const filtered = filterSignificantFREDEvents(events);

			expect(filtered).toHaveLength(2);
			expect(filtered.some((e) => e.impact === "high")).toBe(true);
			expect(filtered.some((e) => e.impact === "medium")).toBe(true);
			expect(filtered.some((e) => e.impact === "low")).toBe(false);
		});
	});

	describe("sortFREDEventsByDateAndImpact", () => {
		it("should sort by date first, then by impact", () => {
			const events: FREDEconomicEvent[] = [
				{
					id: "3",
					name: "Event C",
					date: "2025-01-17",
					time: "08:30:00",
					impact: "high",
					forecast: null,
					previous: null,
					actual: null,
					releaseId: 3,
				},
				{
					id: "1",
					name: "Event A",
					date: "2025-01-15",
					time: "08:30:00",
					impact: "low",
					forecast: null,
					previous: null,
					actual: null,
					releaseId: 1,
				},
				{
					id: "2",
					name: "Event B",
					date: "2025-01-15",
					time: "08:30:00",
					impact: "high",
					forecast: null,
					previous: null,
					actual: null,
					releaseId: 2,
				},
			];

			const sorted = sortFREDEventsByDateAndImpact(events);

			expect(sorted).toHaveLength(3);
			// First: 2025-01-15, high impact
			expect(sorted[0]?.id).toBe("2");
			// Second: 2025-01-15, low impact
			expect(sorted[1]?.id).toBe("1");
			// Third: 2025-01-17, high impact
			expect(sorted[2]?.id).toBe("3");
		});

		it("should handle empty array", () => {
			const sorted = sortFREDEventsByDateAndImpact([]);
			expect(sorted).toHaveLength(0);
		});
	});
});
