import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { fundamentalIndicators } from "../schema/indicators";

export interface FundamentalIndicators {
	id: string;
	symbol: string;
	date: string;
	peRatioTtm: number | null;
	peRatioForward: number | null;
	pbRatio: number | null;
	evEbitda: number | null;
	earningsYield: number | null;
	dividendYield: number | null;
	cape10yr: number | null;
	grossProfitability: number | null;
	roe: number | null;
	roa: number | null;
	assetGrowth: number | null;
	accrualsRatio: number | null;
	cashFlowQuality: number | null;
	beneishMScore: number | null;
	marketCap: number | null;
	sector: string | null;
	industry: string | null;
	source: string;
	computedAt: string;
}

export interface CreateFundamentalIndicatorsInput {
	id?: string;
	symbol: string;
	date: string;
	peRatioTtm?: number | null;
	peRatioForward?: number | null;
	pbRatio?: number | null;
	evEbitda?: number | null;
	earningsYield?: number | null;
	dividendYield?: number | null;
	cape10yr?: number | null;
	grossProfitability?: number | null;
	roe?: number | null;
	roa?: number | null;
	assetGrowth?: number | null;
	accrualsRatio?: number | null;
	cashFlowQuality?: number | null;
	beneishMScore?: number | null;
	marketCap?: number | null;
	sector?: string | null;
	industry?: string | null;
	source?: string;
}

export interface UpdateFundamentalIndicatorsInput {
	peRatioTtm?: number | null;
	peRatioForward?: number | null;
	pbRatio?: number | null;
	evEbitda?: number | null;
	earningsYield?: number | null;
	dividendYield?: number | null;
	cape10yr?: number | null;
	grossProfitability?: number | null;
	roe?: number | null;
	roa?: number | null;
	assetGrowth?: number | null;
	accrualsRatio?: number | null;
	cashFlowQuality?: number | null;
	beneishMScore?: number | null;
	marketCap?: number | null;
	sector?: string | null;
	industry?: string | null;
}

