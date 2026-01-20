/**
 * Runtime Configuration Types
 *
 * All type definitions for the runtime configuration system.
 */

import type { GlobalModel } from "@cream/domain";

// ============================================
// Environment Types
// ============================================

export type TradingEnvironment = "PAPER" | "LIVE";

export type RuntimeEnvironment = "PAPER" | "LIVE";

// ============================================
// Trading Config Types
// ============================================

export type RuntimeTradingConfigStatus = "draft" | "testing" | "active" | "archived";

export interface RuntimeTradingConfig {
	id: string;
	environment: TradingEnvironment;
	version: number;
	maxConsensusIterations: number;
	agentTimeoutMs: number;
	totalConsensusTimeoutMs: number;
	convictionDeltaHold: number;
	convictionDeltaAction: number;
	highConvictionPct: number;
	mediumConvictionPct: number;
	lowConvictionPct: number;
	minRiskRewardRatio: number;
	kellyFraction: number;
	tradingCycleIntervalMs: number;
	predictionMarketsIntervalMs: number;
	globalModel: GlobalModel;
	status: RuntimeTradingConfigStatus;
	createdAt: string;
	updatedAt: string;
	promotedFrom: string | null;
}

// ============================================
// Agent Config Types
// ============================================

export type RuntimeAgentType =
	| "grounding_agent"
	| "news_analyst"
	| "fundamentals_analyst"
	| "bullish_researcher"
	| "bearish_researcher"
	| "trader"
	| "risk_manager"
	| "critic";

export interface RuntimeAgentConfig {
	id: string;
	environment: TradingEnvironment;
	agentType: RuntimeAgentType;
	systemPromptOverride: string | null;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
}

// ============================================
// Universe Config Types
// ============================================

export type RuntimeUniverseSource = "static" | "index" | "screener";

export type RuntimeUniverseConfigStatus = "draft" | "testing" | "active" | "archived";

export interface RuntimeUniverseConfig {
	id: string;
	environment: TradingEnvironment;
	source: RuntimeUniverseSource;
	staticSymbols: string[] | null;
	indexSource: string | null;
	minVolume: number | null;
	minMarketCap: number | null;
	optionableOnly: boolean;
	includeList: string[];
	excludeList: string[];
	status: RuntimeUniverseConfigStatus;
	createdAt: string;
	updatedAt: string;
}

// ============================================
// Constraints Config Types
// ============================================

export type RuntimeConstraintsConfigStatus = "draft" | "testing" | "active" | "archived";

export interface RuntimePerInstrumentLimits {
	maxShares: number;
	maxContracts: number;
	maxNotional: number;
	maxPctEquity: number;
}

export interface RuntimePortfolioLimits {
	maxGrossExposure: number;
	maxNetExposure: number;
	maxConcentration: number;
	maxCorrelation: number;
	maxDrawdown: number;
	maxRiskPerTrade: number;
	maxSectorExposure: number;
	maxPositions: number;
}

export interface RuntimeOptionsLimits {
	maxDelta: number;
	maxGamma: number;
	maxVega: number;
	maxTheta: number;
}

export interface RuntimeConstraintsConfig {
	id: string;
	environment: TradingEnvironment;
	perInstrument: RuntimePerInstrumentLimits;
	portfolio: RuntimePortfolioLimits;
	options: RuntimeOptionsLimits;
	status: RuntimeConstraintsConfigStatus;
	createdAt: string;
	updatedAt: string;
}

// ============================================
// Full Runtime Config
// ============================================

export interface FullRuntimeConfig {
	trading: RuntimeTradingConfig;
	agents: Record<RuntimeAgentType, RuntimeAgentConfig>;
	universe: RuntimeUniverseConfig;
	constraints: RuntimeConstraintsConfig;
}

// ============================================
// Validation Types
// ============================================

export interface ValidationError {
	field: string;
	message: string;
	value?: unknown;
}

export interface RuntimeValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: string[];
}

// ============================================
// History Types
// ============================================

