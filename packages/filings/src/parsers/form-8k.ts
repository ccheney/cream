/**
 * Form 8-K Parser
 *
 * Specialized parser for current reports (8-K) with item extraction.
 * 8-K reports contain specific numbered items for material events.
 */

import type { Form8KItem, ParsedFiling } from "../types.js";
import { FilingParser } from "./base.js";

// ============================================
// 8-K Item Definitions
// ============================================

/**
 * Mapping of 8-K item numbers to their titles.
 */
export const ITEMS_8K: Record<string, string> = {
  // Section 1 - Registrant's Business and Operations
  "1.01": "Entry into a Material Definitive Agreement",
  "1.02": "Termination of a Material Definitive Agreement",
  "1.03": "Bankruptcy or Receivership",
  "1.04": "Mine Safety - Reporting of Shutdowns and Patterns of Violations",

  // Section 2 - Financial Information
  "2.01": "Completion of Acquisition or Disposition of Assets",
  "2.02": "Results of Operations and Financial Condition",
  "2.03": "Creation of a Direct Financial Obligation",
  "2.04": "Triggering Events That Accelerate or Increase a Direct Financial Obligation",
  "2.05": "Costs Associated with Exit or Disposal Activities",
  "2.06": "Material Impairments",

  // Section 3 - Securities and Trading Markets
  "3.01": "Notice of Delisting or Failure to Satisfy a Listing Rule",
  "3.02": "Unregistered Sales of Equity Securities",
  "3.03": "Material Modification to Rights of Security Holders",

  // Section 4 - Matters Related to Accountants and Financial Statements
  "4.01": "Changes in Registrant's Certifying Accountant",
  "4.02": "Non-Reliance on Previously Issued Financial Statements",

  // Section 5 - Corporate Governance and Management
  "5.01": "Changes in Control of Registrant",
  "5.02": "Departure/Election of Directors or Principal Officers; Compensatory Arrangements",
  "5.03": "Amendments to Articles of Incorporation or Bylaws",
  "5.04": "Temporary Suspension of Trading Under Employee Benefit Plans",
  "5.05": "Amendment to Registrant's Code of Ethics",
  "5.06": "Change in Shell Company Status",
  "5.07": "Submission of Matters to a Vote of Security Holders",
  "5.08": "Shareholder Director Nominations",

  // Section 6 - Asset-Backed Securities
  "6.01": "ABS Informational and Computational Material",
  "6.02": "Change of Servicer or Trustee",
  "6.03": "Change in Credit Enhancement or Other External Support",
  "6.04": "Failure to Make a Required Distribution",
  "6.05": "Securities Act Updating Disclosure",

  // Section 7 - Regulation FD
  "7.01": "Regulation FD Disclosure",

  // Section 8 - Other Events
  "8.01": "Other Events",

  // Section 9 - Financial Statements and Exhibits
  "9.01": "Financial Statements and Exhibits",
};

/** Maximum content length per item */
const MAX_ITEM_CONTENT = 10_000;

/** Pattern to match 8-K item numbers */
const ITEM_PATTERN = /item\s*(\d+\.\d+)/gi;

/** Pattern to find signature section (marks end of content) */
const SIGNATURE_PATTERN = /signatures?/i;

// ============================================
// Parser Class
// ============================================

/**
 * Parser for Form 8-K current reports.
 *
 * Extends the base parser with 8-K item extraction. 8-K forms contain
 * numbered items (e.g., 2.02, 5.02) that describe material events.
 *
 * @example
 * ```typescript
 * const parser = new Form8KParser(filing, html);
 * const items = parser.extractItems();
 * console.log(items[0]); // { itemNumber: "2.02", itemTitle: "Results of...", content: "..." }
 *
 * const parsed = parser.parse();
 * console.log(parsed.sections.item_2_02); // Item content
 * ```
 */
export class Form8KParser extends FilingParser {
  /**
   * Extract 8-K items from the filing.
   *
   * Finds all item headers (e.g., "Item 2.02") and extracts content
   * until the next item or the signature section.
   *
   * @returns Array of Form8KItem objects
   */
  extractItems(): Form8KItem[] {
    const text = this.extractText();
    const items: Form8KItem[] = [];

    // Find all item matches
    const matches: Array<{ number: string; index: number; length: number }> = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    ITEM_PATTERN.lastIndex = 0;

    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex loop pattern
    while ((match = ITEM_PATTERN.exec(text)) !== null) {
      const itemNumber = match[1];
      if (itemNumber) {
        matches.push({
          number: itemNumber,
          index: match.index,
          length: match[0].length,
        });
      }
    }

    // Find signature section (marks end of items content)
    const signatureMatch = SIGNATURE_PATTERN.exec(text);
    const signatureIndex = signatureMatch?.index ?? text.length;

    // Extract content for each item
    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      if (!current) {
        continue;
      }
      const next = matches[i + 1];

      // Content starts after item header
      const contentStart = current.index + current.length;

      // Content ends at next item, signature, or end of document
      const contentEnd = Math.min(next?.index ?? text.length, signatureIndex);

      let content = text.slice(contentStart, contentEnd).trim();

      // Limit content length
      if (content.length > MAX_ITEM_CONTENT) {
        content = content.slice(0, MAX_ITEM_CONTENT);
      }

      // Look up item title
      const itemTitle = ITEMS_8K[current.number] ?? "Unknown Item";

      items.push({
        itemNumber: current.number,
        itemTitle,
        content,
      });
    }

    return items;
  }

  /**
   * Extract sections including 8-K items.
   *
   * Adds each item to the sections dictionary with key format "item_X_XX"
   * (e.g., "item_2_02" for Item 2.02).
   */
  override extractSections(): Record<string, string> {
    // Start with base sections (empty for 8-K as they don't have standard sections)
    const sections: Record<string, string> = {};

    // Add extracted items as sections
    const items = this.extractItems();
    for (const item of items) {
      // Convert "2.02" to "item_2_02"
      const key = `item_${item.itemNumber.replace(".", "_")}`;
      sections[key] = item.content;
    }

    return sections;
  }

  /**
   * Parse the 8-K filing.
   */
  override parse(): ParsedFiling {
    return super.parse();
  }
}
