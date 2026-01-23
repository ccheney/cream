/**
 * @cream/agents - Agent Prompts, Configs, and Tools
 *
 * This package provides:
 * - Agent configurations for the 8-agent network
 * - System prompts optimized for Gemini
 * - Agent tools for market data, portfolio, and analysis
 * - Extraction client for LLM-based data extraction
 *
 * @see docs/plans/05-agents.md
 */

export const PACKAGE_NAME = "@cream/agents";
export const VERSION = "0.1.0";

// ============================================
// Agent Types and Configuration
// ============================================

export * from "./agents/index.js";
export * from "./prompts/index.js";
export * from "./types.js";

// ============================================
// Tool Implementations (no @mastra dependencies)
// ============================================

export * from "./tools/implementations/index.js";
export * from "./tools/types.js";

// ============================================
// Extraction
// ============================================

export * from "./extraction/index.js";
