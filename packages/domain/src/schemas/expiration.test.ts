/**
 * Expiration Handling Tests
 *
 * Tests for expiration schemas, evaluation, and helper functions.
 */

import { describe, expect, it } from "bun:test";
import {
	checkPinRisk,
	classifyMoneyness,
	DEFAULT_EXPIRATION_POLICY,
	EXPIRATION_CHECKPOINT_TIMES,
	ExpirationAction,
	ExpirationCheckpoint,
	ExpirationEvaluationSchema,
	ExpirationPolicyConfig,
	ExpirationReason,
	type ExpiringPosition,
	ExpiringPositionSchema,
	getCurrentCheckpoint,
	getMinimumDTE,
	getPinRiskThreshold,
	isPastCheckpoint,
	MinimumDTEConfig,
	Moneyness,
	PinRiskConfig,
	PositionTypeForDTE,
	parseETTimeToMinutes,
	shouldLetExpireWorthless,
} from "./expiration.js";

// ============================================
// Enum Tests
// ============================================

describe("ExpirationAction", () => {
	it("should have all expected values", () => {
		expect(ExpirationAction.parse("CLOSE")).toBe("CLOSE");
		expect(ExpirationAction.parse("EXERCISE")).toBe("EXERCISE");
		expect(ExpirationAction.parse("LET_EXPIRE")).toBe("LET_EXPIRE");
		expect(ExpirationAction.parse("ROLL")).toBe("ROLL");
	});

	it("should reject invalid values", () => {
		expect(() => ExpirationAction.parse("INVALID")).toThrow();
	});
});

describe("ExpirationReason", () => {
	it("should have all expected values", () => {
		expect(ExpirationReason.parse("MINIMUM_DTE")).toBe("MINIMUM_DTE");
		expect(ExpirationReason.parse("PIN_RISK")).toBe("PIN_RISK");
		expect(ExpirationReason.parse("ITM_EXPIRATION")).toBe("ITM_EXPIRATION");
		expect(ExpirationReason.parse("TIMELINE_TRIGGER")).toBe("TIMELINE_TRIGGER");
		expect(ExpirationReason.parse("FORCE_CLOSE")).toBe("FORCE_CLOSE");
		expect(ExpirationReason.parse("AFTER_HOURS_RISK")).toBe("AFTER_HOURS_RISK");
	});
});

describe("PositionTypeForDTE", () => {
	it("should have all expected values", () => {
		expect(PositionTypeForDTE.parse("LONG_OPTION")).toBe("LONG_OPTION");
		expect(PositionTypeForDTE.parse("SHORT_UNCOVERED")).toBe("SHORT_UNCOVERED");
		expect(PositionTypeForDTE.parse("DEFINED_RISK_SPREAD")).toBe("DEFINED_RISK_SPREAD");
		expect(PositionTypeForDTE.parse("COMPLEX_STRATEGY")).toBe("COMPLEX_STRATEGY");
	});
});

describe("Moneyness", () => {
	it("should have all expected values", () => {
		expect(Moneyness.parse("DEEP_ITM")).toBe("DEEP_ITM");
		expect(Moneyness.parse("ITM")).toBe("ITM");
		expect(Moneyness.parse("ATM")).toBe("ATM");
		expect(Moneyness.parse("OTM")).toBe("OTM");
		expect(Moneyness.parse("DEEP_OTM")).toBe("DEEP_OTM");
	});
});

describe("ExpirationCheckpoint", () => {
	it("should have all expected values", () => {
		expect(ExpirationCheckpoint.parse("MARKET_OPEN")).toBe("MARKET_OPEN");
		expect(ExpirationCheckpoint.parse("AUTO_CLOSE_ITM")).toBe("AUTO_CLOSE_ITM");
		expect(ExpirationCheckpoint.parse("FINAL_WARNING")).toBe("FINAL_WARNING");
		expect(ExpirationCheckpoint.parse("FORCE_CLOSE")).toBe("FORCE_CLOSE");
		expect(ExpirationCheckpoint.parse("MARKET_CLOSE")).toBe("MARKET_CLOSE");
		expect(ExpirationCheckpoint.parse("OCC_DEADLINE")).toBe("OCC_DEADLINE");
	});
});

