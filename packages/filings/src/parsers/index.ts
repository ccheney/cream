/**
 * Filing Parsers
 *
 * Factory and exports for SEC filing parsers.
 */

import type { Filing, ParsedFiling } from "../types.js";
import { FilingParser } from "./base.js";
import { Form8KParser } from "./form-8k.js";
import { Form10KParser } from "./form-10k.js";
import { Form10QParser } from "./form-10q.js";

// ============================================
// Exports
// ============================================

export { COMMON_SECTIONS, FilingParser } from "./base.js";
export { Form8KParser, ITEMS_8K } from "./form-8k.js";
export { Form10KParser, SECTIONS_10K } from "./form-10k.js";
export { Form10QParser, SECTIONS_10Q } from "./form-10q.js";

// ============================================
// Factory Functions
// ============================================

/**
 * Get the appropriate parser for a filing type.
 *
 * @param filing - Filing metadata
 * @param html - HTML content of the filing
 * @returns Parser instance for the filing type
 *
 * @example
 * ```typescript
 * const parser = getParser(filing, html);
 * const parsed = parser.parse();
 * ```
 */
export function getParser(filing: Filing, html: string): FilingParser {
	switch (filing.filingType) {
		case "10-K":
			return new Form10KParser(filing, html);
		case "10-Q":
			return new Form10QParser(filing, html);
		case "8-K":
			return new Form8KParser(filing, html);
		default:
			// Use base parser for unknown types (DEF14A, etc.)
			return new FilingParser(filing, html);
	}
}

/**
 * Parse a filing using the appropriate parser.
 *
 * Convenience function that creates the right parser and parses in one call.
 *
 * @param filing - Filing metadata
 * @param html - HTML content of the filing
 * @returns Parsed filing with extracted sections and tables
 *
 * @example
 * ```typescript
 * const parsed = parseFiling(filing, html);
 * console.log(parsed.sections.business);
 * ```
 */
export function parseFiling(filing: Filing, html: string): ParsedFiling {
	const parser = getParser(filing, html);
	return parser.parse();
}

/**
 * Parse filing and return the parser instance.
 *
 * Useful when you need access to both parsed data and parser-specific methods.
 *
 * @param filing - Filing metadata
 * @param html - HTML content of the filing
 * @returns Tuple of [ParsedFiling, FilingParser]
 */
export function parseFilingWithParser(filing: Filing, html: string): [ParsedFiling, FilingParser] {
	const parser = getParser(filing, html);
	return [parser.parse(), parser];
}
