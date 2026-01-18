/**
 * Parity Validation Repository (Drizzle ORM)
 *
 * Storage for parity validation history records.
 *
 * @see packages/validation/src/service.ts
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { parityValidationHistory } from "../schema/audit";

// ============================================
// Types
// ============================================

export type ParityEntityType = "indicator" | "factor" | "config";

export type ParityEnvironment = "PAPER" | "LIVE";

export type ParityRecommendation = "APPROVE_FOR_LIVE" | "NEEDS_INVESTIGATION" | "NOT_READY";

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
// Row Mapping
// ============================================

type ParityValidationRow = typeof parityValidationHistory.$inferSelect;

function mapRow(row: ParityValidationRow): ParityValidationRecord {
	return {
		id: row.id,
		entityType: row.entityType as ParityEntityType,
		entityId: row.entityId,
		environment: row.environment as ParityEnvironment,
		passed: row.passed,
		recommendation: row.recommendation as ParityRecommendation,
		blockingIssues: (row.blockingIssues as string[]) ?? [],
		warnings: (row.warnings as string[]) ?? [],
		fullReport: (row.fullReport as Record<string, unknown>) ?? {},
		validatedAt: row.validatedAt.toISOString(),
		createdAt: row.createdAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class ParityValidationRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateParityValidationInput): Promise<ParityValidationRecord> {
		const [row] = await this.db
			.insert(parityValidationHistory)
			.values({
				entityType: input.entityType as typeof parityValidationHistory.$inferInsert.entityType,
				entityId: input.entityId,
				environment: input.environment as typeof parityValidationHistory.$inferInsert.environment,
				passed: input.passed,
				recommendation:
					input.recommendation as typeof parityValidationHistory.$inferInsert.recommendation,
				blockingIssues: input.blockingIssues,
				warnings: input.warnings,
				fullReport: input.fullReport,
				validatedAt: new Date(input.validatedAt),
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create parity validation record");
		}
		return mapRow(row);
	}

	async findById(id: string): Promise<ParityValidationRecord | null> {
		const [row] = await this.db
			.select()
			.from(parityValidationHistory)
			.where(eq(parityValidationHistory.id, id))
			.limit(1);

		return row ? mapRow(row) : null;
	}

	async findLatestByEntity(
		entityType: ParityEntityType,
		entityId: string
	): Promise<ParityValidationRecord | null> {
		const [row] = await this.db
			.select()
			.from(parityValidationHistory)
			.where(
				and(
					eq(
						parityValidationHistory.entityType,
						entityType as typeof parityValidationHistory.$inferSelect.entityType
					),
					eq(parityValidationHistory.entityId, entityId)
				)
			)
			.orderBy(desc(parityValidationHistory.validatedAt))
			.limit(1);

		return row ? mapRow(row) : null;
	}

	async findByEntity(
		entityType: ParityEntityType,
		entityId: string
	): Promise<ParityValidationRecord[]> {
		const rows = await this.db
			.select()
			.from(parityValidationHistory)
			.where(
				and(
					eq(
						parityValidationHistory.entityType,
						entityType as typeof parityValidationHistory.$inferSelect.entityType
					),
					eq(parityValidationHistory.entityId, entityId)
				)
			)
			.orderBy(desc(parityValidationHistory.validatedAt));

		return rows.map(mapRow);
	}

	async findByEnvironment(environment: ParityEnvironment): Promise<ParityValidationRecord[]> {
		const rows = await this.db
			.select()
			.from(parityValidationHistory)
			.where(
				eq(
					parityValidationHistory.environment,
					environment as typeof parityValidationHistory.$inferSelect.environment
				)
			)
			.orderBy(desc(parityValidationHistory.validatedAt));

		return rows.map(mapRow);
	}

	async findFailing(): Promise<ParityValidationRecord[]> {
		const rows = await this.db
			.select()
			.from(parityValidationHistory)
			.where(eq(parityValidationHistory.passed, false))
			.orderBy(desc(parityValidationHistory.validatedAt));

		return rows.map(mapRow);
	}

	async hasPassingValidation(entityType: ParityEntityType, entityId: string): Promise<boolean> {
		const latest = await this.findLatestByEntity(entityType, entityId);
		return latest?.passed ?? false;
	}

	async pruneHistory(keepLast = 10): Promise<number> {
		const result = await this.db
			.delete(parityValidationHistory)
			.where(
				sql`${parityValidationHistory.id} NOT IN (
					SELECT id FROM (
						SELECT id, entity_type, entity_id,
							ROW_NUMBER() OVER (PARTITION BY entity_type, entity_id ORDER BY validated_at DESC) as rn
						FROM ${parityValidationHistory}
					) sub WHERE rn <= ${keepLast}
				)`
			)
			.returning({ id: parityValidationHistory.id });

		return result.length;
	}
}
