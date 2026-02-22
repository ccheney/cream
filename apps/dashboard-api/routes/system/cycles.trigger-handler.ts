/**
 * Trigger Cycle Handler
 *
 * API orchestration for validating/tracking system cycle triggers and starting async execution.
 */

import type { CreamEnvironment } from "@cream/domain";
import { getCyclesRepo, getRuntimeConfigService } from "../../src/db.js";
import log from "../../src/logger.js";
import {
	getLastTriggerTime,
	getRunningCycles,
	setLastTriggerTime,
	setRunningCycle,
} from "../../src/routes/system/state.js";
import { type CycleState, TRIGGER_RATE_LIMIT_MS } from "../../src/routes/system/types.js";
import { setCyclesRepository } from "../../src/services/cycle-event-persistence.js";
import { runCycleWorkflow } from "./cycles.trigger-runner.js";

export type TriggerCyclePayload = {
	environment: CreamEnvironment;
	useDraftConfig: boolean;
	symbols: string[];
	confirmLive?: boolean;
};

export type InternalAuthCheck = {
	isInternal: boolean;
};

export type TriggerCycleCommand = TriggerCyclePayload & InternalAuthCheck;

export type TriggerCycleResponse = {
	status: number;
	body: Record<string, unknown>;
};

const INTERNAL_SECRET = Bun.env.WORKER_INTERNAL_SECRET ?? "dev-internal-secret";

export function isInternalAuth(authHeader: string | undefined): boolean {
	if (!authHeader?.startsWith("Bearer ")) {
		return false;
	}
	return authHeader.slice(7) === INTERNAL_SECRET;
}

const NO_SYMBOLS_ERROR = {
	error: "symbols[] is required for cycle trigger requests.",
};

const LIVE_CONFIRM_ERROR = { error: "confirmLive required to trigger LIVE cycle" };

const WORKER_CONFIG_ERROR = {
	error: "No configuration found for environment. Run db:seed first.",
};

type ResolveCycleSymbolsResult =
	| {
			ok: false;
			response: TriggerCycleResponse;
	  }
	| {
			ok: true;
			configVersion: string | null;
			resolvedSymbols: string[];
	  };

type StartCycleResult =
	| { ok: true; cycleId: string }
	| { ok: false; response: TriggerCycleResponse };
type StartQueueResult = {
	ok: true;
	cycleState: CycleState;
	resolvedSymbols: string[];
	configVersion: string | null;
};

export async function handleTriggerCycle(
	command: TriggerCycleCommand,
): Promise<TriggerCycleResponse> {
	const validationError = getInitialValidationError(command);
	if (validationError) {
		return validationError;
	}

	const queueResult = await createQueueState(command);
	if (!queueResult.ok) {
		return queueResult.response;
	}

	launchCycleWorkflow({
		cycleId: queueResult.cycleState.cycleId,
		environment: command.environment,
		resolvedSymbols: queueResult.resolvedSymbols,
		useDraftConfig: command.useDraftConfig,
		configVersion: queueResult.configVersion,
		cycleState: queueResult.cycleState,
	});

	return {
		status: 200,
		body: {
			cycleId: queueResult.cycleState.cycleId,
			status: "queued",
			environment: command.environment,
			configVersion: queueResult.configVersion,
			startedAt: queueResult.cycleState.startedAt,
		},
	};
}

function getInitialValidationError(command: TriggerCycleCommand): TriggerCycleResponse | null {
	const validateError = validateTriggerRequest(command.environment, command.confirmLive);
	if (validateError) {
		return validateError;
	}

	const activeCycleError = getInProgressCycleError(command.environment);
	if (activeCycleError) {
		return activeCycleError;
	}

	if (!command.isInternal) {
		return getRateLimitError(command.environment);
	}

	return null;
}