// ============================================
// Configuration Tests
// ============================================

describe("MinimumDTEConfig", () => {
	it("should have correct defaults", () => {
		const config = MinimumDTEConfig.parse({});
		expect(config.longOption).toBe(1);
		expect(config.shortUncovered).toBe(3);
		expect(config.definedRiskSpread).toBe(1);
		expect(config.complexStrategy).toBe(3);
	});

	it("should accept custom values", () => {
		const config = MinimumDTEConfig.parse({
			longOption: 2,
			shortUncovered: 5,
		});
		expect(config.longOption).toBe(2);
		expect(config.shortUncovered).toBe(5);
	});

	it("should validate range", () => {
		expect(() => MinimumDTEConfig.parse({ longOption: -1 })).toThrow();
		expect(() => MinimumDTEConfig.parse({ longOption: 31 })).toThrow();
	});
});

describe("PinRiskConfig", () => {
	it("should have correct defaults", () => {
		const config = PinRiskConfig.parse({});
		expect(config.threshold).toBe(0.5);
		expect(config.thresholdHighPrice).toBe(1.0);
		expect(config.highPriceThreshold).toBe(500);
		expect(config.autoClose).toBe(true);
	});

	it("should accept custom values", () => {
		const config = PinRiskConfig.parse({
			threshold: 0.75,
			autoClose: false,
		});
		expect(config.threshold).toBe(0.75);
		expect(config.autoClose).toBe(false);
	});
});

describe("ExpirationPolicyConfig", () => {
	it("should have correct defaults", () => {
		const config = ExpirationPolicyConfig.parse({});
		expect(config.allowExercise).toBe(false);
		expect(config.autoCloseITMTime).toBe("12:00");
		expect(config.forceCloseTime).toBe("15:00");
		expect(config.closeITMByTime).toBe("14:00");
		expect(config.disabled).toBe(false);
	});

	it("should validate time format", () => {
		expect(() => ExpirationPolicyConfig.parse({ autoCloseITMTime: "invalid" })).toThrow();
		// Note: Regex only validates format HH:MM, not valid time range
		// "25:00" matches \d{2}:\d{2} so it passes regex validation
	});
});

// ============================================
// Default Configuration Tests
// ============================================

describe("DEFAULT_EXPIRATION_POLICY", () => {
	it("should be valid config", () => {
		const result = ExpirationPolicyConfig.safeParse(DEFAULT_EXPIRATION_POLICY);
		expect(result.success).toBe(true);
	});

	it("should have expected values", () => {
		expect(DEFAULT_EXPIRATION_POLICY.minimumDTE.shortUncovered).toBe(3);
		expect(DEFAULT_EXPIRATION_POLICY.pinRisk.threshold).toBe(0.5);
		expect(DEFAULT_EXPIRATION_POLICY.allowExercise).toBe(false);
	});
});

// ============================================
// Checkpoint Times Tests
// ============================================

describe("EXPIRATION_CHECKPOINT_TIMES", () => {
	it("should have all checkpoints", () => {
		expect(EXPIRATION_CHECKPOINT_TIMES.MARKET_OPEN).toBe("09:30");
		expect(EXPIRATION_CHECKPOINT_TIMES.AUTO_CLOSE_ITM).toBe("12:00");
		expect(EXPIRATION_CHECKPOINT_TIMES.FINAL_WARNING).toBe("14:00");
		expect(EXPIRATION_CHECKPOINT_TIMES.FORCE_CLOSE).toBe("15:00");
		expect(EXPIRATION_CHECKPOINT_TIMES.MARKET_CLOSE).toBe("16:00");
		expect(EXPIRATION_CHECKPOINT_TIMES.OCC_DEADLINE).toBe("17:30");
	});
});

// ============================================
// Helper Function Tests
// ============================================

