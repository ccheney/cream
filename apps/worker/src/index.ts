/**
 * @cream/worker - Hourly Scheduler
 *
 * Triggers the trading cycle workflow every hour, aligned to candle closes.
 * Runs the OODA loop: Observe -> Orient -> Decide -> Act
 *
 * Also runs the prediction markets workflow every 15 minutes.
 *
 * Configuration MUST be loaded from the database via RuntimeConfigService.
 * Run 'bun run db:seed' to initialize configuration before starting.
 *
 * Supports config reload on SIGHUP signal.
 */

import { predictionMarketsWorkflow, tradingCycleWorkflow } from "@cream/api";
import type { FullRuntimeConfig, RuntimeEnvironment } from "@cream/config";
import {
	type CreamEnvironment,
	createContext,
	initCalendarService,
	isBacktest,
	requireEnv,
	validateEnvironmentOrExit,
} from "@cream/domain";
import { createFilingsIngestionService } from "@cream/filings";
import {
	CorporateActionsRepository,
	DecisionsRepository,
	SentimentRepository,
	ShortInterestRepository,
} from "@cream/storage";
import {
	getDbClient,
	getRuntimeConfigService,
	resetRuntimeConfigService,
	validateHelixDBOrExit,
} from "./db";
import {
	createAlpacaCorporateActionsFromEnv,
	createDefaultConfig,
	createFINRAClient,
	createSentimentProviderFromEnv,
	IndicatorBatchScheduler,
	type JobState,
} from "./indicators";
import { log } from "./logger";
import { getSubscriptionStatus, stopMarketDataSubscription } from "./marketdata";
import { type IndicatorSynthesisScheduler, startIndicatorSynthesisScheduler } from "./schedulers";

// ============================================
// Worker State
// ============================================

interface WorkerState {
	/** Current runtime config (required) */
	config: FullRuntimeConfig;
	/** Environment */
	environment: RuntimeEnvironment;
	/** Whether to run on startup */
	runOnStartup: boolean;
	/** Whether scheduler is disabled (dev mode) */
	schedulerDisabled: boolean;
	/** Active timer handles */
	timers: {
		tradingCycle: ReturnType<typeof setTimeout> | null;
		predictionMarkets: ReturnType<typeof setTimeout> | null;
		filingsSync: ReturnType<typeof setTimeout> | null;
	};
	/** Last run timestamps */
	lastRun: {
		tradingCycle: Date | null;
		predictionMarkets: Date | null;
		filingsSync: Date | null;
	};
	/** Startup time */
	startedAt: Date;
	/** Whether currently running a cycle */
	running: {
		tradingCycle: boolean;
		predictionMarkets: boolean;
		filingsSync: boolean;
	};
	/** Indicator batch scheduler (v2 engine) */
	indicatorScheduler: IndicatorBatchScheduler | null;
	/** Indicator synthesis scheduler (daily trigger check) */
	synthesisScheduler: IndicatorSynthesisScheduler | null;
}

// State is initialized in main() after config is loaded
let state: WorkerState;

// ============================================
// Config Accessors
// ============================================

function getIntervals(): {
	tradingCycleIntervalMs: number;
	predictionMarketsIntervalMs: number;
} {
	return {
		tradingCycleIntervalMs: state.config.trading.tradingCycleIntervalMs,
		predictionMarketsIntervalMs: state.config.trading.predictionMarketsIntervalMs,
	};
}

function getInstruments(): string[] {
	const symbols = state.config.universe.staticSymbols;
	if (!symbols || symbols.length === 0) {
		throw new Error("No instruments configured in universe.staticSymbols");
	}
	return symbols;
}

// ============================================
// Config Loading
// ============================================

/**
 * Load configuration from database.
 * Throws if config is not found - DB seeding is required.
 */
async function loadConfig(environment: RuntimeEnvironment): Promise<FullRuntimeConfig> {
	const configService = await getRuntimeConfigService();
	const config = await configService.getActiveConfig(environment);
	return config;
}

/**
 * Reload configuration (called on SIGHUP)
 */
