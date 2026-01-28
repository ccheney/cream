/**
 * Traces Routes
 *
 * Proxy endpoints for querying OpenObserve telemetry data.
 * Used by the agents page to display cycle traces and agent activity.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import log from "../logger.js";

// ============================================
// OpenObserve Configuration
// ============================================

const OTEL_ENDPOINT = Bun.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const ZO_AUTH_TOKEN = Bun.env.ZO_AUTH_TOKEN;

// ============================================
// Schemas
// ============================================

const ToolCallSchema = z.object({
	id: z.string(),
	name: z.string(),
	input: z.record(z.string(), z.unknown()),
	output: z.unknown().optional(),
	status: z.enum(["pending", "complete", "error"]),
	durationMs: z.number().optional(),
	timestamp: z.string(),
});

const AgentDataSchema = z.object({
	/** Raw agent name from telemetry (e.g., "Head Trader", "Bullish Research Analyst") */
	name: z.string(),
	/** Normalized agent type for UI display (e.g., "trader", "bullish") */
	type: z.string(),
	status: z.enum(["pending", "running", "complete", "error"]),
	reasoning: z.string().optional(),
	input: z.string().optional(),
	output: z.string().optional(),
	toolCalls: z.array(ToolCallSchema),
	startTime: z.string().optional(),
	endTime: z.string().optional(),
	durationMs: z.number().optional(),
});

const CycleDataSchema = z.object({
	id: z.string(),
	startTime: z.string(),
	endTime: z.string().optional(),
	status: z.enum(["running", "complete", "error"]),
	agents: z.record(z.string(), AgentDataSchema),
});

const CycleListItemSchema = z.object({
	id: z.string(),
	startTime: z.string(),
	status: z.enum(["running", "complete", "error"]),
});

// ============================================
// Helpers
// ============================================

interface OpenObserveHit {
	_timestamp: number;
	trace_id: string;
	span_id: string;
	operation_name: string;
	duration: number;
	start_time: number;
	end_time: number;
	service_name?: string;
	span_status?: string;
	status_code?: number;
	[key: string]: unknown;
}

interface OpenObserveResponse {
	hits: OpenObserveHit[];
	total: number;
}

async function queryOpenObserve(
	sql: string,
	startTime: number,
	endTime: number,
): Promise<OpenObserveHit[]> {
	if (!OTEL_ENDPOINT || !ZO_AUTH_TOKEN) {
		log.warn("OpenObserve not configured - OTEL_EXPORTER_OTLP_ENDPOINT, ZO_AUTH_TOKEN required");
		return [];
	}

	// Derive search URL from OTLP endpoint (replace /v1/traces with /_search?type=traces)
	const url = OTEL_ENDPOINT.replace("/v1/traces", "/_search?type=traces");

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Basic ${ZO_AUTH_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query: {
					sql,
					start_time: startTime,
					end_time: endTime,
					from: 0,
					size: 1000,
				},
			}),
		});

		if (!response.ok) {
			const text = await response.text();
			log.error({ status: response.status, body: text }, "OpenObserve query failed");
			throw new Error(`OpenObserve query failed: ${response.status}`);
		}

		const data = (await response.json()) as OpenObserveResponse;
		return data.hits ?? [];
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"OpenObserve query error",
		);
		throw error;
	}
}

interface ParsedAgent {
	rawName: string;
	normalizedType: string;
}

/**
 * Known agent type mappings from human-readable names to normalized types.
 * The frontend uses these normalized types for icons, colors, and display metadata.
 * New agents are automatically detected and returned with their slug as the type.
 */
const KNOWN_AGENT_MAPPINGS: Record<string, string> = {
	bullish: "bullish",
	bearish: "bearish",
	fundamental: "fundamentals",
	macro: "fundamentals",
	news: "news",
	sentiment: "news",
	grounding: "grounding",
	trader: "trader",
	risk: "risk",
	auditor: "critic",
	critic: "critic",
};

