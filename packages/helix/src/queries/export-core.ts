import type { HelixClient } from "../client";
import {
	EXPORT_VERSION,
	getAllEdgeTypes,
	getAllNodeTypes,
	isCompatibleVersion,
} from "./export-internal";
import type {
	ExportOptions,
	HelixExport,
	ImportOptions,
	ImportResult,
	IncrementalExport,
} from "./export-types";
import type { GraphEdge, GraphNode } from "./graph";

type ImportBatchResult = { imported: number; skipped: number };
type ImportItemType = "node" | "edge";

type ImportBatchConfig<T> = {
	client: HelixClient;
	itemsByType: Record<string, T[]>;
	batchSize: number;
	overwrite: boolean;
	queryName: "importNodes" | "importEdges";
	payloadKey: "nodes" | "edges";
	itemType: ImportItemType;
	result: ImportResult;
};

interface ChangeCounts {
	added: number;
	modified: number;
}

function countByType<T>(itemsByType: Record<string, T[]>): number {
	return Object.values(itemsByType).reduce((sum, items) => sum + items.length, 0);
}

async function resolveExportTypes(
	client: HelixClient,
	options: Pick<ExportOptions, "nodeTypes" | "edgeTypes">,
): Promise<{ nodeTypes: string[]; edgeTypes: string[] }> {
	const [nodeTypes, edgeTypes] = await Promise.all([
		options.nodeTypes ? Promise.resolve(options.nodeTypes) : getAllNodeTypes(client),
		options.edgeTypes ? Promise.resolve(options.edgeTypes) : getAllEdgeTypes(client),
	]);

	return { nodeTypes, edgeTypes };
}

function createImportResult(): ImportResult {
	return {
		nodesImported: 0,
		edgesImported: 0,
		nodesSkipped: 0,
		edgesSkipped: 0,
		errors: [],
	};
}

function resolveImportOptions(options: ImportOptions): Required<ImportOptions> {
	return {
		overwrite: false,
		validate: true,
		batchSize: 100,
		...options,
	};
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Unknown error";
}

function formatImportError(
	itemType: ImportItemType,
	typeName: string,
	batchStart: number,
	error: unknown,
): string {
	return `Failed to import ${itemType} type ${typeName} batch ${batchStart}: ${getErrorMessage(error)}`;
}

async function exportNodesByType(
	client: HelixClient,
	nodeTypes: string[],
	options: ExportOptions,
): Promise<Record<string, GraphNode[]>> {
	const nodes: Record<string, GraphNode[]> = {};

	for (const nodeType of nodeTypes) {
		const response = await client.query<GraphNode[]>("exportNodes", {
			type: nodeType,
			limit: options.maxNodesPerType,
			include_embeddings: options.includeEmbeddings ?? true,
		});
		nodes[nodeType] = response.data;
	}

	return nodes;
}

async function exportEdgesByType(
	client: HelixClient,
	edgeTypes: string[],
): Promise<Record<string, GraphEdge[]>> {
	const edges: Record<string, GraphEdge[]> = {};

	for (const edgeType of edgeTypes) {
		const response = await client.query<GraphEdge[]>("exportEdges", {
			type: edgeType,
		});
		edges[edgeType] = response.data;
	}

	return edges;
}

async function importTypeBatches<T>(config: ImportBatchConfig<T>): Promise<void> {
	for (const [typeName, typedItems] of Object.entries(config.itemsByType)) {
		for (let start = 0; start < typedItems.length; start += config.batchSize) {
			const batch = typedItems.slice(start, start + config.batchSize);
			try {
				const result = await config.client.query<ImportBatchResult>(config.queryName, {
					[config.payloadKey]: batch,
					overwrite: config.overwrite,
				});

				if (config.itemType === "node") {
					config.result.nodesImported += result.data.imported;
					config.result.nodesSkipped += result.data.skipped;
				} else {
					config.result.edgesImported += result.data.imported;
					config.result.edgesSkipped += result.data.skipped;
				}
			} catch (error) {
				config.result.errors.push(formatImportError(config.itemType, typeName, start, error));
			}
		}
	}
}

function wasCreatedSince(properties: unknown, since: string): boolean {
	if (!properties || typeof properties !== "object") {
		return false;
	}

	if (!("created_at" in properties)) {
		return false;
	}

	const createdAt = (properties as { created_at?: unknown }).created_at;
	return typeof createdAt === "string" && createdAt >= since;
}

