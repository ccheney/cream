/**
 * Prediction Market Transformers
 *
 * Transforms prediction market data into Cream's ExternalEvent schema format
 * for integration with the external context pipeline.
 */

import type {
	ExternalEvent,
	NumericScores,
	PredictionMarketEvent,
	PredictionMarketScores,
	PredictionMarketType,
} from "@cream/domain";

export interface InstrumentMappingConfig {
	defaultInstruments: string[];
	keywordMappings: Record<string, string[]>;
}

/**
 * Default instrument mapping by market type
 *
 * Fed rate markets affect rate-sensitive sectors:
 * - XLF: Financials (bank margins affected by rates)
 * - TLT: Long-term treasuries (inverse rate sensitivity)
 * - IYR: Real Estate (rate-sensitive financing)
 * - KRE: Regional banks (NIM sensitivity)
 *
 * Economic data markets affect sector-specific ETFs
 */
export const INSTRUMENT_MAPPING: Record<PredictionMarketType, InstrumentMappingConfig> = {
	FED_RATE: {
		defaultInstruments: ["XLF", "TLT", "IYR", "KRE"],
		keywordMappings: {
			cut: ["TLT", "IYR"], // Rate cuts boost bond prices and real estate
			hike: ["XLF", "KRE"], // Rate hikes help bank margins
		},
	},
	ECONOMIC_DATA: {
		defaultInstruments: [],
		keywordMappings: {
			cpi: ["TIPS", "GLD", "TIP"],
			inflation: ["TIPS", "GLD", "TIP", "RINF"],
			gdp: ["SPY", "QQQ"],
			growth: ["SPY", "QQQ", "IWM"],
			jobs: ["XLY", "XLF"],
			employment: ["XLY", "XLF"],
			payroll: ["XLY", "XLF"],
			pce: ["XLP", "XLY"],
			spending: ["XLP", "XLY", "XRT"],
		},
	},
	RECESSION: {
		defaultInstruments: ["SPY", "QQQ", "VIX", "TLT"],
		keywordMappings: {
			recession: ["XLU", "XLP", "GLD"], // Defensive sectors
			downturn: ["XLU", "XLP", "GLD"],
		},
	},
	GEOPOLITICAL: {
		defaultInstruments: ["VIX", "GLD", "USO"],
		keywordMappings: {
			war: ["XLE", "ITA", "GLD"],
			conflict: ["XLE", "ITA", "GLD"],
			tariff: ["EEM", "FXI", "EWZ"],
			trade: ["EEM", "FXI", "EWZ"],
			sanction: ["XLE", "RSX"],
		},
	},
	REGULATORY: {
		defaultInstruments: ["XLF", "XLK"],
		keywordMappings: {
			bank: ["XLF", "KRE", "KBE"],
			tech: ["XLK", "QQQ"],
			crypto: ["COIN", "MSTR", "GBTC"],
			energy: ["XLE", "XOP"],
			healthcare: ["XLV", "XBI"],
			antitrust: ["XLK", "META", "GOOGL"],
		},
	},
	ELECTION: {
		defaultInstruments: ["SPY", "VIX"],
		keywordMappings: {
			president: ["SPY", "VIX", "DIA"],
			senate: ["XLF", "XLE", "XLV"],
			house: ["XLF", "XLE", "XLV"],
			congress: ["XLF", "XLE", "XLV"],
		},
	},
};

export function mapToRelatedInstruments(event: PredictionMarketEvent): string[] {
	const marketType = event.payload.marketType;
	const config = INSTRUMENT_MAPPING[marketType];

	if (!config) {
		return [];
	}

	const instruments = new Set<string>(config.defaultInstruments);
	const question = event.payload.marketQuestion.toLowerCase();

	for (const [keyword, additionalInstruments] of Object.entries(config.keywordMappings)) {
		if (question.includes(keyword)) {
			for (const instrument of additionalInstruments) {
				instruments.add(instrument);
			}
		}
	}

	for (const id of event.relatedInstrumentIds) {
		instruments.add(id);
	}

	return [...instruments];
}

export function transformToExternalEvent(event: PredictionMarketEvent): ExternalEvent {
	const relatedInstruments = mapToRelatedInstruments(event);

	return {
		eventId: event.eventId,
		eventType: "PREDICTION_MARKET",
		eventTime: event.eventTime,
		payload: {
			platform: event.payload.platform,
			marketType: event.payload.marketType,
			marketTicker: event.payload.marketTicker,
			marketQuestion: event.payload.marketQuestion,
			outcomes: event.payload.outcomes.map((o) => ({
				outcome: o.outcome,
				probability: o.probability,
				price: o.price,
				volume24h: o.volume24h,
			})),
			lastUpdated: event.payload.lastUpdated,
			volume24h: event.payload.volume24h,
			liquidityScore: event.payload.liquidityScore,
			openInterest: event.payload.openInterest,
		},
		relatedInstrumentIds: relatedInstruments,
		source: event.payload.platform,
		headline: event.payload.marketQuestion,
	};
}

export function transformToExternalEvents(events: PredictionMarketEvent[]): ExternalEvent[] {
	return events.map(transformToExternalEvent);
}

export function transformScoresToNumeric(scores: PredictionMarketScores): NumericScores {
	const result: NumericScores = {};

	if (scores.fedCutProbability !== undefined) {
		result.pm_fed_cut = scores.fedCutProbability;
	}
	if (scores.fedHikeProbability !== undefined) {
		result.pm_fed_hike = scores.fedHikeProbability;
	}
	if (scores.recessionProbability12m !== undefined) {
		result.pm_recession_12m = scores.recessionProbability12m;
	}
	if (scores.cpiSurpriseDirection !== undefined) {
		result.pm_cpi_surprise = scores.cpiSurpriseDirection;
	}
	if (scores.gdpSurpriseDirection !== undefined) {
		result.pm_gdp_surprise = scores.gdpSurpriseDirection;
	}
	if (scores.shutdownProbability !== undefined) {
		result.pm_shutdown = scores.shutdownProbability;
	}
	if (scores.tariffEscalationProbability !== undefined) {
		result.pm_tariff_escalation = scores.tariffEscalationProbability;
	}
	if (scores.macroUncertaintyIndex !== undefined) {
		result.pm_macro_uncertainty = scores.macroUncertaintyIndex;
	}
	if (scores.policyEventRisk !== undefined) {
		result.pm_policy_risk = scores.policyEventRisk;
	}

	return result;
}
