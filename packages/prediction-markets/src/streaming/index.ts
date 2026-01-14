/**
 * Prediction Markets Streaming
 *
 * Real-time streaming from Kalshi and Polymarket prediction markets.
 */

export {
	createStreamingServiceFromConfig,
	createUnifiedStreamingService,
	type Platform,
	type StreamingCallback,
	type StreamingConfig,
	type StreamingMarketUpdate,
	UnifiedStreamingService,
} from "./unified-streaming";