function parseAgentInfo(operationName: string): ParsedAgent | null {
	// Parse Mastra agent span names like "invoke_agent Head Trader", "invoke_agent Bullish Research Analyst", etc.
	const match = operationName.match(/^invoke_agent\s+(.+)$/);
	if (!match?.[1]) return null;

	const rawName = match[1];
	const lowerName = rawName.toLowerCase();

	// Try to match against known agent mappings
	for (const [keyword, normalizedType] of Object.entries(KNOWN_AGENT_MAPPINGS)) {
		if (lowerName.includes(keyword)) {
			return { rawName, normalizedType };
		}
	}

	// For unknown agents, create a slug from the name (e.g., "New Agent Type" -> "new-agent-type")
	const slug = rawName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");

	return { rawName, normalizedType: slug };
}

function transformHitsToCycleData(
	hits: OpenObserveHit[],
	cycleId: string,
): z.infer<typeof CycleDataSchema> | null {
	if (hits.length === 0) return null;

	const agents: Record<string, z.infer<typeof AgentDataSchema>> = {};
	let cycleStartTime: number | null = null;
	let cycleEndTime: number | null = null;
	let cycleStatus: "running" | "complete" | "error" = "running";

	// Group spans by agent type, storing both the ParsedAgent info and spans
	// Key: normalized agent type, Value: { info, spans, traceId }
	const agentSpans = new Map<
		string,
		{ info: ParsedAgent; spans: OpenObserveHit[]; traceId: string }
	>();
	// Key: trace_id (tools are in the same trace as their agent), Value: tool spans
	const toolSpansByTrace = new Map<string, OpenObserveHit[]>();

	for (const hit of hits) {
		const operationName = hit.operation_name;

		// Track cycle timing
		if (cycleStartTime === null || hit.start_time < cycleStartTime) {
			cycleStartTime = hit.start_time;
		}
		if (hit.end_time && (cycleEndTime === null || hit.end_time > cycleEndTime)) {
			cycleEndTime = hit.end_time;
		}

		// Check for workflow-level spans (Mastra uses "invoke_workflow trading-cycle" naming)
		if (operationName.startsWith("invoke_workflow ")) {
			// status_code: 1 = OK, 2 = ERROR in OpenTelemetry
			if (hit.status_code === 2) {
				cycleStatus = "error";
			} else if (hit.end_time && cycleStatus !== "error") {
				cycleStatus = "complete";
			}
			continue;
		}

		// Parse agent spans
		const agentInfo = parseAgentInfo(operationName);
		if (agentInfo) {
			const existing = agentSpans.get(agentInfo.normalizedType);
			if (existing) {
				existing.spans.push(hit);
			} else {
				agentSpans.set(agentInfo.normalizedType, {
					info: agentInfo,
					spans: [hit],
					traceId: hit.trace_id,
				});
			}
			continue;
		}

		// Parse tool call spans (Mastra uses "execute_tool {tool_name}" naming)
		// Tools are in the same trace as their parent agent
		if (operationName.startsWith("execute_tool ")) {
			const traceId = hit.trace_id;
			const existing = toolSpansByTrace.get(traceId) ?? [];
			existing.push(hit);
			toolSpansByTrace.set(traceId, existing);
		}
	}

	// Build agent data
	for (const [agentType, { info, spans, traceId }] of agentSpans) {
		const primarySpan = spans[0];
		if (!primarySpan) continue;

		const toolCalls: z.infer<typeof ToolCallSchema>[] = [];

		// Find tool calls for this agent by matching trace_id
		// (tools are in the same trace as their agent)
		const agentToolSpans = toolSpansByTrace.get(traceId) ?? [];
		for (const toolSpan of agentToolSpans) {
			// Extract tool name from "execute_tool {name}" format
			const toolName = toolSpan.operation_name.replace("execute_tool ", "");

			// Parse tool input from gen_ai_tool_call_arguments (JSON string)
			let toolInput: Record<string, unknown> = {};
			if (toolSpan.gen_ai_tool_call_arguments) {
				try {
					toolInput = JSON.parse(toolSpan.gen_ai_tool_call_arguments as string);
				} catch {
					// If parsing fails, wrap raw value
					toolInput = { raw: toolSpan.gen_ai_tool_call_arguments };
				}
			}

			// Parse tool output from gen_ai_tool_call_result (may be JSON string or raw value)
			let toolOutput: unknown;
			if (toolSpan.gen_ai_tool_call_result !== undefined) {
				try {
					toolOutput = JSON.parse(toolSpan.gen_ai_tool_call_result as string);
				} catch {
					// If parsing fails, use raw value
					toolOutput = toolSpan.gen_ai_tool_call_result;
				}
			}

			toolCalls.push({
				id: toolSpan.span_id,
				name: toolName,
				input: toolInput,
				output: toolOutput,
				status: toolSpan.status_code === 2 ? "error" : toolSpan.end_time ? "complete" : "pending",
				durationMs: toolSpan.duration ? Math.round(toolSpan.duration / 1_000) : undefined,
				timestamp: new Date(toolSpan.start_time / 1_000_000).toISOString(),
			});
		}

		let status: "pending" | "running" | "complete" | "error" = "pending";
		if (primarySpan.status_code === 2) {
			status = "error";
		} else if (primarySpan.end_time) {
			status = "complete";
		} else if (primarySpan.start_time) {
			status = "running";
		}

		// Extract agent input from prompt attribute (Mastra span attribute)
		// Note: OpenObserve converts dots to underscores in attribute names
		let agentInput: string | undefined;
		if (primarySpan.prompt) {
			agentInput = primarySpan.prompt as string;
		} else if (primarySpan.mastra_agent_prompt) {
			agentInput = primarySpan.mastra_agent_prompt as string;
		} else if (primarySpan.gen_ai_prompt_0_content) {
			agentInput = primarySpan.gen_ai_prompt_0_content as string;
		} else if (primarySpan.gen_ai_request_prompt) {
			agentInput = primarySpan.gen_ai_request_prompt as string;
		} else if (primarySpan.input) {
			agentInput = primarySpan.input as string;
		}

		// Debug: log available attributes when input is not found
		if (!agentInput) {
			const inputRelatedAttrs = Object.keys(primarySpan).filter(
				(k) => k.includes("prompt") || k.includes("input") || k.includes("message"),
			);
			log.debug(
				{ agentType, inputRelatedAttrs, allAttrs: Object.keys(primarySpan) },
				"[traces] No agent input found, available attributes",
			);
		}

		// Extract agent output from mastra_agent_run_output (JSON string)
		let agentOutput: string | undefined;
		if (primarySpan.mastra_agent_run_output) {
			try {
				const parsed = JSON.parse(primarySpan.mastra_agent_run_output as string);
				// The output structure is { text: string, object: {...}, files: [] }
				// Use the text field for display, or stringify the object if text is empty
				if (parsed.text) {
					agentOutput = parsed.text;
				} else if (parsed.object) {
					agentOutput = JSON.stringify(parsed.object, null, 2);
				}
			} catch {
				// If parsing fails, use raw value
				agentOutput = primarySpan.mastra_agent_run_output as string;
			}
		}

		// Extract reasoning from gen_ai.output.messages or reasoning-specific attributes
		let agentReasoning: string | undefined;
		if (primarySpan.gen_ai_output_messages) {
			try {
				const messages = JSON.parse(primarySpan.gen_ai_output_messages as string);
				// Look for reasoning parts in messages
				for (const msg of Array.isArray(messages) ? messages : [messages]) {
					if (msg.parts) {
						for (const part of msg.parts) {
							if (part.type === "reasoning" && part.details) {
								agentReasoning = Array.isArray(part.details)
									? part.details.join("\n")
									: String(part.details);
								break;
							}
						}
					}
					if (msg.reasoning) {
						agentReasoning = msg.reasoning;
						break;
					}
				}
			} catch {
				// Ignore parse errors
			}
		}
		// Also check for direct reasoning attribute
		if (!agentReasoning && primarySpan.reasoning) {
			agentReasoning = primarySpan.reasoning as string;
		}
		if (!agentReasoning && primarySpan["mastra.reasoning"]) {
			agentReasoning = primarySpan["mastra.reasoning"] as string;
		}

		agents[agentType] = {
			name: info.rawName,
			type: agentType,
			status,
			reasoning: agentReasoning,
			input: agentInput,
			output: agentOutput,
			toolCalls,
			startTime: primarySpan.start_time
				? new Date(primarySpan.start_time / 1_000_000).toISOString()
				: undefined,
			endTime: primarySpan.end_time
				? new Date(primarySpan.end_time / 1_000_000).toISOString()
				: undefined,
			durationMs: primarySpan.duration ? Math.round(primarySpan.duration / 1_000) : undefined,
		};
	}

	return {
		id: cycleId,
		startTime: cycleStartTime
			? new Date(cycleStartTime / 1_000_000).toISOString()
			: new Date().toISOString(),
		endTime: cycleEndTime ? new Date(cycleEndTime / 1_000_000).toISOString() : undefined,
		status: cycleStatus,
		agents,
	};
}

