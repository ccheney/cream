/**
 * Parity Validation Service
 *
 * Provides validation services for indicator and factor promotions,
 * ensuring research-to-production parity.
 *
 * @module @cream/domain/parity-service
 */

import type {
	ParityPerformanceMetrics,
	ParityValidationResult,
	VersionRegistry,
} from "./parity.js";
import { runParityValidation } from "./parity.js";

// ============================================
// Types
// ============================================

/**
 * Entity types that can be validated for parity.
 */
export type ParityEntityType = "indicator" | "factor" | "config";

/**
 * Environment for validation.
 */
export type ParityEnvironment = "BACKTEST" | "PAPER" | "LIVE";

/**
 * Stored parity validation record.
 */
export interface ParityValidationRecord {
	id: string;
	entityType: ParityEntityType;
	entityId: string;
	environment: ParityEnvironment;
	passed: boolean;
	recommendation: ParityValidationResult["recommendation"];
	blockingIssues: string[];
	warnings: string[];
	fullReport: ParityValidationResult;
	validatedAt: string;
	createdAt: string;
}

/**
 * Input for creating a parity validation record.
 */
export interface CreateParityValidationInput {
	entityType: ParityEntityType;
	entityId: string;
	environment: ParityEnvironment;
	result: ParityValidationResult;
}

/**
 * Repository interface for parity validation storage.
 * Consumers must provide an implementation.
 */
export interface ParityValidationRepository {
	create(input: CreateParityValidationInput): Promise<ParityValidationRecord>;
	findByEntity(
		entityType: ParityEntityType,
		entityId: string
	): Promise<ParityValidationRecord | null>;
	findLatestByEntity(
		entityType: ParityEntityType,
		entityId: string
	): Promise<ParityValidationRecord | null>;
	findByEnvironment(environment: ParityEnvironment): Promise<ParityValidationRecord[]>;
}

/**
 * Interface for retrieving performance metrics from backtests/live.
 */
export interface MetricsProvider {
	getBacktestMetrics(entityId: string): Promise<ParityPerformanceMetrics | null>;
	getLiveMetrics(
		entityId: string,
		environment: ParityEnvironment
	): Promise<ParityPerformanceMetrics | null>;
}

/**
 * Interface for retrieving version registries.
 */
export interface VersionRegistryProvider {
	getBacktestRegistry(): Promise<VersionRegistry>;
	getLiveRegistry(environment: ParityEnvironment): Promise<VersionRegistry>;
}

// ============================================
// Service
// ============================================

/**
 * Configuration for the parity validation service.
 */
export interface ParityValidationServiceConfig {
	repository?: ParityValidationRepository;
	metricsProvider?: MetricsProvider;
	registryProvider?: VersionRegistryProvider;
}

/**
 * Service for running and storing parity validations.
 */
export class ParityValidationService {
	private readonly repository: ParityValidationRepository | null;
	private readonly metricsProvider: MetricsProvider | null;
	private readonly registryProvider: VersionRegistryProvider | null;

	constructor(config: ParityValidationServiceConfig = {}) {
		this.repository = config.repository ?? null;
		this.metricsProvider = config.metricsProvider ?? null;
		this.registryProvider = config.registryProvider ?? null;
	}

	/**
	 * Run parity validation for an indicator.
	 */
	async validateIndicator(
		indicatorId: string,
		environment: ParityEnvironment = "PAPER"
	): Promise<ParityValidationResult> {
		// Get metrics from providers if available
		let backtestMetrics: ParityPerformanceMetrics | undefined;
		let liveMetrics: ParityPerformanceMetrics | undefined;
		let backtestRegistry: VersionRegistry | undefined;
		let liveRegistry: VersionRegistry | undefined;

		if (this.metricsProvider) {
			const bt = await this.metricsProvider.getBacktestMetrics(indicatorId);
			const live = await this.metricsProvider.getLiveMetrics(indicatorId, environment);
			if (bt) {
				backtestMetrics = bt;
			}
			if (live) {
				liveMetrics = live;
			}
		}

		if (this.registryProvider) {
			backtestRegistry = await this.registryProvider.getBacktestRegistry();
			liveRegistry = await this.registryProvider.getLiveRegistry(environment);
		}

		const result = runParityValidation({
			backtestMetrics,
			liveMetrics,
			backtestRegistry,
			liveRegistry,
		});

		// Store result if repository is available
		if (this.repository) {
			await this.repository.create({
				entityType: "indicator",
				entityId: indicatorId,
				environment,
				result,
			});
		}

		return result;
	}