describe("getMinimumDTE", () => {
	it("should return correct DTE for each position type", () => {
		expect(getMinimumDTE("LONG_OPTION")).toBe(1);
		expect(getMinimumDTE("SHORT_UNCOVERED")).toBe(3);
		expect(getMinimumDTE("DEFINED_RISK_SPREAD")).toBe(1);
		expect(getMinimumDTE("COMPLEX_STRATEGY")).toBe(3);
	});

	it("should use custom config", () => {
		const config = { longOption: 2, shortUncovered: 5, definedRiskSpread: 2, complexStrategy: 4 };
		expect(getMinimumDTE("LONG_OPTION", config)).toBe(2);
		expect(getMinimumDTE("SHORT_UNCOVERED", config)).toBe(5);
	});
});

describe("classifyMoneyness", () => {
	it("should classify CALL correctly", () => {
		// CALL: ITM when underlying > strike
		expect(classifyMoneyness(110, 100, "CALL")).toBe("DEEP_ITM");
		expect(classifyMoneyness(103, 100, "CALL")).toBe("ITM");
		// ATM is within $0.50 of strike (default pin risk threshold)
		expect(classifyMoneyness(100.25, 100, "CALL")).toBe("ATM"); // $0.25 ITM - within ATM range
		expect(classifyMoneyness(100, 100, "CALL")).toBe("ATM");
		expect(classifyMoneyness(99.75, 100, "CALL")).toBe("ATM"); // $0.25 OTM - within ATM range
		expect(classifyMoneyness(97, 100, "CALL")).toBe("OTM"); // $3 OTM
		expect(classifyMoneyness(90, 100, "CALL")).toBe("DEEP_OTM"); // $10 OTM
	});

	it("should classify PUT correctly", () => {
		// PUT: ITM when underlying < strike
		expect(classifyMoneyness(90, 100, "PUT")).toBe("DEEP_ITM");
		expect(classifyMoneyness(97, 100, "PUT")).toBe("ITM");
		// ATM is within $0.50 of strike
		expect(classifyMoneyness(99.75, 100, "PUT")).toBe("ATM"); // $0.25 ITM - within ATM range
		expect(classifyMoneyness(100, 100, "PUT")).toBe("ATM");
		expect(classifyMoneyness(100.25, 100, "PUT")).toBe("ATM"); // $0.25 OTM - within ATM range
		expect(classifyMoneyness(103, 100, "PUT")).toBe("OTM"); // $3 OTM
		expect(classifyMoneyness(110, 100, "PUT")).toBe("DEEP_OTM"); // $10 OTM
	});
});

describe("checkPinRisk", () => {
	it("should detect pin risk within threshold", () => {
		expect(checkPinRisk(100.25, 100)).toBe(true);
		expect(checkPinRisk(99.75, 100)).toBe(true);
		expect(checkPinRisk(100.5, 100)).toBe(true);
	});

	it("should not detect pin risk outside threshold", () => {
		expect(checkPinRisk(101, 100)).toBe(false);
		expect(checkPinRisk(99, 100)).toBe(false);
	});

	it("should use wider threshold for high-priced underlyings", () => {
		// Default high price threshold is $500, wider threshold is $1.00
		expect(checkPinRisk(500.75, 500)).toBe(true);
		expect(checkPinRisk(501, 500)).toBe(true);
		expect(checkPinRisk(501.5, 500)).toBe(false);
	});

	it("should use custom config", () => {
		// With highPriceThreshold: 200, price 100 uses threshold: 1.0
		const config = {
			threshold: 1.0,
			thresholdHighPrice: 2.0,
			highPriceThreshold: 200,
			autoClose: true,
		};
		expect(checkPinRisk(101, 100, config)).toBe(true); // $1 distance, within $1.0 threshold
		expect(checkPinRisk(102, 100, config)).toBe(false); // $2 distance, outside $1.0 threshold
	});
});

describe("getPinRiskThreshold", () => {
	it("should return standard threshold for low-priced underlyings", () => {
		expect(getPinRiskThreshold(100)).toBe(0.5);
		expect(getPinRiskThreshold(499)).toBe(0.5);
	});

	it("should return wider threshold for high-priced underlyings", () => {
		expect(getPinRiskThreshold(500)).toBe(1.0);
		expect(getPinRiskThreshold(1000)).toBe(1.0);
	});
});

