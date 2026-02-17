/**
 * Parser Tests: Transcript
 */

import { expect, it } from "bun:test";
import type { TranscriptInput } from "../src/index.js";
import { extractTranscriptSections, getExecutiveComments, parseTranscript } from "../src/index.js";

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
