/**
 * LLM Output Parsing with Retry Logic
 *
 * Provides robust JSON parsing and validation for LLM agent outputs.
 * Implements exactly one retry attempt on malformed JSON, then rejection.
 *
 * @see docs/plans/00-overview.md for Agent Consensus Edge Cases
 */

import type { ZodError, ZodIssue, ZodSchema } from "zod";

// ============================================
// Types
// ============================================

/**
 * Agent type for specialized error handling
 */
export type AgentType =
	| "TechnicalAnalyst"
	| "NewsSentimentAnalyst"
	| "FundamentalsMacroAnalyst"
	| "BullishResearchAgent"
	| "BearishResearchAgent"
	| "TraderAgent"
	| "RiskManagerAgent"
	| "CriticAgent";

/**
 * Critical agents that must REJECT on parse failure (safer than auto-approve)
 */
const CRITICAL_AGENTS: AgentType[] = ["RiskManagerAgent", "CriticAgent"];

/**
 * Primary decision agent
 */
const TRADER_AGENT: AgentType = "TraderAgent";

/**
 * Research agents where parse failure logs warning but skips contribution
 */
const RESEARCH_AGENTS: AgentType[] = [
	"TechnicalAnalyst",
	"NewsSentimentAnalyst",
	"FundamentalsMacroAnalyst",
	"BullishResearchAgent",
	"BearishResearchAgent",
];

/**
 * Parse attempt record for logging
 */
export interface ParseAttempt {
	attemptNumber: 1 | 2;
	rawOutput: string;
	success: boolean;
	error?: string;
	zodErrors?: FormattedZodError[];
	timestamp: string;
}

/**
 * Formatted Zod validation error
 */
export interface FormattedZodError {
	path: string;
	message: string;
	expected?: string;
	received?: string;
}

/**
 * Parse result with retry metadata
 */
export interface ParseResult<T> {
	success: boolean;
	data?: T;
	attempts: ParseAttempt[];
	finalError?: string;
	agentAction?: "SUCCESS" | "REJECT" | "SKIP";
}

/**
 * Logger interface for dependency injection
 */
export interface ParseLogger {
	debug(message: string, data?: Record<string, unknown>): void;
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
}

/**
 * Default console logger
 */
export const defaultLogger: ParseLogger = {
	debug: (_message, _data) => {},
	info: (_message, _data) => {},
	warn: (_message, _data) => {},
	error: (_message, _data) => {},
};

/**
 * Options for parseWithRetry
 */
export interface ParseOptions {
	/** Agent type for specialized error handling */
	agentType?: AgentType;
	/** Original task context for retry prompt */
	taskContext?: string;
	/** Custom logger (defaults to console) */
	logger?: ParseLogger;
	/** Callback to invoke LLM for retry */
	retryCallback?: (retryPrompt: string) => Promise<string>;
	/** Redact sensitive data in logs */
	redactSecrets?: boolean;
}

// ============================================
// Error Extraction
// ============================================

/**
 * Extract human-readable error messages from Zod validation errors
 */
export function formatZodErrors(error: ZodError): FormattedZodError[] {
	return error.issues.map((issue) => formatZodIssue(issue));
}

/**
 * Format a single Zod issue into a human-readable error
 */
function formatZodIssue(issue: ZodIssue): FormattedZodError {
	const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";

	const formatted: FormattedZodError = {
		path,
		message: issue.message,
	};

	// Add type information for type errors
	if (issue.code === "invalid_type") {
		// Zod v4 type narrowing - issue has expected/received properties
		formatted.expected = issue.expected;
		// Use type assertion for received property (Zod v4 types)
		formatted.received = String((issue as { received?: unknown }).received ?? "unknown");
	}

	// Zod v4 uses "invalid_value" for enum/literal validation failures
	// Extract expected values from the message if present
	if (issue.code === "invalid_value" || issue.message.includes("expected one of")) {
		const match = issue.message.match(/expected one of (.+)$/);
		if (match) {
			formatted.expected = match[1];
		}
	}

	// Add union errors
	if (issue.code === "invalid_union") {
		formatted.message = "Value doesn't match any allowed type in union";
	}

	return formatted;
}

