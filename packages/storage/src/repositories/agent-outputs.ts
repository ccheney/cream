/**
 * Agent Outputs Repository
 *
 * Data access for agent_outputs table.
 *
 * @see docs/plans/ui/04-data-requirements.md
 */

import type { TursoClient, Row } from "../turso.js";
import {
  RepositoryError,
  parseJson,
  toJson,
} from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Agent vote
 */
export type AgentVote = "APPROVE" | "REJECT" | "ABSTAIN";

/**
 * Agent output entity
 */
export interface AgentOutput {
  id: number;
  decisionId: string;
  agentType: string;
  vote: AgentVote;
  confidence: number;
  reasoningSummary: string | null;
  fullReasoning: string | null;
  tokensUsed: number | null;
  latencyMs: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * Create agent output input
 */
export interface CreateAgentOutputInput {
  decisionId: string;
  agentType: string;
  vote: AgentVote;
  confidence: number;
  reasoningSummary?: string | null;
  fullReasoning?: string | null;
  tokensUsed?: number | null;
  latencyMs?: number | null;
  metadata?: Record<string, unknown>;
}

// ============================================
// Row Mapper
// ============================================

function mapAgentOutputRow(row: Row): AgentOutput {
  return {
    id: row.id as number,
    decisionId: row.decision_id as string,
    agentType: row.agent_type as string,
    vote: row.vote as AgentVote,
    confidence: row.confidence as number,
    reasoningSummary: row.reasoning_summary as string | null,
    fullReasoning: row.full_reasoning as string | null,
    tokensUsed: row.tokens_used as number | null,
    latencyMs: row.latency_ms as number | null,
    metadata: parseJson<Record<string, unknown>>(row.metadata, {}),
    createdAt: row.created_at as string,
  };
}

// ============================================
// Repository
// ============================================

/**
 * Agent outputs repository
 */
export class AgentOutputsRepository {
  private readonly table = "agent_outputs";

  constructor(private readonly client: TursoClient) {}

  /**
   * Create a new agent output
   */
  async create(input: CreateAgentOutputInput): Promise<AgentOutput> {
    try {
      const result = await this.client.run(
        `INSERT INTO ${this.table} (
          decision_id, agent_type, vote, confidence,
          reasoning_summary, full_reasoning, tokens_used, latency_ms, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.decisionId,
          input.agentType,
          input.vote,
          input.confidence,
          input.reasoningSummary ?? null,
          input.fullReasoning ?? null,
          input.tokensUsed ?? null,
          input.latencyMs ?? null,
          toJson(input.metadata ?? {}),
        ]
      );

      return this.findById(Number(result.lastInsertRowid)) as Promise<AgentOutput>;
    } catch (error) {
      throw RepositoryError.fromSqliteError(this.table, error as Error);
    }
  }

  /**
   * Create multiple agent outputs for a decision
   */
  async createMany(inputs: CreateAgentOutputInput[]): Promise<AgentOutput[]> {
    const outputs: AgentOutput[] = [];

    for (const input of inputs) {
      const output = await this.create(input);
      outputs.push(output);
    }

    return outputs;
  }

  /**
   * Find agent output by ID
   */
  async findById(id: number): Promise<AgentOutput | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM ${this.table} WHERE id = ?`,
      [id]
    );

    return row ? mapAgentOutputRow(row) : null;
  }

  /**
   * Find agent outputs by decision ID
   */
  async findByDecision(decisionId: string): Promise<AgentOutput[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table} WHERE decision_id = ? ORDER BY created_at ASC`,
      [decisionId]
    );

    return rows.map(mapAgentOutputRow);
  }

  /**
   * Find agent output by decision and agent type
   */
  async findByDecisionAndAgent(
    decisionId: string,
    agentType: string
  ): Promise<AgentOutput | null> {
    const row = await this.client.get<Row>(
      `SELECT * FROM ${this.table} WHERE decision_id = ? AND agent_type = ?`,
      [decisionId, agentType]
    );

    return row ? mapAgentOutputRow(row) : null;
  }

  /**
   * Find agent outputs by agent type
   */
  async findByAgentType(agentType: string, limit = 50): Promise<AgentOutput[]> {
    const rows = await this.client.execute<Row>(
      `SELECT * FROM ${this.table} WHERE agent_type = ? ORDER BY created_at DESC LIMIT ?`,
      [agentType, limit]
    );

    return rows.map(mapAgentOutputRow);
  }

  /**
   * Get vote summary for a decision
   */
  async getVoteSummary(decisionId: string): Promise<{
    approvals: number;
    rejections: number;
    abstentions: number;
    avgConfidence: number;
    totalTokens: number;
    totalLatencyMs: number;
  }> {
    const row = await this.client.get<Row>(
      `SELECT
        SUM(CASE WHEN vote = 'APPROVE' THEN 1 ELSE 0 END) as approvals,
        SUM(CASE WHEN vote = 'REJECT' THEN 1 ELSE 0 END) as rejections,
        SUM(CASE WHEN vote = 'ABSTAIN' THEN 1 ELSE 0 END) as abstentions,
        AVG(confidence) as avg_confidence,
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COALESCE(SUM(latency_ms), 0) as total_latency_ms
       FROM ${this.table} WHERE decision_id = ?`,
      [decisionId]
    );

    return {
      approvals: (row?.approvals as number) ?? 0,
      rejections: (row?.rejections as number) ?? 0,
      abstentions: (row?.abstentions as number) ?? 0,
      avgConfidence: (row?.avg_confidence as number) ?? 0,
      totalTokens: (row?.total_tokens as number) ?? 0,
      totalLatencyMs: (row?.total_latency_ms as number) ?? 0,
    };
  }

  /**
   * Delete outputs for a decision
   */
  async deleteByDecision(decisionId: string): Promise<number> {
    const result = await this.client.run(
      `DELETE FROM ${this.table} WHERE decision_id = ?`,
      [decisionId]
    );

    return result.changes;
  }
}