async function createQueueState(
	command: TriggerCycleCommand,
): Promise<StartQueueResult | { ok: false; response: TriggerCycleResponse }> {
	const symbolsResult = await resolveCycleSymbols(
		command.environment,
		command.useDraftConfig,
		command.symbols,
	);
	if (!symbolsResult.ok) {
		return symbolsResult;
	}

	const cycleStartResult = await createCycleRecord(
		command.environment,
		symbolsResult.configVersion,
		symbolsResult.resolvedSymbols.length,
	);
	if (!cycleStartResult.ok) {
		return cycleStartResult;
	}

	const cycleState: CycleState = {
		cycleId: cycleStartResult.cycleId,
		status: "queued",
		environment: command.environment,
		startedAt: new Date().toISOString(),
		completedAt: null,
		error: null,
		phase: null,
	};
	setRunningCycle(command.environment, cycleState);
	setLastTriggerTime(command.environment, Date.now());

	return {
		ok: true,
		cycleState,
		resolvedSymbols: symbolsResult.resolvedSymbols,
		configVersion: symbolsResult.configVersion,
	};
}

function validateTriggerRequest(
	environment: CreamEnvironment,
	confirmLive: boolean | undefined,
): TriggerCycleResponse | null {
	if (environment === "LIVE" && !confirmLive) {
		return { status: 400, body: LIVE_CONFIRM_ERROR };
	}
	return null;
}

function getInProgressCycleError(environment: CreamEnvironment): TriggerCycleResponse | null {
	const runningCycles = getRunningCycles();
	const existingCycle = runningCycles.get(environment);
	if (existingCycle && (existingCycle.status === "queued" || existingCycle.status === "running")) {
		return {
			status: 409,
			body: {
				error: `Cycle already in progress for ${environment}`,
				cycleId: existingCycle.cycleId,
			},
		};
	}
	return null;
}

function getRateLimitError(environment: CreamEnvironment): TriggerCycleResponse | null {
	const lastTrigger = getLastTriggerTime().get(environment) ?? 0;
	const timeSinceLastTrigger = Date.now() - lastTrigger;
	if (timeSinceLastTrigger < TRIGGER_RATE_LIMIT_MS) {
		const retryAfterMs = TRIGGER_RATE_LIMIT_MS - timeSinceLastTrigger;
		return {
			status: 429,
			body: {
				error: `Rate limited. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.`,
				retryAfterMs,
			},
		};
	}
	return null;
}

async function resolveCycleSymbols(
	environment: CreamEnvironment,
	useDraftConfig: boolean,
	symbols: string[],
): Promise<ResolveCycleSymbolsResult> {
	const requestSymbols = symbols.filter((symbol) => symbol.trim().length > 0);
	if (requestSymbols.length === 0) {
		return { ok: false, response: { status: 400, body: NO_SYMBOLS_ERROR } };
	}

	try {
		const configService = await getRuntimeConfigService();
		const config = useDraftConfig
			? await configService.getDraft(environment)
			: await configService.getActiveConfig(environment);
		const configVersion = config.trading.id;
		const resolvedSymbols = requestSymbols;

		log.info(
			{
				symbolCount: resolvedSymbols.length,
				symbols: resolvedSymbols,
				fromRequest: true,
			},
			"Resolved symbols for trading cycle",
		);

		return { ok: true, configVersion, resolvedSymbols };
	} catch {
		return { ok: false, response: { status: 400, body: WORKER_CONFIG_ERROR } };
	}
}

async function createCycleRecord(
	environment: CreamEnvironment,
	configVersion: string | null,
	resolvedSymbolCount: number,
): Promise<StartCycleResult> {
	const cyclesRepo = getCyclesRepo();
	setCyclesRepository(cyclesRepo);

	try {
		const cycle = await cyclesRepo.start(
			environment,
			resolvedSymbolCount,
			configVersion ?? undefined,
		);
		return { ok: true, cycleId: cycle.id };
	} catch (error) {
		return {
			ok: false,
			response: {
				status: 500,
				body: {
					error: `Failed to create cycle: ${
						error instanceof Error ? error.message : "Unknown error"
					}`,
				},
			},
		};
	}
}

function launchCycleWorkflow(context: {
	cycleId: string;
	environment: CreamEnvironment;
	resolvedSymbols: string[];
	useDraftConfig: boolean;
	configVersion: string | null;
	cycleState: CycleState;
}): void {
	runCycleWorkflow(context).catch((error) => {
		log.error(
			{
				cycleId: context.cycleId,
				error: error instanceof Error ? error.message : String(error),
			},
			"Unhandled cycle execution error",
		);
	});
}
