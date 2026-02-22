/**
 * Node Query Functions
 *
 * Functions for querying nodes in HelixDB.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { HelixClient } from "../../client.js";
import type { GraphNode } from "./types.js";

interface QuerySelector {
	queryName: string;
	params: Record<string, unknown>;
	nodeType: string;
}

function toRowArray<T>(value: unknown): T[] {
	if (Array.isArray(value)) {
		return value as T[];
	}
	if (value && typeof value === "object") {
		return [value as T];
	}
	return [];
}

function toGraphNode<T>(
	nodeType: string,
	row: Record<string, unknown>,
	fallbackId: string,
): GraphNode<T> {
	const id =
		(typeof row.id === "string" && row.id) ||
		(typeof row._id === "string" && row._id) ||
		(typeof row.decision_id === "string" && row.decision_id) ||
		(typeof row.event_id === "string" && row.event_id) ||
		(typeof row.chunk_id === "string" && row.chunk_id) ||
		(typeof row.item_id === "string" && row.item_id) ||
		(typeof row.thesis_id === "string" && row.thesis_id) ||
		(typeof row.hypothesis_id === "string" && row.hypothesis_id) ||
		(typeof row.paper_id === "string" && row.paper_id) ||
		(typeof row.symbol === "string" && row.symbol) ||
		(typeof row.entity_id === "string" && row.entity_id) ||
		fallbackId;

	return {
		id,
		type: typeof row.type === "string" && row.type.length > 0 ? row.type : nodeType,
		properties: row as T,
	};
}

async function executeNodeQuery<T>(
	client: HelixClient,
	selector: QuerySelector,
): Promise<GraphNode<T>[]> {
	const result = await client.query<unknown>(selector.queryName, selector.params);
	const rows = toRowArray<Record<string, unknown>>(result.data);
	return rows.map((row, index) =>
		toGraphNode<T>(selector.nodeType, row, `${selector.nodeType}-${index}`),
	);
}

function getStringFilter(filters: Record<string, unknown>, key: string): string | undefined {
	const value = filters[key];
	return typeof value === "string" ? value : undefined;
}

function getQueryText(filters: Record<string, unknown>): string | undefined {
	return getStringFilter(filters, "query_text");
}

/**
 * Get a node by ID.
 *
 * @param client - HelixDB client
 * @param nodeId - Node ID
 * @returns The node or null if not found
 */
export async function getNode<T = Record<string, unknown>>(
	client: HelixClient,
	nodeId: string,
): Promise<GraphNode<T> | null> {
	const lookups: QuerySelector[] = [
		{ queryName: "GetDecisionById", params: { decision_id: nodeId }, nodeType: "TradeDecision" },
		{ queryName: "GetExternalEventById", params: { event_id: nodeId }, nodeType: "ExternalEvent" },
		{ queryName: "GetFilingChunkById", params: { chunk_id: nodeId }, nodeType: "FilingChunk" },
		{
			queryName: "GetTranscriptChunkById",
			params: { chunk_id: nodeId },
			nodeType: "TranscriptChunk",
		},
		{
			queryName: "GetNewsItemById",
			params: { news_item_id: nodeId },
			nodeType: "NewsItem",
		},
		{ queryName: "GetThesisById", params: { thesis_id: nodeId }, nodeType: "ThesisMemory" },
		{
			queryName: "GetHypothesisById",
			params: { hypothesis_id: nodeId },
			nodeType: "ResearchHypothesis",
		},
		{ queryName: "GetPaperById", params: { paper_id: nodeId }, nodeType: "AcademicPaper" },
		{ queryName: "GetCompanyBySymbol", params: { symbol: nodeId }, nodeType: "Company" },
		{ queryName: "GetMacroEntityById", params: { entity_id: nodeId }, nodeType: "MacroEntity" },
	];

	for (const selector of lookups) {
		try {
			const nodes = await executeNodeQuery<T>(client, selector);
			const first = nodes[0];
			if (first) {
				return first;
			}
		} catch {
			// Ignore lookup query mismatches and continue probing known node types.
		}
	}

	return null;
}

interface NodeQueryContext {
	filters: Record<string, unknown>;
	limit: number;
	nodeType: string;
	queryText?: string;
}

type NodeSelectorResolver = (context: NodeQueryContext) => QuerySelector[];

