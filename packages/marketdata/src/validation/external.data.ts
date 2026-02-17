import {
	DEFAULT_EXTERNAL_VALIDATION_CONFIG,
	type ExternalDataValidationConfig,
	type ExternalValidationIssue,
	type ExternalValidationResult,
	type RawCandle,
} from "./external.types";

function issue(
	field: string,
	value: unknown,
	message: string,
	severity: "warning" | "error",
): ExternalValidationIssue {
	return { field, value, issue: message, severity };
}

function validateRequiredNumber(field: string, value: unknown): ExternalValidationIssue[] {
	if (value === null || value === undefined) {
		return [
			issue(
				field,
				value,
				`${field[0]?.toUpperCase()}${field.slice(1)} is null or undefined`,
				"error",
			),
		];
	}
	const num = Number(value);
	if (Number.isNaN(num)) {
		return [
			issue(
				field,
				value,
				`${field[0]?.toUpperCase()}${field.slice(1)} is not a valid number`,
				"error",
			),
		];
	}
	if (!Number.isFinite(num)) {
		return [
			issue(field, value, `${field[0]?.toUpperCase()}${field.slice(1)} is infinite`, "error"),
		];
	}
	return [];
}

export function validatePrice(
	price: unknown,
	fieldName: string,
	config: ExternalDataValidationConfig = DEFAULT_EXTERNAL_VALIDATION_CONFIG,
): ExternalValidationIssue[] {
	const issues = validateRequiredNumber(fieldName, price);
	if (issues.length > 0) {
		return issues;
	}

	const num = Number(price);
	if (num < config.minPrice) {
		issues.push(
			issue(
				fieldName,
				num,
				`Price ${num} is below minimum ${config.minPrice}`,
				num < 0 ? "error" : "warning",
			),
		);
	}
	if (num > config.maxPrice) {
		issues.push(issue(fieldName, num, `Price ${num} exceeds maximum ${config.maxPrice}`, "error"));
	}

	return issues;
}

export function validateOHLC(
	open: number,
	high: number,
	low: number,
	close: number,
): ExternalValidationIssue[] {
	const issues: ExternalValidationIssue[] = [];
	if (high < open) {
		issues.push(issue("high", high, `High (${high}) is less than Open (${open})`, "error"));
	}
	if (high < close) {
		issues.push(issue("high", high, `High (${high}) is less than Close (${close})`, "error"));
	}
	if (high < low) {
		issues.push(issue("high", high, `High (${high}) is less than Low (${low})`, "error"));
	}
	if (low > open) {
		issues.push(issue("low", low, `Low (${low}) is greater than Open (${open})`, "error"));
	}
	if (low > close) {
		issues.push(issue("low", low, `Low (${low}) is greater than Close (${close})`, "error"));
	}
	return issues;
}

export function validatePriceChange(
	prevClose: number,
	currentOpen: number,
	config: ExternalDataValidationConfig = DEFAULT_EXTERNAL_VALIDATION_CONFIG,
): ExternalValidationIssue[] {
	if (prevClose <= 0) {
		return [];
	}
	const changePct = Math.abs((currentOpen - prevClose) / prevClose) * 100;
	if (changePct <= config.maxPriceChangePct) {
		return [];
	}
	return [
		issue(
			"open",
			currentOpen,
			`Price change of ${changePct.toFixed(2)}% exceeds maximum ${config.maxPriceChangePct}%`,
			"warning",
		),
	];
}

export function validateVolume(
	volume: unknown,
	config: ExternalDataValidationConfig = DEFAULT_EXTERNAL_VALIDATION_CONFIG,
): ExternalValidationIssue[] {
	const issues = validateRequiredNumber("volume", volume);
	if (issues.length > 0) {
		return issues;
	}
	const num = Number(volume);
	if (num < 0) {
		issues.push(issue("volume", num, "Volume cannot be negative", "error"));
	}
	if (num > config.maxVolume) {
		issues.push(
			issue("volume", num, `Volume ${num} exceeds maximum ${config.maxVolume}`, "warning"),
		);
	}
	return issues;
}

function parseTimestamp(timestamp: unknown): {
	date: Date | null;
	issues: ExternalValidationIssue[];
} {
	if (timestamp === null || timestamp === undefined) {
		return {
			date: null,
			issues: [issue("timestamp", timestamp, "Timestamp is null or undefined", "error")],
		};
	}

	if (timestamp instanceof Date) {
		return { date: timestamp, issues: [] };
	}
	if (typeof timestamp === "string") {
		return { date: new Date(timestamp), issues: [] };
	}
	if (typeof timestamp === "number") {
		const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
		return { date: new Date(ms), issues: [] };
	}
	return {
		date: null,
		issues: [issue("timestamp", timestamp, "Timestamp must be Date, string, or number", "error")],
	};
}

