/**
 * Parity Validation Repository
 *
 * Storage for parity validation history records.
 *
 * @see packages/validation/src/service.ts
 */

import type { Row, TursoClient } from "../turso.js";
import { parseJson, RepositoryError, toJson } from "./base.js";

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
 * Recommendation from parity validation.
 */
export type ParityRecommendation = "APPROVE_FOR_LIVE" | "NEEDS_INVESTIGATION" | "NOT_READY";

/**
 * Stored parity validation record.
 */
export interface ParityValidationRecord {
	id: string;
	entityType: ParityEntityType;
	entityId: string;
	environment: ParityEnvironment;
	passed: boolean;
	recommendation: ParityRecommendation;
	blockingIssues: string[];
	warnings: string[];
	fullReport: Record<string, unknown>;
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
	passed: boolean;
	recommendation: ParityRecommendation;
	blockingIssues: string[];
	warnings: string[];
	fullReport: Record<string, unknown>;
	validatedAt: string;
}

// ============================================
// Row Mapper
// ============================================

function mapRow(row: Row): ParityValidationRecord {
	return {
		id: row.id as string,
		entityType: row.entity_type as ParityEntityType,
		entityId: row.entity_id as string,
		environment: row.environment as ParityEnvironment,
		passed: (row.passed as number) === 1,
		recommendation: row.recommendation as ParityRecommendation,
		blockingIssues: parseJson(row.blocking_issues, []),
		warnings: parseJson(row.warnings, []),
		fullReport: parseJson(row.full_report, {}),
		validatedAt: row.validated_at as string,
		createdAt: row.created_at as string,
	};
}

// ============================================
// Repository
// ============================================

/**
 * Repository for parity validation history.
 */
export class ParityValidationRepository {
	constructor(private client: TursoClient) {}

	/**
	 * Create a new validation record.
	 */
	async create(input: CreateParityValidationInput): Promise<ParityValidationRecord> {
		const id = crypto.randomUUID();
		const now = new Date().toISOString();

		try {
			await this.client.run(
				`INSERT INTO parity_validation_history (
          id, entity_type, entity_id, environment, passed, recommendation,
          blocking_issues, warnings, full_report, validated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					id,
					input.entityType,
					input.entityId,
					input.environment,
					input.passed ? 1 : 0,
					input.recommendation,
					toJson(input.blockingIssues),
					toJson(input.warnings),
					toJson(input.fullReport),
					input.validatedAt,
					now,
				]
			);

			const record = await this.findById(id);
			if (!record) {
				throw new Error("Failed to create parity validation record");
			}
			return record;
		} catch (error) {
			throw RepositoryError.fromSqliteError("parity_validation_history", error as Error);
		}
	}

	/**
	 * Find a validation record by ID.
	 */
	async findById(id: string): Promise<ParityValidationRecord | null> {
		try {
			const row = await this.client.get<Row>(
				"SELECT * FROM parity_validation_history WHERE id = ?",
				[id]
			);
			return row ? mapRow(row) : null;
		} catch (error) {
			throw RepositoryError.fromSqliteError("parity_validation_history", error as Error);
		}
	}

	/**
	 * Find the most recent validation for an entity.
	 */
	async findLatestByEntity(
		entityType: ParityEntityType,
		entityId: string
	): Promise<ParityValidationRecord | null> {
		try {
			const row = await this.client.get<Row>(
				`SELECT * FROM parity_validation_history
         WHERE entity_type = ? AND entity_id = ?
         ORDER BY validated_at DESC LIMIT 1`,
				[entityType, entityId]
			);
			return row ? mapRow(row) : null;
		} catch (error) {
			throw RepositoryError.fromSqliteError("parity_validation_history", error as Error);
		}
	}

	/**
	 * Find all validations for an entity.
	 */
	async findByEntity(
		entityType: ParityEntityType,
		entityId: string
	): Promise<ParityValidationRecord[]> {
		try {
			const rows = await this.client.execute<Row>(
				`SELECT * FROM parity_validation_history
         WHERE entity_type = ? AND entity_id = ?
         ORDER BY validated_at DESC`,
				[entityType, entityId]
			);
			return rows.map(mapRow);
		} catch (error) {
			throw RepositoryError.fromSqliteError("parity_validation_history", error as Error);
		}
	}

	/**
	 * Find all validations for an environment.
	 */
	async findByEnvironment(environment: ParityEnvironment): Promise<ParityValidationRecord[]> {
		try {
			const rows = await this.client.execute<Row>(
				`SELECT * FROM parity_validation_history
         WHERE environment = ?
         ORDER BY validated_at DESC`,
				[environment]
			);
			return rows.map(mapRow);
		} catch (error) {
			throw RepositoryError.fromSqliteError("parity_validation_history", error as Error);
		}
	}

	/**
	 * Find failing validations.
	 */
	async findFailing(): Promise<ParityValidationRecord[]> {
		try {
			const rows = await this.client.execute<Row>(
				`SELECT * FROM parity_validation_history
         WHERE passed = 0
         ORDER BY validated_at DESC`
			);
			return rows.map(mapRow);
		} catch (error) {
			throw RepositoryError.fromSqliteError("parity_validation_history", error as Error);
		}
	}

	/**
	 * Check if an entity has a passing validation.
	 */
	async hasPassingValidation(entityType: ParityEntityType, entityId: string): Promise<boolean> {
		const latest = await this.findLatestByEntity(entityType, entityId);
		return latest?.passed ?? false;
	}

	/**
	 * Delete old validation records (keep last N per entity).
	 */
	async pruneHistory(keepLast = 10): Promise<number> {
		try {
			const result = await this.client.run(
				`DELETE FROM parity_validation_history
         WHERE id NOT IN (
           SELECT id FROM (
             SELECT id, entity_type, entity_id,
               ROW_NUMBER() OVER (PARTITION BY entity_type, entity_id ORDER BY validated_at DESC) as rn
             FROM parity_validation_history
           ) WHERE rn <= ?
         )`,
				[keepLast]
			);
			return result.changes;
		} catch (error) {
			throw RepositoryError.fromSqliteError("parity_validation_history", error as Error);
		}
	}
}
