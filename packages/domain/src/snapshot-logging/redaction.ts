/**
 * Sensitive Data Redaction
 *
 * Utilities for redacting sensitive data from logs.
 */

/**
 * Patterns to redact from logs.
 */
const REDACTION_PATTERNS = [
	// API keys
	{ pattern: /(api[_-]?key|apikey)[=:]\s*["']?[\w-]+["']?/gi, replacement: "$1=[REDACTED]" },
	{ pattern: /["']?bearer\s+[\w.-]+["']?/gi, replacement: "Bearer [REDACTED]" },
	{
		pattern: /(secret|token|password|auth)[=:]\s*["']?[\w-]+["']?/gi,
		replacement: "$1=[REDACTED]",
	},
	// Account numbers
	{ pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: "[REDACTED_CARD]" },
	// SSN patterns
	{ pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, replacement: "[REDACTED_SSN]" },
];

/**
 * Redact sensitive data from a string.
 */
export function redactSensitiveData(text: string): string {
	let result = text;
	for (const { pattern, replacement } of REDACTION_PATTERNS) {
		result = result.replace(pattern, replacement);
	}
	return result;
}

/**
 * Redact sensitive data from an object (deep).
 */
export function redactObject(obj: unknown): unknown {
	if (obj === null || obj === undefined) {
		return obj;
	}

	if (typeof obj === "string") {
		return redactSensitiveData(obj);
	}

	if (Array.isArray(obj)) {
		return obj.map(redactObject);
	}

	if (typeof obj === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			const lowerKey = key.toLowerCase();
			if (
				lowerKey.includes("key") ||
				lowerKey.includes("secret") ||
				lowerKey.includes("token") ||
				lowerKey.includes("password") ||
				lowerKey.includes("auth")
			) {
				result[key] = "[REDACTED]";
			} else {
				result[key] = redactObject(value);
			}
		}
		return result;
	}

	return obj;
}
