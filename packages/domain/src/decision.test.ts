import { describe, expect, it } from "bun:test";
import { Action } from "./decision";

// Primary decision tests are split across:
// - decision-schema.test.ts
// - decision-logic.test.ts

describe("decision test split", () => {
	it("retains legacy smoke coverage", () => {
		expect(Action.parse("BUY")).toBe("BUY");
	});
});
