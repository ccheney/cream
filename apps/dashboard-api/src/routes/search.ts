/**
 * Global Search Routes
 *
 * Full-text search API for fuzzy matching across all searchable entities.
 * Uses PostgreSQL full-text search with trigram similarity.
 *
 * @see docs/plans/46-postgres-drizzle-migration.md
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAlertsRepo, getDecisionsRepo, getThesesRepo } from "../db.js";

const app = new OpenAPIHono();

// ============================================
// Schema Definitions
// ============================================

const SearchResultSchema = z.object({
	id: z.string(),
	type: z.enum(["symbol", "decision", "thesis", "alert", "config", "navigation"]),
	title: z.string(),
	subtitle: z.string().nullable(),
	url: z.string(),
	score: z.number(),
});

const SearchResponseSchema = z.object({
	results: z.array(SearchResultSchema),
	query: z.string(),
	timestamp: z.string(),
});

type SearchResult = z.infer<typeof SearchResultSchema>;

// ============================================
// Navigation Items (static)
// ============================================

const NAVIGATION_ITEMS = [
	{
		id: "nav-portfolio",
		title: "Portfolio",
		subtitle: "View positions and P&L",
		url: "/portfolio",
	},
	{
		id: "nav-decisions",
		title: "Decisions",
		subtitle: "Review pending decisions",
		url: "/decisions",
	},
	{ id: "nav-risk", title: "Risk Dashboard", subtitle: "Risk metrics and exposure", url: "/risk" },
	{ id: "nav-charts", title: "Charts", subtitle: "Technical analysis charts", url: "/charts" },
	{ id: "nav-options", title: "Options", subtitle: "Options flow and chains", url: "/options" },
	{ id: "nav-theses", title: "Theses", subtitle: "Investment theses", url: "/theses" },
	{ id: "nav-config", title: "Configuration", subtitle: "System configuration", url: "/config" },
	{ id: "nav-workers", title: "Workers", subtitle: "Worker services status", url: "/workers" },
	{
		id: "nav-indicators",
		title: "Indicators",
		subtitle: "Indicator engine status",
		url: "/indicators",
	},
	{ id: "nav-calendar", title: "Calendar", subtitle: "Market calendar", url: "/calendar" },
	{ id: "nav-console", title: "Console", subtitle: "Agent console", url: "/console" },
	{ id: "nav-agents", title: "Agents", subtitle: "Agent status and outputs", url: "/agents" },
	{
		id: "nav-query-perf",
		title: "Query Performance",
		subtitle: "Database query stats",
		url: "/admin/query-performance",
	},
];

// ============================================
// Helper Functions
// ============================================

function fuzzyScore(query: string, text: string): number {
	const lowerQuery = query.toLowerCase();
	const lowerText = text.toLowerCase();

	// Exact match
	if (lowerText === lowerQuery) {
		return 1.0;
	}

	// Starts with
	if (lowerText.startsWith(lowerQuery)) {
		return 0.9;
	}

	// Contains
	if (lowerText.includes(lowerQuery)) {
		return 0.7;
	}

	// Word match
	const words = lowerText.split(/\s+/);
	for (const word of words) {
		if (word.startsWith(lowerQuery)) {
			return 0.6;
		}
	}

	// Trigram similarity approximation
	const queryGrams = new Set<string>();
	for (let i = 0; i < lowerQuery.length - 2; i++) {
		queryGrams.add(lowerQuery.slice(i, i + 3));
	}

	const textGrams = new Set<string>();
	for (let i = 0; i < lowerText.length - 2; i++) {
		textGrams.add(lowerText.slice(i, i + 3));
	}

	if (queryGrams.size === 0 || textGrams.size === 0) {
		return 0;
	}

	let intersection = 0;
	for (const gram of queryGrams) {
		if (textGrams.has(gram)) {
			intersection++;
		}
	}

	const union = queryGrams.size + textGrams.size - intersection;
	return (intersection / union) * 0.5;
}

function searchNavigation(query: string): SearchResult[] {
	return NAVIGATION_ITEMS.map((item) => {
		const titleScore = fuzzyScore(query, item.title);
		const subtitleScore = item.subtitle ? fuzzyScore(query, item.subtitle) * 0.5 : 0;
		const score = Math.max(titleScore, subtitleScore);
		return { ...item, type: "navigation" as const, score };
	})
		.filter((item) => item.score > 0.3)
		.toSorted((a, b) => b.score - a.score);
}

function addSymbolResult(query: string, results: SearchResult[]): void {
	const isSymbolQuery = /^[A-Z]{1,5}$/i.test(query);
	if (!isSymbolQuery) {
		return;
	}
	const upperSymbol = query.toUpperCase();
	results.push({
		id: `symbol-${upperSymbol}`,
		type: "symbol",
		title: upperSymbol,
		subtitle: "View chart",
		url: `/charts/${upperSymbol}`,
		score: 0.95,
	});
}

async function addDecisionResults(query: string, results: SearchResult[]): Promise<void> {
	const decisionsRows = await getDecisionsRepo().search(query, 5);
	for (const row of decisionsRows) {
		results.push({
			id: `decision-${row.id}`,
			type: "decision",
			title: `${row.symbol} - ${row.action}`,
			subtitle: "Decision",
			url: `/decisions/${row.id}`,
			score: fuzzyScore(query, `${row.symbol} ${row.action}`),
		});
	}
}

async function addThesisResults(query: string, results: SearchResult[]): Promise<void> {
	const thesesRows = await getThesesRepo().search(query, 5);
	for (const row of thesesRows) {
		results.push({
			id: `thesis-${row.thesisId}`,
			type: "thesis",
			title: row.entryThesis?.slice(0, 50) ?? row.instrumentId,
			subtitle: row.instrumentId,
			url: `/theses/${row.thesisId}`,
			score: fuzzyScore(query, `${row.instrumentId} ${row.entryThesis ?? ""}`),
		});
	}
}

async function addAlertResults(query: string, results: SearchResult[]): Promise<void> {
	const alertsRows = await getAlertsRepo().search(query, 5);
	for (const row of alertsRows) {
		results.push({
			id: `alert-${row.id}`,
			type: "alert",
			title: row.message.slice(0, 50),
			subtitle: row.title,
			url: `/alerts#${row.id}`,
			score: fuzzyScore(query, `${row.title} ${row.message}`),
		});
	}
}

async function addDatabaseSearchResults(query: string, results: SearchResult[]): Promise<void> {
	try {
		await Promise.all([
			addDecisionResults(query, results),
			addThesisResults(query, results),
			addAlertResults(query, results),
		]);
	} catch {
		// Search failures should not fail the entire endpoint.
	}
}

// ============================================
// Routes
// ============================================

// GET /search - Full-text search across entities
const searchRoute = createRoute({
	method: "get",
	path: "/",
	request: {
		query: z.object({
			q: z.string().min(1).max(100),
			limit: z.coerce.number().min(1).max(50).default(20).optional(),
		}),
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: SearchResponseSchema,
				},
			},
			description: "Search results",
		},
	},
	tags: ["Search"],
});

app.openapi(searchRoute, async (c) => {
	const { q: query, limit = 20 } = c.req.valid("query");
	const results: SearchResult[] = [];

	results.push(...searchNavigation(query));
	addSymbolResult(query, results);
	await addDatabaseSearchResults(query, results);

	// Sort by score and limit
	const sortedResults = results.toSorted((a, b) => b.score - a.score).slice(0, limit);

	return c.json({
		results: sortedResults,
		query,
		timestamp: new Date().toISOString(),
	});
});

export default app;
