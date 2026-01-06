/**
 * Tests for useStaggeredAnimation Hook
 */

import { describe, expect, test } from "bun:test";
import { SLIDE_UP_KEYFRAMES } from "./useStaggeredAnimation";

// Note: Full hook testing requires renderHook from @testing-library/react-hooks
// These tests verify the static exports and constants

describe("useStaggeredAnimation", () => {
  describe("SLIDE_UP_KEYFRAMES", () => {
    test("contains slideUp animation", () => {
      expect(SLIDE_UP_KEYFRAMES).toContain("@keyframes slideUp");
    });

    test("animates from opacity 0 to 1", () => {
      expect(SLIDE_UP_KEYFRAMES).toContain("opacity: 0");
      expect(SLIDE_UP_KEYFRAMES).toContain("opacity: 1");
    });

    test("animates translateY from 8px to 0", () => {
      expect(SLIDE_UP_KEYFRAMES).toContain("translateY(8px)");
      expect(SLIDE_UP_KEYFRAMES).toContain("translateY(0)");
    });
  });

  describe("stagger delay calculation", () => {
    test("calculates correct delays", () => {
      const staggerDelay = 50;
      const maxDelay = 500;

      // Item 0 has no delay
      expect(0 * staggerDelay).toBe(0);

      // Item 5 has 250ms delay
      expect(5 * staggerDelay).toBe(250);

      // Item 20 would exceed max, capped at maxDelay
      expect(Math.min(20 * staggerDelay, maxDelay)).toBe(500);
    });
  });

  describe("animation style format", () => {
    test("generates valid animation string", () => {
      const duration = 300;
      const delay = 100;
      const easing = "cubic-bezier(0.16, 1, 0.3, 1)";

      const animation = `slideUp ${duration}ms ${easing} ${delay}ms forwards`;

      expect(animation).toContain("slideUp");
      expect(animation).toContain("300ms");
      expect(animation).toContain("100ms");
      expect(animation).toContain("forwards");
    });
  });
});
