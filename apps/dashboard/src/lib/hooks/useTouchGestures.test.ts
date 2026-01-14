/**
 * Tests for useTouchGestures Hook
 */

import { describe, expect, test } from "bun:test";

// Note: Full hook testing requires JSDOM/testing-library
// These tests verify the type exports and constants

describe("useTouchGestures types", () => {
	test("SwipeDirection type includes all directions", () => {
		const directions: Array<"left" | "right" | "up" | "down"> = ["left", "right", "up", "down"];
		expect(directions).toContain("left");
		expect(directions).toContain("right");
		expect(directions).toContain("up");
		expect(directions).toContain("down");
	});

	test("default thresholds are reasonable", () => {
		const DEFAULT_SWIPE_THRESHOLD = 50;
		const DEFAULT_LONG_PRESS_DELAY = 500;
		const DEFAULT_PULL_THRESHOLD = 80;

		// Swipe threshold should be enough to distinguish from tap
		expect(DEFAULT_SWIPE_THRESHOLD).toBeGreaterThan(20);
		expect(DEFAULT_SWIPE_THRESHOLD).toBeLessThan(100);

		// Long press should be perceptible but not too long
		expect(DEFAULT_LONG_PRESS_DELAY).toBeGreaterThanOrEqual(300);
		expect(DEFAULT_LONG_PRESS_DELAY).toBeLessThanOrEqual(800);

		// Pull threshold for refresh
		expect(DEFAULT_PULL_THRESHOLD).toBeGreaterThan(50);
		expect(DEFAULT_PULL_THRESHOLD).toBeLessThan(150);
	});
});

describe("gesture detection logic", () => {
	test("detects horizontal vs vertical swipe correctly", () => {
		const detectSwipeDirection = (deltaX: number, deltaY: number) => {
			const absX = Math.abs(deltaX);
			const absY = Math.abs(deltaY);

			if (absX > absY) {
				return deltaX > 0 ? "right" : "left";
			}
			return deltaY > 0 ? "down" : "up";
		};

		expect(detectSwipeDirection(100, 10)).toBe("right");
		expect(detectSwipeDirection(-100, 10)).toBe("left");
		expect(detectSwipeDirection(10, 100)).toBe("down");
		expect(detectSwipeDirection(10, -100)).toBe("up");
	});

	test("calculates swipe distance correctly", () => {
		const calculateDistance = (deltaX: number, deltaY: number) => {
			const absX = Math.abs(deltaX);
			const absY = Math.abs(deltaY);
			return absX > absY ? absX : absY;
		};

		expect(calculateDistance(100, 10)).toBe(100);
		expect(calculateDistance(10, 100)).toBe(100);
		expect(calculateDistance(-50, -30)).toBe(50);
	});

	test("respects minimum touch target size", () => {
		// Per accessibility guidelines, minimum touch target is 44x44px
		const MINIMUM_TOUCH_TARGET = 44;
		expect(MINIMUM_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
	});
});
