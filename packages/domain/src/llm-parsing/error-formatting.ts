import type { ZodError, ZodIssue, ZodSchema } from "zod";

import type { FormattedZodError } from "./types";

export function formatZodErrors(error: ZodError): FormattedZodError[] {
	return error.issues.map((issue) => formatZodIssue(issue));
}

function formatZodIssue(issue: ZodIssue): FormattedZodError {
	const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
	const formatted: FormattedZodError = {
		path,
		message: issue.message,
	};

	if (issue.code === "invalid_type") {
		formatted.expected = issue.expected;
		formatted.received = String((issue as { received?: unknown }).received ?? "unknown");
	}

	if (issue.code === "invalid_value" || issue.message.includes("expected one of")) {
		const match = issue.message.match(/expected one of (.+)$/);
		if (match) {
			formatted.expected = match[1];
		}
	}

	if (issue.code === "invalid_union") {
		formatted.message = "Value doesn't match any allowed type in union";
	}

	return formatted;
}

export function formatZodErrorString(error: ZodError): string {
	const formatted = formatZodErrors(error);
	return formatted
		.map((entry) => {
			let message = `${entry.path}: ${entry.message}`;
			if (entry.expected && entry.received) {
				message += ` (expected ${entry.expected}, got ${entry.received})`;
			}
			return message;
		})
		.join("; ");
}

export function formatJsonParseError(error: unknown, rawOutput: string): string {
	if (!(error instanceof SyntaxError)) {
		return `JSON parse error: ${String(error)}`;
	}

	const positionMatch = error.message.match(/position (\d+)/i);
	if (positionMatch?.[1]) {
		const position = Number.parseInt(positionMatch[1], 10);
		const context = extractErrorContext(rawOutput, position);
		return `JSON syntax error at position ${position}: ${error.message}. Context: "${context}"`;
	}

	return `JSON syntax error: ${error.message}`;
}

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

export function schemaToDescription<T>(schema: ZodSchema<T>): string {
	if (schema.description) {
		return schema.description;
	}

	return "a valid JSON object matching the expected structure";
}

export function generateSchemaExample<T>(_schema: ZodSchema<T>): string {
	return "{ /* valid JSON matching the schema */ }";
}

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
