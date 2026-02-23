"use client";

import { config } from "@/lib/config";

type FrontendErrorSource = "error" | "global-error";

interface FrontendErrorPayload {
	source: FrontendErrorSource;
	message: string;
	digest?: string;
	stack?: string;
	pathname?: string;
	userAgent?: string;
	timestamp: string;
}

const FRONTEND_ERROR_ENDPOINT = `${config.api.baseUrl}/api/system/frontend-errors`;

function buildPayload(
	source: FrontendErrorSource,
	error: Error & { digest?: string },
): FrontendErrorPayload {
	return {
		source,
		message: error.message,
		digest: error.digest,
		stack: error.stack,
		pathname: typeof window === "undefined" ? undefined : window.location.pathname,
		userAgent: typeof navigator === "undefined" ? undefined : navigator.userAgent,
		timestamp: new Date().toISOString(),
	};
}

export function reportFrontendError(
	source: FrontendErrorSource,
	error: Error & { digest?: string },
): void {
	const payload = buildPayload(source, error);
	void fetch(FRONTEND_ERROR_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
		credentials: "include",
		keepalive: true,
	}).catch(() => {
		// Error pages should avoid throwing from telemetry reporting.
	});
}
