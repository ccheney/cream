/**
 * Scanner Configs Repository (Drizzle ORM)
 *
 * Data access for scanner_configs table with draft/testing/active workflow.
 */
import { and, desc, eq } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { scannerConfigs } from "../schema/scanner-config";
import { RepositoryError } from "./base";

// ============================================
// Types
// ============================================

export type ScannerConfigStatus = "draft" | "testing" | "active" | "archived";
export type ScannerEnvironment = "PAPER" | "LIVE";

export interface ScannerConfig {
	id: string;
	environment: ScannerEnvironment;
	minPrice: number;
	minAvgVolume: number;
	volumeSpikeThreshold: number;
	priceMoveThreshold: number;
	gapThreshold: number;
	maxCandidates: number;
	cooldownSeconds: number;
	enabled: boolean;
	status: ScannerConfigStatus;
	createdAt: string;
	updatedAt: string;
}

export interface CreateScannerConfigInput {
	id?: string;
	environment: ScannerEnvironment;
	minPrice?: number;
	minAvgVolume?: number;
	volumeSpikeThreshold?: number;
	priceMoveThreshold?: number;
	gapThreshold?: number;
	maxCandidates?: number;
	cooldownSeconds?: number;
	enabled?: boolean;
	status?: ScannerConfigStatus;
}

export interface UpdateScannerConfigInput {
	minPrice?: number;
	minAvgVolume?: number;
	volumeSpikeThreshold?: number;
	priceMoveThreshold?: number;
	gapThreshold?: number;
	maxCandidates?: number;
	cooldownSeconds?: number;
	enabled?: boolean;
}

// ============================================
// Row Mapping
// ============================================

type ScannerConfigRow = typeof scannerConfigs.$inferSelect;
type ScannerConfigInsert = typeof scannerConfigs.$inferInsert;

const SCANNER_MUTABLE_FIELDS = [
	"minPrice",
	"minAvgVolume",
	"volumeSpikeThreshold",
	"priceMoveThreshold",
	"gapThreshold",
	"maxCandidates",
	"cooldownSeconds",
	"enabled",
] as const;

const SCANNER_DEFAULT_VALUES: Pick<CreateScannerConfigInput, (typeof SCANNER_MUTABLE_FIELDS)[number]> = {
	minPrice: 5,
	minAvgVolume: 100_000,
	volumeSpikeThreshold: 3,
	priceMoveThreshold: 2,
	gapThreshold: 2,
	maxCandidates: 10,
	cooldownSeconds: 300,
	enabled: true,
};

type ScannerMutableField = (typeof SCANNER_MUTABLE_FIELDS)[number];

type ScannerMutableFieldValues = Pick<ScannerConfig, ScannerMutableField>;

function getMutableFieldValues(config: ScannerConfig): ScannerMutableFieldValues {
	return {
		minPrice: config.minPrice,
		minAvgVolume: config.minAvgVolume,
		volumeSpikeThreshold: config.volumeSpikeThreshold,
		priceMoveThreshold: config.priceMoveThreshold,
		gapThreshold: config.gapThreshold,
		maxCandidates: config.maxCandidates,
		cooldownSeconds: config.cooldownSeconds,
		enabled: config.enabled,
	};
}