/**
 * Format Zod errors into a single human-readable string
 */
export function formatZodErrorString(error: ZodError): string {
	const formatted = formatZodErrors(error);
	return formatted
		.map((e) => {
			let msg = `${e.path}: ${e.message}`;
			if (e.expected && e.received) {
				msg += ` (expected ${e.expected}, got ${e.received})`;
			}
			return msg;
		})
		.join("; ");
}

/**
 * Extract error details from JSON parse error
 */
export function formatJsonParseError(error: unknown, rawOutput: string): string {
	if (error instanceof SyntaxError) {
		// Try to extract position from error message
		const posMatch = error.message.match(/position (\d+)/i);
		if (posMatch?.[1]) {
			const position = Number.parseInt(posMatch[1], 10);
			const context = extractErrorContext(rawOutput, position);
			return `JSON syntax error at position ${position}: ${error.message}. Context: "${context}"`;
		}
		return `JSON syntax error: ${error.message}`;
	}
	return `JSON parse error: ${String(error)}`;
}

/**
 * Extract context around error position
 */
function extractErrorContext(text: string, position: number, contextLength = 20): string {
	const start = Math.max(0, position - contextLength);
	const end = Math.min(text.length, position + contextLength);
	let context = text.slice(start, end);

	if (start > 0) {
		context = `...${context}`;
	}
	if (end < text.length) {
		context = `${context}...`;
	}

	return context;
}

// ============================================
// Schema Stringification
// ============================================

/**
 * Generate a human-readable schema description for retry prompt
 */
export function schemaToDescription<T>(schema: ZodSchema<T>): string {
	// Use Zod's description if available
	if (schema.description) {
		return schema.description;
	}

	// For complex schemas, provide a generic message
	// In production, you'd want to introspect the schema more deeply
	return "a valid JSON object matching the expected structure";
}

/**
 * Generate example JSON from schema shape (best-effort)
 */
export function generateSchemaExample<T>(_schema: ZodSchema<T>): string {
	// This is a simplified implementation
	// In production, you'd want to introspect the schema to generate real examples
	return "{ /* valid JSON matching the schema */ }";
}

// ============================================
// Retry Prompt Generation
// ============================================

/**
 * Generate retry prompt with error details
 */
export function generateRetryPrompt(
	originalTask: string,
	error: string,
	schemaDescription: string,
): string {
	return `Your previous output was invalid. Error: ${error}

Please provide valid JSON matching this schema: ${schemaDescription}

Original task: ${originalTask}

IMPORTANT:
- Return ONLY valid JSON, no markdown code blocks
- Ensure all required fields are present
- Use correct data types (strings, numbers, booleans, arrays, objects)
- Check for proper JSON syntax (quotes, commas, brackets)`;
}

// ============================================
// Main Parse Function
// ============================================