describe("shouldLetExpireWorthless", () => {
	const makePosition = (overrides: Partial<ExpiringPosition>): ExpiringPosition => ({
		positionId: "test-1",
		osiSymbol: "AAPL  260117C00150000",
		underlyingSymbol: "AAPL",
		expirationDate: "2026-01-17",
		strike: 150,
		right: "CALL",
		quantity: 1,
		underlyingPrice: 140,
		dte: 0.5,
		positionType: "LONG_OPTION",
		moneyness: "OTM",
		distanceFromStrike: 10,
		isPinRisk: false,
		isExpirationDay: true,
		...overrides,
	});

	it("should allow long OTM to expire worthless", () => {
		const position = makePosition({ quantity: 1, moneyness: "OTM" });
		expect(shouldLetExpireWorthless(position)).toBe(true);
	});

	it("should allow long DEEP_OTM to expire worthless", () => {
		const position = makePosition({ quantity: 1, moneyness: "DEEP_OTM" });
		expect(shouldLetExpireWorthless(position)).toBe(true);
	});

	it("should NOT allow short to expire worthless", () => {
		const position = makePosition({ quantity: -1, moneyness: "OTM" });
		expect(shouldLetExpireWorthless(position)).toBe(false);
	});

	it("should NOT allow ITM to expire worthless", () => {
		const position = makePosition({ quantity: 1, moneyness: "ITM" });
		expect(shouldLetExpireWorthless(position)).toBe(false);
	});

	it("should NOT allow ATM to expire worthless", () => {
		const position = makePosition({ quantity: 1, moneyness: "ATM" });
		expect(shouldLetExpireWorthless(position)).toBe(false);
	});

	it("should NOT allow pin risk position to expire worthless", () => {
		const position = makePosition({ quantity: 1, moneyness: "OTM", isPinRisk: true });
		expect(shouldLetExpireWorthless(position)).toBe(false);
	});
});

describe("parseETTimeToMinutes", () => {
	it("should parse time strings correctly", () => {
		expect(parseETTimeToMinutes("09:30")).toBe(9 * 60 + 30);
		expect(parseETTimeToMinutes("12:00")).toBe(12 * 60);
		expect(parseETTimeToMinutes("15:00")).toBe(15 * 60);
		expect(parseETTimeToMinutes("17:30")).toBe(17 * 60 + 30);
	});

	it("should throw on invalid format", () => {
		expect(() => parseETTimeToMinutes("invalid")).toThrow();
		// Note: "9:30" still parses correctly (hours=9, minutes=30)
	});
});

describe("getCurrentCheckpoint", () => {
	it("should return null before market open", () => {
		expect(getCurrentCheckpoint(9 * 60)).toBe(null); // 9:00 AM
	});

	it("should return MARKET_OPEN after 9:30", () => {
		expect(getCurrentCheckpoint(9 * 60 + 30)).toBe("MARKET_OPEN");
		expect(getCurrentCheckpoint(11 * 60)).toBe("MARKET_OPEN");
	});

	it("should return AUTO_CLOSE_ITM after 12:00", () => {
		expect(getCurrentCheckpoint(12 * 60)).toBe("AUTO_CLOSE_ITM");
		expect(getCurrentCheckpoint(13 * 60)).toBe("AUTO_CLOSE_ITM");
	});

	it("should return FINAL_WARNING after 14:00", () => {
		expect(getCurrentCheckpoint(14 * 60)).toBe("FINAL_WARNING");
	});

	it("should return FORCE_CLOSE after 15:00", () => {
		expect(getCurrentCheckpoint(15 * 60)).toBe("FORCE_CLOSE");
	});

	it("should return MARKET_CLOSE after 16:00", () => {
		expect(getCurrentCheckpoint(16 * 60)).toBe("MARKET_CLOSE");
	});

	it("should return OCC_DEADLINE after 17:30", () => {
		expect(getCurrentCheckpoint(17 * 60 + 30)).toBe("OCC_DEADLINE");
	});
});

