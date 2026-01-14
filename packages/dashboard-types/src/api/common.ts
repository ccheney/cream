/**
 * Common/System API Types
 *
 * Shared types for system status and alerts.
 */

import { z } from "zod";

// ============================================
// System Status
// ============================================

export const SystemStatusSchema = z.object({
	environment: z.enum(["BACKTEST", "PAPER", "LIVE"]),
	status: z.enum(["running", "paused", "stopped", "error"]),
	uptime: z.number(),
	version: z.string(),
	lastCycleAt: z.string().nullable(),
	nextCycleAt: z.string().nullable(),
});

export type SystemStatus = z.infer<typeof SystemStatusSchema>;

// ============================================
// Alerts
// ============================================

export const AlertSeveritySchema = z.enum(["info", "warning", "error", "critical"]);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

export const AlertSchema = z.object({
	id: z.string(),
	severity: AlertSeveritySchema,
	message: z.string(),
	source: z.string(),
	createdAt: z.string(),
	acknowledged: z.boolean(),
});

export type Alert = z.infer<typeof AlertSchema>;
