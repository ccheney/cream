/**
 * Base Filing Parser Tests
 *
 * Tests for HTML parsing with cheerio.
 */

import { describe, expect, test } from "bun:test";
import type { Filing } from "../types";
import { COMMON_SECTIONS, FilingParser } from "./base";

// ============================================
// Test Fixtures
// ============================================

const createMockFiling = (): Filing => ({
	accessionNumber: "0000320193-24-000081",
	filingType: "10-K",
	filedDate: new Date("2024-01-15"),
	company: {
		cik: "0000320193",
		name: "Apple Inc.",
		ticker: "AAPL",
	},
	primaryDocument: "aapl-20231230.htm",
});

const simpleHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Test Filing</title>
  <style>.red { color: red; }</style>
  <script>console.log('test');</script>
</head>
<body>
  <p>This is the body content.</p>
  <p>Another paragraph here.</p>
</body>
</html>
`;

const htmlWithSections = `
<!DOCTYPE html>
<html>
<body>
  <h2>ITEM 1. BUSINESS</h2>
  <p>This is the business description section content.</p>
  <p>More business information.</p>

  <h2>ITEM 1A. RISK FACTORS</h2>
  <p>This describes the various risk factors.</p>
  <p>Additional risk information here.</p>

  <h2>ITEM 7. MANAGEMENT'S DISCUSSION AND ANALYSIS</h2>
  <p>Management discusses operations here.</p>
</body>
</html>
`;

const htmlWithTables = `
<!DOCTYPE html>
<html>
<body>
  <table>
    <tr>
      <th>Revenue</th>
      <th>2024</th>
      <th>2023</th>
    </tr>
    <tr>
      <td>Product</td>
      <td>$100M</td>
      <td>$90M</td>
    </tr>
    <tr>
      <td>Services</td>
      <td>$50M</td>
      <td>$45M</td>
    </tr>
  </table>
