/**
 * Configuration types (runtime config, constraints, agents).
 */

import type { Environment } from "./common";

export interface ConstraintsConfig {
	perInstrument: {
		maxShares: number;
		maxContracts: number;
		maxNotional: number;
		maxPctEquity: number;
	};
	portfolio: {
		maxGrossExposure: number;
		maxNetExposure: number;
		maxConcentration: number;
		maxCorrelation: number;
		maxDrawdown: number;
	};
	options: {
		maxDelta: number;
		maxGamma: number;
		maxVega: number;
		maxTheta: number;
	};
}

export type AgentStatusType = "idle" | "processing" | "error";

export interface AgentStatus {
	type: string;
	displayName: string;
	status: AgentStatusType;
	lastOutputAt: string | null;
	outputsToday: number;
	avgConfidence: number;
	approvalRate: number;
}

export interface AgentConfig {
	type: string;
	systemPrompt: string;
	enabled: boolean;
}

export type RuntimeAgentType =
	| "technical_analyst"
	| "news_analyst"
	| "fundamentals_analyst"
	| "bullish_researcher"
	| "bearish_researcher"
	| "trader"
	| "risk_manager"
	| "critic";

export type ConfigStatus = "draft" | "testing" | "active" | "archived";

export type GlobalModel = string;

export interface RuntimeTradingConfig {
	id: string;
	environment: Environment;
	version: number;
	globalModel: GlobalModel;
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
	status: ConfigStatus;
	createdAt: string;
	updatedAt: string;
	promotedFrom: string | null;
}

export interface RuntimeScannerConfig {
	id: string;
	environment: Environment;
	minPrice: number;
	minAvgVolume: number;
	volumeSpikeThreshold: number;
	priceMoveThreshold: number;
	gapThreshold: number;
	maxCandidates: number;
	cooldownSeconds: number;
	enabled: boolean;
	status: ConfigStatus;
	createdAt: string;
	updatedAt: string;
}

export interface ScannerRuntimeStatus {
	active: boolean;
	symbolsTracked: number;
	totalAlerts: number;
	alertsLastHour: number;
}

export interface RuntimeAgentConfig {
	id: string;
	environment: Environment;
	agentType: RuntimeAgentType;
	model: string;
	systemPromptOverride: string | null;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface FullRuntimeConfig {
	trading: RuntimeTradingConfig;
	agents: Record<RuntimeAgentType, RuntimeAgentConfig>;
	scanner: RuntimeScannerConfig;
}

export interface ValidationError {
	field: string;
	message: string;
	value?: unknown;
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: string[];
}

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

export interface SaveDraftInput {
	trading?: Partial<RuntimeTradingConfig>;
	scanner?: Partial<RuntimeScannerConfig>;
	agents?: Partial<Record<RuntimeAgentType, Partial<RuntimeAgentConfig>>>;
}

export interface AlertSettings {
	enablePush: boolean;
	enableEmail: boolean;
	emailAddress: string | null;
	criticalOnly: boolean;
	quietHours: { start: string; end: string } | null;
}
