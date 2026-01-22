/**
 * Agent Outputs Repository (Drizzle ORM)
 *
 * Data access for agent_outputs table.
 *
 * @see docs/plans/ui/04-data-requirements.md
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { agentOutputs } from "../schema/core-trading";

// ============================================
// Types
// ============================================

export type AgentVote = "APPROVE" | "REJECT" | "ABSTAIN";

export interface AgentOutput {
	id: string;
	decisionId: string;
	agentType: string;
	vote: AgentVote;
	confidence: number;
	reasoningSummary: string | null;
	fullReasoning: string | null;
	tokensUsed: number | null;
	latencyMs: number | null;
	createdAt: string;
}

export interface CreateAgentOutputInput {
	decisionId: string;
	agentType: string;
	vote: AgentVote;
	confidence: number;
	reasoningSummary?: string | null;
	fullReasoning?: string | null;
	tokensUsed?: number | null;
	latencyMs?: number | null;
}

// ============================================
// Row Mapping
// ============================================

type AgentOutputRow = typeof agentOutputs.$inferSelect;

function mapAgentOutputRow(row: AgentOutputRow): AgentOutput {
	return {
		id: row.id,
		decisionId: row.decisionId,
		agentType: row.agentType,
		vote: row.vote as AgentVote,
		confidence: Number(row.confidence),
		reasoningSummary: row.reasoningSummary,
		fullReasoning: row.fullReasoning,
		tokensUsed: row.tokensUsed,
		latencyMs: row.latencyMs,
		createdAt: row.createdAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class AgentOutputsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateAgentOutputInput): Promise<AgentOutput> {
		const [row] = await this.db
			.insert(agentOutputs)
			.values({
				decisionId: input.decisionId,
				agentType: input.agentType as typeof agentOutputs.$inferInsert.agentType,
				vote: input.vote as typeof agentOutputs.$inferInsert.vote,
				confidence: String(input.confidence),
				reasoningSummary: input.reasoningSummary ?? null,
				fullReasoning: input.fullReasoning ?? null,
				tokensUsed: input.tokensUsed ?? null,
				latencyMs: input.latencyMs ?? null,
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create agent output");
		}
		return mapAgentOutputRow(row);
	}

	async createMany(inputs: CreateAgentOutputInput[]): Promise<AgentOutput[]> {
		if (inputs.length === 0) {
			return [];
		}

		const values = inputs.map((input) => ({
			decisionId: input.decisionId,
			agentType: input.agentType as typeof agentOutputs.$inferInsert.agentType,
			vote: input.vote as typeof agentOutputs.$inferInsert.vote,
			confidence: String(input.confidence),
			reasoningSummary: input.reasoningSummary ?? null,
			fullReasoning: input.fullReasoning ?? null,
			tokensUsed: input.tokensUsed ?? null,
			latencyMs: input.latencyMs ?? null,
		}));

		const rows = await this.db.insert(agentOutputs).values(values).returning();

		return rows.map(mapAgentOutputRow);
	}

	async findById(id: string): Promise<AgentOutput | null> {
		const [row] = await this.db.select().from(agentOutputs).where(eq(agentOutputs.id, id)).limit(1);

		return row ? mapAgentOutputRow(row) : null;
	}

	async findByDecision(decisionId: string): Promise<AgentOutput[]> {
		const rows = await this.db
			.select()
			.from(agentOutputs)
			.where(eq(agentOutputs.decisionId, decisionId))
			.orderBy(agentOutputs.createdAt);

		return rows.map(mapAgentOutputRow);
	}

	async findByDecisionAndAgent(decisionId: string, agentType: string): Promise<AgentOutput | null> {
		const [row] = await this.db
			.select()
			.from(agentOutputs)
			.where(
				and(
					eq(agentOutputs.decisionId, decisionId),
					eq(agentOutputs.agentType, agentType as typeof agentOutputs.$inferInsert.agentType),
				),
			)
			.limit(1);

		return row ? mapAgentOutputRow(row) : null;
	}

	async findByAgentType(agentType: string, limit = 50): Promise<AgentOutput[]> {
		const rows = await this.db
			.select()
			.from(agentOutputs)
			.where(eq(agentOutputs.agentType, agentType as typeof agentOutputs.$inferInsert.agentType))
			.orderBy(desc(agentOutputs.createdAt))
			.limit(limit);

		return rows.map(mapAgentOutputRow);
	}

	async getVoteSummary(decisionId: string): Promise<{
		approvals: number;
		rejections: number;
		abstentions: number;
		avgConfidence: number;
		totalTokens: number;
		totalLatencyMs: number;
	}> {
		const [row] = await this.db
			.select({
				approvals: sql<number>`SUM(CASE WHEN ${agentOutputs.vote} = 'APPROVE' THEN 1 ELSE 0 END)::int`,
				rejections: sql<number>`SUM(CASE WHEN ${agentOutputs.vote} = 'REJECT' THEN 1 ELSE 0 END)::int`,
				abstentions: sql<number>`SUM(CASE WHEN ${agentOutputs.vote} = 'ABSTAIN' THEN 1 ELSE 0 END)::int`,
				avgConfidence: sql<string>`AVG(${agentOutputs.confidence}::numeric)`,
				totalTokens: sql<number>`COALESCE(SUM(${agentOutputs.tokensUsed}), 0)::int`,
				totalLatencyMs: sql<number>`COALESCE(SUM(${agentOutputs.latencyMs}), 0)::int`,
			})
			.from(agentOutputs)
			.where(eq(agentOutputs.decisionId, decisionId));

		return {
			approvals: row?.approvals ?? 0,
			rejections: row?.rejections ?? 0,
			abstentions: row?.abstentions ?? 0,
			avgConfidence: row?.avgConfidence ? Number(row.avgConfidence) : 0,
			totalTokens: row?.totalTokens ?? 0,
			totalLatencyMs: row?.totalLatencyMs ?? 0,
		};
	}

	async deleteByDecision(decisionId: string): Promise<number> {
		const result = await this.db
			.delete(agentOutputs)
			.where(eq(agentOutputs.decisionId, decisionId))
			.returning({ id: agentOutputs.id });

		return result.length;
	}
}
