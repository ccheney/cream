/**
 * Mock HelixDB Adapter
 *
 * In-memory graph + vector database for testing.
 * Simulates HelixDB behavior without running the actual service.
 *
 * @see docs/plans/14-testing.md for mocking strategy
 */

import { createMemoryContext } from "@cream/test-fixtures";

// ============================================
// Types
// ============================================

/**
 * Node in the graph
 */
export interface GraphNode {
  id: string;
  type: string;
  properties: Record<string, unknown>;
  embedding?: number[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Edge in the graph
 */
export interface GraphEdge {
  id: string;
  fromId: string;
  toId: string;
  type: string;
  properties: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Trade memory for retrieval
 */
export interface TradeMemory {
  caseId: string;
  symbol: string;
  action: string;
  entryPrice: number;
  exitPrice: number;
  pnlPercent: number;
  regime: string;
  rationale: string;
  timestamp: string;
  embedding?: number[];
}

/**
 * Vector search result
 */
export interface VectorSearchResult<T> {
  item: T;
  score: number;
}

/**
 * Mock HelixDB configuration
 */
export interface MockHelixDBConfig {
  /** Simulated query delay (ms) */
  queryDelay?: number;
  /** Simulate failures */
  simulateFailure?: boolean;
  /** Pre-load trade memories */
  tradeMemories?: TradeMemory[];
  /** Use deterministic behavior */
  deterministic?: boolean;
}

// ============================================
// Mock HelixDB
// ============================================

/**
 * Mock HelixDB
 *
 * In-memory graph + vector database for testing:
 * - Node and edge storage
 * - Vector similarity search (simplified)
 * - Trade memory retrieval
 * - Ephemeral data (clears between tests)
 */
export class MockHelixDB {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private tradeMemories: Map<string, TradeMemory> = new Map();
  private config: Required<MockHelixDBConfig>;

  constructor(config: MockHelixDBConfig = {}) {
    this.config = {
      queryDelay: config.queryDelay ?? 5,
      simulateFailure: config.simulateFailure ?? false,
      tradeMemories: config.tradeMemories ?? [],
      deterministic: config.deterministic ?? true,
    };

    // Load initial trade memories
    for (const memory of this.config.tradeMemories) {
      this.tradeMemories.set(memory.caseId, memory);
    }

    // Load default memories if none provided
    if (this.tradeMemories.size === 0) {
      this.loadDefaultMemories();
    }
  }

  /**
   * Load default trade memories from fixtures
   */
  private loadDefaultMemories(): void {
    const context = createMemoryContext();
    for (const tradeCase of context.retrievedCases) {
      this.tradeMemories.set(tradeCase.caseId, {
        ...tradeCase,
        embedding: this.generateEmbedding(),
      });
    }
  }

  /**
   * Generate a random embedding vector (simplified)
   */
  private generateEmbedding(dimensions = 768): number[] {
    if (this.config.deterministic) {
      return new Array(dimensions).fill(0.5);
    }
    return new Array(dimensions).fill(0).map(() => Math.random());
  }

  // ============================================
  // Node Operations
  // ============================================

  /**
   * Upsert a node
   */
  async upsertNode(
    id: string,
    type: string,
    properties: Record<string, unknown>,
    embedding?: number[]
  ): Promise<GraphNode> {
    await this.simulateDelay();
    this.checkFailure();

    const now = new Date();
    const existing = this.nodes.get(id);

    const node: GraphNode = {
      id,
      type,
      properties,
      embedding: embedding ?? existing?.embedding,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.nodes.set(id, node);
    return { ...node };
  }

  /**
   * Get a node by ID
   */
  async getNode(id: string): Promise<GraphNode | undefined> {
    await this.simulateDelay();
    this.checkFailure();

    const node = this.nodes.get(id);
    return node ? { ...node } : undefined;
  }

  /**
   * Get nodes by type
   */
  async getNodesByType(type: string): Promise<GraphNode[]> {
    await this.simulateDelay();
    this.checkFailure();

    return Array.from(this.nodes.values())
      .filter((n) => n.type === type)
      .map((n) => ({ ...n }));
  }

  /**
   * Delete a node
   */
  async deleteNode(id: string): Promise<boolean> {
    await this.simulateDelay();
    this.checkFailure();

    return this.nodes.delete(id);
  }

  // ============================================
  // Edge Operations
  // ============================================

  /**
   * Create an edge between nodes
   */
  async createEdge(
    fromId: string,
    toId: string,
    type: string,
    properties: Record<string, unknown> = {}
  ): Promise<GraphEdge> {
    await this.simulateDelay();
    this.checkFailure();

    const id = `${fromId}-${type}-${toId}`;
    const edge: GraphEdge = {
      id,
      fromId,
      toId,
      type,
      properties,
      createdAt: new Date(),
    };

    this.edges.set(id, edge);
    return { ...edge };
  }

  /**
   * Get edges from a node
   */
  async getEdgesFrom(nodeId: string, edgeType?: string): Promise<GraphEdge[]> {
    await this.simulateDelay();
    this.checkFailure();

    return Array.from(this.edges.values())
      .filter((e) => e.fromId === nodeId && (!edgeType || e.type === edgeType))
      .map((e) => ({ ...e }));
  }

  /**
   * Get edges to a node
   */
  async getEdgesTo(nodeId: string, edgeType?: string): Promise<GraphEdge[]> {
    await this.simulateDelay();
    this.checkFailure();

    return Array.from(this.edges.values())
      .filter((e) => e.toId === nodeId && (!edgeType || e.type === edgeType))
      .map((e) => ({ ...e }));
  }

  // ============================================
  // Trade Memory Operations
  // ============================================

  /**
   * Store a trade memory
   */
  async storeTradeMemory(memory: TradeMemory): Promise<void> {
    await this.simulateDelay();
    this.checkFailure();

    // Generate embedding if not provided
    if (!memory.embedding) {
      memory.embedding = this.generateEmbedding();
    }

    this.tradeMemories.set(memory.caseId, { ...memory });
  }

  /**
   * Retrieve similar trade memories
   *
   * Simplified vector search: filters by symbol and regime, returns top-k
   */
  async retrieveTradeMemory(
    query: {
      symbol?: string;
      regime?: string;
      action?: string;
    },
    k = 10
  ): Promise<VectorSearchResult<TradeMemory>[]> {
    await this.simulateDelay();
    this.checkFailure();

    // Filter memories by query criteria
    let matches = Array.from(this.tradeMemories.values());

    if (query.symbol) {
      matches = matches.filter((m) => m.symbol === query.symbol);
    }
    if (query.regime) {
      matches = matches.filter((m) => m.regime === query.regime);
    }
    if (query.action) {
      matches = matches.filter((m) => m.action === query.action);
    }

    // Calculate mock similarity scores
    const results: VectorSearchResult<TradeMemory>[] = matches.slice(0, k).map((item, index) => ({
      item: { ...item },
      score: this.config.deterministic ? 0.9 - index * 0.05 : Math.random(),
    }));

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results;
  }

  /**
   * Get all trade memories
   */
  async getAllTradeMemories(): Promise<TradeMemory[]> {
    await this.simulateDelay();
    this.checkFailure();

    return Array.from(this.tradeMemories.values()).map((m) => ({ ...m }));
  }

  // ============================================
  // Vector Search Operations
  // ============================================

  /**
   * Vector similarity search on nodes
   *
   * Simplified: returns nodes with matching type, ordered by property match
   */
  async vectorSearch(
    embedding: number[],
    nodeType: string,
    k = 10
  ): Promise<VectorSearchResult<GraphNode>[]> {
    await this.simulateDelay();
    this.checkFailure();

    const nodesOfType = Array.from(this.nodes.values()).filter(
      (n) => n.type === nodeType && n.embedding
    );

    // Calculate mock cosine similarity
    const results: VectorSearchResult<GraphNode>[] = nodesOfType.slice(0, k).map((node, index) => ({
      item: { ...node },
      score: this.config.deterministic
        ? 0.95 - index * 0.02
        : this.cosineSimilarity(embedding, node.embedding!),
    }));

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // ============================================
  // Query Operations
  // ============================================

  /**
   * Execute a HelixQL query (simplified)
   *
   * Supports basic patterns:
   * - MATCH (n:Type) RETURN n
   * - MATCH (n:Type {prop: value}) RETURN n
   */
  async query(
    helixql: string,
    _params: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>[]> {
    await this.simulateDelay();
    this.checkFailure();

    // Very simplified query parsing
    const matchType = helixql.match(/\(n:(\w+)\)/);
    if (matchType) {
      const nodeType = matchType[1];
      const nodes = await this.getNodesByType(nodeType);
      return nodes.map((n) => ({ n }));
    }

    return [];
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Clear all data (for testing)
   */
  reset(): void {
    this.nodes.clear();
    this.edges.clear();
    this.tradeMemories.clear();
    this.loadDefaultMemories();
  }

  /**
   * Get statistics
   */
  getStats(): { nodes: number; edges: number; tradeMemories: number } {
    return {
      nodes: this.nodes.size,
      edges: this.edges.size,
      tradeMemories: this.tradeMemories.size,
    };
  }

  /**
   * Simulate query delay
   */
  private async simulateDelay(): Promise<void> {
    if (this.config.queryDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.config.queryDelay));
    }
  }

  /**
   * Check and throw failure if configured
   */
  private checkFailure(): void {
    if (this.config.simulateFailure) {
      throw new Error("MockHelixDB: Simulated failure");
    }
  }
}

// ============================================
// Factory Function
// ============================================

/**
 * Create a mock HelixDB instance
 */
export function createMockHelixDB(config?: MockHelixDBConfig): MockHelixDB {
  return new MockHelixDB(config);
}
