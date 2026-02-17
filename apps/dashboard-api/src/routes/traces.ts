import { OpenAPIHono } from "@hono/zod-openapi";
import log from "../logger.js";

const OTEL_ENDPOINT = Bun.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const ZO_AUTH_TOKEN = Bun.env.ZO_AUTH_TOKEN;
const THIRTY_DAYS_MICROS = 30 * 24 * 60 * 60 * 1000 * 1000;
const THIRTY_MINUTES_NANOS = 30 * 60 * 1000 * 1000 * 1000;

type OpenObserveHit = Record<string, unknown> & {
	trace_id: string;
	span_id: string;
	operation_name: string;
	duration: number;
	start_time: number;
	end_time: number;
	status_code?: number;
};

type OpenObserveResponse = { hits: OpenObserveHit[]; total: number };
type ParsedAgent = { rawName: string; normalizedType: string };
type AgentSpanGroup = { info: ParsedAgent; spans: OpenObserveHit[]; traceId: string };
type ToolCall = {
	id: string;
	name: string;
	input: Record<string, unknown>;
	output?: unknown;
	status: "pending" | "complete" | "error";
	durationMs?: number;
	timestamp: string;
};
type AgentData = {
	name: string;
	type: string;
	status: "pending" | "running" | "complete" | "error";
	reasoning?: string;
	input?: string;
	output?: string;
	toolCalls: ToolCall[];
	startTime?: string;
	endTime?: string;
	durationMs?: number;
};
type CycleData = {
	id: string;
	startTime: string;
	endTime?: string;
	status: "running" | "complete" | "error";
	agents: Record<string, AgentData>;
};

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

