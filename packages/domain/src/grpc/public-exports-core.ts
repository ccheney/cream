// Market calendar and session handling
export {
	// Session types
	type ActionForSession,
	ActionForSession as ActionForSessionSchema,
	// Core calendar
	canStartCycle,
	DEFAULT_CLOSE_TIME,
	EARLY_CLOSE_TIME,
	type ExpirationCycle,
	getAllHolidays,
	// Session validation functions
	getAllowedSessions,
	getExpirationCycle,
	getHoliday,
	getMarketCloseTime,
	getMinutesToClose,
	getMonthlyExpiration,
	getMonthlyExpirations,
	getNextRTHStart,
	getNextTradingDay,
	getPreviousTradingDay,
	getThirdFriday,
	getTradingSession,
	type Holiday,
	HolidayType,
	hasDailyOptions,
	type InstrumentTypeForSession,
	InstrumentTypeForSession as InstrumentTypeForSessionSchema,
	isDailyExpiration,
	isEntryAction,
	isExitAction,
	isMarketOpen,
	isMonthlyExpiration,
	isPassiveAction,
	isRTH,
	isTradingPossible,
	isWeeklyExpiration,
	MIN_MINUTES_BEFORE_CLOSE,
	NYSE_HOLIDAYS_2026,
	NYSE_SESSIONS,
	type SessionHours,
	type SessionValidationConfig,
	type SessionValidationResult,
	TradingSession,
	validateSessionForAction,
} from "../calendar";

// Calendar service abstraction (API-based or hardcoded)
export {
	type AlpacaCalendarResponse,
	AlpacaCalendarResponseSchema,
	type AlpacaClockResponse,
	AlpacaClockResponseSchema,
	type CalendarCacheEntry,
	CalendarConfigError,
	type CalendarDay,
	CalendarDaySchema,
	type CalendarService,
	type CalendarServiceFactoryOptions,
	type CalendarServiceOptions,
	createCalendarService,
	getCalendarService,
	initCalendarService,
	isCalendarServiceAvailable,
	type MarketClock,
	MarketClockSchema,
	requireCalendarService,
	resetCalendarService,
	TradingSessionSchema,
} from "../calendar/index";

// Clock synchronization and timestamp validation
export {
	alignToDailyCandle,
	alignToHourlyCandle,
	type ClockCheckResult,
	type ClockSkewThresholds,
	checkClockSkew,
	DEFAULT_CLOCK_THRESHOLDS,
	getClockMonitorState,
	isHourlyAligned,
	periodicClockCheck,
	resetClockMonitorState,
	type TimestampValidationResult,
	validateCandleSequence,
	validateTimestamp,
	validateTimestampConsistency,
} from "../clock";

// Execution context (replaces ambient CREAM_ENV with explicit context)
export {
	createContext,
	EXECUTION_SOURCES,
	type ExecutionContext,
	type ExecutionSource,
	isValidExecutionSource,
} from "../context";

// Contract testing
export {
	// Types
	type ContractError,
	type ContractValidationResult,
	// HTTP contracts
	EXECUTION_HTTP_CONTRACTS,
	// Fixtures
	FIXTURE_ACCOUNT_STATE,
	FIXTURE_CONSTRAINT_CHECK,
	FIXTURE_DECISION,
	FIXTURE_DECISION_PLAN,
	FIXTURE_EXECUTION_ACK,
	FIXTURE_INSTRUMENT,
	FIXTURE_OPTION_INSTRUMENT,
	FIXTURE_POSITION,
	FIXTURE_SUBMIT_ORDER_REQUEST,
	FIXTURE_SUBMIT_ORDER_RESPONSE,
	type HTTPEndpointContract,
	// Validation functions
	validateAllContracts,
	validateContract,
	validateHTTPContracts,
} from "../contracts/index.js";

// Decision contracts
export {
	// Enums
	Action,
	type Decision,
	type DecisionPlan,
	DecisionPlanSchema,
	DecisionSchema,
	Direction,
	// Validation functions
	getDecisionDirection,
	type Instrument,
	InstrumentSchema,
	InstrumentType,
	MarketStatus,
	// Types
	type OptionContract,
	// Schemas
	OptionContractSchema,
	OptionType,
	type OrderPlan,
	OrderPlanSchema,
	OrderType,
	type References,
	ReferencesSchema,
	Regime,
	RiskDenomination,
	type RiskLevels,
	RiskLevelsSchema,
	type RiskValidationResult,
	type Size,
	SizeSchema,
	SizeUnit,
	StrategyFamily,
	TimeInForce,
	validateDecisionPlan,
	validateRiskLevels,
} from "../decision";

