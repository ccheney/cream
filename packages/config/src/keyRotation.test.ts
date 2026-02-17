/**
 * Tests for API Key Rotation factory behavior
 */

import { afterEach, describe, expect, it } from "bun:test";
import { createKeyRotationRegistry, KeyRotationRegistry } from "./keyRotation/index.js";

describe("createKeyRotationRegistry", () => {
	const savedAlpacaKey = Bun.env.ALPACA_KEY;

	afterEach(() => {
		if (savedAlpacaKey !== undefined) {
			Bun.env.ALPACA_KEY = savedAlpacaKey;
		} else {
			delete Bun.env.ALPACA_KEY;
		}
	});

	it("should create registry initialized from env", () => {
		Bun.env.ALPACA_KEY = "factory-test-key";

		const registry = createKeyRotationRegistry({});

		expect(registry).toBeInstanceOf(KeyRotationRegistry);
		expect(registry.getKey("alpaca")).toBe("factory-test-key");
	});

	it("should accept custom config", () => {
		Bun.env.ALPACA_KEY = "config-test-key";

		const registry = createKeyRotationRegistry({ maxConsecutiveErrors: 5 });

		expect(registry).toBeInstanceOf(KeyRotationRegistry);
	});
});