function countChangesSince<T extends { properties: unknown }>(
	items: T[],
	since: string,
): ChangeCounts {
	let added = 0;
	let modified = 0;

	for (const item of items) {
		if (wasCreatedSince(item.properties, since)) {
			added++;
		} else {
			modified++;
		}
	}

	return { added, modified };
}

async function exportNodesChangedSince(
	client: HelixClient,
	nodeTypes: string[],
	since: string,
	options: Omit<ExportOptions, "since">,
): Promise<{ nodes: Record<string, GraphNode[]>; changes: ChangeCounts }> {
	const nodes: Record<string, GraphNode[]> = {};
	const changes: ChangeCounts = { added: 0, modified: 0 };

	for (const nodeType of nodeTypes) {
		const response = await client.query<GraphNode[]>("exportNodesChangedSince", {
			type: nodeType,
			since,
			limit: options.maxNodesPerType,
			include_embeddings: options.includeEmbeddings ?? true,
		});

		if (response.data.length === 0) {
			continue;
		}

		nodes[nodeType] = response.data;
		const counts = countChangesSince(response.data, since);
		changes.added += counts.added;
		changes.modified += counts.modified;
	}

	return { nodes, changes };
}

async function exportEdgesChangedSince(
	client: HelixClient,
	edgeTypes: string[],
	since: string,
): Promise<{ edges: Record<string, GraphEdge[]>; changes: ChangeCounts }> {
	const edges: Record<string, GraphEdge[]> = {};
	const changes: ChangeCounts = { added: 0, modified: 0 };

	for (const edgeType of edgeTypes) {
		const response = await client.query<GraphEdge[]>("exportEdgesChangedSince", {
			type: edgeType,
			since,
		});

		if (response.data.length === 0) {
			continue;
		}

		edges[edgeType] = response.data;
		const counts = countChangesSince(response.data, since);
		changes.added += counts.added;
		changes.modified += counts.modified;
	}

	return { edges, changes };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object";
}

function validateRequiredField(
	data: Record<string, unknown>,
	field: "version" | "exportedAt" | "source",
	errors: string[],
): void {
	if (typeof data[field] !== "string") {
		errors.push(`Missing or invalid '${field}' field`);
	}
}

function validateRequiredObjectField(
	data: Record<string, unknown>,
	field: "nodes" | "edges" | "metadata",
	errors: string[],
): void {
	if (!isRecord(data[field])) {
		errors.push(`Missing or invalid '${field}' field`);
	}
}

function validateMetadata(metadata: unknown, errors: string[]): void {
	if (!isRecord(metadata)) {
		return;
	}

	if (typeof metadata.nodeCount !== "number") {
		errors.push("Missing or invalid 'metadata.nodeCount'");
	}
	if (typeof metadata.edgeCount !== "number") {
		errors.push("Missing or invalid 'metadata.edgeCount'");
	}
	if (!Array.isArray(metadata.nodeTypes)) {
		errors.push("Missing or invalid 'metadata.nodeTypes'");
	}
	if (!Array.isArray(metadata.edgeTypes)) {
		errors.push("Missing or invalid 'metadata.edgeTypes'");
	}
}

function mergeItemsByType<T>(
	baseItems: Record<string, T[]>,
	incrementalItems: Record<string, T[]>,
	getKey: (item: T) => string,
): Record<string, T[]> {
	const merged: Record<string, T[]> = { ...baseItems };

	for (const [itemType, items] of Object.entries(incrementalItems)) {
		const existing = merged[itemType] ?? [];
		const itemIndex = new Map(existing.map((item, index) => [getKey(item), index]));
		const nextItems = [...existing];

		for (const item of items) {
			const key = getKey(item);
			const index = itemIndex.get(key);

			if (index === undefined) {
				nextItems.push(item);
				itemIndex.set(key, nextItems.length - 1);
				continue;
			}

			nextItems[index] = item;
		}

		merged[itemType] = nextItems;
	}

	return merged;
}

function mergeMetadata(base: HelixExport, incremental: HelixExport): HelixExport["metadata"] {
	return {
		nodeCount: 0,
		edgeCount: 0,
		nodeTypes: [...new Set([...base.metadata.nodeTypes, ...incremental.metadata.nodeTypes])],
		edgeTypes: [...new Set([...base.metadata.edgeTypes, ...incremental.metadata.edgeTypes])],
	};
}

/**
 * Export data from HelixDB.
 */
