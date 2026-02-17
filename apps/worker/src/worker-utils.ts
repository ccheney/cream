import type { TriggerResult } from "./shared/index.js";

export function toErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "Unknown error";
}

export function successTriggerResult(
	startTime: number,
	message: string,
	options: Partial<TriggerResult> = {},
): TriggerResult {
	return {
		success: true,
		message,
		durationMs: options.durationMs ?? Date.now() - startTime,
		processed: options.processed,
		failed: options.failed,
		error: options.error,
	};
}

export function failedTriggerResult(
	startTime: number,
	message: string,
	error: unknown,
): TriggerResult {
	return {
		success: false,
		message,
		error: toErrorMessage(error),
		durationMs: Date.now() - startTime,
	};
}
