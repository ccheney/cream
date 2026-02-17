import type { HelixClient } from "../client";

/**
 * Export version for format compatibility.
 */
export const EXPORT_VERSION = "1.0.0";

const FALLBACK_NODE_TYPES = [
	"TradeDecision",
	"TradeLifecycleEvent",
	"ExternalEvent",
	"FilingChunk",
	"TranscriptChunk",
	"NewsItem",
	"Company",
	"MacroEntity",
];

const FALLBACK_EDGE_TYPES = [
	"INFLUENCED_DECISION",
	"HAS_EVENT",
	"MENTIONS_COMPANY",
	"IN_SECTOR",
	"RELATED_TO",
];

/**
 * Get all node types in the database.
 */
export async function getAllNodeTypes(client: HelixClient): Promise<string[]> {
	try {
		const result = await client.query<string[]>("getNodeTypes", {});
		return result.data;
	} catch {
		return FALLBACK_NODE_TYPES;
	}
}

/**
 * Get all edge types in the database.
 */
export async function getAllEdgeTypes(client: HelixClient): Promise<string[]> {
	try {
		const result = await client.query<string[]>("getEdgeTypes", {});
		return result.data;
	} catch {
		return FALLBACK_EDGE_TYPES;
	}
}

/**
 * Check if an export version is compatible.
 */
export function isCompatibleVersion(version: string): boolean {
	const [major] = version.split(".");
	const [currentMajor] = EXPORT_VERSION.split(".");
	return major === currentMajor;
}