async function queryOpenObserve(
	sql: string,
	startTime: number,
	endTime: number,
): Promise<OpenObserveHit[]> {
	if (!OTEL_ENDPOINT || !ZO_AUTH_TOKEN) {
		log.warn("OpenObserve not configured - OTEL_EXPORTER_OTLP_ENDPOINT, ZO_AUTH_TOKEN required");
		return [];
	}
	const url = OTEL_ENDPOINT.replace("/v1/traces", "/_search?type=traces");
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Basic ${ZO_AUTH_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query: { sql, start_time: startTime, end_time: endTime, from: 0, size: 1000 },
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

function parseAgentInfo(operationName: string): ParsedAgent | null {
	const match = operationName.match(/^invoke_agent\s+(.+)$/);
	if (!match?.[1]) {
		return null;
	}
	const rawName = match[1];
	const lowerName = rawName.toLowerCase();
	for (const [keyword, normalizedType] of Object.entries(KNOWN_AGENT_MAPPINGS)) {
		if (lowerName.includes(keyword)) {
			return { rawName, normalizedType };
		}
	}
	const slug = rawName
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
	return { rawName, normalizedType: slug };
}

function parseJsonOrFallback(value: unknown): unknown {
	if (typeof value !== "string") {
		return value;
	}
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function nsToIso(ns: number | undefined): string | undefined {
	if (!ns) {
		return undefined;
	}
	return new Date(ns / 1_000_000).toISOString();
}

function nsToMs(ns: number | undefined): number | undefined {
	if (!ns) {
		return undefined;
	}
	return Math.round(ns / 1_000);
}

function extractAgentInput(span: OpenObserveHit): string | undefined {
	const fields = [
		span.prompt,
		span.mastra_agent_prompt,
		span.gen_ai_prompt_0_content,
		span.gen_ai_request_prompt,
		span.input,
	];
	return fields.find((f) => typeof f === "string" && f.length > 0) as string | undefined;
}

function extractAgentOutput(span: OpenObserveHit): string | undefined {
	const parsed = parseJsonOrFallback(span.mastra_agent_run_output);
	if (typeof parsed === "string") {
		return parsed;
	}
	if (!parsed || typeof parsed !== "object") {
		return undefined;
	}
	const obj = parsed as { text?: unknown; object?: unknown };
	if (typeof obj.text === "string" && obj.text.length > 0) {
		return obj.text;
	}
	if (obj.object !== undefined) {
		return JSON.stringify(obj.object, null, 2);
	}
	return undefined;
}

function extractReasoningFromPart(part: unknown): string | undefined {
	if (!part || typeof part !== "object") {
		return undefined;
	}
	const p = part as { type?: unknown; details?: unknown };
	if (p.type !== "reasoning" || p.details === undefined) {
		return undefined;
	}
	return Array.isArray(p.details) ? p.details.join("\n") : String(p.details);
}

function extractReasoningFromMessage(message: unknown): string | undefined {
	if (!message || typeof message !== "object") {
		return undefined;
	}
	const msg = message as { parts?: unknown; reasoning?: unknown };
	if (typeof msg.reasoning === "string" && msg.reasoning.length > 0) {
		return msg.reasoning;
	}
	if (!Array.isArray(msg.parts)) {
		return undefined;
	}
	for (const part of msg.parts) {
		const reasoning = extractReasoningFromPart(part);
		if (reasoning) {
			return reasoning;
		}
	}
	return undefined;
}

function extractAgentReasoning(span: OpenObserveHit): string | undefined {
	const parsed = parseJsonOrFallback(span.gen_ai_output_messages);
	const messages = Array.isArray(parsed) ? parsed : [parsed];
	for (const message of messages) {
		const reasoning = extractReasoningFromMessage(message);
		if (reasoning) {
			return reasoning;
		}
	}
	if (typeof span.reasoning === "string" && span.reasoning.length > 0) {
		return span.reasoning;
	}
	const mastraReasoning = span["mastra.reasoning"];
	if (typeof mastraReasoning === "string" && mastraReasoning.length > 0) {
		return mastraReasoning;
	}
	return undefined;
}

function mapToolInput(value: unknown): Record<string, unknown> {
	const parsed = parseJsonOrFallback(value);
	return parsed && typeof parsed === "object"
		? (parsed as Record<string, unknown>)
		: { raw: parsed };
}

function transformToolSpan(toolSpan: OpenObserveHit): ToolCall {
	return {
		id: toolSpan.span_id,
		name: toolSpan.operation_name.replace("execute_tool ", ""),
		input: mapToolInput(toolSpan.gen_ai_tool_call_arguments),
		output: parseJsonOrFallback(toolSpan.gen_ai_tool_call_result),
		status: toolSpan.status_code === 2 ? "error" : toolSpan.end_time ? "complete" : "pending",
		durationMs: nsToMs(toolSpan.duration),
		timestamp: nsToIso(toolSpan.start_time) ?? new Date().toISOString(),
	};
}

function getAgentStatus(span: OpenObserveHit): AgentData["status"] {
	if (span.status_code === 2) {
		return "error";
	}
	if (span.end_time) {
		return "complete";
	}
	if (span.start_time) {
		return "running";
	}
	return "pending";
}

function updateCycleWindow(
	hit: OpenObserveHit,
	window: { start: number | null; end: number | null },
) {
	window.start = window.start === null ? hit.start_time : Math.min(window.start, hit.start_time);
	if (hit.end_time) {
		window.end = window.end === null ? hit.end_time : Math.max(window.end, hit.end_time);
	}
}

function updateCycleStatus(current: CycleData["status"], hit: OpenObserveHit): CycleData["status"] {
	if (!hit.operation_name.startsWith("invoke_workflow ")) {
		return current;
	}
	if (hit.status_code === 2) {
		return "error";
	}
	if (hit.end_time && current !== "error") {
		return "complete";
	}
	return current;
}

function addAgentHit(groups: Map<string, AgentSpanGroup>, hit: OpenObserveHit): boolean {
	const info = parseAgentInfo(hit.operation_name);
	if (!info) {
		return false;
	}
	const existing = groups.get(info.normalizedType);
	if (existing) {
		existing.spans.push(hit);
		return true;
	}
	groups.set(info.normalizedType, { info, spans: [hit], traceId: hit.trace_id });
	return true;
}

function addToolHitByTrace(
	toolSpansByTrace: Map<string, OpenObserveHit[]>,
	hit: OpenObserveHit,
): void {
	if (!hit.operation_name.startsWith("execute_tool ")) {
		return;
	}
	const spans = toolSpansByTrace.get(hit.trace_id) ?? [];
	spans.push(hit);
	toolSpansByTrace.set(hit.trace_id, spans);
}

function collectCycleAndSpanGroups(hits: OpenObserveHit[]) {
	const window = { start: null as number | null, end: null as number | null };
	let cycleStatus: CycleData["status"] = "running";
	const agentSpans = new Map<string, AgentSpanGroup>();
	const toolSpansByTrace = new Map<string, OpenObserveHit[]>();
	for (const hit of hits) {
		updateCycleWindow(hit, window);
		cycleStatus = updateCycleStatus(cycleStatus, hit);
		if (!addAgentHit(agentSpans, hit)) {
			addToolHitByTrace(toolSpansByTrace, hit);
		}
	}
	return {
		cycleStartTime: window.start,
		cycleEndTime: window.end,
		cycleStatus,
		agentSpans,
		toolSpansByTrace,
	};
}

function buildAgentData(
	agentType: string,
	group: AgentSpanGroup,
	toolSpansByTrace: Map<string, OpenObserveHit[]>,
) {
	const primarySpan = group.spans[0];
	if (!primarySpan) {
		return null;
	}
	return {
		name: group.info.rawName,
		type: agentType,
		status: getAgentStatus(primarySpan),
		reasoning: extractAgentReasoning(primarySpan),
		input: extractAgentInput(primarySpan),
		output: extractAgentOutput(primarySpan),
		toolCalls: (toolSpansByTrace.get(group.traceId) ?? []).map(transformToolSpan),
		startTime: nsToIso(primarySpan.start_time),
		endTime: nsToIso(primarySpan.end_time),
		durationMs: nsToMs(primarySpan.duration),
	};
}

function transformHitsToCycleData(hits: OpenObserveHit[], cycleId: string): CycleData | null {
	if (hits.length === 0) {
		return null;
	}
	const grouped = collectCycleAndSpanGroups(hits);
	const agents: Record<string, AgentData> = {};
	for (const [agentType, group] of grouped.agentSpans.entries()) {
		const agentData = buildAgentData(agentType, group, grouped.toolSpansByTrace);
		if (agentData) {
			agents[agentType] = agentData;
		}
	}
	return {
		id: cycleId,
		startTime: nsToIso(grouped.cycleStartTime ?? undefined) ?? new Date().toISOString(),
		endTime: nsToIso(grouped.cycleEndTime ?? undefined),
		status: grouped.cycleStatus,
		agents,
	};
}

function microsWindow() {
	const nowMicros = Date.now() * 1000;
	return { nowMicros, monthAgoMicros: nowMicros - THIRTY_DAYS_MICROS };
}

function cycleSpansSql(cycleStartTime: number, nowMicros: number): string {
	const cycleEndTime = Math.min(cycleStartTime + THIRTY_MINUTES_NANOS, nowMicros * 1000);
	return `SELECT * FROM "default" WHERE start_time >= ${cycleStartTime} AND start_time <= ${cycleEndTime} AND (operation_name LIKE 'invoke_workflow %' OR operation_name LIKE 'invoke_agent %' OR operation_name LIKE 'execute_tool %') ORDER BY start_time ASC`;
}

const app = new OpenAPIHono();

app.get("/cycles", async (c) => {
	const limitNum = Math.min(Number.parseInt(c.req.query("limit") ?? "20", 10) || 20, 100);
	const { nowMicros, monthAgoMicros } = microsWindow();
	const sql = `SELECT trace_id, MIN(start_time) as start_time, MAX(end_time) as end_time, MAX(CASE WHEN status_code = 2 THEN 1 ELSE 0 END) as has_error FROM "default" WHERE operation_name = 'workflow_step observe-market' GROUP BY trace_id ORDER BY start_time DESC LIMIT ${limitNum}`;
	try {
		const hits = await queryOpenObserve(sql, monthAgoMicros, nowMicros);
		return c.json(
			hits.map((hit) => ({
				id: hit.trace_id,
				startTime: new Date((hit.start_time as number) / 1_000_000).toISOString(),
				status: hit.has_error ? "error" : hit.end_time ? "complete" : "running",
			})),
		);
	} catch {
		return c.json([]);
	}
});

app.get("/cycles/latest", async (c) => {
	const { nowMicros, monthAgoMicros } = microsWindow();
	const latestSql = `SELECT trace_id, MIN(start_time) as start_time, MAX(end_time) as end_time FROM "default" WHERE operation_name = 'workflow_step observe-market' GROUP BY trace_id ORDER BY start_time DESC LIMIT 1`;
	try {
		const latestHit = (await queryOpenObserve(latestSql, monthAgoMicros, nowMicros))[0];
		if (!latestHit) {
			return c.json(null);
		}
		const hits = await queryOpenObserve(
			cycleSpansSql(latestHit.start_time as number, nowMicros),
			monthAgoMicros,
			nowMicros,
		);
		return c.json(transformHitsToCycleData(hits, latestHit.trace_id));
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"[traces] latestCycle error",
		);
		return c.json(null);
	}
});

app.get("/cycles/:cycleId", async (c) => {
	const cycleId = c.req.param("cycleId");
	const { nowMicros, monthAgoMicros } = microsWindow();
	const workflowSql = `SELECT MIN(start_time) as start_time, MAX(end_time) as end_time FROM "default" WHERE trace_id = '${cycleId}' AND operation_name = 'workflow_step observe-market'`;
	try {
		const workflowHit = (await queryOpenObserve(workflowSql, monthAgoMicros, nowMicros))[0];
		if (!workflowHit?.start_time) {
			return c.json({ error: "Cycle not found" }, 404);
		}
		const hits = await queryOpenObserve(
			cycleSpansSql(workflowHit.start_time as number, nowMicros),
			monthAgoMicros,
			nowMicros,
		);
		return c.json(transformHitsToCycleData(hits, cycleId));
	} catch {
		return c.json({ error: "Failed to fetch cycle" }, 404);
	}
});

export default app;
