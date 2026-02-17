import { mock } from "bun:test";
import { z } from "zod";

const mockZodSchema = z.object({});
function SemanticScholarClientMock() {}
function ExtractionPipelineMock() {}
function EntityLinkerMock() {}

export function registerTradingCycleMocks(): void {
	registerDomainMocks();
	registerBrokerMocks();
	registerMarketDataMocks();
	registerRegimeMocks();
	registerUniverseMocks();
	registerLoggerMocks();
	registerExternalContextMocks();
}

function registerDomainMocks(): void {
	mock.module("@cream/domain", () => ({
		createContext: () => ({
			environment: "PAPER",
			source: "test",
			traceId: "test-trace",
		}),
		requireEnv: () => "PAPER",
		isTest: () => true,
		getModelId: () => "google/gemini-2.0-flash",
		getFullModelId: () => "google/gemini-2.0-flash",
		getLLMProvider: () => "google",
		getLLMModelId: () => "gemini-2.0-flash",
		calculateCaseStatistics: () => ({
			total: 0,
			byAction: {},
			byRegime: {},
			averageSimilarity: 0,
		}),
	}));
}

function registerBrokerMocks(): void {
	mock.module("@cream/broker", () => ({
		createAlpacaClient: () => ({
			getPositions: async () => [],
			getPosition: async () => null,
		}),
	}));
}

function registerMarketDataMocks(): void {
	mock.module("@cream/marketdata", () => ({
		isAlpacaConfigured: () => false,
		createAlpacaClientFromEnv: () => ({
			getSnapshots: async () => new Map(),
			getBars: async () => [],
		}),
	}));
}

function registerRegimeMocks(): void {
	mock.module("@cream/regime", () => ({
		classifyRegime: () => ({
			regime: "RANGE",
			confidence: 0.7,
			reasoning: "Mock regime classification",
		}),
		DEFAULT_RULE_BASED_CONFIG: {},
		getRequiredCandleCount: () => 50,
	}));
}

function registerUniverseMocks(): void {
	mock.module("@cream/universe", () => ({
		resolveUniverseSymbols: async () => ["AAPL", "MSFT"],
		createFREDClient: () => ({
			getObservations: async () => [],
			getSeriesInfo: async () => null,
		}),
	}));
}

function registerLoggerMocks(): void {
	mock.module("@cream/logger", () => ({
		createNodeLogger: () => ({
			info: () => {},
			warn: () => {},
			error: () => {},
			debug: () => {},
		}),
	}));
}

function registerExternalContextMocks(): void {
	mock.module("@cream/external-context", () => ({
		createSemanticScholarClient: () => ({
			searchPapers: async () => ({ data: [], total: 0, offset: 0 }),
		}),
		SemanticScholarClient: SemanticScholarClientMock,
		createExtractionPipeline: () => ({
			processNews: async () => ({ events: [] }),
		}),
		ExtractionPipeline: ExtractionPipelineMock,
		createEntityLinker: () => ({
			link: async () => [],
		}),
		EntityLinker: EntityLinkerMock,
		ExtractionResultSchema: mockZodSchema,
		DataPointSchema: mockZodSchema,
		EntityTypeSchema: z.enum(["PERSON", "ORG", "PRODUCT"]),
		EventTypeSchema: z.enum(["EARNINGS", "MACRO"]),
		ExtractedEntitySchema: mockZodSchema,
		SentimentSchema: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]),
	}));
}

export function createStepContext(inputData: Record<string, unknown>) {
	return {
		inputData,
		mapiTraceId: "test",
		runId: "test-run",
		context: { machineContext: undefined },
		suspend: async () => undefined,
		getInitData: () => undefined,
		getStepResult: () => undefined,
		runtimeContext: {},
	};
}
