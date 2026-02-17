import { eq, gte, lte } from "drizzle-orm";
import { sentimentIndicators } from "../schema/indicators";

export interface SentimentIndicators {
	id: string;
	symbol: string;
	date: string;
	sentimentScore: number | null;
	sentimentStrength: number | null;
	newsVolume: number | null;
	sentimentMomentum: number | null;
	eventRiskFlag: boolean;
	newsSentiment: number | null;
	socialSentiment: number | null;
	analystSentiment: number | null;
	computedAt: string;
}

export interface CreateSentimentInput {
	symbol: string;
	date: string;
	sentimentScore?: number | null;
	sentimentStrength?: number | null;
	newsVolume?: number | null;
	sentimentMomentum?: number | null;
	eventRiskFlag?: boolean;
	newsSentiment?: number | null;
	socialSentiment?: number | null;
	analystSentiment?: number | null;
}

export interface UpdateSentimentInput {
	sentimentScore?: number | null;
	sentimentStrength?: number | null;
	newsVolume?: number | null;
	sentimentMomentum?: number | null;
	eventRiskFlag?: boolean;
	newsSentiment?: number | null;
	socialSentiment?: number | null;
	analystSentiment?: number | null;
}

export interface SentimentFilters {
	symbol?: string;
	date?: string;
	dateGte?: string;
	dateLte?: string;
	sentimentScoreGte?: number;
	sentimentScoreLte?: number;
	eventRiskFlag?: boolean;
}

export interface PaginationOptions {
	page?: number;
	pageSize?: number;
}

export interface PaginatedResult<T> {
	data: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

type SentimentRow = typeof sentimentIndicators.$inferSelect;

const DECIMAL_FIELDS = [
	"sentimentScore",
	"sentimentStrength",
	"sentimentMomentum",
	"newsSentiment",
	"socialSentiment",
	"analystSentiment",
] as const satisfies ReadonlyArray<keyof UpdateSentimentInput>;

function toDecimal(value: number | null | undefined): string | null {
	return value != null ? String(value) : null;
}

function toNumber(value: string | null): number | null {
	return value ? Number(value) : null;
}

export function mapSentimentRow(row: SentimentRow): SentimentIndicators {
	return {
		id: row.id,
		symbol: row.symbol,
		date: row.date.toISOString(),
		sentimentScore: toNumber(row.sentimentScore),
		sentimentStrength: toNumber(row.sentimentStrength),
		newsVolume: row.newsVolume,
		sentimentMomentum: toNumber(row.sentimentMomentum),
		eventRiskFlag: row.eventRiskFlag ?? false,
		newsSentiment: toNumber(row.newsSentiment),
		socialSentiment: toNumber(row.socialSentiment),
		analystSentiment: toNumber(row.analystSentiment),
		computedAt: row.computedAt.toISOString(),
	};
}

export function buildSentimentCreateValues(input: CreateSentimentInput) {
	return {
		symbol: input.symbol,
		date: new Date(input.date),
		sentimentScore: toDecimal(input.sentimentScore),
		sentimentStrength: toDecimal(input.sentimentStrength),
		newsVolume: input.newsVolume ?? null,
		sentimentMomentum: toDecimal(input.sentimentMomentum),
		eventRiskFlag: input.eventRiskFlag ?? false,
		newsSentiment: toDecimal(input.newsSentiment),
		socialSentiment: toDecimal(input.socialSentiment),
		analystSentiment: toDecimal(input.analystSentiment),
	};
}

export function buildSentimentUpsertSet(input: CreateSentimentInput) {
	return {
		sentimentScore: toDecimal(input.sentimentScore),
		sentimentStrength: toDecimal(input.sentimentStrength),
		newsVolume: input.newsVolume ?? null,
		sentimentMomentum: toDecimal(input.sentimentMomentum),
		eventRiskFlag: input.eventRiskFlag ?? false,
		newsSentiment: toDecimal(input.newsSentiment),
		socialSentiment: toDecimal(input.socialSentiment),
		analystSentiment: toDecimal(input.analystSentiment),
		computedAt: new Date(),
	};
}

export function buildSentimentUpdateData(input: UpdateSentimentInput) {
	const updates: Partial<typeof sentimentIndicators.$inferInsert> = {
		computedAt: new Date(),
	};

	for (const field of DECIMAL_FIELDS) {
		const value = input[field];
		if (value === undefined) {
			continue;
		}
		updates[field] = toDecimal(value);
	}
	if (input.newsVolume !== undefined) {
		updates.newsVolume = input.newsVolume;
	}
	if (input.eventRiskFlag !== undefined) {
		updates.eventRiskFlag = input.eventRiskFlag;
	}

	return updates;
}

export function getDateRange(date: string) {
	const start = new Date(date);
	start.setHours(0, 0, 0, 0);

	const end = new Date(date);
	end.setHours(23, 59, 59, 999);

	return { start, end };
}

export function buildSentimentFilterConditions(filters: SentimentFilters) {
	const conditions = [];

	if (filters.symbol) {
		conditions.push(eq(sentimentIndicators.symbol, filters.symbol));
	}
	if (filters.date) {
		const { start, end } = getDateRange(filters.date);
		conditions.push(gte(sentimentIndicators.date, start));
		conditions.push(lte(sentimentIndicators.date, end));
	}
	if (filters.dateGte) {
		conditions.push(gte(sentimentIndicators.date, new Date(filters.dateGte)));
	}
	if (filters.dateLte) {
		conditions.push(lte(sentimentIndicators.date, new Date(filters.dateLte)));
	}
	if (filters.sentimentScoreGte !== undefined) {
		conditions.push(gte(sentimentIndicators.sentimentScore, String(filters.sentimentScoreGte)));
	}
	if (filters.sentimentScoreLte !== undefined) {
		conditions.push(lte(sentimentIndicators.sentimentScore, String(filters.sentimentScoreLte)));
	}
	if (filters.eventRiskFlag !== undefined) {
		conditions.push(eq(sentimentIndicators.eventRiskFlag, filters.eventRiskFlag));
	}

	return conditions;
}

export function buildSentimentCountConditions(filters?: SentimentFilters) {
	const conditions = [];

	if (filters?.symbol) {
		conditions.push(eq(sentimentIndicators.symbol, filters.symbol));
	}
	if (filters?.date) {
		const { start, end } = getDateRange(filters.date);
		conditions.push(gte(sentimentIndicators.date, start));
		conditions.push(lte(sentimentIndicators.date, end));
	}
	if (filters?.eventRiskFlag !== undefined) {
		conditions.push(eq(sentimentIndicators.eventRiskFlag, filters.eventRiskFlag));
	}

	return conditions;
}

export function resolvePagination(pagination?: PaginationOptions) {
	const page = pagination?.page ?? 1;
	const pageSize = pagination?.pageSize ?? 50;
	const offset = (page - 1) * pageSize;
	return { page, pageSize, offset };
}
