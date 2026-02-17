export type AgentType =
	| "TechnicalAnalyst"
	| "NewsSentimentAnalyst"
	| "FundamentalsMacroAnalyst"
	| "BullishResearchAgent"
	| "BearishResearchAgent"
	| "TraderAgent"
	| "RiskManagerAgent"
	| "CriticAgent";

export interface ParseAttempt {
	attemptNumber: 1 | 2;
	rawOutput: string;
	success: boolean;
	error?: string;
	zodErrors?: FormattedZodError[];
	timestamp: string;
}

export interface FormattedZodError {
	path: string;
	message: string;
	expected?: string;
	received?: string;
}

export interface ParseResult<T> {
	success: boolean;
	data?: T;
	attempts: ParseAttempt[];
	finalError?: string;
	agentAction?: "SUCCESS" | "REJECT" | "SKIP";
}

export interface ParseLogger {
	debug(message: string, data?: Record<string, unknown>): void;
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
}

export const defaultLogger: ParseLogger = {
	debug: (_message, _data) => {},
	info: (_message, _data) => {},
	warn: (_message, _data) => {},
	error: (_message, _data) => {},
};

export interface ParseOptions {
	agentType?: AgentType;
	taskContext?: string;
	logger?: ParseLogger;
	retryCallback?: (retryPrompt: string) => Promise<string>;
	redactSecrets?: boolean;
}