// Drawdown metrics
export {
	calculateDrawdown,
	calculateDrawdownStats,
	calculateRecoveryNeeded,
	checkDrawdownAlert,
	createEmptyDrawdownStats,
	DEFAULT_DRAWDOWN_ALERT_CONFIG,
	DRAWDOWN_THRESHOLDS,
	type DrawdownAlertConfig,
	type DrawdownEvent,
	type DrawdownStats,
	DrawdownStatsSchema,
	DrawdownTracker,
	type EquityPoint,
	formatDrawdownStats,
	getRiskLevel,
} from "../drawdown";

// Output enforcement
export {
	createFallbackPlan,
	createOutputEnforcer,
	type EnforcementOptions,
	type EnforcementResult,
	type MarketContext,
	OutputEnforcer,
	type ParseError,
	type PositionInfo,
	type PreflightError,
	type PreflightErrorType,
	type PreflightResult,
	parseAndValidateJSON,
	type Result,
	runPreflightChecks,
	type TraderAgentInterface,
} from "../enforcement/index.js";

// Environment configuration
export {
	CreamEnvironment,
	type EnvConfig,
	type EnvValidationResult,
	env,
	envSchema,
	getAlpacaBaseUrl,
	getEnvDatabaseSuffix,
	getEnvVarDocumentation,
	getHelixUrl,
	isLive,
	isPaper,
	isTest,
	requireEnv,
	validateEnvironment,
	validateEnvironmentOrExit,
} from "../env";

// Execution errors and gRPC mapping
export {
	// Error details types
	type ConstraintViolationDetails,
	// Specific error classes
	ConstraintViolationError,
	calculateRetryDelay,
	DEFAULT_RETRY_OPTIONS,
	DeadlineExceededError,
	// Base error class
	ExecutionError,
	GRPC_STATUS_NAMES,
	type GrpcError,
	// gRPC status codes
	GrpcStatusCode,
	InsufficientFundsError,
	InternalError,
	InvalidArgumentError,
	isConstraintViolation,
	// Type guards
	isExecutionError,
	isInsufficientFunds,
	isRetryableError,
	// Error mapping
	mapGrpcError,
	NotFoundError,
	PermissionDeniedError,
	ResourceExhaustedError,
	// Retry logic
	type RetryOptions,
	ServiceUnavailableError,
	withRetry,
} from "../errors";

// Typed event schemas (mirrors events.proto)
export {
	type AnalystRatingPayload,
	AnalystRatingPayloadSchema,
	createEarningsEvent,
	createMacroEvent,
	createNewsEvent,
	DataSource,
	type DividendPayload,
	DividendPayloadSchema,
	type EarningsEventPayload,
	EarningsEventPayloadSchema,
	type EventQueryRequest,
	EventQueryRequestSchema,
	ExtendedEventType,
	type ExternalEventList,
	ExternalEventListSchema,
	type ExtractedEntity,
	ExtractedEntitySchema,
	ExtractedSentiment,
	getEventSurpriseScore,
	isEarningsEvent,
	isMacroEvent,
	isNewsEvent,
	type MacroEventPayload,
	MacroEventPayloadSchema,
	type MergerAcquisitionPayload,
	MergerAcquisitionPayloadSchema,
	type NewsEventPayload,
	NewsEventPayloadSchema,
	type RegulatoryPayload,
	RegulatoryPayloadSchema,
	type SentimentEventPayload,
	SentimentEventPayloadSchema,
	type SplitPayload,
	SplitPayloadSchema,
	type TypedAnalystRatingEvent,
	TypedAnalystRatingEventSchema,
	type TypedDividendEvent,
	TypedDividendEventSchema,
	type TypedEarningsEvent,
	TypedEarningsEventSchema,
	type TypedExternalEvent,
	TypedExternalEventSchema,
	type TypedGenericEvent,
	TypedGenericEventSchema,
	type TypedMacroEvent,
	TypedMacroEventSchema,
	type TypedMergerAcquisitionEvent,
	TypedMergerAcquisitionEventSchema,
	type TypedNewsEvent,
	TypedNewsEventSchema,
	type TypedRegulatoryEvent,
	TypedRegulatoryEventSchema,
	type TypedSentimentEvent,
	TypedSentimentEventSchema,
	type TypedSplitEvent,
	TypedSplitEventSchema,
} from "../events";

