/**
 * Candle Ingestion Module
 */

export {
	aggregateCandles,
	type Candle,
	CandleIngestionService,
	CandleSchema,
	type CandleStorage,
	checkStaleness,
	type GapInfo,
	type IngestionOptions,
	type IngestionResult,
	type StalenessResult,
	type Timeframe,
	TimeframeSchema,
} from "./candleIngestion";