</body>
</html>
`;

// ============================================
// extractText Tests
// ============================================

describe("FilingParser.extractText", () => {
	test("extracts body text", () => {
		const parser = new FilingParser(createMockFiling(), simpleHtml);
		const text = parser.extractText();

		expect(text).toContain("This is the body content");
		expect(text).toContain("Another paragraph");
	});

	test("removes script and style content", () => {
		const parser = new FilingParser(createMockFiling(), simpleHtml);
		const text = parser.extractText();

		expect(text).not.toContain("console.log");
		expect(text).not.toContain(".red { color: red; }");
	});

	test("collapses whitespace", () => {
		const htmlWithWhitespace = `
      <body>
        <p>Text    with    extra     spaces</p>
        <p>And
        newlines</p>
      </body>
    `;
		const parser = new FilingParser(createMockFiling(), htmlWithWhitespace);
		const text = parser.extractText();

		expect(text).not.toContain("    ");
		expect(text).toContain("Text with extra spaces");
	});

	test("handles malformed HTML gracefully", () => {
		const malformedHtml = "<p>Unclosed paragraph<div>Nested div</p></div>";
		const parser = new FilingParser(createMockFiling(), malformedHtml);

		// Should not throw
		const text = parser.extractText();
		expect(text).toContain("Unclosed paragraph");
		expect(text).toContain("Nested div");
	});

	test("handles empty HTML", () => {
		const parser = new FilingParser(createMockFiling(), "");
		const text = parser.extractText();
		expect(text).toBe("");
	});
});

// ============================================
// extractSections Tests
// ============================================

describe("FilingParser.extractSections", () => {
	test("extracts sections by pattern", () => {
		const parser = new FilingParser(createMockFiling(), htmlWithSections);
		const sections = parser.extractSections();

		expect(sections.business).toContain("business description");
		expect(sections.risk_factors).toContain("risk factors");
		expect(sections.mda).toContain("discusses operations");
	});

	test("extracts content between sections", () => {
		const parser = new FilingParser(createMockFiling(), htmlWithSections);
		const sections = parser.extractSections();

		// Business section should not contain risk factors content
		expect(sections.business).not.toContain("risk factors");
		// Risk factors should not contain MDA content
		expect(sections.risk_factors).not.toContain("discusses operations");
	});

	test("returns empty object when no sections match", () => {
		const htmlNoSections = "<body><p>No recognizable sections here</p></body>";
		const parser = new FilingParser(createMockFiling(), htmlNoSections);
		const sections = parser.extractSections();

		expect(Object.keys(sections)).toHaveLength(0);
	});

	test("handles custom section patterns", () => {
		const customPatterns = {
			intro: /introduction/i,
			conclusion: /conclusion/i,
		};

		const htmlCustom = `
      <body>
        <h1>Introduction</h1>
        <p>Opening content here.</p>
        <h1>Conclusion</h1>
        <p>Closing content here.</p>
      </body>
    `;

		const parser = new FilingParser(createMockFiling(), htmlCustom);
		const sections = parser.extractSections(customPatterns);

		expect(sections.intro).toContain("Opening content");
		expect(sections.conclusion).toContain("Closing content");
	});
});

// ============================================
// extractTables Tests
// ============================================

describe("FilingParser.extractTables", () => {
	test("extracts table headers and rows", () => {
		const parser = new FilingParser(createMockFiling(), htmlWithTables);
		const tables = parser.extractTables();

		expect(tables).toHaveLength(1);
		expect(tables[0]?.headers).toEqual(["Revenue", "2024", "2023"]);
		expect(tables[0]?.rows).toHaveLength(2);
		expect(tables[0]?.rows[0]).toEqual(["Product", "$100M", "$90M"]);
	});

	test("handles tables without headers", () => {
		const htmlTableNoHeader = `
      <table>
        <tr><td>Row 1</td><td>Data 1</td></tr>
        <tr><td>Row 2</td><td>Data 2</td></tr>
      </table>
    `;
		const parser = new FilingParser(createMockFiling(), htmlTableNoHeader);
		const tables = parser.extractTables();

		expect(tables).toHaveLength(1);
		// First row is treated as header
		expect(tables[0]?.headers).toEqual(["Row 1", "Data 1"]);
	});

	test("skips empty tables", () => {
		const htmlEmptyTable = "<table></table><table><tr><td>Valid</td></tr></table>";
		const parser = new FilingParser(createMockFiling(), htmlEmptyTable);
		const tables = parser.extractTables();

		// Should only have the valid table
		expect(tables.length).toBeLessThanOrEqual(1);
	});

	test("limits number of tables extracted", () => {
		// Create HTML with 25 tables
		let htmlManyTables = "<body>";
		for (let i = 0; i < 25; i++) {
			htmlManyTables += `<table><tr><td>Table ${i}</td></tr></table>`;
		}
		htmlManyTables += "</body>";

		const parser = new FilingParser(createMockFiling(), htmlManyTables);
		const tables = parser.extractTables();

		expect(tables.length).toBeLessThanOrEqual(20); // MAX_TABLES = 20
	});

	test("handles no tables", () => {
		const htmlNoTables = "<body><p>No tables here</p></body>";
		const parser = new FilingParser(createMockFiling(), htmlNoTables);
		const tables = parser.extractTables();

		expect(tables).toHaveLength(0);
	});
});

// ============================================
// parse Tests
// ============================================

describe("FilingParser.parse", () => {
	test("returns complete ParsedFiling object", () => {
		const parser = new FilingParser(createMockFiling(), htmlWithSections);
		const result = parser.parse();

		expect(result.filing).toEqual(createMockFiling());
		expect(result.extractedText).toBeDefined();
		expect(result.sections).toBeDefined();
		expect(result.financialTables).toBeDefined();
		expect(result.extractedAt).toBeInstanceOf(Date);
	});

	test("includes raw HTML", () => {
		const parser = new FilingParser(createMockFiling(), simpleHtml);
		const result = parser.parse();

		expect(result.rawHtml).toBeDefined();
		expect(result.rawHtml).toContain("<body>");
	});

	test("truncates extractedText to max length", () => {
		// Create HTML with very long content
		const longContent = "X".repeat(150000);
		const htmlLong = `<body>${longContent}</body>`;

		const parser = new FilingParser(createMockFiling(), htmlLong);
		const result = parser.parse();

		// MAX_TEXT_LENGTH = 100_000
		expect(result.extractedText?.length).toBeLessThanOrEqual(100000);
	});
});

// ============================================
// COMMON_SECTIONS Tests
// ============================================

describe("COMMON_SECTIONS patterns", () => {
	test("matches Item 1 Business", () => {
		const variations = [
			"Item 1. Business",
			"ITEM 1 BUSINESS",
			"item 1.business",
			"Item  1.  Business",
		];

		const pattern = COMMON_SECTIONS.business;
		expect(pattern).toBeDefined();
		for (const text of variations) {
			expect(pattern!.test(text)).toBe(true);
		}
	});

	test("matches Item 1A Risk Factors", () => {
		const variations = ["Item 1A. Risk Factors", "ITEM 1A RISK FACTORS", "item 1a.risk factors"];

		const pattern = COMMON_SECTIONS.risk_factors;
		expect(pattern).toBeDefined();
		for (const text of variations) {
			expect(pattern!.test(text)).toBe(true);
		}
	});

	test("matches Item 7 MD&A", () => {
		const variations = [
			"Item 7. Management's Discussion and Analysis",
			"ITEM 7 MANAGEMENT'S DISCUSSION",
			"item 7.management's discussion",
		];

		const pattern = COMMON_SECTIONS.mda;
		expect(pattern).toBeDefined();
		for (const text of variations) {
			expect(pattern!.test(text)).toBe(true);
		}
	});
});