const resolveTradeDecisionSelectors: NodeSelectorResolver = (context) => {
	const decisionId = getStringFilter(context.filters, "decision_id");
	if (decisionId) {
		return [
			{
				queryName: "GetDecisionById",
				params: { decision_id: decisionId },
				nodeType: context.nodeType,
			},
		];
	}

	if (!context.queryText) {
		return [];
	}

	const instrumentId = getStringFilter(context.filters, "instrument_id");
	return [
		instrumentId
			? {
					queryName: "SearchDecisionsByInstrument",
					params: {
						query_text: context.queryText,
						instrument_id: instrumentId,
						limit: context.limit,
					},
					nodeType: context.nodeType,
				}
			: {
					queryName: "SearchSimilarDecisions",
					params: { query_text: context.queryText, limit: context.limit },
					nodeType: context.nodeType,
				},
	];
};

const resolveExternalEventSelectors: NodeSelectorResolver = (context) => {
	if (!context.queryText) {
		return [];
	}

	const eventType = getStringFilter(context.filters, "event_type");
	return [
		eventType
			? {
					queryName: "SearchExternalEventsByType",
					params: {
						query: context.queryText,
						event_type: eventType,
						limit: context.limit,
					},
					nodeType: context.nodeType,
				}
			: {
					queryName: "SearchExternalEvents",
					params: { query: context.queryText, limit: context.limit },
					nodeType: context.nodeType,
				},
	];
};

const resolveFilingSelectors: NodeSelectorResolver = (context) => {
	if (!context.queryText) {
		return [];
	}

	const companySymbol = getStringFilter(context.filters, "company_symbol");
	return [
		companySymbol
			? {
					queryName: "SearchFilingsByCompany",
					params: {
						query: context.queryText,
						company_symbol: companySymbol,
						limit: context.limit,
					},
					nodeType: context.nodeType,
				}
			: {
					queryName: "SearchFilings",
					params: { query: context.queryText, limit: context.limit },
					nodeType: context.nodeType,
				},
	];
};

const resolveTranscriptSelectors: NodeSelectorResolver = (context) => {
	if (!context.queryText) {
		return [];
	}

	const companySymbol = getStringFilter(context.filters, "company_symbol");
	return [
		companySymbol
			? {
					queryName: "SearchTranscriptsByCompany",
					params: {
						query: context.queryText,
						company_symbol: companySymbol,
						limit: context.limit,
					},
					nodeType: context.nodeType,
				}
			: {
					queryName: "SearchTranscripts",
					params: { query: context.queryText, limit: context.limit },
					nodeType: context.nodeType,
				},
	];
};

const resolveNewsSelectors: NodeSelectorResolver = (context) => {
	if (!context.queryText) {
		return [];
	}

	return [
		{
			queryName: "SearchNews",
			params: { query: context.queryText, limit: context.limit },
			nodeType: context.nodeType,
		},
	];
};

const resolveCompanySelectors: NodeSelectorResolver = (context) => {
	const symbol = getStringFilter(context.filters, "symbol");
	if (symbol) {
		return [
			{
				queryName: "GetCompanyBySymbol",
				params: { symbol },
				nodeType: context.nodeType,
			},
		];
	}

	const sector = getStringFilter(context.filters, "sector");
	if (!sector) {
		return [];
	}

	return [
		{
			queryName: "GetCompaniesBySector",
			params: { sector },
			nodeType: context.nodeType,
		},
	];
};

const resolveMacroEntitySelectors: NodeSelectorResolver = (context) => {
	const entityId = getStringFilter(context.filters, "entity_id");
	if (entityId) {
		return [
			{
				queryName: "GetMacroEntityById",
				params: { entity_id: entityId },
				nodeType: context.nodeType,
			},
		];
	}

	return [
		{
			queryName: "GetAllMacroEntities",
			params: {},
			nodeType: context.nodeType,
		},
	];
};

const resolveThesisSelectors: NodeSelectorResolver = (context) => {
	const thesisId = getStringFilter(context.filters, "thesis_id");
	if (thesisId) {
		return [
			{
				queryName: "GetThesisById",
				params: { thesis_id: thesisId },
				nodeType: context.nodeType,
			},
		];
	}

	if (!context.queryText) {
		return [];
	}

	const outcome = getStringFilter(context.filters, "outcome");
	return [
		outcome
			? {
					queryName: "SearchThesesByOutcome",
					params: {
						query_text: context.queryText,
						outcome,
						limit: context.limit,
					},
					nodeType: context.nodeType,
				}
			: {
					queryName: "SearchSimilarTheses",
					params: { query_text: context.queryText, limit: context.limit },
					nodeType: context.nodeType,
				},
	];
};