export interface ConfigHistoryEntry {
	id: string;
	version: number;
	config: FullRuntimeConfig;
	createdAt: string;
	createdBy?: string;
	isActive: boolean;
	changedFields: string[];
	description?: string;
}

// ============================================
// Repository Interfaces
// ============================================

export interface TradingConfigRepository {
	getActive(environment: TradingEnvironment): Promise<RuntimeTradingConfig | null>;
	getDraft(environment: TradingEnvironment): Promise<RuntimeTradingConfig | null>;
	saveDraft(
		environment: TradingEnvironment,
		input: Partial<
			Omit<RuntimeTradingConfig, "id" | "environment" | "createdAt" | "updatedAt" | "status">
		>
	): Promise<RuntimeTradingConfig>;
	setStatus(id: string, status: RuntimeTradingConfigStatus): Promise<RuntimeTradingConfig>;
	getHistory(environment: TradingEnvironment, limit: number): Promise<RuntimeTradingConfig[]>;
	findById(id: string): Promise<RuntimeTradingConfig | null>;
	getNextVersion(environment: TradingEnvironment): Promise<number>;
	create(input: {
		id: string;
		environment: TradingEnvironment;
		version: number;
		maxConsensusIterations?: number;
		agentTimeoutMs?: number;
		totalConsensusTimeoutMs?: number;
		convictionDeltaHold?: number;
		convictionDeltaAction?: number;
		highConvictionPct?: number;
		mediumConvictionPct?: number;
		lowConvictionPct?: number;
		minRiskRewardRatio?: number;
		kellyFraction?: number;
		tradingCycleIntervalMs?: number;
		predictionMarketsIntervalMs?: number;
		status?: RuntimeTradingConfigStatus;
		promotedFrom?: string | null;
	}): Promise<RuntimeTradingConfig>;
	promote(sourceId: string, targetEnvironment: TradingEnvironment): Promise<RuntimeTradingConfig>;
}

export interface AgentConfigsRepository {
	getAll(environment: TradingEnvironment): Promise<RuntimeAgentConfig[]>;
	upsert(
		environment: TradingEnvironment,
		agentType: RuntimeAgentType,
		config: Partial<
			Omit<RuntimeAgentConfig, "id" | "environment" | "agentType" | "createdAt" | "updatedAt">
		>
	): Promise<RuntimeAgentConfig>;
	cloneToEnvironment(
		source: TradingEnvironment,
		target: TradingEnvironment
	): Promise<void> | Promise<unknown[]>;
}

export interface UniverseConfigsRepository {
	getActive(environment: TradingEnvironment): Promise<RuntimeUniverseConfig | null>;
	getDraft(environment: TradingEnvironment): Promise<RuntimeUniverseConfig | null>;
	saveDraft(
		environment: TradingEnvironment,
		input: Partial<
			Omit<RuntimeUniverseConfig, "id" | "environment" | "createdAt" | "updatedAt" | "status">
		>
	): Promise<RuntimeUniverseConfig>;
	setStatus(id: string, status: RuntimeUniverseConfigStatus): Promise<RuntimeUniverseConfig>;
}

export interface ConstraintsConfigRepository {
	getActive(environment: TradingEnvironment): Promise<RuntimeConstraintsConfig | null>;
	getDraft(environment: TradingEnvironment): Promise<RuntimeConstraintsConfig | null>;
	saveDraft(
		environment: TradingEnvironment,
		input: Partial<{
			maxShares: number;
			maxContracts: number;
			maxNotional: number;
			maxPctEquity: number;
			maxGrossExposure: number;
			maxNetExposure: number;
			maxConcentration: number;
			maxCorrelation: number;
			maxDrawdown: number;
			maxRiskPerTrade: number;
			maxSectorExposure: number;
			maxPositions: number;
			maxDelta: number;
			maxGamma: number;
			maxVega: number;
			maxTheta: number;
		}>
	): Promise<RuntimeConstraintsConfig>;
	setStatus(id: string, status: RuntimeConstraintsConfigStatus): Promise<RuntimeConstraintsConfig>;
}
