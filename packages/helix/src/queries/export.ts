/**
 * Data Export/Import Utilities
 *
 * Provides data portability for HelixDB as a risk mitigation
 * strategy for the early-stage database.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { HelixClient } from "../client";
import type { GraphEdge, GraphNode } from "./graph";

/**
 * Export format for HelixDB data.
 */
export interface HelixExport {
  /** Export version for compatibility checking */
  version: string;
  /** Timestamp of export */
  exportedAt: string;
  /** Source HelixDB instance */
  source: string;
  /** Exported nodes by type */
  nodes: Record<string, GraphNode[]>;
  /** Exported edges by type */
  edges: Record<string, GraphEdge[]>;
  /** Export metadata */
  metadata: {
    nodeCount: number;
    edgeCount: number;
    nodeTypes: string[];
    edgeTypes: string[];
  };
}

/**
 * Export options.
 */
export interface ExportOptions {
  /** Node types to export (empty = all) */
  nodeTypes?: string[];
  /** Edge types to export (empty = all) */
  edgeTypes?: string[];
  /** Maximum nodes per type (default: no limit) */
  maxNodesPerType?: number;
  /** Include embeddings in export (default: true) */
  includeEmbeddings?: boolean;
  /** Only export changes since this timestamp (ISO 8601) for incremental backups */
  since?: string;
}

/**
 * Incremental export result.
 */
export interface IncrementalExport extends HelixExport {
  /** Whether this is an incremental export */
  incremental: true;
  /** Timestamp to use as 'since' for next incremental export */
  nextSinceTimestamp: string;
  /** Changes detected */
  changes: {
    nodesAdded: number;
    nodesModified: number;
    edgesAdded: number;
    edgesModified: number;
  };
}

/**
 * Import options.
 */
export interface ImportOptions {
  /** Whether to overwrite existing nodes (default: false) */
  overwrite?: boolean;
  /** Whether to validate data before import (default: true) */
  validate?: boolean;
  /** Batch size for import operations (default: 100) */
  batchSize?: number;
}

/**
 * Import result.
 */
export interface ImportResult {
  /** Number of nodes imported */
  nodesImported: number;
  /** Number of edges imported */
  edgesImported: number;
  /** Number of nodes skipped (already exist) */
  nodesSkipped: number;
  /** Number of edges skipped */
  edgesSkipped: number;
  /** Any errors encountered */
  errors: string[];
}

/**
 * Export version for format compatibility.
 */
const EXPORT_VERSION = "1.0.0";

/**
 * Export data from HelixDB.
 *
 * @param client - HelixDB client
 * @param options - Export options
 * @returns Exported data
 *
 * @example
 * ```typescript
 * const data = await exportData(client, {
 *   nodeTypes: ["TradeDecision", "ExternalEvent"],
 *   includeEmbeddings: true,
 * });
 *
 * // Save to file
 * await Bun.write("backup.json", JSON.stringify(data));
 * ```
 */
export async function exportData(
  client: HelixClient,
  options: ExportOptions = {}
): Promise<HelixExport> {
  const config = client.getConfig();

  // Get all node types if not specified
  const nodeTypes = options.nodeTypes ?? (await getAllNodeTypes(client));
  const edgeTypes = options.edgeTypes ?? (await getAllEdgeTypes(client));

  const nodes: Record<string, GraphNode[]> = {};
  const edges: Record<string, GraphEdge[]> = {};

  // Export nodes by type
  for (const nodeType of nodeTypes) {
    const typeNodes = await client.query<GraphNode[]>("exportNodes", {
      type: nodeType,
      limit: options.maxNodesPerType,
      include_embeddings: options.includeEmbeddings ?? true,
    });
    nodes[nodeType] = typeNodes.data;
  }

  // Export edges by type
  for (const edgeType of edgeTypes) {
    const typeEdges = await client.query<GraphEdge[]>("exportEdges", {
      type: edgeType,
    });
    edges[edgeType] = typeEdges.data;
  }

  const nodeCount = Object.values(nodes).reduce((sum, arr) => sum + arr.length, 0);
  const edgeCount = Object.values(edges).reduce((sum, arr) => sum + arr.length, 0);

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    source: `${config.host}:${config.port}`,
    nodes,
    edges,
    metadata: {
      nodeCount,
      edgeCount,
      nodeTypes,
      edgeTypes,
    },
  };
}

