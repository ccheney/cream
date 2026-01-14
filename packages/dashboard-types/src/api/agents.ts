/**
 * Agent API Types
 *
 * Types for AI agent configuration and status.
 */

import { z } from "zod";

// ============================================
// Agent Types
// ============================================

export const AgentTypeSchema = z.enum([
	"technical",
	"grounding",
	"news",
	"fundamentals",
	"bullish",
	"bearish",
	"trader",
	"risk",
	"critic",
]);

export type AgentType = z.infer<typeof AgentTypeSchema>;

// ============================================
// Agent Status
// ============================================

export const AgentStatusSchema = z.object({
	type: z.string(),
	displayName: z.string(),
	status: z.enum(["idle", "processing", "error"]),
	lastOutputAt: z.string().nullable(),
	outputsToday: z.number(),
	avgConfidence: z.number(),
	approvalRate: z.number(),
});

export type AgentStatus = z.infer<typeof AgentStatusSchema>;

// ============================================
// Agent Configuration
// ============================================

export const AgentConfigSchema = z.object({
	type: z.string(),
	systemPrompt: z.string(),
	enabled: z.boolean(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
