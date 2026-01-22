/**
 * Simple structured logger for validate-versions script.
 * Self-contained to avoid workspace package resolution issues.
 */

interface LogContext {
	[key: string]: unknown;
}

interface Logger {
	info(message: string): void;
	info(context: LogContext, message: string): void;
	warn(message: string): void;
	warn(context: LogContext, message: string): void;
	error(message: string): void;
	error(context: LogContext, message: string): void;
}

const colors = {
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	blue: "\x1b[34m",
	yellow: "\x1b[33m",
	red: "\x1b[31m",
};

function formatTimestamp(): string {
	return new Date().toISOString();
}

function formatContext(context: LogContext): string {
	const entries = Object.entries(context);
	if (entries.length === 0) return "";
	return " " + entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ");
}

function log(level: string, color: string, context: LogContext, message: string): void {
	const timestamp = formatTimestamp();
	const contextStr = formatContext(context);
	process.stderr.write(
		`${colors.dim}${timestamp}${colors.reset} ${color}${level}${colors.reset} [validate-versions]${contextStr} ${message}\n`,
	);
}

export function createLogger(): Logger {
	return {
		info(contextOrMessage: LogContext | string, message?: string): void {
			if (typeof contextOrMessage === "string") {
				log("INFO", colors.blue, {}, contextOrMessage);
			} else {
				log("INFO", colors.blue, contextOrMessage, message ?? "");
			}
		},
		warn(contextOrMessage: LogContext | string, message?: string): void {
			if (typeof contextOrMessage === "string") {
				log("WARN", colors.yellow, {}, contextOrMessage);
			} else {
				log("WARN", colors.yellow, contextOrMessage, message ?? "");
			}
		},
		error(contextOrMessage: LogContext | string, message?: string): void {
			if (typeof contextOrMessage === "string") {
				log("ERROR", colors.red, {}, contextOrMessage);
			} else {
				log("ERROR", colors.red, contextOrMessage, message ?? "");
			}
		},
	};
}