async function reloadConfig(): Promise<void> {
	log.info({}, "Reloading configuration");

	// Reset the service to force fresh load
	resetRuntimeConfigService();

	const oldIntervals = getIntervals();
	state.config = await loadConfig(state.environment);
	const newIntervals = getIntervals();

	// Check if intervals changed
	const tradingIntervalChanged =
		oldIntervals.tradingCycleIntervalMs !== newIntervals.tradingCycleIntervalMs;
	const predictionIntervalChanged =
		oldIntervals.predictionMarketsIntervalMs !== newIntervals.predictionMarketsIntervalMs;

	if (tradingIntervalChanged || predictionIntervalChanged) {
		log.info({}, "Intervals changed, rescheduling");

		// Cancel existing timers and reschedule
		stopScheduler();
		startScheduler();
	}

	log.info({}, "Configuration reloaded");
}

// ============================================
// Cycle ID Generation
// ============================================

function generateCycleId(): string {
	const now = new Date();
	const timestamp = now.toISOString().replace(/[:.]/g, "-");
	const random = Math.random().toString(36).substring(2, 8);
	return `cycle-${timestamp}-${random}`;
}

// ============================================
// Dashboard Event Streaming
// ============================================

/**
 * Configuration for streaming events to dashboard-api.
 * Events are batched and sent via HTTP for real-time visibility.
 */
const DASHBOARD_API_URL = process.env.DASHBOARD_API_URL ?? "http://localhost:3001";
const WORKER_INTERNAL_SECRET = process.env.WORKER_INTERNAL_SECRET ?? "dev-internal-secret";
const EVENT_BATCH_SIZE = 10;
const EVENT_FLUSH_INTERVAL_MS = 500;

type AgentType =
	| "grounding"
	| "news"
	| "fundamentals"
	| "bullish"
	| "bearish"
	| "trader"
	| "risk"
	| "critic";
type CyclePhase = "observe" | "orient" | "decide" | "act" | "complete" | "error";

interface WorkerEvent {
	type: string;
	cycleId: string;
	timestamp: string;
	[key: string]: unknown;
}

/**
 * Event batcher for streaming events to dashboard-api.
 * Batches events and flushes periodically or when batch is full.
 */
