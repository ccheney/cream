/**
 * Search Academic Papers Tool
 *
 * Search for academic papers in the knowledge base.
 */

import { searchAcademicPapersTool, searchExternalPapersTool } from "@cream/agents";

// Re-export the existing tools
// Already use v1 patterns with inputSchema, outputSchema, and execute
export const searchAcademicPapers = searchAcademicPapersTool;
export const searchExternalPapers = searchExternalPapersTool;