// ============================================
// Routes
// ============================================

const app = new OpenAPIHono();

// GET /api/traces/cycles - List recent cycles
const listCyclesRoute = createRoute({
	method: "get",
	path: "/cycles",
	request: {
		query: z.object({
			limit: z.string().optional().default("20"),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: z.array(CycleListItemSchema) } },
			description: "List of recent cycles",
		},
	},
	tags: ["Traces"],
});

app.openapi(listCyclesRoute, async (c) => {
	const { limit } = c.req.valid("query");
	const limitNum = Math.min(Number.parseInt(limit, 10) || 20, 100);

	// Query for distinct trading-cycle workflow traces in the last 30 days
	const now = Date.now() * 1000; // microseconds
	const monthAgo = now - 30 * 24 * 60 * 60 * 1000 * 1000;

	// Find workflow traces (the actual OODA cycles)
	// Mastra OTEL exports to "default" stream
	// Note: streaming workflows don't create invoke_workflow span, so we look for workflow_step observe-market
	const sql = `
		SELECT trace_id, MIN(start_time) as start_time, MAX(end_time) as end_time,
		       MAX(CASE WHEN status_code = 2 THEN 1 ELSE 0 END) as has_error
		FROM "default"
		WHERE operation_name = 'workflow_step observe-market'
		GROUP BY trace_id
		ORDER BY start_time DESC
		LIMIT ${limitNum}
	`;

	try {
		const hits = await queryOpenObserve(sql, monthAgo, now);

		const cycles: z.infer<typeof CycleListItemSchema>[] = hits.map((hit) => ({
			id: hit.trace_id,
			startTime: new Date((hit.start_time as number) / 1_000_000).toISOString(),
			status: hit.has_error ? "error" : hit.end_time ? "complete" : "running",
		}));

		return c.json(cycles);
	} catch {
		return c.json([]);
	}
});

