/**
 * Database Context
 *
 * Provides database client and repositories for API routes.
 * Uses Drizzle ORM with PostgreSQL.
 */

import { createRuntimeConfigService, type RuntimeConfigService } from "@cream/config";
import {
	AgentConfigsRepository,
	AgentOutputsRepository,
	AlertSettingsRepository,
	AlertsRepository,
	AuditLogRepository,
	BacktestsRepository,
	ConfigVersionsRepository,
	ConstraintsConfigRepository,
	CorporateActionsRepository,
	CyclesRepository,
	DecisionsRepository,
	FactorZooRepository,
	FilingSyncRunsRepository,
	FilingsRepository,
	FundamentalsRepository,
	IndicatorSyncRunsRepository,
	IndicatorsRepository,
	MacroWatchRepository,
	OrdersRepository,
	PortfolioSnapshotsRepository,
	PositionsRepository,
	PredictionMarketsRepository,
	RegimeLabelsRepository,
	SentimentRepository,
	ShortInterestRepository,
	SystemStateRepository,
	ThesisStateRepository,
	TradingConfigRepository,
	UniverseConfigsRepository,
	UserPreferencesRepository,
} from "@cream/storage";
import { type Database, closeDb as drizzleCloseDb, getDb } from "@cream/storage/db";

// ============================================
// Database Client Singleton
// ============================================

/**
 * Get the Drizzle database client.
 * The connection is managed by @cream/storage/db module.
 */
export function getDrizzleDb(): Database {
	return getDb();
}

/**
 * Close the database connection
 */
export async function closeDb(): Promise<void> {
	await drizzleCloseDb();
}

// ============================================
// Repository Factories
// ============================================

/**
 * Get decisions repository
 */
export function getDecisionsRepo(): DecisionsRepository {
	return new DecisionsRepository();
}

/**
 * Get alerts repository
 */
export function getAlertsRepo(): AlertsRepository {
	return new AlertsRepository();
}

/**
 * Get alert settings repository
 */
export function getAlertSettingsRepo(): AlertSettingsRepository {
	return new AlertSettingsRepository();
}

/**
 * Get orders repository
 */
export function getOrdersRepo(): OrdersRepository {
	return new OrdersRepository();
}

/**
 * Get positions repository
 */
export function getPositionsRepo(): PositionsRepository {
	return new PositionsRepository();
}

/**
 * Get agent outputs repository
 */
export function getAgentOutputsRepo(): AgentOutputsRepository {
	return new AgentOutputsRepository();
}

/**
 * Get portfolio snapshots repository
 */
export function getPortfolioSnapshotsRepo(): PortfolioSnapshotsRepository {
	return new PortfolioSnapshotsRepository();
}

/**
 * Get backtests repository
 */
export function getBacktestsRepo(): BacktestsRepository {
	return new BacktestsRepository();
}

/**
 * Get config versions repository
 */
export function getConfigVersionsRepo(): ConfigVersionsRepository {
	return new ConfigVersionsRepository();
}

/**
 * Get thesis state repository
 */
export function getThesesRepo(): ThesisStateRepository {
	return new ThesisStateRepository();
}

/**
 * Get factor zoo repository
 */
export function getFactorZooRepo(): FactorZooRepository {
	return new FactorZooRepository();
}

/**
 * Get regime labels repository
 */
export function getRegimeLabelsRepo(): RegimeLabelsRepository {
	return new RegimeLabelsRepository();
}

/**
 * Get trading config repository
 */
export function getTradingConfigRepo(): TradingConfigRepository {
	return new TradingConfigRepository();
}

/**
 * Get agent configs repository
 */
export function getAgentConfigsRepo(): AgentConfigsRepository {
	return new AgentConfigsRepository();
}

/**
 * Get universe configs repository
 */
export function getUniverseConfigsRepo(): UniverseConfigsRepository {
	return new UniverseConfigsRepository();
}

/**
 * Get user preferences repository
 */
export function getUserPreferencesRepo(): UserPreferencesRepository {
	return new UserPreferencesRepository();
}

/**
 * Get audit log repository
 */
export function getAuditLogRepo(): AuditLogRepository {
	return new AuditLogRepository();
}

/**
 * Get constraints config repository
 */
export function getConstraintsConfigRepo(): ConstraintsConfigRepository {
	return new ConstraintsConfigRepository();
}

/**
 * Get cycles repository
 */
export function getCyclesRepo(): CyclesRepository {
	return new CyclesRepository();
}

/**
 * Get filings repository
 */
export function getFilingsRepo(): FilingsRepository {
	return new FilingsRepository();
}

/**
 * Get filing sync runs repository
 */
export function getFilingSyncRunsRepo(): FilingSyncRunsRepository {
	return new FilingSyncRunsRepository();
}

/**
 * Get system state repository
 */
export function getSystemStateRepo(): SystemStateRepository {
	return new SystemStateRepository();
}

/**
 * Get indicators repository
 */
export function getIndicatorsRepo(): IndicatorsRepository {
	return new IndicatorsRepository();
}

/**
 * Get indicator sync runs repository
 */
export function getIndicatorSyncRunsRepo(): IndicatorSyncRunsRepository {
	return new IndicatorSyncRunsRepository();
}

/**
 * Get macro watch repository
 */
export function getMacroWatchRepo(): MacroWatchRepository {
	return new MacroWatchRepository();
}

/**
 * Get fundamentals repository
 */
export function getFundamentalsRepo(): FundamentalsRepository {
	return new FundamentalsRepository();
}

/**
 * Get short interest repository
 */
export function getShortInterestRepo(): ShortInterestRepository {
	return new ShortInterestRepository();
}

/**
 * Get sentiment repository
 */
export function getSentimentRepo(): SentimentRepository {
	return new SentimentRepository();
}

/**
 * Get corporate actions repository
 */
export function getCorporateActionsRepo(): CorporateActionsRepository {
	return new CorporateActionsRepository();
}

/**
 * Get prediction markets repository
 */
export function getPredictionMarketsRepo(): PredictionMarketsRepository {
	return new PredictionMarketsRepository();
}

// ============================================
// Runtime Config Service
// ============================================

let runtimeConfigService: RuntimeConfigService | null = null;

/**
 * Get the runtime configuration service
 */
export function getRuntimeConfigService(): RuntimeConfigService {
	if (runtimeConfigService) {
		return runtimeConfigService;
	}

	const tradingRepo = getTradingConfigRepo();
	const agentRepo = getAgentConfigsRepo();
	const universeRepo = getUniverseConfigsRepo();
	const constraintsRepo = getConstraintsConfigRepo();

	runtimeConfigService = createRuntimeConfigService(
		tradingRepo,
		agentRepo,
		universeRepo,
		constraintsRepo
	);
	return runtimeConfigService;
}
