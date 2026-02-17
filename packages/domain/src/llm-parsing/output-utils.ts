export function cleanLLMOutput(output: string): string {
	let cleaned = output.trim();

	const codeBlockMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
	if (codeBlockMatch?.[1]) {
		cleaned = codeBlockMatch[1].trim();
	}

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

export function redactSensitiveData(output: string): string {
	const patterns = [
		/"(?:api[_-]?[Kk]ey|apiKey|api_secret|secret[_-]?key|auth[_-]?token)":\s*"[^"]+"/gi,
		/(?:api[_-]?key|apikey|api_secret|secret[_-]?key|auth[_-]?token)["\s:=]+["']?[A-Za-z0-9_-]{16,}["']?/gi,
		/Bearer\s+[A-Za-z0-9_\-.]+/gi,
		/(?:AKIA|ASIA)[A-Z0-9]{16}/g,
		/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g,
		/"(?:password|passwd|pwd)":\s*"[^"]+"/gi,
		/(?:password|passwd|pwd)["\s:=]+["'][^"']{4,}["']/gi,
		/sk-[A-Za-z0-9]{20,}/gi,
	];

	let redacted = output;
	for (const pattern of patterns) {
		redacted = redacted.replace(pattern, "[REDACTED]");
	}

	return redacted;
}
