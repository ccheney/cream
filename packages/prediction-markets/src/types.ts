export {
	type AggregatedPredictionData,
	AggregatedPredictionDataSchema,
	createEmptyPredictionScores,
	getFedDirection,
	hasHighMacroUncertainty,
	hasHighPolicyRisk,
	type PredictionMarketEvent,
	PredictionMarketEventSchema,
	type PredictionMarketPayload,
	PredictionMarketPayloadSchema,
	type PredictionMarketScores,
	PredictionMarketScoresSchema,
	PredictionMarketType,
	type PredictionOutcome,
	PredictionOutcomeSchema,
	PredictionPlatform,
	toNumericScores,
} from "@cream/domain";

export type Platform = import("@cream/domain").PredictionPlatform;
export type MarketType = import("@cream/domain").PredictionMarketType;
export type MarketOutcome = import("@cream/domain").PredictionOutcome;

import type {
	PredictionMarketEvent,
	PredictionMarketScores,
	PredictionMarketType,
	PredictionPlatform,
} from "@cream/domain";

export interface PredictionMarketProvider {
	readonly platform: PredictionPlatform;
	fetchMarkets(marketTypes: PredictionMarketType[]): Promise<PredictionMarketEvent[]>;
	fetchMarketByTicker(ticker: string): Promise<PredictionMarketEvent | null>;
	calculateScores(events: PredictionMarketEvent[]): PredictionMarketScores;
}

type ErrorPlatform = PredictionPlatform | "AGGREGATOR";
type NoExtraProperties = Record<PropertyKey, never>;

type PredictionMarketErrorDefinition<TArgs extends unknown[], TExtra extends object> = (
	...args: TArgs
) => {
	message: string;
	platform: ErrorPlatform;
	code: string;
	cause?: Error;
	extra?: TExtra;
};

type PredictionMarketErrorConstructor<
	TArgs extends unknown[],
	TInstance extends PredictionMarketError,
> = {
	new (...args: TArgs): TInstance;
	readonly prototype: TInstance;
};

export class PredictionMarketError extends Error {
	constructor(
		message: string,
		public readonly platform: ErrorPlatform,
		public readonly code: string,
		public override readonly cause?: Error,
	) {
		super(message, { cause });
		this.name = "PredictionMarketError";
	}
}

function createPredictionMarketErrorConstructor<
	TArgs extends unknown[],
	TExtra extends object = NoExtraProperties,
	TInstance extends PredictionMarketError = PredictionMarketError & TExtra,
>(
	name: string,
	definition: PredictionMarketErrorDefinition<TArgs, TExtra>,
): PredictionMarketErrorConstructor<TArgs, TInstance> {
	function ErrorConstructor(this: unknown, ...args: TArgs): TInstance {
		void this;
		const { message, platform, code, cause, extra } = definition(...args);
		const error = new PredictionMarketError(message, platform, code, cause) as TInstance;
		error.name = name;
		if (extra) {
			Object.assign(error, extra);
		}
		Object.setPrototypeOf(error, Constructor.prototype);
		return error;
	}

	const Constructor = ErrorConstructor as unknown as PredictionMarketErrorConstructor<
		TArgs,
		TInstance
	>;

	Object.defineProperty(Constructor, "name", { value: name });
	Object.setPrototypeOf(Constructor.prototype, PredictionMarketError.prototype);
	Object.setPrototypeOf(Constructor, PredictionMarketError);
	Object.defineProperty(Constructor.prototype, "constructor", {
		value: Constructor,
		writable: true,
		configurable: true,
	});

	return Constructor;
}

export interface RateLimitError extends PredictionMarketError {
	readonly retryAfterMs: number;
}

export const RateLimitError = createPredictionMarketErrorConstructor<
	[platform: PredictionPlatform, retryAfterMs: number],
	{ readonly retryAfterMs: number },
	RateLimitError
>("RateLimitError", (platform, retryAfterMs) => ({
	message: `Rate limit exceeded for ${platform}`,
	platform,
	code: "RATE_LIMIT",
	extra: { retryAfterMs },
}));

export interface AuthenticationError extends PredictionMarketError {}

export const AuthenticationError = createPredictionMarketErrorConstructor<
	[platform: PredictionPlatform, message: string],
	NoExtraProperties,
	AuthenticationError
>("AuthenticationError", (platform, message) => ({
	message,
	platform,
	code: "AUTH_ERROR",
}));

export interface ConfigurationError extends PredictionMarketError {}

export const ConfigurationError = createPredictionMarketErrorConstructor<
	[platform: ErrorPlatform, message: string],
	NoExtraProperties,
	ConfigurationError
>("ConfigurationError", (platform, message) => ({
	message,
	platform,
	code: "CONFIG_MISSING",
}));

export interface InsufficientDataError extends PredictionMarketError {}

export const InsufficientDataError = createPredictionMarketErrorConstructor<
	[platform: ErrorPlatform, required: number, actual: number],
	NoExtraProperties,
	InsufficientDataError
>("InsufficientDataError", (platform, required, actual) => ({
	message: `Insufficient data: need ${required} samples, got ${actual}`,
	platform,
	code: "INSUFFICIENT_DATA",
}));

export interface ValidationError extends PredictionMarketError {}

export const ValidationError = createPredictionMarketErrorConstructor<
	[platform: ErrorPlatform, schemaName: string, details: string],
	NoExtraProperties,
	ValidationError
>("ValidationError", (platform, schemaName, details) => ({
	message: `Schema validation failed for ${schemaName}: ${details}`,
	platform,
	code: "VALIDATION_ERROR",
}));
