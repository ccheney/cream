/**
 * Command Palette Utility Functions
 */

import type { CommandItem } from "./types.js";

/**
 * Simple fuzzy match - checks if query chars appear in order
 */
export function fuzzyMatch(query: string, text: string): boolean {
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

/**
 * Score a match - higher is better
 */
export function scoreMatch(query: string, item: CommandItem): number {
  const lowerQuery = query.toLowerCase();
  const lowerLabel = item.label.toLowerCase();

  if (lowerLabel === lowerQuery) {
    return 100;
  }

  if (lowerLabel.startsWith(lowerQuery)) {
    return 80;
  }

  if (lowerLabel.includes(lowerQuery)) {
    return 60;
  }

  if (fuzzyMatch(lowerQuery, lowerLabel)) {
    return 40;
  }

  if (item.keywords?.some((kw) => kw.toLowerCase().includes(lowerQuery))) {
    return 30;
  }

  if (item.description?.toLowerCase().includes(lowerQuery)) {
    return 20;
  }

  return 0;
}
