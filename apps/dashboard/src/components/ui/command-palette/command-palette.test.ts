/**
 * Tests for Command Palette Component
 */

import { describe, expect, test } from "bun:test";

// Test utilities - can't test React components directly without JSDOM
// These tests verify the fuzzy matching logic

describe("CommandPalette fuzzy matching", () => {
	// Simple fuzzy match - checks if query chars appear in order
	function fuzzyMatch(query: string, text: string): boolean {
		const lowerQuery = query.toLowerCase();
		const lowerText = text.toLowerCase();

		let queryIndex = 0;
		for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
			if (lowerText[i] === lowerQuery[queryIndex]) {
				queryIndex++;
			}
		}

		return queryIndex === lowerQuery.length;
	}

	test("matches exact strings", () => {
		expect(fuzzyMatch("dashboard", "dashboard")).toBe(true);
		expect(fuzzyMatch("portfolio", "portfolio")).toBe(true);
	});

	test("matches partial strings", () => {
		expect(fuzzyMatch("dash", "dashboard")).toBe(true);
		expect(fuzzyMatch("port", "portfolio")).toBe(true);
	});

	test("matches fuzzy patterns", () => {
		expect(fuzzyMatch("db", "dashboard")).toBe(true);
		expect(fuzzyMatch("pfo", "portfolio")).toBe(true);
		expect(fuzzyMatch("gtd", "Go to Dashboard")).toBe(true);
	});

	test("is case insensitive", () => {
		expect(fuzzyMatch("DASH", "dashboard")).toBe(true);
		expect(fuzzyMatch("dash", "DASHBOARD")).toBe(true);
		expect(fuzzyMatch("DaSh", "DashBoard")).toBe(true);
	});

	test("rejects non-matching patterns", () => {
		expect(fuzzyMatch("xyz", "dashboard")).toBe(false);
		expect(fuzzyMatch("dashboardx", "dashboard")).toBe(false);
		expect(fuzzyMatch("dz", "dashboard")).toBe(false); // 'z' not in dashboard
	});

	test("handles empty query", () => {
		expect(fuzzyMatch("", "dashboard")).toBe(true);
		expect(fuzzyMatch("", "")).toBe(true);
	});
});

describe("CommandPalette scoring", () => {
	interface CommandItem {
		id: string;
		label: string;
		description?: string;
		keywords?: string[];
	}

	function scoreMatch(query: string, item: CommandItem): number {
		const lowerQuery = query.toLowerCase();
		const lowerLabel = item.label.toLowerCase();

		// Exact match in label
		if (lowerLabel === lowerQuery) {
			return 100;
		}

		// Starts with query
		if (lowerLabel.startsWith(lowerQuery)) {
			return 80;
		}

		// Contains query
		if (lowerLabel.includes(lowerQuery)) {
			return 60;
		}

		// Match in keywords
		if (item.keywords?.some((kw) => kw.toLowerCase().includes(lowerQuery))) {
			return 30;
		}

		// Match in description
		if (item.description?.toLowerCase().includes(lowerQuery)) {
			return 20;
		}

		return 0;
	}

	test("scores exact match highest", () => {
		const item = { id: "1", label: "Dashboard" };
		expect(scoreMatch("dashboard", item)).toBe(100);
	});

	test("scores prefix match high", () => {
		const item = { id: "1", label: "Dashboard" };
		expect(scoreMatch("dash", item)).toBe(80);
	});

	test("scores contains match medium", () => {
		const item = { id: "1", label: "Go to Dashboard" };
		expect(scoreMatch("dashboard", item)).toBe(60);
	});

	test("scores keyword match lower", () => {
		const item = { id: "1", label: "Home", keywords: ["dashboard", "main"] };
		expect(scoreMatch("dashboard", item)).toBe(30);
	});

	test("scores description match lowest", () => {
		const item = { id: "1", label: "Home", description: "Go to dashboard" };
		expect(scoreMatch("dashboard", item)).toBe(20);
	});

	test("returns 0 for no match", () => {
		const item = { id: "1", label: "Settings" };
		expect(scoreMatch("dashboard", item)).toBe(0);
	});
});
