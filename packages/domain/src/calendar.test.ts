import { describe, expect, test } from "bun:test";
import { NYSE_HOLIDAYS_2026 } from "./calendar";

// Primary calendar coverage is split across:
// - calendar-holiday-session.test.ts
// - calendar-expiration-navigation.test.ts
// - calendar-session-validation.test.ts

describe("calendar test split", () => {
	test("keeps a smoke check in the legacy file", () => {
		expect(NYSE_HOLIDAYS_2026.length).toBeGreaterThan(0);
	});
});