class EventStreamer {
	private eventQueue: WorkerEvent[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private enabled = true;

	constructor() {
		// Check if streaming is enabled
		if (process.env.DISABLE_WORKER_STREAMING === "true") {
			this.enabled = false;
			log.info({}, "Worker event streaming disabled via DISABLE_WORKER_STREAMING");
		}
	}

	async push(event: WorkerEvent): Promise<void> {
		if (!this.enabled) {
			return;
		}

		this.eventQueue.push(event);

		if (this.eventQueue.length >= EVENT_BATCH_SIZE) {
			await this.flush();
		} else if (!this.flushTimer) {
			this.flushTimer = setTimeout(() => this.flush(), EVENT_FLUSH_INTERVAL_MS);
		}
	}

	async flush(): Promise<void> {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}

		if (this.eventQueue.length === 0) {
			return;
		}

		const events = this.eventQueue.splice(0);

		try {
			const response = await fetch(`${DASHBOARD_API_URL}/api/system/worker-events`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${WORKER_INTERNAL_SECRET}`,
				},
				body: JSON.stringify({ events }),
			});

			if (!response.ok) {
				log.warn(
					{ status: response.status, count: events.length },
					"Failed to send events to dashboard-api"
				);
			}
		} catch (error) {
			log.debug(
				{ error: error instanceof Error ? error.message : String(error), count: events.length },
				"Could not reach dashboard-api for event streaming (non-critical)"
			);
		}
	}
}

const eventStreamer = new EventStreamer();

/**
 * Map workflow agent types to dashboard agent types.
 */
const AGENT_TYPE_MAP: Record<string, AgentType> = {
	grounding_agent: "grounding",
	news_analyst: "news",
	fundamentals_analyst: "fundamentals",
	bullish_researcher: "bullish",
	bearish_researcher: "bearish",
	trader: "trader",
	risk_manager: "risk",
	critic: "critic",
};

/**
 * Map workflow step names to cycle phases with progress percentages.
 */
const STEP_PROGRESS_MAP: Record<string, { phase: CyclePhase; progress: number }> = {
	observe: { phase: "observe", progress: 20 },
	orient: { phase: "orient", progress: 30 },
	grounding: { phase: "decide", progress: 35 },
	analysts: { phase: "decide", progress: 45 },
	debate: { phase: "decide", progress: 60 },
	trader: { phase: "decide", progress: 75 },
	consensus: { phase: "decide", progress: 90 },
	act: { phase: "act", progress: 100 },
};

// ============================================
// Workflow Execution
// ============================================

async function runTradingCycle(): Promise<void> {
	if (state.running.tradingCycle) {
		log.info({}, "Skipping trading cycle - previous run still in progress");
		return;
	}

	state.running.tradingCycle = true;
	const cycleId = generateCycleId();
	state.lastRun.tradingCycle = new Date();
	const startTime = Date.now();

	log.info({ cycleId, environment: state.environment }, "Starting trading cycle");

	try {
		const instruments = getInstruments();
		log.debug({ cycleId, instruments }, "Fetched instruments for cycle");

		// Emit cycle start event
		await eventStreamer.push({
			type: "cycle-start",
			cycleId,
			environment: state.environment,
			instruments,
			timestamp: new Date().toISOString(),
		});

		// Use streaming mode for real-time event visibility
		const run = await tradingCycleWorkflow.createRun();
		const stream = await run.stream({
			inputData: {
				cycleId,
				instruments,
			},
		});

		// Track workflow result
		type WorkflowOutput = {
			approved?: boolean;
			iterations?: number;
			decisionPlan?: {
				decisions?: Array<{
					decisionId: string;
					instrumentId: string;
					action: "BUY" | "SELL" | "HOLD" | "CLOSE";
					direction: "LONG" | "SHORT" | "FLAT";
					size: { value: number; unit: string };
					strategyFamily?: string | null;
					timeHorizon?: string | null;
					rationale?: {
						summary?: string | null;
						bullishFactors?: string[] | null;
						bearishFactors?: string[] | null;
					} | null;
				}>;
			};
		};
		let workflowOutput: WorkflowOutput | undefined;

		// Process stream events and forward to dashboard
		for await (const event of stream.fullStream) {
			const evt = event as unknown as Record<string, unknown>;

			// Helper to check if an object is an agent event
			const isAgentEvent = (obj: unknown): obj is Record<string, unknown> => {
				if (!obj || typeof obj !== "object") {
					return false;
				}
				const o = obj as Record<string, unknown>;
				return (
					o.type === "agent-start" ||
					o.type === "agent-chunk" ||
					o.type === "agent-complete" ||
					o.type === "agent-error"
				);
			};

			// Extract agent event from stream
			let agentEvt: Record<string, unknown> | null = null;
			if (evt.type === "workflow-step-output" && evt.payload) {
				const payload = evt.payload as Record<string, unknown>;
				if (isAgentEvent(payload.output)) {
					agentEvt = payload.output as Record<string, unknown>;
				}
			} else if (isAgentEvent(evt)) {
				agentEvt = evt;
			}

			// Forward agent events
			if (agentEvt) {
				const agentEvent = agentEvt as {
					type: string;
					agent: string;
					data?: Record<string, unknown>;
					error?: string;
					timestamp?: string;
				};

				const agentType = AGENT_TYPE_MAP[agentEvent.agent ?? ""];
				if (!agentType) {
					continue;
				}

				const ts = agentEvent.timestamp ?? new Date().toISOString();

				switch (agentEvent.type) {
					case "agent-start":
						await eventStreamer.push({
							type: "agent-start",
							agentType,
							cycleId,
							timestamp: ts,
						});
						break;

					case "agent-chunk": {
						const data = agentEvent.data as Record<string, unknown> | undefined;
						const payload = data?.payload as Record<string, unknown> | undefined;
						const chunkType = data?.type as string | undefined;

						if (chunkType === "text-delta" && payload?.text) {
							await eventStreamer.push({
								type: "agent-chunk",
								chunkType: "text-delta",
								agentType,
								cycleId,
								text: String(payload.text),
								timestamp: ts,
							});
						} else if (chunkType === "reasoning-delta" && payload?.text) {
							await eventStreamer.push({
								type: "agent-chunk",
								chunkType: "reasoning-delta",
								agentType,
								cycleId,
								text: String(payload.text),
								timestamp: ts,
							});
						} else if (chunkType === "tool-call" && payload?.toolName) {
							await eventStreamer.push({
								type: "agent-chunk",
								chunkType: "tool-call",
								agentType,
								cycleId,
								toolName: String(payload.toolName),
								toolArgs: JSON.stringify(payload.toolArgs ?? {}),
								toolCallId: String(payload.toolCallId ?? `tc_${Date.now()}`),
								timestamp: ts,
							});
						} else if (chunkType === "tool-result" || payload?.result !== undefined) {
							await eventStreamer.push({
								type: "agent-chunk",
								chunkType: "tool-result",
								agentType,
								cycleId,
								toolName: String(payload?.toolName ?? "unknown"),
								toolCallId: String(payload?.toolCallId ?? `tc_${Date.now()}`),
								result: JSON.stringify(payload?.result ?? {}).slice(0, 200),
								success: Boolean(payload?.success ?? true),
								timestamp: ts,
							});
						} else if (chunkType === "error" && payload?.error) {
							await eventStreamer.push({
								type: "agent-chunk",
								chunkType: "error",
								agentType,
								cycleId,
								error: String(payload.error),
								timestamp: ts,
							});
						}
						break;
					}

					case "agent-complete":
						await eventStreamer.push({
							type: "agent-complete",
							agentType,
							cycleId,
							output: JSON.stringify(agentEvent.data?.output ?? {}).slice(0, 500),
							timestamp: ts,
						});
						break;

					case "agent-error":
						await eventStreamer.push({
							type: "agent-error",
							agentType,
							cycleId,
							error: agentEvent.error ?? "Unknown error",
							timestamp: ts,
						});
						break;
				}
			}

			// Handle step completion for progress updates
			if (evt.type === "workflow-step-finish") {
				const stepId = String((evt.payload as Record<string, unknown>)?.stepName ?? "");
				const stepInfo = STEP_PROGRESS_MAP[stepId];
				if (stepInfo) {
					await eventStreamer.push({
						type: "cycle-progress",
						cycleId,
						phase: stepInfo.phase,
						step: stepId,
						progress: stepInfo.progress,
						message: `Completed ${stepId} step`,
						timestamp: new Date().toISOString(),
					});
				}
			}
		}

		// Flush any remaining events
		await eventStreamer.flush();

		// Get workflow result
		const durationMs = Date.now() - startTime;

		if (stream.status !== "success") {
			log.error(
				{ cycleId, status: stream.status, durationMs },
				"Trading cycle workflow returned non-success status"
			);

			await eventStreamer.push({
				type: "cycle-result",
				cycleId,
				environment: state.environment,
				status: "failed",
				durationMs,
				error: "Workflow execution failed",
				timestamp: new Date().toISOString(),
			});
			await eventStreamer.flush();
			return;
		}

		// Get result from stream
		if (stream.result) {
			workflowOutput = (await stream.result) as unknown as WorkflowOutput;
		}

		// Persist decisions so they show up in the dashboard Decisions page.
		const decisions = workflowOutput?.decisionPlan?.decisions ?? [];
		if (decisions.length > 0) {
			try {
				const client = await getDbClient();
				const repo = new DecisionsRepository(client);
				const status = workflowOutput?.approved ? "approved" : "rejected";

				let created = 0;
				for (const decision of decisions) {
					if (!decision.decisionId || !decision.instrumentId) {
						continue;
					}

					const existing = await repo.findById(decision.decisionId);
					if (existing) {
						continue;
					}

					await repo.create({
						id: decision.decisionId,
						cycleId,
						symbol: decision.instrumentId,
						action: decision.action === "CLOSE" ? "SELL" : decision.action,
						direction: decision.direction,
						size: decision.size.value,
						sizeUnit: decision.size.unit,
						status,
						strategyFamily: decision.strategyFamily ?? null,
						timeHorizon: decision.timeHorizon ?? null,
						rationale: decision.rationale?.summary ?? null,
						bullishFactors: decision.rationale?.bullishFactors ?? [],
						bearishFactors: decision.rationale?.bearishFactors ?? [],
						environment: state.environment,
					});
					created++;
				}

				if (created > 0) {
					log.info(
						{ cycleId, created, approved: workflowOutput?.approved, durationMs },
						"Trading cycle completed with decisions"
					);
				} else {
					log.info(
						{ cycleId, approved: workflowOutput?.approved, durationMs },
						"Trading cycle completed - no new decisions to persist"
					);
				}
			} catch (error) {
				log.warn(
					{ cycleId, error: error instanceof Error ? error.message : String(error) },
					"Failed to persist trading decisions"
				);
			}
		} else {
			log.info(
				{ cycleId, approved: workflowOutput?.approved, durationMs },
				"Trading cycle completed - workflow produced no decisions"
			);
		}

		// Emit cycle result
		await eventStreamer.push({
			type: "cycle-result",
			cycleId,
			environment: state.environment,
			status: "completed",
			durationMs,
			approved: workflowOutput?.approved ?? false,
			iterations: workflowOutput?.iterations ?? 0,
			timestamp: new Date().toISOString(),
		});
		await eventStreamer.flush();
	} catch (error) {
		const durationMs = Date.now() - startTime;
		log.error(
			{
				cycleId,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			},
			"Trading cycle failed with error"
		);

		// Emit error event
		await eventStreamer.push({
			type: "cycle-result",
			cycleId,
			environment: state.environment,
			status: "failed",
			durationMs,
			error: error instanceof Error ? error.message : String(error),
			timestamp: new Date().toISOString(),
		});
		await eventStreamer.flush();
	} finally {
		state.running.tradingCycle = false;
	}
}

/**
 * Run the prediction markets workflow.
 * Fetches data from Kalshi/Polymarket and stores computed signals.
 */
async function runPredictionMarkets(): Promise<void> {
	if (state.running.predictionMarkets) {
		log.info({}, "Skipping prediction markets - previous run still in progress");
		return;
	}

	state.running.predictionMarkets = true;
	state.lastRun.predictionMarkets = new Date();

	try {
		const run = await predictionMarketsWorkflow.createRun();
		await run.start({
			inputData: {
				marketTypes: ["FED_RATE", "ECONOMIC_DATA", "RECESSION"] as const,
			},
		});
	} catch (_error) {
		// Error handling done in workflow
	} finally {
		state.running.predictionMarkets = false;
	}
}

/**
 * Run the SEC filings sync.
 * Fetches filings from SEC EDGAR, chunks them, and ingests into HelixDB.
 */
async function runFilingsSync(): Promise<void> {
	if (state.running.filingsSync) {
		log.info({}, "Skipping filings sync - previous run still in progress");
		return;
	}

	state.running.filingsSync = true;
	state.lastRun.filingsSync = new Date();

	log.info({}, "Starting SEC filings sync");

	try {
		const dbClient = await getDbClient();
		const service = createFilingsIngestionService(dbClient);

		// Get symbols from universe config
		const instruments = getInstruments();

		const result = await service.syncFilings({
			symbols: instruments,
			filingTypes: ["10-K", "10-Q", "8-K"],
			limitPerSymbol: 5,
			triggerSource: "scheduled",
			environment: state.environment,
		});

		log.info(
			{
				filingsIngested: result.filingsIngested,
				chunksCreated: result.chunksCreated,
				durationMs: result.durationMs,
			},
			"Filings sync complete"
		);
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			"Filings sync failed"
		);
	} finally {
		state.running.filingsSync = false;
	}
}

// ============================================
// Indicator Batch Scheduler (v2 Engine)
// ============================================

/**
 * Initialize and start the indicator batch scheduler.
 * Creates data provider adapters and repositories, then starts scheduled jobs.
 */
async function initIndicatorBatchScheduler(): Promise<void> {
	// Check if required API keys are available
	const hasAlpacaKeys = !!(
		(process.env.ALPACA_KEY ?? Bun.env.ALPACA_KEY) &&
		(process.env.ALPACA_SECRET ?? Bun.env.ALPACA_SECRET)
	);

	if (!hasAlpacaKeys) {
		log.warn({}, "Indicator batch scheduler disabled: ALPACA_KEY/ALPACA_SECRET not configured");
		return;
	}

	try {
		const db = await getDbClient();

		// Create repositories
		const shortInterestRepo = new ShortInterestRepository(db);
		const sentimentRepo = new SentimentRepository(db);
		const corporateActionsRepo = new CorporateActionsRepository(db);

		// Create scheduler config with enabled jobs based on available API keys
		const schedulerConfig = createDefaultConfig();
		schedulerConfig.enabled.shortInterest = true;
		schedulerConfig.enabled.sentiment = hasAlpacaKeys;
		schedulerConfig.enabled.corporateActions = hasAlpacaKeys;

		// Create data provider adapters
		const finraClient = createFINRAClient();
		const sharesProvider = createStubSharesProvider();
		const sentimentProvider = hasAlpacaKeys
			? createSentimentProviderFromEnv()
			: createStubSentimentProvider();
		const alpacaClient = hasAlpacaKeys
			? createAlpacaCorporateActionsFromEnv()
			: createStubAlpacaClient();

		// Create and start scheduler
		state.indicatorScheduler = new IndicatorBatchScheduler(
			{
				finraClient,
				sharesProvider,
				sentimentProvider,
				alpacaClient,
				shortInterestRepo,
				sentimentRepo,
				corporateActionsRepo,
				getSymbols: getInstruments,
			},
			schedulerConfig
		);

		state.indicatorScheduler.start();
		log.info(
			{
				shortInterest: schedulerConfig.enabled.shortInterest,
				sentiment: schedulerConfig.enabled.sentiment,
				corporateActions: schedulerConfig.enabled.corporateActions,
			},
			"Indicator batch scheduler started"
		);
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : String(error) },
			"Failed to initialize indicator batch scheduler"
		);
	}
}

/**
 * Get indicator batch job status for health endpoint.
 */
function getIndicatorJobStatus(): Record<string, JobState> | null {
	return state.indicatorScheduler?.getJobStatus() ?? null;
}

// Stub implementations for when API keys are not available
function createStubSharesProvider() {
	return {
		getSharesData: async () => null,
	};
}

function createStubSentimentProvider() {
	return {
		getSentimentData: async () => [],
		getHistoricalSentiment: async () => [],
	};
}

function createStubAlpacaClient() {
	return {
		getCorporateActions: async () => [],
		getCorporateActionsForSymbols: async () => [],
	};
}

// ============================================
// Scheduler
// ============================================

function calculateNextHourMs(): number {
	const now = new Date();
	const nextHour = new Date(now);
	nextHour.setHours(nextHour.getHours() + 1);
	nextHour.setMinutes(0);
	nextHour.setSeconds(0);
	nextHour.setMilliseconds(0);
	return nextHour.getTime() - now.getTime();
}

function calculateNext15MinMs(): number {
	const now = new Date();
	const next15Min = new Date(now);
	const minutes = now.getMinutes();
	const nextQuarter = Math.ceil((minutes + 1) / 15) * 15;
	next15Min.setMinutes(nextQuarter % 60);
	if (nextQuarter >= 60) {
		next15Min.setHours(next15Min.getHours() + 1);
	}
	next15Min.setSeconds(0);
	next15Min.setMilliseconds(0);
	return next15Min.getTime() - now.getTime();
}

/**
 * Calculate milliseconds until next 6 AM EST.
 * SEC filings sync runs once per day at 6 AM Eastern.
 */
function calculateNext6AMESTMs(): number {
	const now = new Date();

	// Get current time in EST/EDT
	const estOptions: Intl.DateTimeFormatOptions = {
		timeZone: "America/New_York",
		hour: "numeric",
		hour12: false,
	};
	const estHour = parseInt(new Intl.DateTimeFormat("en-US", estOptions).format(now), 10);

	// Calculate next 6 AM EST
	const next6AM = new Date(now);
	if (estHour >= 6) {
		// Already past 6 AM today, schedule for tomorrow
		next6AM.setDate(next6AM.getDate() + 1);
	}

	// Set to 6 AM EST (approximate by setting UTC time)
	// EST is UTC-5, EDT is UTC-4
	// This is a simplification - in production use a proper timezone library
	next6AM.setUTCHours(11, 0, 0, 0); // 6 AM EST = 11 AM UTC

	return next6AM.getTime() - now.getTime();
}

function scheduleTradingCycle(): void {
	const intervals = getIntervals();

	// Schedule at next hour boundary, then repeat at configured interval
	const msUntilNextHour = calculateNextHourMs();
	state.timers.tradingCycle = setTimeout(() => {
		runTradingCycle();
		state.timers.tradingCycle = setInterval(runTradingCycle, intervals.tradingCycleIntervalMs);
	}, msUntilNextHour);
}

function schedulePredictionMarkets(): void {
	const intervals = getIntervals();

	// Schedule at next 15-minute boundary, then repeat at configured interval
	const msUntilNext15Min = calculateNext15MinMs();
	state.timers.predictionMarkets = setTimeout(() => {
		runPredictionMarkets();
		state.timers.predictionMarkets = setInterval(
			runPredictionMarkets,
			intervals.predictionMarketsIntervalMs
		);
	}, msUntilNext15Min);
}

/** 24 hours in milliseconds */
const FILINGS_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

function scheduleFilingsSync(): void {
	// Schedule at next 6 AM EST, then repeat every 24 hours
	const msUntil6AM = calculateNext6AMESTMs();
	state.timers.filingsSync = setTimeout(() => {
		runFilingsSync();
		state.timers.filingsSync = setInterval(runFilingsSync, FILINGS_SYNC_INTERVAL_MS);
	}, msUntil6AM);
}

function startScheduler(): void {
	const msUntilHour = calculateNextHourMs();
	const msUntil15Min = calculateNext15MinMs();
	const msUntil6AM = calculateNext6AMESTMs();
	log.info(
		{
			tradingCycleMinutes: Math.round(msUntilHour / 60000),
			predictionsMinutes: Math.round(msUntil15Min / 60000),
			filingsHours: Math.round(msUntil6AM / 3600000),
		},
		"Scheduler started"
	);
	scheduleTradingCycle();
	schedulePredictionMarkets();
	scheduleFilingsSync();
}

function stopScheduler(): void {
	if (state.timers.tradingCycle) {
		clearTimeout(state.timers.tradingCycle);
		clearInterval(state.timers.tradingCycle);
		state.timers.tradingCycle = null;
	}
	if (state.timers.predictionMarkets) {
		clearTimeout(state.timers.predictionMarkets);
		clearInterval(state.timers.predictionMarkets);
		state.timers.predictionMarkets = null;
	}
	if (state.timers.filingsSync) {
		clearTimeout(state.timers.filingsSync);
		clearInterval(state.timers.filingsSync);
		state.timers.filingsSync = null;
	}
}

// ============================================
// Health Endpoint
// ============================================

const HEALTH_PORT = Number(Bun.env.HEALTH_PORT ?? 3002);

function startHealthServer(): void {
	Bun.serve({
		port: HEALTH_PORT,
		fetch(req) {
			const url = new URL(req.url);

			if (url.pathname === "/health" || url.pathname === "/") {
				const intervals = getIntervals();
				const uptime = Date.now() - state.startedAt.getTime();

				const marketDataStatus = getSubscriptionStatus();
				const indicatorJobs = getIndicatorJobStatus();
				const health = {
					status: "ok",
					uptime_ms: uptime,
					environment: state.environment,
					config_id: state.config.trading.id,
					intervals: {
						trading_cycle_ms: intervals.tradingCycleIntervalMs,
						prediction_markets_ms: intervals.predictionMarketsIntervalMs,
					},
					instruments: getInstruments(),
					last_run: {
						trading_cycle: state.lastRun.tradingCycle?.toISOString() ?? null,
						prediction_markets: state.lastRun.predictionMarkets?.toISOString() ?? null,
						filings_sync: state.lastRun.filingsSync?.toISOString() ?? null,
					},
					running: {
						trading_cycle: state.running.tradingCycle,
						prediction_markets: state.running.predictionMarkets,
						filings_sync: state.running.filingsSync,
					},
					market_data: {
						active: marketDataStatus.active,
						symbols: marketDataStatus.symbols,
						last_update: marketDataStatus.lastUpdate?.toISOString() ?? null,
						update_count: marketDataStatus.updateCount,
					},
					indicator_batch_jobs: indicatorJobs
						? Object.fromEntries(
								Object.entries(indicatorJobs).map(([name, job]) => [
									name,
									{
										status: job.status,
										last_run: job.lastRun?.toISOString() ?? null,
										next_run: job.nextRun?.toISOString() ?? null,
										run_count: job.runCount,
										last_error: job.lastError,
										last_result: job.lastResult
											? {
													processed: job.lastResult.processed,
													failed: job.lastResult.failed,
													duration_ms: job.lastResult.durationMs,
												}
											: null,
									},
								])
							)
						: null,
					synthesis_scheduler: state.synthesisScheduler
						? (() => {
								const synthState = state.synthesisScheduler.getState();
								return {
									enabled: true,
									last_run: synthState.lastRun?.toISOString() ?? null,
									next_run: synthState.nextRun?.toISOString() ?? null,
									run_count: synthState.runCount,
									last_trigger_result: synthState.lastTriggerResult,
									last_error: synthState.lastError,
								};
							})()
						: { enabled: false },
					started_at: state.startedAt.toISOString(),
				};

				return new Response(JSON.stringify(health, null, 2), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}

			if (url.pathname === "/reload") {
				if (req.method === "POST") {
					reloadConfig().catch(() => {});
					return new Response(JSON.stringify({ status: "reloading" }), {
						status: 202,
						headers: { "Content-Type": "application/json" },
					});
				}
				return new Response("Method not allowed", { status: 405 });
			}

			return new Response("Not found", { status: 404 });
		},
	});
}

// ============================================
// Main
// ============================================

async function main() {
	const environment = requireEnv();

	// Validate environment at startup
	const startupCtx = createContext(environment, "scheduled");
	if (!isBacktest(startupCtx)) {
		validateEnvironmentOrExit(startupCtx, "worker", []);

		// Warn if no LLM key is set (needed for OODA agent execution)
		// OODA agents use Gemini exclusively via GOOGLE_GENERATIVE_AI_API_KEY
		if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
			log.warn(
				{},
				"GOOGLE_GENERATIVE_AI_API_KEY not configured. Agent execution will use stub agents."
			);
		}
	}

	// Validate HelixDB connectivity - required for CBR memory persistence
	// In PAPER/LIVE, this will fail fast if HelixDB is unavailable
	// In BACKTEST, it will warn but continue (unless SKIP_HELIX_PERSISTENCE is set)
	await validateHelixDBOrExit(startupCtx);

	// Initialize CalendarService (non-blocking, falls back to hardcoded for BACKTEST)
	initCalendarService({
		mode: environment as CreamEnvironment,
		alpacaKey: process.env.ALPACA_KEY,
		alpacaSecret: process.env.ALPACA_SECRET,
	})
		.then(() => {
			log.info({ mode: environment }, "CalendarService initialized");
		})
		.catch((error: unknown) => {
			log.warn(
				{ error: error instanceof Error ? error.message : String(error), mode: environment },
				"CalendarService initialization failed, using fallback"
			);
		});

	// Load configuration from database - REQUIRED
	let config: FullRuntimeConfig;
	try {
		config = await loadConfig(environment);
	} catch (error) {
		log.error(
			{ error: error instanceof Error ? error.message : "Unknown error" },
			"Failed to load config from database. Run 'bun run db:seed' to initialize."
		);
		process.exit(1);
	}

	// Initialize state
	state = {
		config,
		environment,
		runOnStartup: Bun.env.RUN_ON_STARTUP === "true",
		schedulerDisabled: Bun.env.SCHEDULER_DISABLED === "true",
		timers: {
			tradingCycle: null,
			predictionMarkets: null,
			filingsSync: null,
		},
		lastRun: {
			tradingCycle: null,
			predictionMarkets: null,
			filingsSync: null,
		},
		startedAt: new Date(),
		running: {
			tradingCycle: false,
			predictionMarkets: false,
			filingsSync: false,
		},
		indicatorScheduler: null,
		synthesisScheduler: null,
	};

	const intervals = getIntervals();
	log.info({ environment, configId: config.trading.id }, "Worker starting");
	log.info(
		{
			tradingCycleIntervalMs: intervals.tradingCycleIntervalMs,
			predictionMarketsIntervalMs: intervals.predictionMarketsIntervalMs,
		},
		"Intervals configured"
	);
	log.info({ instruments: getInstruments() }, "Instruments configured");

	// Start health server
	startHealthServer();
	log.info({ port: HEALTH_PORT }, "Health endpoint listening");

	// Skip scheduling if disabled (dev mode)
	if (state.schedulerDisabled) {
		log.info({}, "Scheduler disabled (SCHEDULER_DISABLED=true). Health endpoint only.");
	} else {
		// Run immediately if configured
		if (state.runOnStartup) {
			log.info({}, "Running cycles on startup");
			await Promise.all([runTradingCycle(), runPredictionMarkets()]);
		}

		// Start the schedulers
		startScheduler();

		// Initialize indicator batch scheduler (v2 engine)
		await initIndicatorBatchScheduler();

		// Initialize synthesis scheduler (daily trigger check)
		// Only run in non-backtest modes
		if (!isBacktest(startupCtx)) {
			const db = await getDbClient();
			state.synthesisScheduler = startIndicatorSynthesisScheduler(db);
			log.info({}, "Indicator synthesis scheduler started");
		}
	}

	// Handle config reload on SIGHUP
	process.on("SIGHUP", () => {
		reloadConfig().catch((error) => {
			log.error(
				{ error: error instanceof Error ? error.message : String(error) },
				"Config reload failed"
			);
		});
	});

	// Handle shutdown
	process.on("SIGINT", () => {
		stopScheduler();
		state.indicatorScheduler?.stop();
		state.synthesisScheduler?.stop();
		stopMarketDataSubscription().catch(() => {});
		process.exit(0);
	});

	process.on("SIGTERM", () => {
		stopScheduler();
		state.indicatorScheduler?.stop();
		state.synthesisScheduler?.stop();
		stopMarketDataSubscription().catch(() => {});
		process.exit(0);
	});
}

main().catch((_error) => {
	process.exit(1);
});
