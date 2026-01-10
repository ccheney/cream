/**
 * Form 10-K Parser
 *
 * Specialized parser for annual reports (10-K) with additional section patterns.
 */

import type { ParsedFiling } from "../types.js";
import { COMMON_SECTIONS, FilingParser } from "./base.js";

// ============================================
// 10-K Specific Sections
// ============================================

/**
 * Section patterns specific to 10-K annual reports.
 */
export const SECTIONS_10K: Record<string, RegExp> = {
  ...COMMON_SECTIONS,
  selected_financial_data: /item\s*6[.\s]*selected\s*financial/i,
  quantitative_disclosures: /item\s*7a[.\s]*quantitative/i,
  controls_procedures: /item\s*9a[.\s]*controls\s*and\s*procedures/i,
};

// ============================================
// Parser Class
// ============================================

/**
 * Parser for Form 10-K annual reports.
 *
 * Extends the base parser with 10-K specific section extraction.
 *
 * @example
 * ```typescript
 * const parser = new Form10KParser(filing, html);
 * const parsed = parser.parse();
 * console.log(parsed.sections.mda); // MD&A section
 * console.log(parsed.sections.risk_factors); // Risk Factors
 * ```
 */
export class Form10KParser extends FilingParser {
  /**
   * Extract sections using 10-K specific patterns.
   */
  override extractSections(): Record<string, string> {
    return super.extractSections(SECTIONS_10K);
  }

  /**
   * Parse the 10-K filing.
   */
  override parse(): ParsedFiling {
    return super.parse();
  }
}
