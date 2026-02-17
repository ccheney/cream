/**
 * Internal Worker Events Route
 *
 * Accepts streaming events from the worker process and broadcasts
 * them to connected WebSocket clients. This enables real-time
 * agent activity visibility for scheduled trading cycles.
 *
 * Authentication: Uses internal secret (WORKER_INTERNAL_SECRET)
 * to prevent unauthorized access.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { getCyclesRepo } from "../../db.js";
import {
	flushSync,
	queueAgentComplete,
	queueAgentStart,
	queueReasoningDelta,
	queueTextDelta,
	queueToolCall,
	queueToolResult,
	setCyclesRepository,
} from "../../services/cycle-event-persistence.js";
import {
	broadcastAgentOutput,
	broadcastAgentReasoning,
	broadcastAgentSource,
	broadcastAgentTextDelta,
	broadcastAgentToolCall,
	broadcastAgentToolResult,
	broadcastCycleProgress,
	broadcastCycleResult,
} from "../../websocket/handler.js";

const app = new OpenAPIHono();
type WorkerEvent = z.infer<typeof WorkerEventSchema>;
type AgentEvent = z.infer<typeof AgentEventSchema>;

// ============================================
// Authentication Middleware
// ============================================

const INTERNAL_SECRET = Bun.env.WORKER_INTERNAL_SECRET ?? "dev-internal-secret";

/**
 * Validate internal secret for worker-to-dashboard communication.
 */
function validateInternalAuth(authHeader: string | undefined): boolean {
	if (!authHeader) {
		return false;
	}
	const [scheme, token] = authHeader.split(" ");
	if (scheme !== "Bearer" || !token) {
		return false;
	}
	return token === INTERNAL_SECRET;
}

// ============================================
// Schemas
// ============================================

const AgentTypeSchema = z.enum([
	"grounding",
	"news",
	"fundamentals",
	"bullish",
	"bearish",
	"trader",
	"risk",
	"critic",
]);

const CyclePhaseSchema = z.enum(["observe", "orient", "decide", "act", "complete", "error"]);

const AgentEventSchema = z.object({
	type: z.enum(["agent-start", "agent-chunk", "agent-complete", "agent-error"]),
	agentType: AgentTypeSchema,
	cycleId: z.string(),
	timestamp: z.string(),
	// For agent-chunk: chunk data
	chunkType: z
		.enum(["text-delta", "reasoning-delta", "tool-call", "tool-result", "source", "error"])
		.optional(),
	text: z.string().optional(),
	toolCallId: z.string().optional(),
	toolName: z.string().optional(),
	toolArgs: z.string().optional(),
	result: z.string().optional(),
	success: z.boolean().optional(),
	// For source chunks
	sourceType: z.enum(["url", "x"]).optional(),
	url: z.string().optional(),
	title: z.string().optional(),
	domain: z.string().optional(),
	logoUrl: z.string().optional(),
	// For agent-complete/error
	output: z.string().optional(),
	error: z.string().optional(),
	durationMs: z.number().optional(),
});

const CycleProgressEventSchema = z.object({
	type: z.literal("cycle-progress"),
	cycleId: z.string(),
	phase: CyclePhaseSchema,
	step: z.string(),
	progress: z.number().min(0).max(100),
	message: z.string(),
	timestamp: z.string(),
});

const EnvironmentSchema = z.enum(["PAPER", "LIVE"]);

const CycleResultEventSchema = z.object({
	type: z.literal("cycle-result"),
	cycleId: z.string(),
	environment: EnvironmentSchema,
	status: z.enum(["completed", "failed"]),
	durationMs: z.number(),
	approved: z.boolean().optional(),
	iterations: z.number().optional(),
	error: z.string().optional(),
	timestamp: z.string(),
});

const CycleStartEventSchema = z.object({
	type: z.literal("cycle-start"),
	cycleId: z.string(),
	environment: EnvironmentSchema,
	instruments: z.array(z.string()),
	configVersion: z.string().optional(),
	timestamp: z.string(),
});

const WorkerEventSchema = z.discriminatedUnion("type", [
	AgentEventSchema,
	CycleProgressEventSchema,
	CycleResultEventSchema,
	CycleStartEventSchema,
]);