export function validateTimestamp(
	timestamp: unknown,
	config: ExternalDataValidationConfig = DEFAULT_EXTERNAL_VALIDATION_CONFIG,
): ExternalValidationIssue[] {
	const parsed = parseTimestamp(timestamp);
	if (parsed.issues.length > 0) {
		return parsed.issues;
	}

	const date = parsed.date;
	if (!date || Number.isNaN(date.getTime())) {
		return [issue("timestamp", timestamp, "Invalid timestamp format", "error")];
	}

	const now = Date.now();
	const maxFuture = now + config.maxFutureMinutes * 60_000;
	const minPast = now - config.maxAgeDays * 24 * 60 * 60 * 1000;
	const issues: ExternalValidationIssue[] = [];
	if (date.getTime() > maxFuture) {
		issues.push(
			issue(
				"timestamp",
				timestamp,
				`Timestamp ${date.toISOString()} is too far in the future`,
				"error",
			),
		);
	}
	if (date.getTime() < minPast) {
		issues.push(
			issue(
				"timestamp",
				timestamp,
				`Timestamp ${date.toISOString()} is too old (>${config.maxAgeDays} days)`,
				"warning",
			),
		);
	}
	return issues;
}

function extractRawCandleValues(candle: RawCandle) {
	return {
		timestamp: candle.timestamp ?? candle.t,
		open: candle.open ?? candle.o,
		high: candle.high ?? candle.h,
		low: candle.low ?? candle.l,
		close: candle.close ?? candle.c,
		volume: candle.volume ?? candle.v,
	};
}

function sanitizeRawCandle(values: {
	timestamp: unknown;
	open: unknown;
	high: unknown;
	low: unknown;
	close: unknown;
	volume: unknown;
}): Record<string, unknown> {
	return {
		timestamp: values.timestamp,
		open: Number(values.open),
		high: Number(values.high),
		low: Number(values.low),
		close: Number(values.close),
		volume: Number(values.volume),
	};
}

export function validateRawCandle(
	candle: RawCandle,
	config: ExternalDataValidationConfig = DEFAULT_EXTERNAL_VALIDATION_CONFIG,
): ExternalValidationResult {
	const values = extractRawCandleValues(candle);
	const issues: ExternalValidationIssue[] = [];

	issues.push(...validateTimestamp(values.timestamp, config));
	issues.push(...validatePrice(values.open, "open", config));
	issues.push(...validatePrice(values.high, "high", config));
	issues.push(...validatePrice(values.low, "low", config));
	issues.push(...validatePrice(values.close, "close", config));
	issues.push(...validateVolume(values.volume, config));

	if (
		config.enforceOHLC &&
		typeof values.open === "number" &&
		typeof values.high === "number" &&
		typeof values.low === "number" &&
		typeof values.close === "number"
	) {
		issues.push(...validateOHLC(values.open, values.high, values.low, values.close));
	}

	const hasErrors = issues.some((entry) => entry.severity === "error");
	return {
		valid: !hasErrors,
		issues,
		sanitized: hasErrors ? undefined : sanitizeRawCandle(values),
	};
}

export function validateRawCandles(
	candles: RawCandle[],
	config: ExternalDataValidationConfig = DEFAULT_EXTERNAL_VALIDATION_CONFIG,
): {
	valid: RawCandle[];
	invalid: Array<{ index: number; candle: RawCandle; issues: ExternalValidationIssue[] }>;
	totalIssues: number;
} {
	const valid: RawCandle[] = [];
	const invalid: Array<{ index: number; candle: RawCandle; issues: ExternalValidationIssue[] }> =
		[];
	let totalIssues = 0;

	for (let i = 0; i < candles.length; i++) {
		const candle = candles[i];
		if (!candle) {
			continue;
		}
		const result = validateRawCandle(candle, config);
		totalIssues += result.issues.length;
		if (result.valid) {
			valid.push(candle);
		} else {
			invalid.push({ index: i, candle, issues: result.issues });
		}
	}

	return { valid, invalid, totalIssues };
}

export function validateSymbol(symbol: unknown): ExternalValidationIssue[] {
	if (typeof symbol !== "string") {
		return [issue("symbol", symbol, "Symbol must be a string", "error")];
	}
	if (symbol.length === 0) {
		return [issue("symbol", symbol, "Symbol cannot be empty", "error")];
	}

	const issues: ExternalValidationIssue[] = [];
	if (symbol.length > 21) {
		issues.push(issue("symbol", symbol, "Symbol exceeds maximum length of 21 characters", "error"));
	}
	if (!/^[A-Z0-9.^/-]+$/i.test(symbol)) {
		issues.push(issue("symbol", symbol, "Symbol contains invalid characters", "error"));
	}
	return issues;
}
