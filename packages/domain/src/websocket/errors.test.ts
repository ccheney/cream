import { describe, expect, it } from "bun:test";
import {
	createErrorDetails,
	ERROR_CODE_DESCRIPTIONS,
	ERROR_RECOVERY,
	ERROR_SEVERITY,
	ErrorCode,
	ErrorDetailsSchema,
	ErrorSeverity,
	getRetryDelay,
	isCritical,
	isRetryable,
	RecoveryAction,
	requiresAuthRefresh,
} from "./errors.js";

describe("ErrorCode", () => {
	it("defines authentication error codes", () => {
		const authCodes = ErrorCode.options.filter((code) => code.startsWith("AUTH_"));
		expect(authCodes).toContain("AUTH_FAILED");
		expect(authCodes).toContain("AUTH_EXPIRED");
		expect(authCodes).toContain("AUTH_INVALID_TOKEN");
		expect(authCodes.length).toBe(3);
	});

	it("defines channel and message error codes", () => {
		const channelCodes = ErrorCode.options.filter((code) => code.startsWith("CHANNEL_"));
		expect(channelCodes).toEqual(["CHANNEL_NOT_FOUND", "CHANNEL_UNAUTHORIZED", "CHANNEL_INVALID"]);

		const messageCodes = ErrorCode.options.filter((code) => code.startsWith("MESSAGE_"));
		expect(messageCodes).toContain("MESSAGE_INVALID_FORMAT");
		expect(messageCodes).toContain("MESSAGE_INVALID_TYPE");
		expect(messageCodes).toContain("MESSAGE_TOO_LARGE");
		expect(messageCodes).toContain("MESSAGE_PARSE_ERROR");
	});

	it("defines rate, limit, internal, and connection codes", () => {
		expect(ErrorCode.options.filter((code) => code.startsWith("RATE_"))).toHaveLength(3);
		expect(ErrorCode.options.filter((code) => code.startsWith("LIMIT_"))).toHaveLength(3);
		expect(ErrorCode.options.filter((code) => code.startsWith("INTERNAL_"))).toHaveLength(3);
		expect(ErrorCode.options.filter((code) => code.startsWith("CONNECTION_"))).toHaveLength(2);
	});
});

describe("ERROR_CODE_DESCRIPTIONS", () => {
	it("has description for every error code", () => {
		for (const code of ErrorCode.options) {
			expect(ERROR_CODE_DESCRIPTIONS[code]).toBeDefined();
			expect(typeof ERROR_CODE_DESCRIPTIONS[code]).toBe("string");
			expect(ERROR_CODE_DESCRIPTIONS[code].length).toBeGreaterThan(10);
		}
	});
});

describe("ErrorSeverity and ERROR_SEVERITY", () => {
	it("defines all severity levels", () => {
		expect(ErrorSeverity.options).toEqual(["critical", "warning", "info"]);
	});

	it("maps every error code to a severity", () => {
		for (const code of ErrorCode.options) {
			expect(ERROR_SEVERITY[code]).toBeDefined();
			expect(ErrorSeverity.options).toContain(ERROR_SEVERITY[code]);
		}
	});

	it("uses expected severities for known code classes", () => {
		expect(ERROR_SEVERITY.AUTH_FAILED).toBe("critical");
		expect(ERROR_SEVERITY.INTERNAL_ERROR).toBe("critical");
		expect(ERROR_SEVERITY.RATE_LIMIT_EXCEEDED).toBe("warning");
		expect(ERROR_SEVERITY.CHANNEL_NOT_FOUND).toBe("info");
	});
});

describe("RecoveryAction and ERROR_RECOVERY", () => {
	it("defines all recovery actions", () => {
		expect(RecoveryAction.options).toContain("refresh_token");
		expect(RecoveryAction.options).toContain("retry");
		expect(RecoveryAction.options).toContain("retry_backoff");
		expect(RecoveryAction.options).toContain("reduce_rate");
		expect(RecoveryAction.options).toContain("remove_subscription");
		expect(RecoveryAction.options).toContain("reconnect");
		expect(RecoveryAction.options).toContain("none");
	});

	it("maps every error code to a recovery action", () => {
		for (const code of ErrorCode.options) {
			expect(ERROR_RECOVERY[code]).toBeDefined();
			expect(RecoveryAction.options).toContain(ERROR_RECOVERY[code]);
		}
	});

	it("uses expected recoveries for known code classes", () => {
		expect(ERROR_RECOVERY.AUTH_FAILED).toBe("refresh_token");
		expect(ERROR_RECOVERY.CHANNEL_NOT_FOUND).toBe("remove_subscription");
		expect(ERROR_RECOVERY.RATE_LIMIT_EXCEEDED).toBe("reduce_rate");
		expect(ERROR_RECOVERY.INTERNAL_ERROR).toBe("retry_backoff");
		expect(ERROR_RECOVERY.CONNECTION_TIMEOUT).toBe("reconnect");
	});
});