const resolveResearchHypothesisSelectors: NodeSelectorResolver = (context) => {
	const hypothesisId = getStringFilter(context.filters, "hypothesis_id");
	if (hypothesisId) {
		return [
			{
				queryName: "GetHypothesisById",
				params: { hypothesis_id: hypothesisId },
				nodeType: context.nodeType,
			},
		];
	}

	if (!context.queryText) {
		return [];
	}

	const status = getStringFilter(context.filters, "status");
	if (status) {
		return [
			{
				queryName: "SearchHypothesesByStatus",
				params: { query_text: context.queryText, status, limit: context.limit },
				nodeType: context.nodeType,
			},
		];
	}

	const mechanism = getStringFilter(context.filters, "market_mechanism");
	return [
		mechanism
			? {
					queryName: "SearchHypothesesByMechanism",
					params: {
						query_text: context.queryText,
						market_mechanism: mechanism,
						limit: context.limit,
					},
					nodeType: context.nodeType,
				}
			: {
					queryName: "SearchSimilarHypotheses",
					params: { query_text: context.queryText, limit: context.limit },
					nodeType: context.nodeType,
				},
	];
};

const resolveAcademicPaperSelectors: NodeSelectorResolver = (context) => {
	const paperId = getStringFilter(context.filters, "paper_id");
	if (paperId) {
		return [
			{
				queryName: "GetPaperById",
				params: { paper_id: paperId },
				nodeType: context.nodeType,
			},
		];
	}

	if (!context.queryText) {
		return [];
	}

	return [
		{
			queryName: "SearchAcademicPapers",
			params: { query_text: context.queryText, limit: context.limit },
			nodeType: context.nodeType,
		},
	];
};

const NODE_TYPE_RESOLVERS: Record<string, NodeSelectorResolver> = {
	AcademicPaper: resolveAcademicPaperSelectors,
	Company: resolveCompanySelectors,
	ExternalEvent: resolveExternalEventSelectors,
	FilingChunk: resolveFilingSelectors,
	MacroEntity: resolveMacroEntitySelectors,
	NewsItem: resolveNewsSelectors,
	ResearchHypothesis: resolveResearchHypothesisSelectors,
	ThesisMemory: resolveThesisSelectors,
	TradeDecision: resolveTradeDecisionSelectors,
	TranscriptChunk: resolveTranscriptSelectors,
};

/**
 * Get nodes by type.
 *
 * @param client - HelixDB client
 * @param nodeType - Node type
 * @param options - Query options
 * @returns Matching nodes
 */
export async function getNodesByType<T = Record<string, unknown>>(
	client: HelixClient,
	nodeType: string,
	options: { limit?: number; filters?: Record<string, unknown> } = {},
): Promise<GraphNode<T>[]> {
	const limit = options.limit ?? 100;
	const filters = options.filters ?? {};
	const resolver = NODE_TYPE_RESOLVERS[nodeType];
	if (!resolver) {
		return [];
	}

	const selectors = resolver({
		filters,
		limit,
		nodeType,
		queryText: getQueryText(filters),
	});

	if (selectors.length === 0) {
		return [];
	}

	const nodes = await Promise.all(
		selectors.map((selector) => executeNodeQuery<T>(client, selector)),
	);
	return nodes.flat().slice(0, limit);
}

/**
 * Get company-related nodes (filings, transcripts, news).
 *
 * @param client - HelixDB client
 * @param companySymbol - Company ticker symbol
 * @param nodeTypes - Types of nodes to retrieve
 * @returns Related nodes
 */
export async function getCompanyNodes(
	client: HelixClient,
	companySymbol: string,
	nodeTypes: ("FilingChunk" | "TranscriptChunk" | "NewsItem")[] = [
		"FilingChunk",
		"TranscriptChunk",
		"NewsItem",
	],
): Promise<GraphNode[]> {
	const selectors: QuerySelector[] = [];
	for (const nodeType of nodeTypes) {
		if (nodeType === "FilingChunk") {
			selectors.push({
				queryName: "GetCompanyFilings",
				params: { symbol: companySymbol },
				nodeType,
			});
			continue;
		}
		if (nodeType === "TranscriptChunk") {
			selectors.push({
				queryName: "GetCompanyTranscripts",
				params: { symbol: companySymbol },
				nodeType,
			});
			continue;
		}
		selectors.push({
			queryName: "GetCompanyNews",
			params: { symbol: companySymbol },
			nodeType: "NewsItem",
		});
	}

	const nodeGroups = await Promise.all(
		selectors.map((selector) => executeNodeQuery<Record<string, unknown>>(client, selector)),
	);
	return nodeGroups.flat();
}