const BatchEventsRequestSchema = z.object({
	events: z.array(WorkerEventSchema),
});

async function handleCycleStartEvent(event: z.infer<typeof CycleStartEventSchema>): Promise<void> {
	try {
		const cyclesRepo = await getCyclesRepo();
		setCyclesRepository(cyclesRepo);
		await cyclesRepo.start(
			event.environment,
			event.instruments.length,
			event.configVersion,
			event.cycleId,
		);
	} catch {}

	broadcastCycleProgress({
		type: "cycle_progress",
		data: {
			cycleId: event.cycleId,
			phase: "observe",
			step: "starting",
			progress: 0,
			message: "Starting trading cycle...",
			timestamp: event.timestamp,
		},
	});
}

function handleCycleProgressEvent(event: z.infer<typeof CycleProgressEventSchema>): void {
	broadcastCycleProgress({
		type: "cycle_progress",
		data: {
			cycleId: event.cycleId,
			phase: event.phase,
			step: event.step,
			progress: event.progress,
			message: event.message,
			timestamp: event.timestamp,
		},
	});
}

async function handleCycleResultEvent(
	event: z.infer<typeof CycleResultEventSchema>,
): Promise<void> {
	try {
		await flushSync(event.cycleId);
	} catch {}

	broadcastCycleResult({
		type: "cycle_result",
		data: {
			cycleId: event.cycleId,
			environment: event.environment,
			status: event.status,
			durationMs: event.durationMs,
			error: event.error,
			result:
				event.status === "completed"
					? {
							approved: event.approved ?? false,
							iterations: event.iterations ?? 0,
							decisions: [],
							orders: [],
						}
					: undefined,
			timestamp: event.timestamp,
		},
	});
}

function handleAgentStartEvent(event: AgentEvent): void {
	broadcastAgentOutput({
		type: "agent_output",
		data: {
			cycleId: event.cycleId,
			agentType: event.agentType,
			status: "running",
			output: `${event.agentType} agent started`,
			timestamp: event.timestamp,
		},
	});
	queueAgentStart(event.cycleId, event.agentType);
}

function handleTextDeltaChunk(event: AgentEvent): void {
	if (!event.text) {
		return;
	}

	broadcastAgentTextDelta({
		type: "agent_text_delta",
		data: {
			cycleId: event.cycleId,
			agentType: event.agentType,
			text: event.text,
			timestamp: event.timestamp,
		},
	});
	queueTextDelta(event.cycleId, event.agentType, event.text);
}

function handleReasoningDeltaChunk(event: AgentEvent): void {
	if (!event.text) {
		return;
	}

	broadcastAgentReasoning({
		type: "agent_reasoning",
		data: {
			cycleId: event.cycleId,
			agentType: event.agentType,
			text: event.text,
			timestamp: event.timestamp,
		},
	});
	queueReasoningDelta(event.cycleId, event.agentType, event.text);
}

function handleToolCallChunk(event: AgentEvent, toolCallId: string): void {
	if (!event.toolName) {
		return;
	}

	const toolArgs = event.toolArgs ?? "{}";
	broadcastAgentToolCall({
		type: "agent_tool_call",
		data: {
			cycleId: event.cycleId,
			agentType: event.agentType,
			toolName: event.toolName,
			toolArgs,
			toolCallId,
			timestamp: event.timestamp,
		},
	});
	queueToolCall(event.cycleId, event.agentType, {
		toolCallId,
		toolName: event.toolName,
		toolArgs,
	});
}

function handleToolResultChunk(event: AgentEvent, toolCallId: string): void {
	const toolName = event.toolName ?? "unknown";
	const success = event.success ?? true;
	const resultSummary = event.result ?? "";

	broadcastAgentToolResult({
		type: "agent_tool_result",
		data: {
			cycleId: event.cycleId,
			agentType: event.agentType,
			toolName,
			toolCallId,
			resultSummary,
			success,
			timestamp: event.timestamp,
		},
	});
	queueToolResult(event.cycleId, event.agentType, {
		toolCallId,
		toolName,
		success,
		resultSummary,
	});
}

