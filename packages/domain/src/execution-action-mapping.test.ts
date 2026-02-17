import { describe, expect, test } from "bun:test";
import { ActionMappingError, deriveActionFromPositions, mapActionToBrokerOrder } from "./execution";

describe("mapActionToBrokerOrder BUY/SELL", () => {
	test("maps BUY flat to long position", () => {
		const result = mapActionToBrokerOrder("BUY", 0, 100);
		expect(result).not.toBeNull();
		expect(result?.side).toBe("BUY");
		expect(result?.quantity).toBe(100);
	});

	test("BUY throws if not flat or target not positive", () => {
		expect(() => mapActionToBrokerOrder("BUY", 50, 150)).toThrow(ActionMappingError);
		expect(() => mapActionToBrokerOrder("BUY", 0, 0)).toThrow(ActionMappingError);
		expect(() => mapActionToBrokerOrder("BUY", 0, -100)).toThrow(ActionMappingError);
	});

	test("maps SELL flat to short position", () => {
		const result = mapActionToBrokerOrder("SELL", 0, -100);
		expect(result).not.toBeNull();
		expect(result?.side).toBe("SELL");
		expect(result?.quantity).toBe(100);
	});

	test("SELL throws if not flat or target not negative", () => {
		expect(() => mapActionToBrokerOrder("SELL", -50, -150)).toThrow(ActionMappingError);
		expect(() => mapActionToBrokerOrder("SELL", 0, 0)).toThrow(ActionMappingError);
		expect(() => mapActionToBrokerOrder("SELL", 0, 100)).toThrow(ActionMappingError);
	});
});

describe("mapActionToBrokerOrder INCREASE", () => {
	test("increases long position with broker BUY", () => {
		const result = mapActionToBrokerOrder("INCREASE", 100, 200);
		expect(result?.side).toBe("BUY");
		expect(result?.quantity).toBe(100);
	});

	test("increases short position with broker SELL", () => {
		const result = mapActionToBrokerOrder("INCREASE", -100, -200);
		expect(result?.side).toBe("SELL");
		expect(result?.quantity).toBe(100);
	});

	test("throws when INCREASE is invalid", () => {
		expect(() => mapActionToBrokerOrder("INCREASE", 0, 100)).toThrow(ActionMappingError);
		expect(() => mapActionToBrokerOrder("INCREASE", 100, 50)).toThrow(ActionMappingError);
		expect(() => mapActionToBrokerOrder("INCREASE", -100, -50)).toThrow(ActionMappingError);
	});
});

describe("mapActionToBrokerOrder REDUCE", () => {
	test("reduces long position with broker SELL", () => {
		const result = mapActionToBrokerOrder("REDUCE", 100, 50);
		expect(result?.side).toBe("SELL");
		expect(result?.quantity).toBe(50);
	});

	test("reduces short position with broker BUY", () => {
		const result = mapActionToBrokerOrder("REDUCE", -100, -50);
		expect(result?.side).toBe("BUY");
		expect(result?.quantity).toBe(50);
	});

	test("closes long and short positions to flat", () => {
		const closeLong = mapActionToBrokerOrder("REDUCE", 100, 0);
		expect(closeLong?.side).toBe("SELL");
		expect(closeLong?.quantity).toBe(100);

		const closeShort = mapActionToBrokerOrder("REDUCE", -100, 0);
		expect(closeShort?.side).toBe("BUY");
		expect(closeShort?.quantity).toBe(100);
	});

	test("throws when REDUCE is invalid", () => {
		expect(() => mapActionToBrokerOrder("REDUCE", 0, 0)).toThrow(ActionMappingError);
		expect(() => mapActionToBrokerOrder("REDUCE", 100, 150)).toThrow(ActionMappingError);
		expect(() => mapActionToBrokerOrder("REDUCE", -100, -150)).toThrow(ActionMappingError);
		expect(() => mapActionToBrokerOrder("REDUCE", 100, -50)).toThrow(ActionMappingError);
		expect(() => mapActionToBrokerOrder("REDUCE", -100, 50)).toThrow(ActionMappingError);
	});
});

describe("mapActionToBrokerOrder no-order actions", () => {
	test("HOLD returns null", () => {
		expect(mapActionToBrokerOrder("HOLD", 100, 100)).toBeNull();
	});

	test("NO_TRADE returns null", () => {
		expect(mapActionToBrokerOrder("NO_TRADE", 0, 0)).toBeNull();
	});
});

describe("deriveActionFromPositions base transitions", () => {
	test("returns NO_TRADE or HOLD for unchanged positions", () => {
		expect(deriveActionFromPositions(0, 0)).toBe("NO_TRADE");
		expect(deriveActionFromPositions(100, 100)).toBe("HOLD");
		expect(deriveActionFromPositions(-100, -100)).toBe("HOLD");
	});

	test("returns BUY or SELL from flat position", () => {
		expect(deriveActionFromPositions(0, 100)).toBe("BUY");
		expect(deriveActionFromPositions(0, -100)).toBe("SELL");
	});

	test("returns INCREASE for larger same-direction positions", () => {
		expect(deriveActionFromPositions(100, 200)).toBe("INCREASE");
		expect(deriveActionFromPositions(-100, -200)).toBe("INCREASE");
	});

	test("returns REDUCE when moving toward flat", () => {
		expect(deriveActionFromPositions(100, 50)).toBe("REDUCE");
		expect(deriveActionFromPositions(100, 0)).toBe("REDUCE");
		expect(deriveActionFromPositions(-100, -50)).toBe("REDUCE");
		expect(deriveActionFromPositions(-100, 0)).toBe("REDUCE");
	});
});

describe("deriveActionFromPositions invalid flips", () => {
	test("throws when flipping long to short", () => {
		expect(() => deriveActionFromPositions(100, -100)).toThrow(ActionMappingError);
	});

	test("throws when flipping short to long", () => {
		expect(() => deriveActionFromPositions(-100, 100)).toThrow(ActionMappingError);
	});
});
