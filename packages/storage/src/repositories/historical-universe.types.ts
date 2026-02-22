import { z } from "zod";
import type {
	indexConstituents,
	tickerChanges,
	universeSnapshots,
} from "../schema/historical-universe";

export const IndexIdSchema = z.enum([
	"SP500",
	"NASDAQ100",
	"DOWJONES",
	"RUSSELL2000",
	"RUSSELL3000",
	"SP400",
	"SP600",
]);
export type IndexId = z.infer<typeof IndexIdSchema>;

export const ChangeTypeSchema = z.enum([
	"rename",
	"merger",
	"spinoff",
	"acquisition",
	"restructure",
]);
export type ChangeType = z.infer<typeof ChangeTypeSchema>;

export const IndexConstituentSchema = z.object({
	id: z.number().optional(),
	indexId: IndexIdSchema,
	symbol: z.string().min(1),
	dateAdded: z.string().describe("Date symbol was added to index in ISO8601 format"),
	dateRemoved: z.string().nullable().optional(),
	reasonAdded: z.string().nullable().optional(),
	reasonRemoved: z.string().nullable().optional(),
	sector: z.string().nullable().optional(),
	industry: z.string().nullable().optional(),
	marketCapAtAdd: z.number().nullable().optional(),
	provider: z.string().default("alpaca"),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
});
export type IndexConstituent = z.infer<typeof IndexConstituentSchema>;

export const TickerChangeSchema = z.object({
	id: z.number().optional(),
	oldSymbol: z.string().min(1),
	newSymbol: z.string().min(1),
	changeDate: z.string().describe("Date of ticker change in ISO8601 format"),
	changeType: ChangeTypeSchema,
	conversionRatio: z.number().nullable().optional(),
	reason: z.string().nullable().optional(),
	acquiringCompany: z.string().nullable().optional(),
	provider: z.string().default("alpaca"),
	createdAt: z.string().optional(),
});
export type TickerChange = z.infer<typeof TickerChangeSchema>;

export const UniverseSnapshotSchema = z.object({
	id: z.number().optional(),
	snapshotDate: z.string().describe("Point-in-time date of universe snapshot in ISO8601 format"),
	indexId: IndexIdSchema,
	tickers: z.array(z.string()),
	tickerCount: z.number(),
	sourceVersion: z.string().nullable().optional(),
	computedAt: z.string().optional(),
	expiresAt: z.string().nullable().optional(),
});
export type UniverseSnapshot = z.infer<typeof UniverseSnapshotSchema>;

type IndexConstituentRow = typeof indexConstituents.$inferSelect;
type TickerChangeRow = typeof tickerChanges.$inferSelect;
type UniverseSnapshotRow = typeof universeSnapshots.$inferSelect;

export function mapConstituentRow(row: IndexConstituentRow): IndexConstituent {
	return {
		id: row.id,
		indexId: row.indexId as IndexId,
		symbol: row.symbol,
		dateAdded: row.dateAdded.toISOString(),
		dateRemoved: row.dateRemoved?.toISOString() ?? null,
		reasonAdded: row.reasonAdded,
		reasonRemoved: row.reasonRemoved,
		sector: row.sector,
		industry: row.industry,
		marketCapAtAdd: row.marketCapAtAdd ? Number(row.marketCapAtAdd) : null,
		provider: row.provider,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

export function mapTickerChangeRow(row: TickerChangeRow): TickerChange {
	return {
		id: row.id,
		oldSymbol: row.oldSymbol,
		newSymbol: row.newSymbol,
		changeDate: row.changeDate.toISOString(),
		changeType: row.changeType as ChangeType,
		conversionRatio: row.conversionRatio ? Number(row.conversionRatio) : null,
		reason: row.reason,
		acquiringCompany: row.acquiringCompany,
		provider: row.provider,
		createdAt: row.createdAt.toISOString(),
	};
}

export function mapSnapshotRow(row: UniverseSnapshotRow): UniverseSnapshot {
	return {
		id: row.id,
		snapshotDate: row.snapshotDate.toISOString(),
		indexId: row.indexId as IndexId,
		tickers: (row.tickers as string[]) ?? [],
		tickerCount: row.tickerCount,
		sourceVersion: row.sourceVersion,
		computedAt: row.computedAt.toISOString(),
		expiresAt: row.expiresAt?.toISOString() ?? null,
	};
}
