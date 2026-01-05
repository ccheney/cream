/**
 * Candle Ingestion Module
 */

export {
  aggregateCandles,
  CandleIngestionService,
  CandleSchema,
  checkStaleness,
  TimeframeSchema,
  type Candle,
  type CandleStorage,
  type GapInfo,
  type IngestionOptions,
  type IngestionResult,
  type StalenessResult,
  type Timeframe,
} from "./candleIngestion";
