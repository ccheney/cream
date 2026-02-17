import type { ParityValidationResult } from "./parity.js";

export class ParityValidationError extends Error {
	readonly code: "VALIDATION_FAILED" | "NO_VALIDATION" | "NOT_READY";
	readonly report?: ParityValidationResult;

	constructor(
		message: string,
		code: "VALIDATION_FAILED" | "NO_VALIDATION" | "NOT_READY",
		report?: ParityValidationResult,
	) {
		super(message);
		this.name = "ParityValidationError";
		this.code = code;
		this.report = report;
	}
}