describe("classification helpers", () => {
	it("isRetryable matches expected classes", () => {
		expect(isRetryable("INTERNAL_TIMEOUT")).toBe(true);
		expect(isRetryable("INTERNAL_ERROR")).toBe(true);
		expect(isRetryable("AUTH_FAILED")).toBe(false);
		expect(isRetryable("MESSAGE_INVALID_FORMAT")).toBe(false);
	});

	it("requiresAuthRefresh detects auth errors", () => {
		expect(requiresAuthRefresh("AUTH_FAILED")).toBe(true);
		expect(requiresAuthRefresh("AUTH_EXPIRED")).toBe(true);
		expect(requiresAuthRefresh("AUTH_INVALID_TOKEN")).toBe(true);
		expect(requiresAuthRefresh("INTERNAL_ERROR")).toBe(false);
	});

	it("isCritical uses severity mapping", () => {
		expect(isCritical("AUTH_FAILED")).toBe(true);
		expect(isCritical("INTERNAL_ERROR")).toBe(true);
		expect(isCritical("RATE_LIMIT_EXCEEDED")).toBe(false);
		expect(isCritical("CHANNEL_NOT_FOUND")).toBe(false);
	});
});

describe("getRetryDelay", () => {
	it("returns fixed delay for retry errors", () => {
		expect(getRetryDelay("INTERNAL_TIMEOUT", 0)).toBe(1000);
		expect(getRetryDelay("INTERNAL_TIMEOUT", 5)).toBe(1000);
	});

	it("returns bounded exponential backoff for retry_backoff errors", () => {
		const delay0 = getRetryDelay("INTERNAL_ERROR", 0);
		expect(delay0).toBeGreaterThanOrEqual(1000);
		expect(delay0).toBeLessThanOrEqual(1200);

		const delay1 = getRetryDelay("INTERNAL_ERROR", 1);
		expect(delay1).toBeGreaterThanOrEqual(2000);
		expect(delay1).toBeLessThanOrEqual(2400);

		const capped = getRetryDelay("INTERNAL_ERROR", 10);
		expect(capped).toBeLessThanOrEqual(36000);
	});

	it("returns linear and capped delays for reduce_rate errors", () => {
		expect(getRetryDelay("RATE_LIMIT_EXCEEDED", 0)).toBe(1000);
		expect(getRetryDelay("RATE_LIMIT_EXCEEDED", 1)).toBe(2000);
		expect(getRetryDelay("RATE_LIMIT_EXCEEDED", 4)).toBe(5000);
		expect(getRetryDelay("RATE_LIMIT_EXCEEDED", 10)).toBe(5000);
	});

	it("returns 0 for non-retryable errors", () => {
		expect(getRetryDelay("AUTH_FAILED", 0)).toBe(0);
		expect(getRetryDelay("CHANNEL_NOT_FOUND", 0)).toBe(0);
		expect(getRetryDelay("MESSAGE_INVALID_FORMAT", 0)).toBe(0);
	});
});

describe("mapping consistency", () => {
	it("all error codes have complete mappings and valid schema output", () => {
		for (const code of ErrorCode.options) {
			expect(ERROR_CODE_DESCRIPTIONS[code]).toBeDefined();
			expect(ERROR_SEVERITY[code]).toBeDefined();
			expect(ERROR_RECOVERY[code]).toBeDefined();

			const details = createErrorDetails(code);
			expect(details.code).toBe(code);
			expect(ErrorDetailsSchema.safeParse(details).success).toBe(true);
		}
	});

	it("every severity and recovery has at least one code", () => {
		for (const severity of ErrorSeverity.options) {
			expect(ErrorCode.options.some((code) => ERROR_SEVERITY[code] === severity)).toBe(true);
		}
		for (const recovery of RecoveryAction.options) {
			expect(ErrorCode.options.some((code) => ERROR_RECOVERY[code] === recovery)).toBe(true);
		}
	});
});