function handleSourceChunk(event: AgentEvent): void {
	if (!event.url) {
		return;
	}

	broadcastAgentSource({
		type: "agent_source",
		data: {
			cycleId: event.cycleId,
			agentType: event.agentType,
			sourceType: event.sourceType ?? "url",
			url: event.url,
			title: event.title,
			domain: event.domain,
			logoUrl: event.logoUrl,
			timestamp: event.timestamp,
		},
	});
}

function handleErrorChunk(event: AgentEvent): void {
	if (!event.error) {
		return;
	}

	broadcastAgentOutput({
		type: "agent_output",
		data: {
			cycleId: event.cycleId,
			agentType: event.agentType,
			status: "error",
			output: event.error,
			error: event.error,
			timestamp: event.timestamp,
		},
	});
}

type ChunkHandler = (event: AgentEvent, toolCallId: string) => void;

const chunkHandlers: Record<NonNullable<AgentEvent["chunkType"]>, ChunkHandler> = {
	"text-delta": (event) => handleTextDeltaChunk(event),
	"reasoning-delta": (event) => handleReasoningDeltaChunk(event),
	"tool-call": handleToolCallChunk,
	"tool-result": handleToolResultChunk,
	source: (event) => handleSourceChunk(event),
	error: (event) => handleErrorChunk(event),
};

function handleAgentChunkEvent(event: AgentEvent): void {
	const chunkType = event.chunkType;
	if (!chunkType) {
		return;
	}

	const handler = chunkHandlers[chunkType];
	const toolCallId = event.toolCallId ?? `tc_${Date.now()}`;
	handler(event, toolCallId);
}

function handleAgentCompleteEvent(event: AgentEvent): void {
	broadcastAgentOutput({
		type: "agent_output",
		data: {
			cycleId: event.cycleId,
			agentType: event.agentType,
			status: "complete",
			output: event.output ?? "",
			durationMs: event.durationMs,
			timestamp: event.timestamp,
		},
	});
	queueAgentComplete(event.cycleId, event.agentType, { output: event.output });
}

function handleAgentErrorEvent(event: AgentEvent): void {
	broadcastAgentOutput({
		type: "agent_output",
		data: {
			cycleId: event.cycleId,
			agentType: event.agentType,
			status: "error",
			output: event.error ?? "Unknown error",
			error: event.error,
			timestamp: event.timestamp,
		},
	});
}

async function processWorkerEvent(event: WorkerEvent): Promise<void> {
	switch (event.type) {
		case "cycle-start":
			await handleCycleStartEvent(event);
			return;
		case "cycle-progress":
			handleCycleProgressEvent(event);
			return;
		case "cycle-result":
			await handleCycleResultEvent(event);
			return;
		case "agent-start":
			handleAgentStartEvent(event);
			return;
		case "agent-chunk":
			handleAgentChunkEvent(event);
			return;
		case "agent-complete":
			handleAgentCompleteEvent(event);
			return;
		case "agent-error":
			handleAgentErrorEvent(event);
			return;
	}
}

// ============================================
// Routes
// ============================================

// POST /api/system/worker-events
const workerEventsRoute = createRoute({
	method: "post",
	path: "/",
	request: {
		body: {
			content: { "application/json": { schema: BatchEventsRequestSchema } },
		},
	},
	responses: {
		200: {
			content: {
				"application/json": {
					schema: z.object({ processed: z.number() }),
				},
			},
			description: "Events processed successfully",
		},
		401: {
			content: {
				"application/json": {
					schema: z.object({ error: z.string() }),
				},
			},
			description: "Unauthorized",
		},
	},
	tags: ["Internal"],
});

// @ts-expect-error - Hono OpenAPI multi-response type inference limitation
app.openapi(workerEventsRoute, async (c) => {
	const authHeader = c.req.header("Authorization");
	if (!validateInternalAuth(authHeader)) {
		throw new HTTPException(401, { message: "Invalid internal authorization" });
	}

	const { events } = c.req.valid("json");
	let processed = 0;

	for (const event of events) {
		try {
			await processWorkerEvent(event);
			processed++;
		} catch {
			// Ignore individual event failures and continue.
		}
	}

	return c.json({ processed });
});

export default app;
