/**
 * Citation Functions
 *
 * Functions for retrieving citations and sources for trade decisions.
 *
 * @see docs/plans/04-memory-helixdb.md
 */

import type { HelixClient } from "../../client.js";
import { getInfluencingEvents } from "./relationships.js";

/**
 * Citation source type
 */
export type CitationSourceType = "news" | "filing" | "transcript" | "memory" | "event";

/**
 * Citation for a trade decision
 */
export interface Citation {
	/** Unique identifier */
	id: string;
	/** Source type */
	sourceType: CitationSourceType;
	/** URL if available */
	url?: string;
	/** Title or headline */
	title: string;
	/** Source name (e.g., "Reuters", "SEC EDGAR") */
	source: string;
	/** Relevant text snippet */
	snippet: string;
	/** Relevance/influence score (0-1) */
	relevanceScore: number;
	/** When the citation was fetched/created */
	fetchedAt: string;
}

type InfluencingNode = Awaited<ReturnType<typeof getInfluencingEvents>>[number];
type CitationBuilder = (
	node: InfluencingNode,
	props: Record<string, unknown>,
	defaultTimestamp: string,
) => Citation;

function toText(value: unknown, fallback = ""): string {
	if (typeof value === "string") {
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return fallback;
}

function toMagnitudeScore(value: unknown, fallback: number): number {
	if (!value) {
		return fallback;
	}
	return Math.abs(Number(value));
}

const CITATION_BUILDERS: Record<string, CitationBuilder> = {
	ExternalEvent: (node, props, defaultTimestamp) => ({
		id: toText(props.event_id, node.id),
		sourceType: "event",
		title: toText(props.text_summary, toText(props.event_type, "External Event")),
		source: toText(props.event_type, "Unknown"),
		snippet: toText(props.payload, toText(props.text_summary)),
		relevanceScore: 0.8,
		fetchedAt: toText(props.event_time, defaultTimestamp),
	}),
	NewsItem: (node, props, defaultTimestamp) => ({
		id: toText(props.item_id, node.id),
		sourceType: "news",
		title: toText(props.headline, "News Item"),
		source: toText(props.source, "Unknown"),
		snippet: toText(props.body_text, toText(props.headline)).slice(0, 500),
		relevanceScore: toMagnitudeScore(props.sentiment_score, 0.7),
		fetchedAt: toText(props.published_at, defaultTimestamp),
	}),
	FilingChunk: (node, props, defaultTimestamp) => {
		const symbol = toText(props.company_symbol);
		return {
			id: toText(props.chunk_id, node.id),
			sourceType: "filing",
			url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${symbol}`,
			title: `${toText(props.filing_type)} Filing - ${symbol}`,
			source: "SEC EDGAR",
			snippet: toText(props.chunk_text).slice(0, 500),
			relevanceScore: 0.75,
			fetchedAt: toText(props.filing_date, defaultTimestamp),
		};
	},
	TranscriptChunk: (node, props, defaultTimestamp) => ({
		id: toText(props.chunk_id, node.id),
		sourceType: "transcript",
		title: `Earnings Call - ${toText(props.company_symbol)} (${toText(props.call_date)})`,
		source: toText(props.speaker, "Earnings Call"),
		snippet: toText(props.chunk_text).slice(0, 500),
		relevanceScore: 0.7,
		fetchedAt: toText(props.call_date, defaultTimestamp),
	}),
};

function buildCitation(node: InfluencingNode, defaultTimestamp: string): Citation | undefined {
	const builder = CITATION_BUILDERS[node.type];
	if (!builder) {
		return undefined;
	}
	return builder(node, node.properties as Record<string, unknown>, defaultTimestamp);
}

/**
 * Get citations for a trade decision.
 *
 * Retrieves all sources that influenced the decision:
 * - News items that mentioned related symbols
 * - Filing chunks from SEC filings
 * - Transcript chunks from earnings calls
 * - External events that influenced the decision
 *
 * @param client - HelixDB client
 * @param decisionId - Trade decision ID
 * @returns Array of citations
 *
 * @example
 * ```typescript
 * const citations = await getDecisionCitations(client, "decision-123");
 * for (const citation of citations) {
 *   console.log(`[${citation.sourceType}] ${citation.title}`);
 * }
 * ```
 */
export async function getDecisionCitations(
	client: HelixClient,
	decisionId: string,
): Promise<Citation[]> {
	const defaultTimestamp = new Date().toISOString();
	const influencingNodes = await getInfluencingEvents(client, decisionId);
	return influencingNodes
		.map((node) => buildCitation(node, defaultTimestamp))
		.filter((citation): citation is Citation => citation !== undefined)
		.toSorted((a, b) => b.relevanceScore - a.relevanceScore);
}