export async function exportData(
	client: HelixClient,
	options: ExportOptions = {},
): Promise<HelixExport> {
	const config = client.getConfig();
	const { nodeTypes, edgeTypes } = await resolveExportTypes(client, options);
	const [nodes, edges] = await Promise.all([
		exportNodesByType(client, nodeTypes, options),
		exportEdgesByType(client, edgeTypes),
	]);

	return {
		version: EXPORT_VERSION,
		exportedAt: new Date().toISOString(),
		source: `${config.host}:${config.port}`,
		nodes,
		edges,
		metadata: {
			nodeCount: countByType(nodes),
			edgeCount: countByType(edges),
			nodeTypes,
			edgeTypes,
		},
	};
}

/**
 * Import data into HelixDB.
 */
export async function importData(
	client: HelixClient,
	data: HelixExport,
	options: ImportOptions = {},
): Promise<ImportResult> {
	const opts = resolveImportOptions(options);
	const result = createImportResult();

	if (opts.validate && !isCompatibleVersion(data.version)) {
		result.errors.push(`Incompatible export version: ${data.version} (expected ${EXPORT_VERSION})`);
		return result;
	}

	await importTypeBatches<GraphNode>({
		client,
		itemsByType: data.nodes,
		batchSize: opts.batchSize,
		overwrite: opts.overwrite,
		queryName: "importNodes",
		payloadKey: "nodes",
		itemType: "node",
		result,
	});

	await importTypeBatches<GraphEdge>({
		client,
		itemsByType: data.edges,
		batchSize: opts.batchSize,
		overwrite: opts.overwrite,
		queryName: "importEdges",
		payloadKey: "edges",
		itemType: "edge",
		result,
	});

	return result;
}

/**
 * Export data to a JSON string.
 */
export async function exportToJson(
	client: HelixClient,
	options: ExportOptions = {},
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
	options: ImportOptions = {},
): Promise<ImportResult> {
	const data = JSON.parse(json) as HelixExport;
	return importData(client, data, options);
}

/**
 * Export incremental changes since a timestamp.
 */
export async function exportIncremental(
	client: HelixClient,
	since: string,
	options: Omit<ExportOptions, "since"> = {},
): Promise<IncrementalExport> {
	const config = client.getConfig();
	const exportTimestamp = new Date().toISOString();
	const { nodeTypes, edgeTypes } = await resolveExportTypes(client, options);

	const [{ nodes, changes: nodeChanges }, { edges, changes: edgeChanges }] = await Promise.all([
		exportNodesChangedSince(client, nodeTypes, since, options),
		exportEdgesChangedSince(client, edgeTypes, since),
	]);

	return {
		version: EXPORT_VERSION,
		exportedAt: exportTimestamp,
		source: `${config.host}:${config.port}`,
		nodes,
		edges,
		metadata: {
			nodeCount: countByType(nodes),
			edgeCount: countByType(edges),
			nodeTypes: Object.keys(nodes),
			edgeTypes: Object.keys(edges),
		},
		incremental: true,
		nextSinceTimestamp: exportTimestamp,
		changes: {
			nodesAdded: nodeChanges.added,
			nodesModified: nodeChanges.modified,
			edgesAdded: edgeChanges.added,
			edgesModified: edgeChanges.modified,
		},
	};
}

/**
 * Validate export data structure.
 */
export function validateExport(data: unknown): { valid: boolean; errors: string[] } {
	if (!isRecord(data)) {
		return { valid: false, errors: ["Export data must be an object"] };
	}

	const errors: string[] = [];
	validateRequiredField(data, "version", errors);
	validateRequiredField(data, "exportedAt", errors);
	validateRequiredField(data, "source", errors);
	validateRequiredObjectField(data, "nodes", errors);
	validateRequiredObjectField(data, "edges", errors);
	validateRequiredObjectField(data, "metadata", errors);
	validateMetadata(data.metadata, errors);

	if (typeof data.version === "string" && !isCompatibleVersion(data.version)) {
		errors.push(
			`Incompatible version: ${data.version} (expected major version ${EXPORT_VERSION.split(".")[0]})`,
		);
	}

	return { valid: errors.length === 0, errors };
}

/**
 * Merge two exports together.
 */
export function mergeExports(base: HelixExport, incremental: HelixExport): HelixExport {
	const nodes = mergeItemsByType(base.nodes, incremental.nodes, (node) => node.id);
	const edges = mergeItemsByType(
		base.edges,
		incremental.edges,
		(edge) => `${edge.sourceId}-${edge.targetId}`,
	);

	const metadata = mergeMetadata(base, incremental);
	metadata.nodeCount = countByType(nodes);
	metadata.edgeCount = countByType(edges);

	return {
		version: incremental.version,
		exportedAt: incremental.exportedAt,
		source: incremental.source,
		nodes,
		edges,
		metadata,
	};
}