/**
 * Parse LLM output with exactly one retry attempt
 *
 * Flow:
 * 1. Attempt to parse and validate JSON
 * 2. On failure: generate retry prompt with error details
 * 3. If retryCallback provided, invoke it and try once more
 * 4. On second failure: reject based on agent type
 *
 * @param rawOutput - Raw string output from LLM
 * @param schema - Zod schema to validate against
 * @param options - Parse options including agent type and retry callback
 * @returns ParseResult with success status, data, and attempt history
 */
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
	const logOutput = redactSecrets ? redactSensitiveData(rawOutput) : rawOutput;

	// First attempt
	logger.info("Attempting to parse LLM output", {
		agentType,
		outputLength: rawOutput.length,
	});

	const firstAttempt = attemptParse(rawOutput, schema, 1);
	attempts.push(firstAttempt);

	if (firstAttempt.success) {
		logger.info("Parse succeeded on first attempt", { agentType });
		return {
			success: true,
			data: firstAttempt.parsedData as T,
			attempts,
			agentAction: "SUCCESS",
		};
	}

	// Log first attempt failure
	logger.warn("First parse attempt failed", {
		agentType,
		error: firstAttempt.error,
		zodErrors: firstAttempt.zodErrors,
		rawOutput: logOutput,
	});

	// If no retry callback, fail immediately
	if (!retryCallback) {
		logger.error("No retry callback provided, failing", { agentType });
		return createFailureResult(attempts, firstAttempt.error ?? "Unknown error", agentType);
	}

	// Generate retry prompt
	const retryPrompt = generateRetryPrompt(
		taskContext,
		firstAttempt.error ?? "Unknown error",
		schemaToDescription(schema),
	);

	logger.info("Invoking retry callback with enhanced prompt", {
		agentType,
		promptLength: retryPrompt.length,
	});

	// Second attempt (retry)
	let retryOutput: string;
	try {
		retryOutput = await retryCallback(retryPrompt);
	} catch (callbackError) {
		logger.error("Retry callback threw an error", {
			agentType,
			error: String(callbackError),
		});
		return createFailureResult(
			attempts,
			`Retry callback failed: ${String(callbackError)}`,
			agentType,
		);
	}

	const secondAttempt = attemptParse(retryOutput, schema, 2);
	attempts.push(secondAttempt);

	if (secondAttempt.success) {
		logger.info("Parse succeeded on retry attempt", { agentType });
		return {
			success: true,
			data: secondAttempt.parsedData as T,
			attempts,
			agentAction: "SUCCESS",
		};
	}

	// Log second attempt failure
	logger.error("Second parse attempt failed, rejecting", {
		agentType,
		error: secondAttempt.error,
		zodErrors: secondAttempt.zodErrors,
		rawOutput: redactSecrets ? redactSensitiveData(retryOutput) : retryOutput,
	});

	return createFailureResult(attempts, secondAttempt.error ?? "Unknown error", agentType);
}

/**
 * Synchronous parse for cases where retry isn't needed
 */
export function parseOnce<T>(
	rawOutput: string,
	schema: ZodSchema<T>,
	options: Omit<ParseOptions, "retryCallback"> = {},
): ParseResult<T> {
	const { agentType, logger = defaultLogger, redactSecrets = true } = options;
	const logOutput = redactSecrets ? redactSensitiveData(rawOutput) : rawOutput;

	const attempt = attemptParse(rawOutput, schema, 1);

	if (attempt.success) {
		logger.info("Parse succeeded", { agentType });
		return {
			success: true,
			data: attempt.parsedData as T,
			attempts: [attempt],
			agentAction: "SUCCESS",
		};
	}

	logger.warn("Parse failed", {
		agentType,
		error: attempt.error,
		rawOutput: logOutput,
	});

	return createFailureResult([attempt], attempt.error ?? "Unknown error", agentType);
}

// ============================================
// Helper Functions
// ============================================

interface AttemptResult {
	attemptNumber: 1 | 2;
	rawOutput: string;
	success: boolean;
	error?: string;
	zodErrors?: FormattedZodError[];
	parsedData?: unknown;
	timestamp: string;
}

/**
 * Attempt to parse and validate JSON
 */
function attemptParse<T>(
	rawOutput: string,
	schema: ZodSchema<T>,
	attemptNumber: 1 | 2,
): AttemptResult {
	const timestamp = new Date().toISOString();

	// Clean output (remove markdown code blocks if present)
	const cleanedOutput = cleanLLMOutput(rawOutput);

	// Step 1: Parse JSON
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

	// Step 2: Validate against schema
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

	// Validation failed
	const zodErrors = formatZodErrors(result.error);
	return {
		attemptNumber,
		rawOutput,
		success: false,
		error: formatZodErrorString(result.error),
		zodErrors,
		timestamp,
	};
}

/**
 * Clean LLM output by removing markdown code blocks and extra whitespace
 */
