/**
 * Form 10-Q Parser
 *
 * Specialized parser for quarterly reports (10-Q) with quarterly-specific section patterns.
 */

import type { ParsedFiling } from "../types.js";
import { FilingParser } from "./base.js";

// ============================================
// 10-Q Specific Sections
// ============================================

/**
 * Section patterns specific to 10-Q quarterly reports.
 *
 * 10-Q uses "PART I ITEM X" format vs 10-K's "ITEM X" format.
 */
export const SECTIONS_10Q: Record<string, RegExp> = {
  financial_statements: /part\s*i[.\s]*item\s*1[.\s]*financial/i,
  mda: /item\s*2[.\s]*management.s\s*discussion/i,
  quantitative_disclosures: /item\s*3[.\s]*quantitative/i,
  controls_procedures: /item\s*4[.\s]*controls/i,
  legal_proceedings: /part\s*ii[.\s]*item\s*1[.\s]*legal/i,
  risk_factors: /item\s*1a[.\s]*risk\s*factors/i,
};

// ============================================
// Parser Class
// ============================================

/**
 * Parser for Form 10-Q quarterly reports.
 *
 * Extends the base parser with 10-Q specific section extraction.
 *
 * @example
 * ```typescript
 * const parser = new Form10QParser(filing, html);
 * const parsed = parser.parse();
 * console.log(parsed.sections.mda); // Quarterly MD&A
 * ```
 */
export class Form10QParser extends FilingParser {
  /**
   * Extract sections using 10-Q specific patterns.
   */
  override extractSections(): Record<string, string> {
    return super.extractSections(SECTIONS_10Q);
  }

  /**
   * Parse the 10-Q filing.
   */
  override parse(): ParsedFiling {
    return super.parse();
  }
}