/**
 * Import data into HelixDB.
 *
 * @param client - HelixDB client
 * @param data - Data to import
 * @param options - Import options
 * @returns Import result
 *
 * @example
 * ```typescript
 * const data = JSON.parse(await Bun.file("backup.json").text());
 * const result = await importData(client, data, { overwrite: false });
 * console.log(`Imported ${result.nodesImported} nodes`);
 * ```
 */
export async function importData(
  client: HelixClient,
  data: HelixExport,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const opts = {
    overwrite: false,
    validate: true,
    batchSize: 100,
    ...options,
  };

  const result: ImportResult = {
    nodesImported: 0,
    edgesImported: 0,
    nodesSkipped: 0,
    edgesSkipped: 0,
    errors: [],
  };

  // Validate export version
  if (opts.validate && !isCompatibleVersion(data.version)) {
    result.errors.push(`Incompatible export version: ${data.version} (expected ${EXPORT_VERSION})`);
    return result;
  }

  // Import nodes by type
  for (const [nodeType, typeNodes] of Object.entries(data.nodes)) {
    // Process in batches
    for (let i = 0; i < typeNodes.length; i += opts.batchSize) {
      const batch = typeNodes.slice(i, i + opts.batchSize);

      try {
        const batchResult = await client.query<{
          imported: number;
          skipped: number;
        }>("importNodes", {
          nodes: batch,
          overwrite: opts.overwrite,
        });

        result.nodesImported += batchResult.data.imported;
        result.nodesSkipped += batchResult.data.skipped;
      } catch (error) {
        result.errors.push(
          `Failed to import ${nodeType} batch ${i}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }
  }

  // Import edges by type
  for (const [edgeType, typeEdges] of Object.entries(data.edges)) {
    for (let i = 0; i < typeEdges.length; i += opts.batchSize) {
      const batch = typeEdges.slice(i, i + opts.batchSize);

      try {
        const batchResult = await client.query<{
          imported: number;
          skipped: number;
        }>("importEdges", {
          edges: batch,
          overwrite: opts.overwrite,
        });

        result.edgesImported += batchResult.data.imported;
        result.edgesSkipped += batchResult.data.skipped;
      } catch (error) {
        result.errors.push(
          `Failed to import ${edgeType} batch ${i}: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }
  }

  return result;
}

/**
 * Export data to a JSON string.
 */
export async function exportToJson(
  client: HelixClient,
  options: ExportOptions = {}
): Promise<string> {
  const data = await exportData(client, options);
  return JSON.stringify(data, null, 2);
}

/**
 * Import data from a JSON string.
 */
export async function importFromJson(
  client: HelixClient,
  json: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const data = JSON.parse(json) as HelixExport;
  return importData(client, data, options);
}

/**
 * Export incremental changes since a timestamp.
 *
 * @param client - HelixDB client
 * @param since - ISO 8601 timestamp to export changes from
 * @param options - Export options (nodeTypes, edgeTypes, etc.)
 * @returns Incremental export with change tracking
 *
 * @example
 * ```typescript
 * // First full export
 * const full = await exportData(client);
 * const lastExport = full.exportedAt;
 *
 * // Later: incremental export
 * const incremental = await exportIncremental(client, lastExport);
 * console.log(`Added: ${incremental.changes.nodesAdded} nodes`);
 *
 * // Use nextSinceTimestamp for next incremental
 * const next = await exportIncremental(client, incremental.nextSinceTimestamp);
 * ```
 */
export async function exportIncremental(
  client: HelixClient,
  since: string,
  options: Omit<ExportOptions, "since"> = {}
): Promise<IncrementalExport> {
  const config = client.getConfig();
  const exportTimestamp = new Date().toISOString();

  // Get all node types if not specified
  const nodeTypes = options.nodeTypes ?? (await getAllNodeTypes(client));
  const edgeTypes = options.edgeTypes ?? (await getAllEdgeTypes(client));

  const nodes: Record<string, GraphNode[]> = {};
  const edges: Record<string, GraphEdge[]> = {};

  let nodesAdded = 0;
  let nodesModified = 0;
  let edgesAdded = 0;
  let edgesModified = 0;

  // Export nodes changed since timestamp
  for (const nodeType of nodeTypes) {
    const typeNodes = await client.query<GraphNode[]>("exportNodesChangedSince", {
      type: nodeType,
      since,
      limit: options.maxNodesPerType,
      include_embeddings: options.includeEmbeddings ?? true,
    });

    if (typeNodes.data.length > 0) {
      nodes[nodeType] = typeNodes.data;

      // Count added vs modified based on created_at vs updated_at
      for (const node of typeNodes.data) {
        const createdAt = (node as Record<string, unknown>).created_at as string | undefined;
        if (createdAt && createdAt >= since) {
          nodesAdded++;
        } else {
          nodesModified++;
        }
      }
    }
  }

  // Export edges changed since timestamp
  for (const edgeType of edgeTypes) {
    const typeEdges = await client.query<GraphEdge[]>("exportEdgesChangedSince", {
      type: edgeType,
      since,
    });

    if (typeEdges.data.length > 0) {
      edges[edgeType] = typeEdges.data;

      // Count added vs modified
      for (const edge of typeEdges.data) {
        const createdAt = (edge as Record<string, unknown>).created_at as string | undefined;
        if (createdAt && createdAt >= since) {
          edgesAdded++;
        } else {
          edgesModified++;
        }
      }
    }
  }

  const nodeCount = Object.values(nodes).reduce((sum, arr) => sum + arr.length, 0);
  const edgeCount = Object.values(edges).reduce((sum, arr) => sum + arr.length, 0);

  return {
    version: EXPORT_VERSION,
    exportedAt: exportTimestamp,
    source: `${config.host}:${config.port}`,
    nodes,
    edges,
    metadata: {
      nodeCount,
      edgeCount,
      nodeTypes: Object.keys(nodes),
      edgeTypes: Object.keys(edges),
    },
    incremental: true,
    nextSinceTimestamp: exportTimestamp,
    changes: {
      nodesAdded,
      nodesModified,
      edgesAdded,
      edgesModified,
    },
  };
}

/**
 * Validate export data structure.
 *
 * @param data - Data to validate
 * @returns Validation result with any errors
 */
export function validateExport(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data || typeof data !== "object") {
    return { valid: false, errors: ["Export data must be an object"] };
  }

  const export_ = data as Record<string, unknown>;

  // Check required fields
  if (typeof export_.version !== "string") {
    errors.push("Missing or invalid 'version' field");
  }

  if (typeof export_.exportedAt !== "string") {
    errors.push("Missing or invalid 'exportedAt' field");
  }

  if (typeof export_.source !== "string") {
    errors.push("Missing or invalid 'source' field");
  }

  if (!export_.nodes || typeof export_.nodes !== "object") {
    errors.push("Missing or invalid 'nodes' field");
  }

  if (!export_.edges || typeof export_.edges !== "object") {
    errors.push("Missing or invalid 'edges' field");
  }

  if (!export_.metadata || typeof export_.metadata !== "object") {
    errors.push("Missing or invalid 'metadata' field");
  } else {
    const meta = export_.metadata as Record<string, unknown>;
    if (typeof meta.nodeCount !== "number") {
      errors.push("Missing or invalid 'metadata.nodeCount'");
    }
    if (typeof meta.edgeCount !== "number") {
      errors.push("Missing or invalid 'metadata.edgeCount'");
    }
    if (!Array.isArray(meta.nodeTypes)) {
      errors.push("Missing or invalid 'metadata.nodeTypes'");
    }
    if (!Array.isArray(meta.edgeTypes)) {
      errors.push("Missing or invalid 'metadata.edgeTypes'");
    }
  }

  // Check version compatibility
  if (typeof export_.version === "string" && !isCompatibleVersion(export_.version)) {
    errors.push(`Incompatible version: ${export_.version} (expected major version ${EXPORT_VERSION.split(".")[0]})`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Merge two exports together.
 * Useful for combining incremental exports with a base export.
 *
 * @param base - Base export
 * @param incremental - Incremental export to merge
 * @returns Merged export
 */
export function mergeExports(base: HelixExport, incremental: HelixExport): HelixExport {
  const nodes: Record<string, GraphNode[]> = { ...base.nodes };
  const edges: Record<string, GraphEdge[]> = { ...base.edges };

  // Merge nodes (incremental overwrites base for same IDs)
  for (const [nodeType, typeNodes] of Object.entries(incremental.nodes)) {
    if (!nodes[nodeType]) {
      nodes[nodeType] = [];
    }

    const existingIds = new Set(nodes[nodeType].map((n) => n.id));
    for (const node of typeNodes) {
      if (existingIds.has(node.id)) {
        // Replace existing node
        const index = nodes[nodeType].findIndex((n) => n.id === node.id);
        nodes[nodeType][index] = node;
      } else {
        nodes[nodeType].push(node);
      }
    }
  }

  // Merge edges
  for (const [edgeType, typeEdges] of Object.entries(incremental.edges)) {
    if (!edges[edgeType]) {
      edges[edgeType] = [];
    }

    const existingIds = new Set(edges[edgeType].map((e) => `${e.source}-${e.target}`));
    for (const edge of typeEdges) {
      const edgeId = `${edge.source}-${edge.target}`;
      if (existingIds.has(edgeId)) {
        // Replace existing edge
        const index = edges[edgeType].findIndex((e) => `${e.source}-${e.target}` === edgeId);
        edges[edgeType][index] = edge;
      } else {
        edges[edgeType].push(edge);
      }
    }
  }

  const nodeCount = Object.values(nodes).reduce((sum, arr) => sum + arr.length, 0);
  const edgeCount = Object.values(edges).reduce((sum, arr) => sum + arr.length, 0);

  return {
    version: incremental.version,
    exportedAt: incremental.exportedAt,
    source: incremental.source,
    nodes,
    edges,
    metadata: {
      nodeCount,
      edgeCount,
      nodeTypes: [...new Set([...base.metadata.nodeTypes, ...incremental.metadata.nodeTypes])],
      edgeTypes: [...new Set([...base.metadata.edgeTypes, ...incremental.metadata.edgeTypes])],
    },
  };
}

// ============================================================================
// Abstraction Layer Interface
// ============================================================================

/**
 * Graph database abstraction interface.
 * Allows swapping HelixDB for Neo4j, Weaviate, or other graph databases.
 */
export interface IGraphDatabase {
  /** Export all data */
  exportAll(options?: ExportOptions): Promise<HelixExport>;

  /** Export incremental changes */
  exportIncremental(since: string, options?: Omit<ExportOptions, "since">): Promise<IncrementalExport>;

  /** Import data */
  importData(data: HelixExport, options?: ImportOptions): Promise<ImportResult>;

  /** Get all node types */
  getNodeTypes(): Promise<string[]>;

  /** Get all edge types */
  getEdgeTypes(): Promise<string[]>;

  /** Check connection health */
  healthCheck(): Promise<{ healthy: boolean; latencyMs: number }>;
}

/**
 * HelixDB implementation of IGraphDatabase.
 */
export class HelixGraphDatabase implements IGraphDatabase {
  constructor(private client: HelixClient) {}

  async exportAll(options?: ExportOptions): Promise<HelixExport> {
    return exportData(this.client, options);
  }

  async exportIncremental(since: string, options?: Omit<ExportOptions, "since">): Promise<IncrementalExport> {
    return exportIncremental(this.client, since, options);
  }

  async importData(data: HelixExport, options?: ImportOptions): Promise<ImportResult> {
    return importData(this.client, data, options);
  }

  async getNodeTypes(): Promise<string[]> {
    return getAllNodeTypes(this.client);
  }

  async getEdgeTypes(): Promise<string[]> {
    return getAllEdgeTypes(this.client);
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    const start = Date.now();
    try {
      await this.client.query("healthCheck", {});
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}

/**
 * Create a graph database instance from a HelixDB client.
 */
export function createGraphDatabase(client: HelixClient): IGraphDatabase {
  return new HelixGraphDatabase(client);
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get all node types in the database.
 */
async function getAllNodeTypes(client: HelixClient): Promise<string[]> {
  try {
    const result = await client.query<string[]>("getNodeTypes", {});
    return result.data;
  } catch {
    // Return known types as fallback
    return [
      "TradeDecision",
      "TradeLifecycleEvent",
      "ExternalEvent",
      "FilingChunk",
      "TranscriptChunk",
      "NewsItem",
      "Company",
      "MacroEntity",
    ];
  }
}

/**
 * Get all edge types in the database.
 */
async function getAllEdgeTypes(client: HelixClient): Promise<string[]> {
  try {
    const result = await client.query<string[]>("getEdgeTypes", {});
    return result.data;
  } catch {
    // Return known types as fallback
    return ["INFLUENCED_DECISION", "HAS_EVENT", "MENTIONS_COMPANY", "IN_SECTOR", "RELATED_TO"];
  }
}

/**
 * Check if an export version is compatible.
 */
function isCompatibleVersion(version: string): boolean {
  const [major] = version.split(".");
  const [currentMajor] = EXPORT_VERSION.split(".");
  return major === currentMajor;
}
