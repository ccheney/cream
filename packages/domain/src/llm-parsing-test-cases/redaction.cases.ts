import { describe, expect, it } from "bun:test";

import { redactSensitiveData } from "../llm-parsing";

describe("redactSensitiveData", () => {
	it("redacts API keys", () => {
		const input = '{"api_key": "sk-1234567890abcdefghij"}';
		const redacted = redactSensitiveData(input);

		expect(redacted).toContain("[REDACTED]");
		expect(redacted).not.toContain("sk-1234567890");
	});

	it("redacts Bearer tokens", () => {
		const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test";
		const redacted = redactSensitiveData(input);

		expect(redacted).toContain("[REDACTED]");
		expect(redacted).not.toContain("eyJhbGciOiJIUzI1NiJ9");
	});

	it("redacts AWS access keys", () => {
		const input = "AWS_ACCESS_KEY: AKIAIOSFODNN7EXAMPLE";
		const redacted = redactSensitiveData(input);

		expect(redacted).toContain("[REDACTED]");
	});
});

describe("redactSensitiveData", () => {
	it("redacts passwords", () => {
		const input = '{"password": "supersecret123"}';
		const redacted = redactSensitiveData(input);

		expect(redacted).toContain("[REDACTED]");
		expect(redacted).not.toContain("supersecret123");
	});

	it("preserves non-sensitive data", () => {
		const input = '{"name": "test", "value": 42}';
		const redacted = redactSensitiveData(input);

		expect(redacted).toBe(input);
	});
});