function mapScannerConfigRow(row: ScannerConfigRow): ScannerConfig {
	return {
		id: row.id,
		environment: row.environment as ScannerEnvironment,
		minPrice: Number(row.minPrice),
		minAvgVolume: row.minAvgVolume,
		volumeSpikeThreshold: Number(row.volumeSpikeThreshold),
		priceMoveThreshold: Number(row.priceMoveThreshold),
		gapThreshold: Number(row.gapThreshold),
		maxCandidates: row.maxCandidates,
		cooldownSeconds: row.cooldownSeconds,
		enabled: row.enabled,
		status: row.status as ScannerConfigStatus,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function buildScannerDraftUpdateData(
	input: UpdateScannerConfigInput,
): Partial<ScannerConfigInsert> {
	const data: Partial<ScannerConfigInsert> = {
		updatedAt: new Date(),
	};

	if (input.minPrice !== undefined) {
		data.minPrice = String(input.minPrice);
	}
	if (input.minAvgVolume !== undefined) {
		data.minAvgVolume = input.minAvgVolume;
	}
	if (input.volumeSpikeThreshold !== undefined) {
		data.volumeSpikeThreshold = String(input.volumeSpikeThreshold);
	}
	if (input.priceMoveThreshold !== undefined) {
		data.priceMoveThreshold = String(input.priceMoveThreshold);
	}
	if (input.gapThreshold !== undefined) {
		data.gapThreshold = String(input.gapThreshold);
	}
	if (input.maxCandidates !== undefined) {
		data.maxCandidates = input.maxCandidates;
	}
	if (input.cooldownSeconds !== undefined) {
		data.cooldownSeconds = input.cooldownSeconds;
	}
	if (input.enabled !== undefined) {
		data.enabled = input.enabled;
	}

	return data;
}

function buildScannerDraftCreateInput(
	environment: ScannerEnvironment,
	input: UpdateScannerConfigInput,
	activeConfig: ScannerConfig | null,
): CreateScannerConfigInput {
	const baseValues = activeConfig ? getMutableFieldValues(activeConfig) : SCANNER_DEFAULT_VALUES;
	return {
		environment,
		status: "draft",
		...baseValues,
		...(input.minPrice !== undefined ? { minPrice: input.minPrice } : {}),
		...(input.minAvgVolume !== undefined ? { minAvgVolume: input.minAvgVolume } : {}),
		...(input.volumeSpikeThreshold !== undefined
			? { volumeSpikeThreshold: input.volumeSpikeThreshold }
			: {}),
		...(input.priceMoveThreshold !== undefined
			? { priceMoveThreshold: input.priceMoveThreshold }
			: {}),
		...(input.gapThreshold !== undefined ? { gapThreshold: input.gapThreshold } : {}),
		...(input.maxCandidates !== undefined ? { maxCandidates: input.maxCandidates } : {}),
		...(input.cooldownSeconds !== undefined ? { cooldownSeconds: input.cooldownSeconds } : {}),
		...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
	};
}

// ============================================
// Repository
// ============================================

export class ScannerConfigsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateScannerConfigInput): Promise<ScannerConfig> {
		const [row] = await this.db
			.insert(scannerConfigs)
			.values({
				environment: input.environment,
				minPrice: String(input.minPrice ?? 5),
				minAvgVolume: input.minAvgVolume ?? 100_000,
				volumeSpikeThreshold: String(input.volumeSpikeThreshold ?? 3),
				priceMoveThreshold: String(input.priceMoveThreshold ?? 2),
				gapThreshold: String(input.gapThreshold ?? 2),
				maxCandidates: input.maxCandidates ?? 10,
				cooldownSeconds: input.cooldownSeconds ?? 300,
				enabled: input.enabled ?? true,
				status: input.status ?? "draft",
			})
			.returning();

		if (!row) {
			throw new RepositoryError(
				"Failed to create scanner config",
				"CONSTRAINT_VIOLATION",
				"scanner_configs",
			);
		}
		return mapScannerConfigRow(row);
	}

	async findById(id: string): Promise<ScannerConfig | null> {
		const [row] = await this.db
			.select()
			.from(scannerConfigs)
			.where(eq(scannerConfigs.id, id))
			.limit(1);

		return row ? mapScannerConfigRow(row) : null;
	}

	async findByIdOrThrow(id: string): Promise<ScannerConfig> {
		const config = await this.findById(id);
		if (!config) {
			throw RepositoryError.notFound("scanner_configs", id);
		}
		return config;
	}

	async getActive(environment: ScannerEnvironment): Promise<ScannerConfig | null> {
		const [row] = await this.db
			.select()
			.from(scannerConfigs)
			.where(and(eq(scannerConfigs.environment, environment), eq(scannerConfigs.status, "active")))
			.limit(1);

		return row ? mapScannerConfigRow(row) : null;
	}

	async getDraft(environment: ScannerEnvironment): Promise<ScannerConfig | null> {
		const [row] = await this.db
			.select()
			.from(scannerConfigs)
			.where(and(eq(scannerConfigs.environment, environment), eq(scannerConfigs.status, "draft")))
			.orderBy(desc(scannerConfigs.createdAt))
			.limit(1);

		return row ? mapScannerConfigRow(row) : null;
	}

	async saveDraft(
		environment: ScannerEnvironment,
		input: UpdateScannerConfigInput,
	): Promise<ScannerConfig> {
		const existingDraft = await this.getDraft(environment);

		if (existingDraft) {
			await this.db
				.update(scannerConfigs)
				.set(buildScannerDraftUpdateData(input))
				.where(eq(scannerConfigs.id, existingDraft.id));

			return this.findByIdOrThrow(existingDraft.id);
		}

		const activeConfig = await this.getActive(environment);
		return this.create(buildScannerDraftCreateInput(environment, input, activeConfig));
	}

	async setStatus(id: string, status: ScannerConfigStatus): Promise<ScannerConfig> {
		const config = await this.findByIdOrThrow(id);

		if (status === "active") {
			await this.db
				.update(scannerConfigs)
				.set({ status: "archived", updatedAt: new Date() })
				.where(
					and(
						eq(scannerConfigs.environment, config.environment),
						eq(scannerConfigs.status, "active"),
					),
				);
		}

		await this.db
			.update(scannerConfigs)
			.set({ status, updatedAt: new Date() })
			.where(eq(scannerConfigs.id, id));

		return this.findByIdOrThrow(id);
	}
}