// GET /api/traces/cycles/latest - Get the latest/current cycle
const latestCycleRoute = createRoute({
	method: "get",
	path: "/cycles/latest",
	responses: {
		200: {
			content: { "application/json": { schema: CycleDataSchema.nullable() } },
			description: "Latest cycle data",
		},
	},
	tags: ["Traces"],
});

app.openapi(latestCycleRoute, async (c) => {
	// Query for the most recent trading-cycle workflow in the last 30 days
	const now = Date.now() * 1000;
	const monthAgo = now - 30 * 24 * 60 * 60 * 1000 * 1000;

	// First, find the latest trading-cycle workflow
	// Note: streaming workflows don't create invoke_workflow span, so we look for workflow_step observe-market
	const latestSql = `
		SELECT trace_id, MIN(start_time) as start_time, MAX(end_time) as end_time
		FROM "default"
		WHERE operation_name = 'workflow_step observe-market'
		GROUP BY trace_id
		ORDER BY start_time DESC
		LIMIT 1
	`;

	try {
		const latestHits = await queryOpenObserve(latestSql, monthAgo, now);
		const latestHit = latestHits[0];

		log.info({ latestHit, hitCount: latestHits.length }, "[traces] latestCycle query result");

		if (!latestHit) {
			return c.json(null);
		}

		const cycleId = latestHit.trace_id;
		const cycleStartTime = latestHit.start_time as number;
		// Extend window to capture all agents - cycles can run for several minutes
		// Use 30 minutes after start, or current time if cycle might still be running
		const thirtyMinutesNs = 30 * 60 * 1000 * 1000 * 1000; // 30 mins in nanoseconds
		const cycleEndTime = Math.min(cycleStartTime + thirtyMinutesNs, now * 1000);

		// Query all relevant spans within the cycle's time window (across all traces)
		// This includes workflow spans, agent spans, and tool spans
		// Note: agents have different trace_ids, so we correlate by time window only
		const cycleSql = `
			SELECT *
			FROM "default"
			WHERE start_time >= ${cycleStartTime} AND start_time <= ${cycleEndTime}
			  AND (operation_name LIKE 'invoke_workflow %'
			       OR operation_name LIKE 'invoke_agent %'
			       OR operation_name LIKE 'execute_tool %')
			ORDER BY start_time ASC
		`;

		const cycleHits = await queryOpenObserve(cycleSql, monthAgo, now);
		const opNames = cycleHits.map((h) => h.operation_name);
		log.debug(
			{ cycleId, cycleStartTime, cycleEndTime, hitCount: cycleHits.length, operations: opNames },
			"[traces] cycle spans query",
		);

		const cycleData = transformHitsToCycleData(cycleHits, cycleId);
		log.debug(
			{
				cycleId,
				agentCount: cycleData ? Object.keys(cycleData.agents).length : 0,
				agentTypes: cycleData ? Object.keys(cycleData.agents) : [],
			},
			"[traces] transformed data",
		);

		return c.json(cycleData);
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"[traces] latestCycle error",
		);
		return c.json(null);
	}
});

