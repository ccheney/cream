import { describe, expect, it } from "bun:test";
import {
	authError,
	channelError,
	connectionError,
	createErrorDetails,
	createErrorMessage,
	type EnhancedErrorMessage,
	EnhancedErrorMessageSchema,
	ERROR_CODE_DESCRIPTIONS,
	type ErrorDetails,
	ErrorDetailsSchema,
	internalError,
	limitError,
	messageError,
	rateLimitError,
} from "./errors.js";

describe("ErrorDetailsSchema valid cases", () => {
	it("validates basic details", () => {
		const details: ErrorDetails = {
			code: "AUTH_FAILED",
			message: "Authentication failed",
			severity: "critical",
			recovery: "refresh_token",
			timestamp: new Date().toISOString(),
		};
		expect(ErrorDetailsSchema.safeParse(details).success).toBe(true);
	});

	it("validates details with retry context", () => {
		const details: ErrorDetails = {
			code: "RATE_LIMIT_EXCEEDED",
			message: "Rate limit exceeded",
			severity: "warning",
			recovery: "reduce_rate",
			timestamp: new Date().toISOString(),
			context: { retryAfterMs: 5000 },
		};
		expect(ErrorDetailsSchema.safeParse(details).success).toBe(true);
	});

	it("validates details with channel/limit context", () => {
		const channelDetails: ErrorDetails = {
			code: "CHANNEL_NOT_FOUND",
			message: "Channel not found",
			severity: "info",
			recovery: "remove_subscription",
			timestamp: new Date().toISOString(),
			context: { channel: "invalid-channel" },
		};
		expect(ErrorDetailsSchema.safeParse(channelDetails).success).toBe(true);

		const limitDetails: ErrorDetails = {
			code: "LIMIT_MAX_SYMBOLS",
			message: "Maximum symbols exceeded",
			severity: "warning",
			recovery: "remove_subscription",
			timestamp: new Date().toISOString(),
			context: { limit: 100, current: 105 },
		};
		expect(ErrorDetailsSchema.safeParse(limitDetails).success).toBe(true);
	});
});

describe("ErrorDetailsSchema invalid cases", () => {
	it("rejects invalid error code", () => {
		const result = ErrorDetailsSchema.safeParse({
			code: "INVALID_CODE",
			message: "Test",
			severity: "info",
			recovery: "none",
			timestamp: new Date().toISOString(),
		});
		expect(result.success).toBe(false);
	});

	it("rejects invalid severity", () => {
		const result = ErrorDetailsSchema.safeParse({
			code: "AUTH_FAILED",
			message: "Test",
			severity: "extreme",
			recovery: "none",
			timestamp: new Date().toISOString(),
		});
		expect(result.success).toBe(false);
	});
});

describe("EnhancedErrorMessageSchema", () => {
	it("validates valid enhanced error message", () => {
		const message: EnhancedErrorMessage = {
			type: "error",
			error: {
				code: "AUTH_FAILED",
				message: "Authentication failed",
				severity: "critical",
				recovery: "refresh_token",
				timestamp: new Date().toISOString(),
			},
		};
		expect(EnhancedErrorMessageSchema.safeParse(message).success).toBe(true);
	});

	it("rejects missing or invalid type", () => {
		const missingType = {
			error: {
				code: "AUTH_FAILED",
				message: "Authentication failed",
				severity: "critical",
				recovery: "refresh_token",
				timestamp: new Date().toISOString(),
			},
		};
		expect(EnhancedErrorMessageSchema.safeParse(missingType).success).toBe(false);

		const wrongType = {
			type: "warning",
			error: {
				code: "AUTH_FAILED",
				message: "Authentication failed",
				severity: "critical",
				recovery: "refresh_token",
				timestamp: new Date().toISOString(),
			},
		};
		expect(EnhancedErrorMessageSchema.safeParse(wrongType).success).toBe(false);
	});
});

