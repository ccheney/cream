/**
 * Agent Configs Repository (Drizzle ORM)
 *
 * Data access for agent_configs table. Manages per-agent prompt
 * configuration and enabled/disabled status.
 *
 * NOTE: Model selection is global via trading_config.global_model.
 */
import { and, asc, eq } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { agentConfigs } from "../schema/config";
import { RepositoryError } from "./base";

// ============================================
// Types
// ============================================

export type AgentType =
	| "news_analyst"
	| "fundamentals_analyst"
	| "bullish_researcher"
	| "bearish_researcher"
	| "trader"
	| "risk_manager"
	| "critic";

export const AGENT_TYPES: AgentType[] = [
	"news_analyst",
	"fundamentals_analyst",
	"bullish_researcher",
	"bearish_researcher",
	"trader",
	"risk_manager",
	"critic",
];

export type AgentEnvironment = "PAPER" | "LIVE";

export interface AgentConfig {
	id: string;
	environment: AgentEnvironment;
	agentType: AgentType;
	systemPromptOverride: string | null;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface CreateAgentConfigInput {
	id?: string;
	environment: AgentEnvironment;
	agentType: AgentType;
	systemPromptOverride?: string | null;
	enabled?: boolean;
}

export interface UpdateAgentConfigInput {
	systemPromptOverride?: string | null;
	enabled?: boolean;
}

// ============================================
// Row Mapping
// ============================================

type AgentConfigRow = typeof agentConfigs.$inferSelect;

function mapAgentConfigRow(row: AgentConfigRow): AgentConfig {
	return {
		id: row.id,
		environment: row.environment as AgentEnvironment,
		agentType: row.agentType as AgentType,
		systemPromptOverride: row.systemPromptOverride,
		enabled: row.enabled,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class AgentConfigsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateAgentConfigInput): Promise<AgentConfig> {
		const [row] = await this.db
			.insert(agentConfigs)
			.values({
				environment: input.environment,
				agentType: input.agentType,
				systemPromptOverride: input.systemPromptOverride ?? null,
				enabled: input.enabled !== false,
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create agent config");
		}
		return mapAgentConfigRow(row);
	}

	async findById(id: string): Promise<AgentConfig | null> {
		const [row] = await this.db.select().from(agentConfigs).where(eq(agentConfigs.id, id)).limit(1);

		return row ? mapAgentConfigRow(row) : null;
	}

	async findByIdOrThrow(id: string): Promise<AgentConfig> {
		const config = await this.findById(id);
		if (!config) {
			throw RepositoryError.notFound("agent_configs", id);
		}
		return config;
	}

	async get(environment: AgentEnvironment, agentType: AgentType): Promise<AgentConfig | null> {
		const [row] = await this.db
			.select()
			.from(agentConfigs)
			.where(and(eq(agentConfigs.environment, environment), eq(agentConfigs.agentType, agentType)))
			.limit(1);

		return row ? mapAgentConfigRow(row) : null;
	}

	async getOrThrow(environment: AgentEnvironment, agentType: AgentType): Promise<AgentConfig> {
		const config = await this.get(environment, agentType);
		if (!config) {
			throw new RepositoryError(
				`No config found for agent '${agentType}' in environment '${environment}'. Run seed script.`,
				"NOT_FOUND",
				"agent_configs"
			);
		}
		return config;
	}

	async getAll(environment: AgentEnvironment): Promise<AgentConfig[]> {
		const rows = await this.db
			.select()
			.from(agentConfigs)
			.where(eq(agentConfigs.environment, environment))
			.orderBy(asc(agentConfigs.agentType));

		return rows.map(mapAgentConfigRow);
	}

	async getEnabled(environment: AgentEnvironment): Promise<AgentConfig[]> {
		const rows = await this.db
			.select()
			.from(agentConfigs)
			.where(and(eq(agentConfigs.environment, environment), eq(agentConfigs.enabled, true)))
			.orderBy(asc(agentConfigs.agentType));

		return rows.map(mapAgentConfigRow);
	}

	async update(id: string, input: UpdateAgentConfigInput): Promise<AgentConfig> {
		await this.findByIdOrThrow(id);

		const updateData: Partial<typeof agentConfigs.$inferInsert> = {
			updatedAt: new Date(),
		};

		if (input.systemPromptOverride !== undefined) {
			updateData.systemPromptOverride = input.systemPromptOverride;
		}
		if (input.enabled !== undefined) {
			updateData.enabled = input.enabled;
		}

		await this.db.update(agentConfigs).set(updateData).where(eq(agentConfigs.id, id));

		return this.findByIdOrThrow(id);
	}

	async upsert(
		environment: AgentEnvironment,
		agentType: AgentType,
		input: UpdateAgentConfigInput
	): Promise<AgentConfig> {
		const existing = await this.get(environment, agentType);

		if (existing) {
			return this.update(existing.id, input);
		}
		return this.create({
			environment,
			agentType,
			...input,
		});
	}

	async setEnabled(id: string, enabled: boolean): Promise<AgentConfig> {
		return this.update(id, { enabled });
	}

	async resetToDefaults(environment: AgentEnvironment, agentType: AgentType): Promise<AgentConfig> {
		const existing = await this.get(environment, agentType);

		if (!existing) {
			return this.create({
				environment,
				agentType,
			});
		}

		return this.update(existing.id, {
			systemPromptOverride: null,
			enabled: true,
		});
	}

	async delete(id: string): Promise<boolean> {
		const result = await this.db
			.delete(agentConfigs)
			.where(eq(agentConfigs.id, id))
			.returning({ id: agentConfigs.id });

		return result.length > 0;
	}

	async deleteAll(environment: AgentEnvironment): Promise<number> {
		const result = await this.db
			.delete(agentConfigs)
			.where(eq(agentConfigs.environment, environment))
			.returning({ id: agentConfigs.id });

		return result.length;
	}

	async cloneToEnvironment(
		sourceEnvironment: AgentEnvironment,
		targetEnvironment: AgentEnvironment
	): Promise<AgentConfig[]> {
		const sourceConfigs = await this.getAll(sourceEnvironment);
		const results: AgentConfig[] = [];

		for (const source of sourceConfigs) {
			const newConfig = await this.upsert(targetEnvironment, source.agentType, {
				systemPromptOverride: source.systemPromptOverride,
				enabled: source.enabled,
			});
			results.push(newConfig);
		}

		return results;
	}
}
