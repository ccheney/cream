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
	const citations: Citation[] = [];

	const influencingNodes = await getInfluencingEvents(client, decisionId);

	for (const node of influencingNodes) {
		const props = node.properties as Record<string, unknown>;

		if (node.type === "ExternalEvent") {
			citations.push({
				id: String(props.event_id ?? node.id),
				sourceType: "event",
				title: String(props.text_summary ?? props.event_type ?? "External Event"),
				source: String(props.event_type ?? "Unknown"),
				snippet: String(props.payload ?? props.text_summary ?? ""),
				relevanceScore: 0.8,
				fetchedAt: String(props.event_time ?? new Date().toISOString()),
			});
		} else if (node.type === "NewsItem") {
			citations.push({
				id: String(props.item_id ?? node.id),
				sourceType: "news",
				title: String(props.headline ?? "News Item"),
				source: String(props.source ?? "Unknown"),
				snippet: String(props.body_text ?? props.headline ?? "").slice(0, 500),
				relevanceScore: props.sentiment_score ? Math.abs(Number(props.sentiment_score)) : 0.7,
				fetchedAt: String(props.published_at ?? new Date().toISOString()),
			});
		} else if (node.type === "FilingChunk") {
			citations.push({
				id: String(props.chunk_id ?? node.id),
				sourceType: "filing",
				url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${props.company_symbol}`,
				title: `${props.filing_type} Filing - ${props.company_symbol}`,
				source: "SEC EDGAR",
				snippet: String(props.chunk_text ?? "").slice(0, 500),
				relevanceScore: 0.75,
				fetchedAt: String(props.filing_date ?? new Date().toISOString()),
			});
		} else if (node.type === "TranscriptChunk") {
			citations.push({
				id: String(props.chunk_id ?? node.id),
				sourceType: "transcript",
				title: `Earnings Call - ${props.company_symbol} (${props.call_date})`,
				source: String(props.speaker ?? "Earnings Call"),
				snippet: String(props.chunk_text ?? "").slice(0, 500),
				relevanceScore: 0.7,
				fetchedAt: String(props.call_date ?? new Date().toISOString()),
			});
		}
	}

	citations.sort((a, b) => b.relevanceScore - a.relevanceScore);

	return citations;
}