export interface FundamentalFilters {
	symbol?: string;
	symbols?: string[];
	sector?: string;
	industry?: string;
	startDate?: string;
	endDate?: string;
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

type FundamentalRow = typeof fundamentalIndicators.$inferSelect;

const NUMERIC_FIELDS = [
	"peRatioTtm",
	"peRatioForward",
	"pbRatio",
	"evEbitda",
	"earningsYield",
	"dividendYield",
	"cape10yr",
	"grossProfitability",
	"roe",
	"roa",
	"assetGrowth",
	"accrualsRatio",
	"cashFlowQuality",
	"beneishMScore",
	"marketCap",
] as const satisfies ReadonlyArray<keyof UpdateFundamentalIndicatorsInput>;

function toDecimal(value: number | null | undefined): string | null {
	return value != null ? String(value) : null;
}

function toNumber(value: string | null): number | null {
	return value ? Number(value) : null;
}

export function mapFundamentalRow(row: FundamentalRow): FundamentalIndicators {
	return {
		id: row.id,
		symbol: row.symbol,
		date: row.date.toISOString(),
		peRatioTtm: toNumber(row.peRatioTtm),
		peRatioForward: toNumber(row.peRatioForward),
		pbRatio: toNumber(row.pbRatio),
		evEbitda: toNumber(row.evEbitda),
		earningsYield: toNumber(row.earningsYield),
		dividendYield: toNumber(row.dividendYield),
		cape10yr: toNumber(row.cape10yr),
		grossProfitability: toNumber(row.grossProfitability),
		roe: toNumber(row.roe),
		roa: toNumber(row.roa),
		assetGrowth: toNumber(row.assetGrowth),
		accrualsRatio: toNumber(row.accrualsRatio),
		cashFlowQuality: toNumber(row.cashFlowQuality),
		beneishMScore: toNumber(row.beneishMScore),
		marketCap: toNumber(row.marketCap),
		sector: row.sector,
		industry: row.industry,
		source: row.source,
		computedAt: row.computedAt.toISOString(),
	};
}

export function buildFundamentalCreateValues(input: CreateFundamentalIndicatorsInput) {
	return {
		symbol: input.symbol,
		date: new Date(input.date),
		peRatioTtm: toDecimal(input.peRatioTtm),
		peRatioForward: toDecimal(input.peRatioForward),
		pbRatio: toDecimal(input.pbRatio),
		evEbitda: toDecimal(input.evEbitda),
		earningsYield: toDecimal(input.earningsYield),
		dividendYield: toDecimal(input.dividendYield),
		cape10yr: toDecimal(input.cape10yr),
		grossProfitability: toDecimal(input.grossProfitability),
		roe: toDecimal(input.roe),
		roa: toDecimal(input.roa),
		assetGrowth: toDecimal(input.assetGrowth),
		accrualsRatio: toDecimal(input.accrualsRatio),
		cashFlowQuality: toDecimal(input.cashFlowQuality),
		beneishMScore: toDecimal(input.beneishMScore),
		marketCap: toDecimal(input.marketCap),
		sector: input.sector ?? null,
		industry: input.industry ?? null,
		source: input.source ?? "computed",
	};
}

export function buildFundamentalUpsertValues(input: CreateFundamentalIndicatorsInput) {
	return {
		...buildFundamentalCreateValues(input),
		computedAt: new Date(),
	};
}

export function buildFundamentalUpsertSet(values: ReturnType<typeof buildFundamentalUpsertValues>) {
	return {
		peRatioTtm: values.peRatioTtm,
		peRatioForward: values.peRatioForward,
		pbRatio: values.pbRatio,
		evEbitda: values.evEbitda,
		earningsYield: values.earningsYield,
		dividendYield: values.dividendYield,
		cape10yr: values.cape10yr,
		grossProfitability: values.grossProfitability,
		roe: values.roe,
		roa: values.roa,
		assetGrowth: values.assetGrowth,
		accrualsRatio: values.accrualsRatio,
		cashFlowQuality: values.cashFlowQuality,
		beneishMScore: values.beneishMScore,
		marketCap: values.marketCap,
		sector: values.sector,
		industry: values.industry,
		source: values.source,
		computedAt: values.computedAt,
	};
}

export function buildFundamentalUpdateData(input: UpdateFundamentalIndicatorsInput) {
	const updates: Partial<typeof fundamentalIndicators.$inferInsert> = {
		computedAt: new Date(),
	};

	for (const field of NUMERIC_FIELDS) {
		const value = input[field];
		if (value === undefined) {
			continue;
		}
		updates[field] = toDecimal(value);
	}

	if (input.sector !== undefined) {
		updates.sector = input.sector;
	}
	if (input.industry !== undefined) {
		updates.industry = input.industry;
	}

	return updates;
}

export function buildFundamentalFilterConditions(filters?: FundamentalFilters) {
	const conditions = [];

	if (filters?.symbol) {
		conditions.push(eq(fundamentalIndicators.symbol, filters.symbol));
	}
	if (filters?.symbols?.length) {
		conditions.push(inArray(fundamentalIndicators.symbol, filters.symbols));
	}
	if (filters?.sector) {
		conditions.push(eq(fundamentalIndicators.sector, filters.sector));
	}
	if (filters?.industry) {
		conditions.push(eq(fundamentalIndicators.industry, filters.industry));
	}
	if (filters?.startDate) {
		conditions.push(gte(fundamentalIndicators.date, new Date(filters.startDate)));
	}
	if (filters?.endDate) {
		conditions.push(lte(fundamentalIndicators.date, new Date(filters.endDate)));
	}

	return conditions;
}

export function buildSymbolDateConditions(symbol: string, startDate?: string, endDate?: string) {
	const conditions = [eq(fundamentalIndicators.symbol, symbol)];

	if (startDate) {
		conditions.push(gte(fundamentalIndicators.date, new Date(startDate)));
	}
	if (endDate) {
		conditions.push(lte(fundamentalIndicators.date, new Date(endDate)));
	}

	return and(...conditions);
}