describe("createErrorDetails", () => {
	it("creates details with defaults", () => {
		const details = createErrorDetails("AUTH_FAILED");
		expect(details.code).toBe("AUTH_FAILED");
		expect(details.message).toBe(ERROR_CODE_DESCRIPTIONS.AUTH_FAILED);
		expect(details.severity).toBe("critical");
		expect(details.recovery).toBe("refresh_token");
		expect(details.timestamp).toBeDefined();
	});

	it("supports custom message and context", () => {
		const custom = createErrorDetails("AUTH_FAILED", "Custom auth error message");
		expect(custom.message).toBe("Custom auth error message");

		const contextual = createErrorDetails("RATE_LIMIT_EXCEEDED", undefined, { retryAfterMs: 5000 });
		expect(contextual.context?.retryAfterMs).toBe(5000);
	});

	it("generates valid timestamp", () => {
		const details = createErrorDetails("AUTH_FAILED");
		expect(details.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		expect(new Date(details.timestamp).getTime()).not.toBeNaN();
	});
});

describe("createErrorMessage", () => {
	it("creates enhanced error message", () => {
		const message = createErrorMessage("AUTH_FAILED");
		expect(message.type).toBe("error");
		expect(message.error.code).toBe("AUTH_FAILED");
		expect(message.error.severity).toBe("critical");
	});

	it("produces schema-valid messages", () => {
		const message = createErrorMessage("RATE_LIMIT_EXCEEDED", undefined, { retryAfterMs: 5000 });
		expect(EnhancedErrorMessageSchema.safeParse(message).success).toBe(true);
	});
});

describe("authError", () => {
	it("creates failed/expired/invalid token auth errors", () => {
		expect(authError("failed").error.code).toBe("AUTH_FAILED");
		expect(authError("expired").error.code).toBe("AUTH_EXPIRED");
		expect(authError("invalid_token").error.code).toBe("AUTH_INVALID_TOKEN");
	});
});

describe("channelError", () => {
	it("creates not found, unauthorized, and invalid channel errors", () => {
		const notFound = channelError("not_found", "invalid-channel");
		expect(notFound.error.code).toBe("CHANNEL_NOT_FOUND");
		expect(notFound.error.context?.channel).toBe("invalid-channel");

		const unauthorized = channelError("unauthorized", "admin-channel");
		expect(unauthorized.error.code).toBe("CHANNEL_UNAUTHORIZED");

		const invalid = channelError("invalid", "!!bad");
		expect(invalid.error.code).toBe("CHANNEL_INVALID");
	});
});

describe("messageError", () => {
	it("creates each message error variant", () => {
		expect(messageError("invalid_format", { bad: "message" }).error.code).toBe(
			"MESSAGE_INVALID_FORMAT",
		);
		expect(messageError("invalid_type").error.code).toBe("MESSAGE_INVALID_TYPE");
		expect(messageError("too_large").error.code).toBe("MESSAGE_TOO_LARGE");
		expect(messageError("parse_error").error.code).toBe("MESSAGE_PARSE_ERROR");
	});
});

describe("rateLimitError", () => {
	it("creates general/messages/subscriptions rate errors", () => {
		expect(rateLimitError("general").error.code).toBe("RATE_LIMIT_EXCEEDED");
		const messages = rateLimitError("messages", 5000);
		expect(messages.error.code).toBe("RATE_LIMIT_MESSAGES");
		expect(messages.error.context?.retryAfterMs).toBe(5000);
		expect(rateLimitError("subscriptions").error.code).toBe("RATE_LIMIT_SUBSCRIPTIONS");
	});
});

describe("limitError", () => {
	it("creates connections/symbols/channels limit errors", () => {
		const connections = limitError("connections", 5, 6);
		expect(connections.error.code).toBe("LIMIT_MAX_CONNECTIONS");
		expect(connections.error.message).toContain("6/5");
		expect(connections.error.context?.limit).toBe(5);
		expect(connections.error.context?.current).toBe(6);

		const symbols = limitError("symbols", 100, 105);
		expect(symbols.error.code).toBe("LIMIT_MAX_SYMBOLS");

		expect(limitError("channels", 10, 11).error.code).toBe("LIMIT_MAX_CHANNELS");
	});
});

describe("internalError and connectionError", () => {
	it("creates all internal error variants", () => {
		expect(internalError("error").error.code).toBe("INTERNAL_ERROR");
		expect(internalError("timeout").error.code).toBe("INTERNAL_TIMEOUT");
		expect(internalError("unavailable").error.code).toBe("INTERNAL_UNAVAILABLE");
	});

	it("creates all connection error variants", () => {
		expect(connectionError("closing").error.code).toBe("CONNECTION_CLOSING");
		expect(connectionError("timeout").error.code).toBe("CONNECTION_TIMEOUT");
	});
});