// GET /api/traces/cycles/:cycleId - Get a specific cycle
const getCycleRoute = createRoute({
	method: "get",
	path: "/cycles/:cycleId",
	request: {
		params: z.object({
			cycleId: z.string(),
		}),
	},
	responses: {
		200: {
			content: { "application/json": { schema: CycleDataSchema.nullable() } },
			description: "Cycle data",
		},
		404: {
			content: { "application/json": { schema: z.object({ error: z.string() }) } },
			description: "Cycle not found",
		},
	},
	tags: ["Traces"],
});

// @ts-expect-error - Hono multi-response type inference issue (see routes/index.ts)
app.openapi(getCycleRoute, async (c) => {
	const { cycleId } = c.req.valid("param");

	// Query spans for this specific cycle (look back 30 days)
	const now = Date.now() * 1000;
	const monthAgo = now - 30 * 24 * 60 * 60 * 1000 * 1000;

	// First, get the workflow span to find its time window
	// Note: streaming workflows don't create invoke_workflow span, so we look for workflow_step observe-market
	const workflowSql = `
		SELECT MIN(start_time) as start_time, MAX(end_time) as end_time
		FROM "default"
		WHERE trace_id = '${cycleId}' AND operation_name = 'workflow_step observe-market'
	`;

	try {
		const workflowHits = await queryOpenObserve(workflowSql, monthAgo, now);
		const workflowHit = workflowHits[0];

		if (!workflowHit?.start_time) {
			return c.json({ error: "Cycle not found" }, 404);
		}

		const cycleStartTime = workflowHit.start_time as number;
		// Extend window to capture all agents - cycles can run for several minutes
		const thirtyMinutesNs = 30 * 60 * 1000 * 1000 * 1000; // 30 mins in nanoseconds
		const cycleEndTime = Math.min(cycleStartTime + thirtyMinutesNs, now * 1000);

		// Query all relevant spans within the cycle's time window (across all traces)
		// Note: agents have different trace_ids, so we correlate by time window only
		const cycleSql = `
			SELECT *
			FROM "default"
			WHERE start_time >= ${cycleStartTime} AND start_time <= ${cycleEndTime}
			  AND (operation_name LIKE 'invoke_workflow %'
			       OR operation_name LIKE 'invoke_agent %'
			       OR operation_name LIKE 'execute_tool %')
			ORDER BY start_time ASC
		`;

		const cycleHits = await queryOpenObserve(cycleSql, monthAgo, now);
		const cycleData = transformHitsToCycleData(cycleHits, cycleId);

		return c.json(cycleData);
	} catch {
		return c.json({ error: "Failed to fetch cycle" }, 404);
	}
});

export default app;
