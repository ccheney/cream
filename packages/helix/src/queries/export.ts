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
