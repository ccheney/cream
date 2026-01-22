/**
 * Base Filing Parser
 *
 * Provides core HTML parsing functionality using cheerio.
 * Extended by form-specific parsers for 10-K, 10-Q, and 8-K.
 */

import * as cheerio from "cheerio";
import type { Filing, ParsedFiling } from "../types.js";

// ============================================
// Section Patterns
// ============================================

/**
 * Common section patterns found in SEC filings.
 * These regex patterns are case-insensitive and match common variations.
 */
export const COMMON_SECTIONS: Record<string, RegExp> = {
	business: /item\s*1[.\s]*business/i,
	risk_factors: /item\s*1a[.\s]*risk\s*factors/i,
	properties: /item\s*2[.\s]*properties/i,
	legal_proceedings: /item\s*3[.\s]*legal\s*proceedings/i,
	mda: /item\s*7[.\s]*management.s\s*discussion/i,
	financial_statements: /item\s*8[.\s]*financial\s*statements/i,
};

// ============================================
// Constants
// ============================================

/** Maximum length for extracted text */
const MAX_TEXT_LENGTH = 100_000;

/** Maximum length for each section */
const MAX_SECTION_LENGTH = 50_000;

/** Maximum number of tables to extract */
const MAX_TABLES = 20;

// ============================================
// Base Parser Class
// ============================================

/**
 * Base parser for SEC filings using cheerio.
 *
 * @example
 * ```typescript
 * const parser = new FilingParser(filing, html);
 * const parsed = parser.parse();
 * console.log(parsed.extractedText?.length);
 * ```
 */
export class FilingParser {
	protected $: cheerio.CheerioAPI;

	constructor(
		protected filing: Filing,
		html: string,
	) {
		// Load HTML in forgiving mode (xml: false handles malformed HTML)
		this.$ = cheerio.load(html, { xml: false });
	}

	/**
	 * Extract plain text from HTML.
	 *
	 * Removes script, style, and head elements, then extracts text content
	 * with whitespace normalization.
	 */
	extractText(): string {
		// Clone to avoid modifying the original
		const $clone = cheerio.load(this.$.html() ?? "");

		// Remove script, style, and head elements
		$clone("script, style, head, noscript").remove();

		// Get text with space separator
		const text = $clone("body").text();

		// Collapse multiple whitespace into single space
		return text.replace(/\s+/g, " ").trim();
	}

	/**
	 * Extract named sections from the filing.
	 *
	 * Uses regex patterns to find section headers and extracts content
	 * until the next section begins.
	 *
	 * @param sectionPatterns - Map of section names to regex patterns
	 * @returns Map of section names to content
	 */
	extractSections(
		sectionPatterns: Record<string, RegExp> = COMMON_SECTIONS,
	): Record<string, string> {
		const text = this.extractText();
		const sections: Record<string, string> = {};

		// Find all section positions
		const sectionPositions: Array<{ name: string; start: number }> = [];

		for (const [name, pattern] of Object.entries(sectionPatterns)) {
			const match = pattern.exec(text);
			if (match) {
				sectionPositions.push({
					name,
					start: match.index + match[0].length,
				});
			}
		}

		// Sort by position in document
		sectionPositions.sort((a, b) => a.start - b.start);

		// Extract content between sections
		for (let i = 0; i < sectionPositions.length; i++) {
			const current = sectionPositions[i];
			if (!current) {
				continue;
			}
			const next = sectionPositions[i + 1];

			// Content ends at next section or end of document
			const endPos = next?.start ?? text.length;
			let content = text.slice(current.start, endPos).trim();

			// Limit section length
			if (content.length > MAX_SECTION_LENGTH) {
				content = content.slice(0, MAX_SECTION_LENGTH);
			}

			sections[current.name] = content;
		}

		return sections;
	}

	/**
	 * Extract HTML tables as structured data.
	 *
	 * @returns Array of tables with headers and rows
	 */
	extractTables(): Array<{ headers: string[]; rows: string[][] }> {
		const tables: Array<{ headers: string[]; rows: string[][] }> = [];
		const tableElements = this.$("table");

		tableElements.each((index, element): undefined | boolean => {
			if (index >= MAX_TABLES) {
				return false; // Stop iterating
			}

			const $table = this.$(element);
			const rows = $table.find("tr");

			if (rows.length === 0) {
				return; // Skip empty tables
			}

			// Extract headers from first row
			const headerRow = rows.first();
			const headers: string[] = [];
			headerRow.find("th, td").each((_, cell) => {
				headers.push(this.$(cell).text().trim());
			});

			// Extract data rows
			const dataRows: string[][] = [];
			rows.slice(1).each((_, row) => {
				const cells: string[] = [];
				this.$(row)
					.find("td, th")
					.each((_, cell) => {
						cells.push(this.$(cell).text().trim());
					});

				// Skip empty rows
				if (cells.some((cell) => cell.length > 0)) {
					dataRows.push(cells);
				}
			});

			// Only include tables with data
			if (headers.length > 0 || dataRows.length > 0) {
				tables.push({ headers, rows: dataRows });
			}

			return undefined;
		});

		return tables;
	}

	/**
	 * Parse the filing and return structured data.
	 */
	parse(): ParsedFiling {
		const extractedText = this.extractText();

		return {
			filing: this.filing,
			rawHtml: this.$.html() ?? undefined,
			extractedText: extractedText.slice(0, MAX_TEXT_LENGTH),
			sections: this.extractSections(),
			financialTables: this.extractTables(),
			extractedAt: new Date(),
		};
	}
}
