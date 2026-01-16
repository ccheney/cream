/**
 * Global Search Routes
 *
 * Full-text search API for fuzzy matching across all searchable entities.
 * Uses PostgreSQL full-text search with trigram similarity.
 *
 * @see docs/plans/46-postgres-drizzle-migration.md
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import { getDrizzleDb } from "../db.js";

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

// ============================================
// Navigation Items (static)
// ============================================

const NAVIGATION_ITEMS = [
	{ id: "nav-portfolio", title: "Portfolio", subtitle: "View positions and P&L", url: "/portfolio" },
	{ id: "nav-decisions", title: "Decisions", subtitle: "Review pending decisions", url: "/decisions" },
	{ id: "nav-risk", title: "Risk Dashboard", subtitle: "Risk metrics and exposure", url: "/risk" },
	{ id: "nav-charts", title: "Charts", subtitle: "Technical analysis charts", url: "/charts" },
	{ id: "nav-options", title: "Options", subtitle: "Options flow and chains", url: "/options" },
	{ id: "nav-theses", title: "Theses", subtitle: "Investment theses", url: "/theses" },
	{ id: "nav-config", title: "Configuration", subtitle: "System configuration", url: "/config" },
	{ id: "nav-workers", title: "Workers", subtitle: "Worker services status", url: "/workers" },
	{ id: "nav-indicators", title: "Indicators", subtitle: "Indicator engine status", url: "/indicators" },
	{ id: "nav-backtest", title: "Backtest", subtitle: "Backtesting engine", url: "/backtest" },
	{ id: "nav-calendar", title: "Calendar", subtitle: "Market calendar", url: "/calendar" },
	{ id: "nav-console", title: "Console", subtitle: "Agent console", url: "/console" },
	{ id: "nav-agents", title: "Agents", subtitle: "Agent status and outputs", url: "/agents" },
	{ id: "nav-query-perf", title: "Query Performance", subtitle: "Database query stats", url: "/admin/query-performance" },
];

// ============================================
// Helper Functions
// ============================================

function fuzzyScore(query: string, text: string): number {
	const lowerQuery = query.toLowerCase();
	const lowerText = text.toLowerCase();

	// Exact match
	if (lowerText === lowerQuery) return 1.0;

	// Starts with
	if (lowerText.startsWith(lowerQuery)) return 0.9;

	// Contains
	if (lowerText.includes(lowerQuery)) return 0.7;

	// Word match
	const words = lowerText.split(/\s+/);
	for (const word of words) {
		if (word.startsWith(lowerQuery)) return 0.6;
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

	if (queryGrams.size === 0 || textGrams.size === 0) return 0;

	let intersection = 0;
	for (const gram of queryGrams) {
		if (textGrams.has(gram)) intersection++;
	}

	const union = queryGrams.size + textGrams.size - intersection;
	return intersection / union * 0.5;
}

function searchNavigation(query: string): Array<z.infer<typeof SearchResultSchema>> {
	return NAVIGATION_ITEMS
		.map((item) => {
			const titleScore = fuzzyScore(query, item.title);
			const subtitleScore = item.subtitle ? fuzzyScore(query, item.subtitle) * 0.5 : 0;
			const score = Math.max(titleScore, subtitleScore);
			return { ...item, type: "navigation" as const, score };
		})
		.filter((item) => item.score > 0.3)
		.toSorted((a, b) => b.score - a.score);
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
	const db = getDrizzleDb();

	const results: Array<z.infer<typeof SearchResultSchema>> = [];

	// Search navigation (static)
	const navResults = searchNavigation(query);
	results.push(...navResults);

	// Check if query looks like a stock symbol (1-5 uppercase letters)
	const isSymbolQuery = /^[A-Z]{1,5}$/i.test(query);

	if (isSymbolQuery) {
		const upperSymbol = query.toUpperCase();
		// Add symbol as search result
		results.push({
			id: `symbol-${upperSymbol}`,
			type: "symbol",
			title: upperSymbol,
			subtitle: "View chart",
			url: `/charts/${upperSymbol}`,
			score: 0.95,
		});
	}

	try {
		// Search decisions
		const decisionsResult = await db.execute(sql`
			SELECT id, symbol, action_type, created_at
			FROM decisions
			WHERE
				symbol ILIKE ${'%' + query + '%'}
				OR action_type ILIKE ${'%' + query + '%'}
			ORDER BY created_at DESC
			LIMIT 5
		`);

		for (const row of decisionsResult.rows) {
			const r = row as { id: string; symbol: string; action_type: string };
			results.push({
				id: `decision-${r.id}`,
				type: "decision",
				title: `${r.symbol} - ${r.action_type}`,
				subtitle: "Decision",
				url: `/decisions/${r.id}`,
				score: fuzzyScore(query, `${r.symbol} ${r.action_type}`),
			});
		}

		// Search theses
		const thesesResult = await db.execute(sql`
			SELECT id, symbol, title
			FROM thesis_states
			WHERE
				symbol ILIKE ${'%' + query + '%'}
				OR title ILIKE ${'%' + query + '%'}
			ORDER BY created_at DESC
			LIMIT 5
		`);

		for (const row of thesesResult.rows) {
			const r = row as { id: string; symbol: string; title: string };
			results.push({
				id: `thesis-${r.id}`,
				type: "thesis",
				title: r.title,
				subtitle: r.symbol,
				url: `/theses/${r.id}`,
				score: fuzzyScore(query, `${r.symbol} ${r.title}`),
			});
		}

		// Search alerts
		const alertsResult = await db.execute(sql`
			SELECT id, symbol, message
			FROM alerts
			WHERE
				symbol ILIKE ${'%' + query + '%'}
				OR message ILIKE ${'%' + query + '%'}
			ORDER BY created_at DESC
			LIMIT 5
		`);

		for (const row of alertsResult.rows) {
			const r = row as { id: string; symbol: string | null; message: string };
			results.push({
				id: `alert-${r.id}`,
				type: "alert",
				title: r.message.slice(0, 50),
				subtitle: r.symbol,
				url: `/alerts#${r.id}`,
				score: fuzzyScore(query, `${r.symbol ?? ""} ${r.message}`),
			});
		}
	} catch (error) {
		// Database search failed, continue with static results
		console.warn("Database search failed:", error);
	}

	// Sort by score and limit
	const sortedResults = results
		.toSorted((a, b) => b.score - a.score)
		.slice(0, limit);

	return c.json({
		results: sortedResults,
		query,
		timestamp: new Date().toISOString(),
	});
});

export default app;
