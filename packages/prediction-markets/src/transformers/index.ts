/**
 * Prediction Market Transformers
 *
 * Transforms prediction market data into Cream's ExternalEvent schema format
 * for integration with the external context pipeline.
 *
 * @see docs/plans/18-prediction-markets.md - Phase 4 External Context Integration
 */

export {
	INSTRUMENT_MAPPING,
	type InstrumentMappingConfig,
	mapToRelatedInstruments,
	transformScoresToNumeric,
	transformToExternalEvent,
	transformToExternalEvents,
} from "./transformers";
