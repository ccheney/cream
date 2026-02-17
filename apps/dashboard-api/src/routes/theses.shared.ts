import type { Thesis, ThesisState } from "@cream/storage";
import { z } from "@hono/zod-openapi";

export const ThesisStatusSchema = z.enum(["ACTIVE", "INVALIDATED", "REALIZED", "EXPIRED"]);

export const ThesisSchema = z.object({
	id: z.string(),
	symbol: z.string(),
	direction: z.enum(["BULLISH", "BEARISH", "NEUTRAL"]),
	thesis: z.string(),
	catalysts: z.array(z.string()),
	invalidationConditions: z.array(z.string()),
	targetPrice: z.number().nullable(),
	stopPrice: z.number().nullable(),
	timeHorizon: z.enum(["INTRADAY", "SWING", "POSITION", "LONG_TERM"]),
	confidence: z.number().min(0).max(1).nullable(),
	status: ThesisStatusSchema,
	entryPrice: z.number().nullable(),
	currentPrice: z.number().nullable(),
	pnlPct: z.number().nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	expiresAt: z.string().nullable(),
	agentSource: z.string(),
	supportingEvidence: z.array(
		z.object({
			type: z.enum(["technical", "fundamental", "sentiment", "macro"]),
			summary: z.string(),
			weight: z.number(),
		}),
	),
});

export const CreateThesisSchema = z.object({
	symbol: z.string(),
	direction: z.enum(["BULLISH", "BEARISH", "NEUTRAL"]),
	thesis: z.string(),
	catalysts: z.array(z.string()),
	invalidationConditions: z.array(z.string()),
	targetPrice: z.number().nullable(),
	stopPrice: z.number().nullable(),
	timeHorizon: z.enum(["INTRADAY", "SWING", "POSITION", "LONG_TERM"]),
	confidence: z.number().min(0).max(1).nullable(),
	expiresAt: z.string().nullable(),
});

export const ThesisHistoryEntrySchema = z.object({
	id: z.string(),
	thesisId: z.string(),
	field: z.string(),
	oldValue: z.unknown(),
	newValue: z.unknown(),
	reason: z.string().nullable(),
	timestamp: z.string(),
});

function mapStateToStatus(state: ThesisState): "ACTIVE" | "INVALIDATED" | "REALIZED" | "EXPIRED" {
	if (state === "CLOSED") {
		return "REALIZED";
	}
	return "ACTIVE";
}

function inferDirection(thesis: Thesis): "BULLISH" | "BEARISH" | "NEUTRAL" {
	const thesisText = (thesis.entryThesis ?? "").toLowerCase();
	if (thesisText.includes("bullish") || thesisText.includes("long") || thesisText.includes("buy")) {
		return "BULLISH";
	}
	if (
		thesisText.includes("bearish") ||
		thesisText.includes("short") ||
		thesisText.includes("sell")
	) {
		return "BEARISH";
	}
	return "NEUTRAL";
}

export function mapThesisToResponse(thesis: Thesis): z.infer<typeof ThesisSchema> {
	const notes = thesis.notes as Record<string, unknown>;

	return {
		id: thesis.thesisId,
		symbol: thesis.instrumentId,
		direction: inferDirection(thesis),
		thesis: thesis.entryThesis ?? "",
		catalysts: (notes.catalysts as string[]) ?? [],
		invalidationConditions: thesis.invalidationConditions ? [thesis.invalidationConditions] : [],
		targetPrice: thesis.currentTarget,
		stopPrice: thesis.currentStop,
		timeHorizon: (notes.timeHorizon as "INTRADAY" | "SWING" | "POSITION" | "LONG_TERM") ?? "SWING",
		confidence: thesis.conviction,
		status: mapStateToStatus(thesis.state),
		entryPrice: thesis.entryPrice,
		currentPrice: null,
		pnlPct: thesis.realizedPnlPct,
		createdAt: thesis.createdAt,
		updatedAt: thesis.lastUpdated,
		expiresAt: (notes.expiresAt as string) ?? null,
		agentSource: (notes.agentSource as string) ?? "manual",
		supportingEvidence:
			(notes.supportingEvidence as z.infer<typeof ThesisSchema>["supportingEvidence"]) ?? [],
	};
}