// Execution schemas
export {
	type AccountState,
	// Account state
	AccountStateSchema,
	// Action mapping
	ActionMappingError,
	type BrokerOrderMapping,
	type CheckConstraintsRequest,
	CheckConstraintsRequestSchema,
	type CheckConstraintsResponse,
	CheckConstraintsResponseSchema,
	type ConstraintCheck,
	// Constraint check
	ConstraintCheckSchema,
	// Enums
	ConstraintResult,
	deriveActionFromPositions,
	type ExecutionAck,
	ExecutionAckSchema,
	type GetAccountStateRequest,
	GetAccountStateRequestSchema,
	type GetAccountStateResponse,
	GetAccountStateResponseSchema,
	type GetPositionsRequest,
	GetPositionsRequestSchema,
	type GetPositionsResponse,
	GetPositionsResponseSchema,
	mapActionToBrokerOrder,
	OrderSide,
	type PortfolioState,
	PortfolioStateSchema,
	type Position,
	// Positions
	PositionSchema,
	type StreamExecutionsRequest,
	// Service types
	StreamExecutionsRequestSchema,
	type StreamExecutionsResponse,
	StreamExecutionsResponseSchema,
	type SubmitOrderRequest,
	// Order execution
	SubmitOrderRequestSchema,
	type SubmitOrderResponse,
	SubmitOrderResponseSchema,
} from "../execution";

// Exposure calculations
export {
	type BucketedExposure,
	calculateDeltaAdjustedExposure,
	calculateExposureByAssetClass,
	calculateExposureByBucket,
	calculateExposureByInstrumentType,
	calculateExposureBySector,
	calculateExposureByStrategy,
	calculateExposurePair,
	calculateExposureStats,
	createEmptyExposureStats,
	DEFAULT_EXPOSURE_LIMITS,
	type ExposureBucket,
	type ExposureLimits,
	type ExposurePair,
	ExposurePairSchema,
	type ExposureStats,
	ExposureStatsSchema,
	type ExposureValidationResult,
	type ExposureValues,
	ExposureValuesSchema,
	type ExposureViolation,
	formatExposureStats,
	type PositionWithDelta,
	type PositionWithMetadata,
	validateExposure,
	validateSectorExposure,
} from "../exposure";

// External context types
export {
	type AnalystRatings,
	AnalystRatingsSchema,
	createEmptyExternalContext,
	type EarningsData,
	EarningsDataSchema,
	EventType,
	type ExternalContext,
	ExternalContextSchema,
	type ExternalEvent,
	ExternalEventSchema,
	type FundamentalsContext,
	FundamentalsContextSchema,
	getSentimentScore,
	hasExternalContext,
	InfluenceType,
	type MacroIndicators,
	MacroIndicatorsSchema,
	type NewsContext,
	NewsContextSchema,
	type NewsItem,
	NewsItemSchema,
	type NumericScores,
	NumericScoresSchema,
	type SentimentContext,
	SentimentContextSchema,
	SentimentDirection,
	type SocialSentiment,
	SocialSentimentSchema,
	StandardScoreNames,
	type StructuredSummary,
	StructuredSummarySchema,
	type ValuationMetrics,
	ValuationMetricsSchema,
} from "../external-context";

// Global LLM model configuration
export {
	type GlobalModel,
	GlobalModelSchema,
	getDefaultGlobalModel,
	getFullModelId,
	getLLMModelId,
	getLLMProvider,
	getModelId,
	isValidModel,
	parseModel,
} from "../llm-models";

// LLM parsing with retry logic
export {
	allowsSkipOnFailure,
	cleanLLMOutput,
	defaultLogger,
	type FormattedZodError,
	formatJsonParseError,
	formatZodErrorString,
	formatZodErrors,
	generateRetryPrompt,
	generateSchemaExample,
	type ParseAttempt,
	type ParseLogger,
	type ParseOptions,
	type ParseResult,
	parseOnce,
	parseWithRetry,
	redactSensitiveData,
	requiresRejectionOnFailure,
	schemaToDescription,
} from "../llm-parsing";

// LogoKit URL utilities
export {
	buildLogoUrl,
	buildTickerLogoUrl,
	extractDomain,
	getSourceLogoInfo,
} from "../logokit";

// Market snapshot schemas
export * from "./public-exports-market-snapshot";
