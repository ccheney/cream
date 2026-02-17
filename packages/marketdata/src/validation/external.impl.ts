export {
	type ApiErrorResponse,
	ApiErrorResponseSchema,
	extractApiErrorMessage,
	extractRateLimitStatus,
	isApiErrorResponse,
} from "./external.api";

export {
	validateOHLC,
	validatePrice,
	validatePriceChange,
	validateRawCandle,
	validateRawCandles,
	validateSymbol,
	validateTimestamp,
	validateVolume,
} from "./external.data";

export {
	DEFAULT_EXTERNAL_VALIDATION_CONFIG,
	type ExternalDataValidationConfig,
	type ExternalValidationIssue,
	type ExternalValidationResult,
	type RateLimitStatus,
	type RawCandle,
} from "./external.types";

import { extractApiErrorMessage, extractRateLimitStatus, isApiErrorResponse } from "./external.api";
import {
	validateOHLC,
	validatePrice,
	validatePriceChange,
	validateRawCandle,
	validateRawCandles,
	validateSymbol,
	validateTimestamp,
	validateVolume,
} from "./external.data";
import { DEFAULT_EXTERNAL_VALIDATION_CONFIG } from "./external.types";

export default {
	validatePrice,
	validateOHLC,
	validatePriceChange,
	validateVolume,
	validateTimestamp,
	validateRawCandle,
	validateRawCandles,
	validateSymbol,
	isApiErrorResponse,
	extractApiErrorMessage,
	extractRateLimitStatus,
	DEFAULT_EXTERNAL_VALIDATION_CONFIG,
};
