import type {
	predictionMarketArbitrage,
	predictionMarketSignals,
	predictionMarketSnapshots,
} from "../schema/external";

export type PredictionPlatform = "kalshi" | "polymarket";

export type PredictionMarketType = "rate" | "election" | "economic";

export type SignalType =
	| "fed_cut_probability"
	| "fed_hike_probability"
	| "recession_12m"
	| "macro_uncertainty"
	| "policy_event_risk"
	| "cpi_surprise"
	| "gdp_surprise"
	| "shutdown_probability"
	| "tariff_escalation";

export interface MarketSnapshot {
	id: string;
	platform: PredictionPlatform;
	marketTicker: string;
	marketType: PredictionMarketType;
	marketQuestion: string | null;
	snapshotTime: string;
	data: MarketSnapshotData;
	createdAt: string;
}

export interface MarketSnapshotData {
	outcomes: Array<{
		outcome: string;
		probability: number;
		price: number;
		volume24h?: number;
	}>;
	liquidityScore?: number;
	volume24h?: number;
	openInterest?: number;
}

export interface CreateSnapshotInput {
	platform: PredictionPlatform;
	marketTicker: string;
	marketType: PredictionMarketType;
	marketQuestion?: string | null;
	snapshotTime: string;
	data: MarketSnapshotData;
}

export interface ComputedSignal {
	id: string;
	signalType: SignalType;
	signalValue: number;
	confidence: number | null;
	computedAt: string;
	inputs: SignalInputs;
	createdAt: string;
}

export interface SignalInputs {
	sources: Array<{
		platform: PredictionPlatform;
		ticker: string;
		price: number;
		weight: number;
	}>;
	method: string;
}

export interface CreateSignalInput {
	signalType: SignalType;
	signalValue: number;
	confidence?: number | null;
	computedAt: string;
	inputs: SignalInputs;
}

export interface ArbitrageAlert {
	id: string;
	kalshiTicker: string;
	polymarketToken: string;
	kalshiPrice: number;
	polymarketPrice: number;
	divergencePct: number;
	marketType: PredictionMarketType;
	detectedAt: string;
	resolvedAt: string | null;
	resolutionPrice: number | null;
	createdAt: string;
}

export interface CreateArbitrageInput {
	kalshiTicker: string;
	polymarketToken: string;
	kalshiPrice: number;
	polymarketPrice: number;
	divergencePct: number;
	marketType: PredictionMarketType;
	detectedAt: string;
}

export interface SnapshotFilters {
	platform?: PredictionPlatform;
	marketType?: PredictionMarketType;
	marketTicker?: string;
	fromTime?: string;
	toTime?: string;
}

export interface SignalFilters {
	signalType?: SignalType;
	fromTime?: string;
	toTime?: string;
	minValue?: number;
	maxValue?: number;
}

type SnapshotRow = typeof predictionMarketSnapshots.$inferSelect;
type SignalRow = typeof predictionMarketSignals.$inferSelect;
type ArbitrageRow = typeof predictionMarketArbitrage.$inferSelect;

export function mapSnapshotRow(row: SnapshotRow): MarketSnapshot {
	return {
		id: row.id,
		platform: row.platform as PredictionPlatform,
		marketTicker: row.marketTicker,
		marketType: row.marketType as PredictionMarketType,
		marketQuestion: row.marketQuestion,
		snapshotTime: row.snapshotTime.toISOString(),
		data: row.data as unknown as MarketSnapshotData,
		createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
	};
}

export function mapSignalRow(row: SignalRow): ComputedSignal {
	return {
		id: row.id,
		signalType: row.signalType as SignalType,
		signalValue: Number(row.signalValue),
		confidence: row.confidence ? Number(row.confidence) : null,
		computedAt: row.computedAt.toISOString(),
		inputs: row.inputs as unknown as SignalInputs,
		createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
	};
}

export function mapArbitrageRow(row: ArbitrageRow): ArbitrageAlert {
	return {
		id: row.id,
		kalshiTicker: row.kalshiTicker,
		polymarketToken: row.polymarketToken,
		kalshiPrice: Number(row.kalshiPrice),
		polymarketPrice: Number(row.polymarketPrice),
		divergencePct: Number(row.divergencePct),
		marketType: row.marketType as PredictionMarketType,
		detectedAt: row.detectedAt.toISOString(),
		resolvedAt: row.resolvedAt?.toISOString() ?? null,
		resolutionPrice: row.resolutionPrice ? Number(row.resolutionPrice) : null,
		createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
	};
}
