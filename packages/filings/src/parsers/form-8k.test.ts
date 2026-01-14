/**
 * Form 8-K Parser Tests
 *
 * Tests for 8-K current report parsing with item extraction.
 */

import { describe, expect, test } from "bun:test";
import type { Filing } from "../types";
import { Form8KParser, ITEMS_8K } from "./form-8k";

// ============================================
// Test Fixtures
// ============================================

const createMock8KFiling = (): Filing => ({
	accessionNumber: "0000320193-24-000100",
	filingType: "8-K",
	filedDate: new Date("2024-02-01"),
	company: {
		cik: "0000320193",
		name: "Apple Inc.",
		ticker: "AAPL",
	},
	primaryDocument: "aapl-8k-20240201.htm",
});

const simple8KHtml = `
<!DOCTYPE html>
<html>
<body>
  <h2>Item 2.02 Results of Operations and Financial Condition</h2>
  <p>On February 1, 2024, Apple Inc. announced its financial results.</p>
  <p>Revenue was $119.58 billion, up 2% year over year.</p>

  <h2>Item 9.01 Financial Statements and Exhibits</h2>
  <p>Exhibit 99.1 Press Release</p>

  <h2>SIGNATURES</h2>
  <p>Pursuant to the requirements of the Securities Exchange Act of 1934...</p>
</body>
</html>
`;

const multiItem8KHtml = `
<!DOCTYPE html>
<html>
<body>
  <h2>Item 1.01 Entry into a Material Definitive Agreement</h2>
  <p>The company entered into a new credit facility agreement.</p>

  <h2>Item 2.03 Creation of a Direct Financial Obligation</h2>
  <p>As a result of the credit facility, the company has new obligations.</p>

  <h2>Item 5.02 Departure of Directors; Appointment of Principal Officers</h2>
  <p>On January 15, 2024, the Board appointed Jane Doe as CFO.</p>

  <h2>Item 9.01 Financial Statements and Exhibits</h2>
  <p>See attached exhibits.</p>

  <h2>SIGNATURE</h2>
  <p>Pursuant to the requirements...</p>
</body>
</html>
`;

// ============================================
// ITEMS_8K Tests
// ============================================

describe("ITEMS_8K", () => {
	test("contains Section 1 items", () => {
		expect(ITEMS_8K["1.01"]).toBe("Entry into a Material Definitive Agreement");
		expect(ITEMS_8K["1.02"]).toBe("Termination of a Material Definitive Agreement");
		expect(ITEMS_8K["1.03"]).toBe("Bankruptcy or Receivership");
	});

	test("contains Section 2 items", () => {
		expect(ITEMS_8K["2.01"]).toBe("Completion of Acquisition or Disposition of Assets");
		expect(ITEMS_8K["2.02"]).toBe("Results of Operations and Financial Condition");
		expect(ITEMS_8K["2.03"]).toBe("Creation of a Direct Financial Obligation");
	});

	test("contains Section 5 corporate governance items", () => {
		expect(ITEMS_8K["5.01"]).toBe("Changes in Control of Registrant");
		expect(ITEMS_8K["5.02"]).toContain("Departure");
		expect(ITEMS_8K["5.02"]).toContain("Directors");
	});

	test("contains all standard sections 1-9", () => {
		const sections = new Set(Object.keys(ITEMS_8K).map((k) => k.split(".")[0]));
		expect(sections.has("1")).toBe(true);
		expect(sections.has("2")).toBe(true);
		expect(sections.has("3")).toBe(true);
		expect(sections.has("4")).toBe(true);
		expect(sections.has("5")).toBe(true);
		expect(sections.has("6")).toBe(true);
		expect(sections.has("7")).toBe(true);
		expect(sections.has("8")).toBe(true);
		expect(sections.has("9")).toBe(true);
	});
});

// ============================================
// extractItems Tests
// ============================================

