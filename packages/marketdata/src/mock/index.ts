/**
 * Mock Market Data Module
 *
 * Exports mock adapters and convenience functions for development and testing.
 */

export {
	createFailingMockAdapter,
	createFlakeMockAdapter,
	// Factory Functions
	createMockAdapter,
	createMockAdapterWithLatency,
	type ErrorSimulationConfig,
	type ErrorType,
	getMockAccount,
	// Convenience Functions
	getMockCandles,
	getMockPositions,
	getMockQuote,
	getMockTrades,
	type MockAccount,
	// Mock Adapter
	MockAdapter,
	// Types
	type MockAdapterConfig,
	MockApiError,
	type MockCandle,
	type MockMacroIndicator,
	type MockOrder,
	type MockPosition,
	type MockQuote,
	type MockTrade,
	// Fixture Registry
	mockData,
	type Timeframe,
} from "./mock-adapter";
