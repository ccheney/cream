/**
 * Agent Outputs Repository Tests
 */

// Set required environment variables before imports
process.env.CREAM_ENV = "BACKTEST";
process.env.CREAM_BROKER = "ALPACA";

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createInMemoryClient, type TursoClient } from "../turso.js";
import { AgentOutputsRepository } from "./agent-outputs.js";

async function setupTables(client: TursoClient): Promise<void> {
  await client.run(`
    CREATE TABLE IF NOT EXISTS agent_outputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      decision_id TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      vote TEXT NOT NULL CHECK (vote IN ('APPROVE', 'REJECT', 'ABSTAIN')),
      confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
      reasoning_summary TEXT,
      full_reasoning TEXT,
      tokens_used INTEGER,
      latency_ms INTEGER,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

describe("AgentOutputsRepository", () => {
  let client: TursoClient;
  let repo: AgentOutputsRepository;

  beforeEach(async () => {
    client = await createInMemoryClient();
    await setupTables(client);
    repo = new AgentOutputsRepository(client);
  });

  afterEach(() => {
    client.close();
  });

  test("creates an agent output", async () => {
    const output = await repo.create({
      decisionId: "dec-001",
      agentType: "technical_analyst",
      vote: "APPROVE",
      confidence: 0.85,
      reasoningSummary: "Strong buy signal",
      tokensUsed: 500,
      latencyMs: 1200,
    });

    expect(output.id).toBeDefined();
    expect(output.decisionId).toBe("dec-001");
    expect(output.agentType).toBe("technical_analyst");
    expect(output.vote).toBe("APPROVE");
    expect(output.confidence).toBe(0.85);
    expect(output.reasoningSummary).toBe("Strong buy signal");
    expect(output.tokensUsed).toBe(500);
    expect(output.latencyMs).toBe(1200);
  });

  test("creates multiple agent outputs", async () => {
    const outputs = await repo.createMany([
      { decisionId: "dec-002", agentType: "risk_manager", vote: "APPROVE", confidence: 0.9 },
      { decisionId: "dec-002", agentType: "critic", vote: "REJECT", confidence: 0.6 },
    ]);

    expect(outputs).toHaveLength(2);
    expect(outputs[0]!.agentType).toBe("risk_manager");
    expect(outputs[1]!.agentType).toBe("critic");
  });

  test("finds agent output by ID", async () => {
    const created = await repo.create({
      decisionId: "dec-003",
      agentType: "news_analyst",
      vote: "ABSTAIN",
      confidence: 0.5,
    });

    const found = await repo.findById(created.id);
    expect(found).not.toBeNull();
    expect(found!.agentType).toBe("news_analyst");
    expect(found!.vote).toBe("ABSTAIN");
  });

  test("returns null for non-existent ID", async () => {
    const found = await repo.findById(999);
    expect(found).toBeNull();
  });

  test("finds outputs by decision ID", async () => {
    await repo.create({
      decisionId: "dec-004",
      agentType: "tech",
      vote: "APPROVE",
      confidence: 0.8,
    });
    await repo.create({
      decisionId: "dec-004",
      agentType: "risk",
      vote: "APPROVE",
      confidence: 0.9,
    });
    await repo.create({
      decisionId: "dec-005",
      agentType: "tech",
      vote: "REJECT",
      confidence: 0.7,
    });

    const outputs = await repo.findByDecision("dec-004");
    expect(outputs).toHaveLength(2);
  });

  test("finds output by decision and agent type", async () => {
    await repo.create({
      decisionId: "dec-006",
      agentType: "analyst",
      vote: "APPROVE",
      confidence: 0.8,
    });
    await repo.create({
      decisionId: "dec-006",
      agentType: "critic",
      vote: "REJECT",
      confidence: 0.6,
    });

    const found = await repo.findByDecisionAndAgent("dec-006", "critic");
    expect(found).not.toBeNull();
    expect(found!.vote).toBe("REJECT");
  });

  test("returns null for non-existent decision/agent combo", async () => {
    const found = await repo.findByDecisionAndAgent("nonexistent", "analyst");
    expect(found).toBeNull();
  });

  test("finds outputs by agent type", async () => {
    await repo.create({
      decisionId: "dec-a",
      agentType: "tech_analyst",
      vote: "APPROVE",
      confidence: 0.8,
    });
    await repo.create({
      decisionId: "dec-b",
      agentType: "tech_analyst",
      vote: "REJECT",
      confidence: 0.7,
    });
    await repo.create({
      decisionId: "dec-c",
      agentType: "risk_manager",
      vote: "APPROVE",
      confidence: 0.9,
    });

    const outputs = await repo.findByAgentType("tech_analyst");
    expect(outputs).toHaveLength(2);
  });

  test("respects limit when finding by agent type", async () => {
    for (let i = 0; i < 10; i++) {
      await repo.create({
        decisionId: `dec-${i}`,
        agentType: "limited",
        vote: "APPROVE",
        confidence: 0.5,
      });
    }

    const outputs = await repo.findByAgentType("limited", 5);
    expect(outputs).toHaveLength(5);
  });

  test("gets vote summary for a decision", async () => {
    await repo.create({
      decisionId: "dec-sum",
      agentType: "a1",
      vote: "APPROVE",
      confidence: 0.9,
      tokensUsed: 100,
      latencyMs: 500,
    });
    await repo.create({
      decisionId: "dec-sum",
      agentType: "a2",
      vote: "APPROVE",
      confidence: 0.8,
      tokensUsed: 150,
      latencyMs: 600,
    });
    await repo.create({
      decisionId: "dec-sum",
      agentType: "a3",
      vote: "REJECT",
      confidence: 0.7,
      tokensUsed: 200,
      latencyMs: 700,
    });
    await repo.create({
      decisionId: "dec-sum",
      agentType: "a4",
      vote: "ABSTAIN",
      confidence: 0.5,
      tokensUsed: 50,
      latencyMs: 300,
    });

    const summary = await repo.getVoteSummary("dec-sum");

    expect(summary.approvals).toBe(2);
    expect(summary.rejections).toBe(1);
    expect(summary.abstentions).toBe(1);
    expect(summary.avgConfidence).toBeCloseTo(0.725, 2);
    expect(summary.totalTokens).toBe(500);
    expect(summary.totalLatencyMs).toBe(2100);
  });

  test("returns zero summary for non-existent decision", async () => {
    const summary = await repo.getVoteSummary("nonexistent");

    expect(summary.approvals).toBe(0);
    expect(summary.rejections).toBe(0);
    expect(summary.abstentions).toBe(0);
    expect(summary.avgConfidence).toBe(0);
  });

  test("deletes outputs by decision ID", async () => {
    await repo.create({ decisionId: "dec-del", agentType: "a1", vote: "APPROVE", confidence: 0.8 });
    await repo.create({ decisionId: "dec-del", agentType: "a2", vote: "REJECT", confidence: 0.6 });
    await repo.create({
      decisionId: "dec-keep",
      agentType: "a1",
      vote: "APPROVE",
      confidence: 0.9,
    });

    const deleted = await repo.deleteByDecision("dec-del");
    expect(deleted).toBe(2);

    const remaining = await repo.findByDecision("dec-del");
    expect(remaining).toHaveLength(0);

    const kept = await repo.findByDecision("dec-keep");
    expect(kept).toHaveLength(1);
  });

  test("handles metadata correctly", async () => {
    const output = await repo.create({
      decisionId: "dec-meta",
      agentType: "test",
      vote: "APPROVE",
      confidence: 0.9,
      metadata: { model: "gemini-2.0-flash", temperature: 0.7 },
    });

    expect(output.metadata).toEqual({ model: "gemini-2.0-flash", temperature: 0.7 });
  });

  test("handles null optional fields", async () => {
    const output = await repo.create({
      decisionId: "dec-null",
      agentType: "minimal",
      vote: "APPROVE",
      confidence: 0.5,
    });

    expect(output.reasoningSummary).toBeNull();
    expect(output.fullReasoning).toBeNull();
    expect(output.tokensUsed).toBeNull();
    expect(output.latencyMs).toBeNull();
  });
});