describe("Form8KParser.extractItems", () => {
	test("extracts items from simple 8-K", () => {
		const parser = new Form8KParser(createMock8KFiling(), simple8KHtml);
		const items = parser.extractItems();

		expect(items.length).toBeGreaterThanOrEqual(2);

		const item202 = items.find((i) => i.itemNumber === "2.02");
		expect(item202).toBeDefined();
		expect(item202?.itemTitle).toBe("Results of Operations and Financial Condition");
		expect(item202?.content).toContain("financial results");
		expect(item202?.content).toContain("$119.58 billion");
	});

	test("extracts multiple items", () => {
		const parser = new Form8KParser(createMock8KFiling(), multiItem8KHtml);
		const items = parser.extractItems();

		expect(items.length).toBeGreaterThanOrEqual(4);

		const itemNumbers = items.map((i) => i.itemNumber);
		expect(itemNumbers).toContain("1.01");
		expect(itemNumbers).toContain("2.03");
		expect(itemNumbers).toContain("5.02");
		expect(itemNumbers).toContain("9.01");
	});

	test("extracts content between items", () => {
		const parser = new Form8KParser(createMock8KFiling(), multiItem8KHtml);
		const items = parser.extractItems();

		const item101 = items.find((i) => i.itemNumber === "1.01");
		const item203 = items.find((i) => i.itemNumber === "2.03");

		// Item 1.01 content should not include Item 2.03 content
		expect(item101?.content).not.toContain("As a result of the credit facility");
		expect(item203?.content).toContain("As a result of the credit facility");
	});

	test("stops content at signature section", () => {
		const parser = new Form8KParser(createMock8KFiling(), simple8KHtml);
		const items = parser.extractItems();

		// No item should contain signature content
		for (const item of items) {
			expect(item.content).not.toContain("Pursuant to the requirements");
		}
	});

	test("handles case-insensitive item matching", () => {
		const htmlLowerCase = `
      <body>
        <h2>item 2.02 Results of Operations</h2>
        <p>Content here</p>
        <h2>ITEM 9.01 Exhibits</h2>
        <p>More content</p>
      </body>
    `;
		const parser = new Form8KParser(createMock8KFiling(), htmlLowerCase);
		const items = parser.extractItems();

		expect(items.length).toBeGreaterThanOrEqual(2);
	});

	test("handles items with various spacing", () => {
		const htmlSpacing = `
      <body>
        <h2>Item  2.02</h2>
        <p>Content A</p>
        <h2>Item2.03</h2>
        <p>Content B</p>
      </body>
    `;
		const parser = new Form8KParser(createMock8KFiling(), htmlSpacing);
		const items = parser.extractItems();

		// Should match at least the properly formatted one
		expect(items.length).toBeGreaterThanOrEqual(1);
	});

	test("returns unknown title for unrecognized items", () => {
		const htmlUnknown = `
      <body>
        <h2>Item 99.99 Made Up Item</h2>
        <p>Some content</p>
      </body>
    `;
		const parser = new Form8KParser(createMock8KFiling(), htmlUnknown);
		const items = parser.extractItems();

		if (items.length > 0) {
			const unknown = items.find((i) => i.itemNumber === "99.99");
			expect(unknown?.itemTitle).toBe("Unknown Item");
		}
	});

	test("returns empty array for 8-K with no items", () => {
		const htmlNoItems = `
      <body>
        <p>This filing has no recognizable items.</p>
      </body>
    `;
		const parser = new Form8KParser(createMock8KFiling(), htmlNoItems);
		const items = parser.extractItems();

		expect(items).toHaveLength(0);
	});

	test("truncates very long item content", () => {
		const longContent = "X".repeat(15000);
		const htmlLong = `
      <body>
        <h2>Item 2.02 Results</h2>
        <p>${longContent}</p>
      </body>
    `;
		const parser = new Form8KParser(createMock8KFiling(), htmlLong);
		const items = parser.extractItems();

		// MAX_ITEM_CONTENT = 10_000
		expect(items[0]?.content.length).toBeLessThanOrEqual(10000);
	});
});

// ============================================
// extractSections Tests
// ============================================

describe("Form8KParser.extractSections", () => {
	test("converts items to sections with item_X_XX keys", () => {
		const parser = new Form8KParser(createMock8KFiling(), simple8KHtml);
		const sections = parser.extractSections();

		expect(sections.item_2_02).toBeDefined();
		expect(sections.item_2_02).toContain("financial results");
		expect(sections.item_9_01).toBeDefined();
	});

	test("includes all extracted items as sections", () => {
		const parser = new Form8KParser(createMock8KFiling(), multiItem8KHtml);
		const sections = parser.extractSections();

		expect(sections.item_1_01).toBeDefined();
		expect(sections.item_2_03).toBeDefined();
		expect(sections.item_5_02).toBeDefined();
		expect(sections.item_9_01).toBeDefined();
	});
});

// ============================================
// parse Tests
// ============================================

describe("Form8KParser.parse", () => {
	test("returns ParsedFiling with item sections", () => {
		const parser = new Form8KParser(createMock8KFiling(), simple8KHtml);
		const result = parser.parse();

		expect(result.filing).toEqual(createMock8KFiling());
		expect(result.sections.item_2_02).toBeDefined();
		expect(result.extractedAt).toBeInstanceOf(Date);
	});

	test("includes extracted text and raw HTML", () => {
		const parser = new Form8KParser(createMock8KFiling(), simple8KHtml);
		const result = parser.parse();

		expect(result.extractedText).toContain("financial results");
		expect(result.rawHtml).toContain("<body>");
	});
});