describe("isPastCheckpoint", () => {
	it("should return true when past checkpoint", () => {
		expect(isPastCheckpoint("MARKET_OPEN", 10 * 60)).toBe(true);
		expect(isPastCheckpoint("FORCE_CLOSE", 16 * 60)).toBe(true);
	});

	it("should return false when before checkpoint", () => {
		expect(isPastCheckpoint("FORCE_CLOSE", 14 * 60)).toBe(false);
		expect(isPastCheckpoint("OCC_DEADLINE", 17 * 60)).toBe(false);
	});

	it("should return true at exact checkpoint time", () => {
		expect(isPastCheckpoint("FORCE_CLOSE", 15 * 60)).toBe(true);
	});
});

// ============================================
// Schema Validation Tests
// ============================================

describe("ExpiringPositionSchema", () => {
	it("should validate a complete position", () => {
		const position = {
			positionId: "pos-123",
			osiSymbol: "AAPL  260117C00150000",
			underlyingSymbol: "AAPL",
			expirationDate: "2026-01-17",
			strike: 150,
			right: "CALL",
			quantity: 1,
			underlyingPrice: 155,
			dte: 12.5,
			positionType: "LONG_OPTION",
			moneyness: "ITM",
			distanceFromStrike: 5,
			isPinRisk: false,
			isExpirationDay: false,
		};

		const result = ExpiringPositionSchema.safeParse(position);
		expect(result.success).toBe(true);
	});

	it("should reject invalid right", () => {
		const position = {
			positionId: "pos-123",
			osiSymbol: "AAPL  260117C00150000",
			underlyingSymbol: "AAPL",
			expirationDate: "2026-01-17",
			strike: 150,
			right: "INVALID",
			quantity: 1,
			underlyingPrice: 155,
			dte: 12.5,
			positionType: "LONG_OPTION",
			moneyness: "ITM",
			distanceFromStrike: 5,
			isPinRisk: false,
			isExpirationDay: false,
		};

		const result = ExpiringPositionSchema.safeParse(position);
		expect(result.success).toBe(false);
	});
});

describe("ExpirationEvaluationSchema", () => {
	it("should validate a complete evaluation", () => {
		const position = {
			positionId: "pos-123",
			osiSymbol: "AAPL  260117C00150000",
			underlyingSymbol: "AAPL",
			expirationDate: "2026-01-17",
			strike: 150,
			right: "CALL" as const,
			quantity: -1,
			underlyingPrice: 150.25,
			dte: 0.5,
			positionType: "SHORT_UNCOVERED" as const,
			moneyness: "ATM" as const,
			distanceFromStrike: 0.25,
			isPinRisk: true,
			isExpirationDay: true,
		};

		const evaluation = {
			position,
			action: "CLOSE",
			reason: "PIN_RISK",
			priority: 9,
			explanation: "Short CALL within $0.50 of strike - pin risk at expiration",
			deadline: "2026-01-17T15:00:00.000Z",
			isForced: true,
		};

		const result = ExpirationEvaluationSchema.safeParse(evaluation);
		expect(result.success).toBe(true);
	});

	it("should validate priority range", () => {
		const position = {
			positionId: "pos-123",
			osiSymbol: "AAPL  260117C00150000",
			underlyingSymbol: "AAPL",
			expirationDate: "2026-01-17",
			strike: 150,
			right: "CALL" as const,
			quantity: 1,
			underlyingPrice: 155,
			dte: 5,
			positionType: "LONG_OPTION" as const,
			moneyness: "ITM" as const,
			distanceFromStrike: 5,
			isPinRisk: false,
			isExpirationDay: false,
		};

		// Priority must be 1-10
		expect(
			ExpirationEvaluationSchema.safeParse({
				position,
				action: "CLOSE",
				reason: "MINIMUM_DTE",
				priority: 0,
				explanation: "test",
				isForced: false,
			}).success,
		).toBe(false);

		expect(
			ExpirationEvaluationSchema.safeParse({
				position,
				action: "CLOSE",
				reason: "MINIMUM_DTE",
				priority: 11,
				explanation: "test",
				isForced: false,
			}).success,
		).toBe(false);

		expect(
			ExpirationEvaluationSchema.safeParse({
				position,
				action: "CLOSE",
				reason: "MINIMUM_DTE",
				priority: 5,
				explanation: "test",
				isForced: false,
			}).success,
		).toBe(true);
	});
});