	/**
	 * Run parity validation for a factor.
	 */
	async validateFactor(
		factorId: string,
		environment: ParityEnvironment = "PAPER"
	): Promise<ParityValidationResult> {
		let backtestMetrics: ParityPerformanceMetrics | undefined;
		let liveMetrics: ParityPerformanceMetrics | undefined;

		if (this.metricsProvider) {
			const bt = await this.metricsProvider.getBacktestMetrics(factorId);
			const live = await this.metricsProvider.getLiveMetrics(factorId, environment);
			if (bt) {
				backtestMetrics = bt;
			}
			if (live) {
				liveMetrics = live;
			}
		}

		const result = runParityValidation({
			backtestMetrics,
			liveMetrics,
		});

		if (this.repository) {
			await this.repository.create({
				entityType: "factor",
				entityId: factorId,
				environment,
				result,
			});
		}

		return result;
	}

	/**
	 * Run parity validation for config promotion.
	 */
	async validateConfigPromotion(
		sourceEnvironment: ParityEnvironment,
		targetEnvironment: ParityEnvironment
	): Promise<ParityValidationResult> {
		// Config validation primarily checks version registries
		let backtestRegistry: VersionRegistry | undefined;
		let liveRegistry: VersionRegistry | undefined;

		if (this.registryProvider) {
			backtestRegistry = await this.registryProvider.getBacktestRegistry();
			liveRegistry = await this.registryProvider.getLiveRegistry(sourceEnvironment);
		}

		const result = runParityValidation({
			backtestRegistry,
			liveRegistry,
		});

		if (this.repository) {
			await this.repository.create({
				entityType: "config",
				entityId: `${sourceEnvironment}->${targetEnvironment}`,
				environment: targetEnvironment,
				result,
			});
		}

		return result;
	}

	/**
	 * Get the latest validation result for an entity.
	 */
	async getLatestValidation(
		entityType: ParityEntityType,
		entityId: string
	): Promise<ParityValidationRecord | null> {
		if (!this.repository) {
			return null;
		}
		return this.repository.findLatestByEntity(entityType, entityId);
	}

	/**
	 * Check if an entity has passing validation.
	 */
	async hasPassingValidation(entityType: ParityEntityType, entityId: string): Promise<boolean> {
		const latest = await this.getLatestValidation(entityType, entityId);
		return latest?.passed ?? false;
	}

	/**
	 * Validate that an entity is ready for promotion.
	 * Returns the validation result, or throws if validation is required and failed.
	 */
	async requirePassingValidation(
		entityType: ParityEntityType,
		entityId: string
	): Promise<ParityValidationResult> {
		const latest = await this.getLatestValidation(entityType, entityId);

		if (!latest) {
			// Run new validation
			switch (entityType) {
				case "indicator":
					return this.validateIndicator(entityId);
				case "factor":
					return this.validateFactor(entityId);
				default:
					throw new ParityValidationError(
						`No validation found for ${entityType} ${entityId}`,
						"NO_VALIDATION"
					);
			}
		}

		if (!latest.passed) {
			throw new ParityValidationError(
				`${entityType} ${entityId} has failing parity validation: ${latest.blockingIssues.join(", ")}`,
				"VALIDATION_FAILED",
				latest.fullReport
			);
		}

		return latest.fullReport;
	}
}

// ============================================
// Error Types
// ============================================

/**
 * Error thrown when parity validation fails.
 */
export class ParityValidationError extends Error {
	readonly code: "VALIDATION_FAILED" | "NO_VALIDATION" | "NOT_READY";
	readonly report?: ParityValidationResult;

	constructor(
		message: string,
		code: "VALIDATION_FAILED" | "NO_VALIDATION" | "NOT_READY",
		report?: ParityValidationResult
	) {
		super(message);
		this.name = "ParityValidationError";
		this.code = code;
		this.report = report;
	}
}

// ============================================
// Factory
// ============================================

/**
 * Create a new parity validation service.
 */
export function createParityValidationService(
	config: ParityValidationServiceConfig = {}
): ParityValidationService {
	return new ParityValidationService(config);
}
