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
 * Graph database abstraction interface.
 * Allows swapping HelixDB for Neo4j, Weaviate, or other graph databases.
 */
export interface IGraphDatabase {
	/** Export all data */
	exportAll(options?: ExportOptions): Promise<HelixExport>;

	/** Export incremental changes */
	exportIncremental(
		since: string,
		options?: Omit<ExportOptions, "since">,
	): Promise<IncrementalExport>;

	/** Import data */
	importData(data: HelixExport, options?: ImportOptions): Promise<ImportResult>;

	/** Get all node types */
	getNodeTypes(): Promise<string[]>;

	/** Get all edge types */
	getEdgeTypes(): Promise<string[]>;

	/** Check connection health */
	healthCheck(): Promise<{ healthy: boolean; latencyMs: number }>;
}
