import type { ZodSchema } from "zod";
import { createFailureResult } from "./agent-actions";
import {
	formatJsonParseError,
	formatZodErrorString,
	formatZodErrors,
	generateRetryPrompt,
	schemaToDescription,
} from "./error-formatting";
import { cleanLLMOutput, redactSensitiveData } from "./output-utils";
import type {
	AgentType,
	FormattedZodError,
	ParseAttempt,
	ParseOptions,
	ParseResult,
} from "./types";
import { defaultLogger } from "./types";

interface AttemptResult {
	attemptNumber: 1 | 2;
	rawOutput: string;
	success: boolean;
	error?: string;
	zodErrors?: FormattedZodError[];
	parsedData?: unknown;
	timestamp: string;
}

function createSuccessResult<T>(attempts: ParseAttempt[], data: T): ParseResult<T> {
	return {
		success: true,
		data,
		attempts,
		agentAction: "SUCCESS",
	};
}

function createLogOutput(rawOutput: string, redactSecrets: boolean): string {
	return redactSecrets ? redactSensitiveData(rawOutput) : rawOutput;
}

function logFirstAttemptFailure(
	agentType: AgentType | undefined,
	attempt: AttemptResult,
	logOutput: string,
	logger: ParseOptions["logger"],
): void {
	logger?.warn("First parse attempt failed", {
		agentType,
		error: attempt.error,
		zodErrors: attempt.zodErrors,
		rawOutput: logOutput,
	});
}

async function invokeRetryCallback(
	retryCallback: (retryPrompt: string) => Promise<string>,
	retryPrompt: string,
	agentType: AgentType | undefined,
	logger: ParseOptions["logger"],
): Promise<{ success: true; output: string } | { success: false; error: string }> {
	try {
		logger?.info("Invoking retry callback with enhanced prompt", {
			agentType,
			promptLength: retryPrompt.length,
		});
		return { success: true, output: await retryCallback(retryPrompt) };
	} catch (callbackError) {
		logger?.error("Retry callback threw an error", {
			agentType,
			error: String(callbackError),
		});
		return { success: false, error: `Retry callback failed: ${String(callbackError)}` };
	}
}

function attemptParse<T>(
	rawOutput: string,
	schema: ZodSchema<T>,
	attemptNumber: 1 | 2,
): AttemptResult {
	const timestamp = new Date().toISOString();
	const cleanedOutput = cleanLLMOutput(rawOutput);

	let parsed: unknown;
	try {
		parsed = JSON.parse(cleanedOutput);
	} catch (error) {
		return {
			attemptNumber,
			rawOutput,
			success: false,
			error: formatJsonParseError(error, cleanedOutput),
			timestamp,
		};
	}

	const result = schema.safeParse(parsed);
	if (result.success) {
		return {
			attemptNumber,
			rawOutput,
			success: true,
			parsedData: result.data,
			timestamp,
		};
	}

	return {
		attemptNumber,
		rawOutput,
		success: false,
		error: formatZodErrorString(result.error),
		zodErrors: formatZodErrors(result.error),
		timestamp,
	};
}

export async function parseWithRetry<T>(
	rawOutput: string,
	schema: ZodSchema<T>,
	options: ParseOptions = {},
): Promise<ParseResult<T>> {
	const {
		agentType,
		taskContext = "Provide valid JSON output",
		logger = defaultLogger,
		retryCallback,
		redactSecrets = true,
	} = options;

	const attempts: ParseAttempt[] = [];
	const logOutput = createLogOutput(rawOutput, redactSecrets);
	logger.info("Attempting to parse LLM output", { agentType, outputLength: rawOutput.length });

	const firstAttempt = attemptParse(rawOutput, schema, 1);
	attempts.push(firstAttempt);
	if (firstAttempt.success) {
		logger.info("Parse succeeded on first attempt", { agentType });
		return createSuccessResult(attempts, firstAttempt.parsedData as T);
	}

	logFirstAttemptFailure(agentType, firstAttempt, logOutput, logger);
	if (!retryCallback) {
		logger.error("No retry callback provided, failing", { agentType });
		return createFailureResult(attempts, firstAttempt.error ?? "Unknown error", agentType);
	}

	const retryPrompt = generateRetryPrompt(
		taskContext,
		firstAttempt.error ?? "Unknown error",
		schemaToDescription(schema),
	);
	const retryResult = await invokeRetryCallback(retryCallback, retryPrompt, agentType, logger);
	if (!retryResult.success) {
		return createFailureResult(attempts, retryResult.error, agentType);
	}

	const secondAttempt = attemptParse(retryResult.output, schema, 2);
	attempts.push(secondAttempt);
	if (secondAttempt.success) {
		logger.info("Parse succeeded on retry attempt", { agentType });
		return createSuccessResult(attempts, secondAttempt.parsedData as T);
	}

	logger.error("Second parse attempt failed, rejecting", {
		agentType,
		error: secondAttempt.error,
		zodErrors: secondAttempt.zodErrors,
		rawOutput: createLogOutput(retryResult.output, redactSecrets),
	});
	return createFailureResult(attempts, secondAttempt.error ?? "Unknown error", agentType);
}

export function parseOnce<T>(
	rawOutput: string,
	schema: ZodSchema<T>,
	options: Omit<ParseOptions, "retryCallback"> = {},
): ParseResult<T> {
	const { agentType, logger = defaultLogger, redactSecrets = true } = options;
	const logOutput = createLogOutput(rawOutput, redactSecrets);
	const attempt = attemptParse(rawOutput, schema, 1);

	if (attempt.success) {
		logger.info("Parse succeeded", { agentType });
		return createSuccessResult([attempt], attempt.parsedData as T);
	}

	logger.warn("Parse failed", {
		agentType,
		error: attempt.error,
		rawOutput: logOutput,
	});
	return createFailureResult([attempt], attempt.error ?? "Unknown error", agentType);
}