export function cleanLLMOutput(output: string): string {
	let cleaned = output.trim();

	// Remove markdown JSON code blocks
	// Match ```json ... ``` or ``` ... ```
	const codeBlockMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
	if (codeBlockMatch?.[1]) {
		cleaned = codeBlockMatch[1].trim();
	}

	// Remove any leading/trailing non-JSON content
	// Find the first { or [ and last } or ]
	const firstBrace = cleaned.indexOf("{");
	const firstBracket = cleaned.indexOf("[");
	const lastBrace = cleaned.lastIndexOf("}");
	const lastBracket = cleaned.lastIndexOf("]");

	let start = -1;
	let end = -1;

	if (firstBrace >= 0 && firstBracket >= 0) {
		start = Math.min(firstBrace, firstBracket);
	} else if (firstBrace >= 0) {
		start = firstBrace;
	} else if (firstBracket >= 0) {
		start = firstBracket;
	}

	if (lastBrace >= 0 && lastBracket >= 0) {
		end = Math.max(lastBrace, lastBracket);
	} else if (lastBrace >= 0) {
		end = lastBrace;
	} else if (lastBracket >= 0) {
		end = lastBracket;
	}

	if (start >= 0 && end >= start) {
		cleaned = cleaned.slice(start, end + 1);
	}

	return cleaned;
}

/**
 * Create failure result with agent-specific action
 */
function createFailureResult<T>(
	attempts: ParseAttempt[],
	finalError: string,
	agentType?: AgentType,
): ParseResult<T> {
	let agentAction: "REJECT" | "SKIP" = "REJECT";

	if (agentType) {
		if (CRITICAL_AGENTS.includes(agentType)) {
			// Risk Manager and Critic must REJECT (safer than auto-approve)
			agentAction = "REJECT";
		} else if (RESEARCH_AGENTS.includes(agentType)) {
			// Research agents can be skipped
			agentAction = "SKIP";
		} else if (agentType === TRADER_AGENT) {
			// Trader agent is critical
			agentAction = "REJECT";
		}
	}

	return {
		success: false,
		attempts,
		finalError,
		agentAction,
	};
}

/**
 * Redact potentially sensitive data from output
 */
export function redactSensitiveData(output: string): string {
	// Redact common secret patterns
	const patterns = [
		// API keys in JSON (various formats including camelCase)
		/"(?:api[_-]?[Kk]ey|apiKey|api_secret|secret[_-]?key|auth[_-]?token)":\s*"[^"]+"/gi,
		// API keys (various formats, non-JSON)
		/(?:api[_-]?key|apikey|api_secret|secret[_-]?key|auth[_-]?token)["\s:=]+["']?[A-Za-z0-9_-]{16,}["']?/gi,
		// Bearer tokens
		/Bearer\s+[A-Za-z0-9_\-.]+/gi,
		// AWS keys
		/(?:AKIA|ASIA)[A-Z0-9]{16}/g,
		// Private keys
		/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g,
		// Passwords in JSON
		/"(?:password|passwd|pwd)":\s*"[^"]+"/gi,
		// Passwords (non-JSON)
		/(?:password|passwd|pwd)["\s:=]+["'][^"']{4,}["']/gi,
		// SK- prefixed secrets (OpenAI, etc)
		/sk-[A-Za-z0-9]{20,}/gi,
	];

	let redacted = output;
	for (const pattern of patterns) {
		redacted = redacted.replace(pattern, "[REDACTED]");
	}

	return redacted;
}

/**
 * Check if agent type requires rejection on parse failure
 */
export function requiresRejectionOnFailure(agentType: AgentType): boolean {
	return CRITICAL_AGENTS.includes(agentType) || agentType === TRADER_AGENT;
}

/**
 * Check if agent type allows skipping on parse failure
 */
export function allowsSkipOnFailure(agentType: AgentType): boolean {
	return RESEARCH_AGENTS.includes(agentType);
}
