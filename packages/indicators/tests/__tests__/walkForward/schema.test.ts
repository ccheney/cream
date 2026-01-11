/**
 * Tests for WalkForwardInputSchema validation.
 */

import { describe, expect, test } from "bun:test";
import { WalkForwardInputSchema } from "../../../src/synthesis/walkForward.js";

describe("WalkForwardInputSchema", () => {
  test("accepts valid input with defaults", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
    };
    const parsed = WalkForwardInputSchema.parse(input);
    expect(parsed.nPeriods).toBe(5);
    expect(parsed.trainRatio).toBe(0.8);
    expect(parsed.method).toBe("rolling");
  });

  test("accepts custom nPeriods", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
      nPeriods: 10,
    };
    const parsed = WalkForwardInputSchema.parse(input);
    expect(parsed.nPeriods).toBe(10);
  });

  test("accepts custom trainRatio", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
      trainRatio: 0.7,
    };
    const parsed = WalkForwardInputSchema.parse(input);
    expect(parsed.trainRatio).toBe(0.7);
  });

  test("accepts anchored method", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
      method: "anchored" as const,
    };
    const parsed = WalkForwardInputSchema.parse(input);
    expect(parsed.method).toBe("anchored");
  });

  test("rejects nPeriods < 2", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
      nPeriods: 1,
    };
    expect(() => WalkForwardInputSchema.parse(input)).toThrow();
  });

  test("rejects trainRatio outside valid range", () => {
    expect(() =>
      WalkForwardInputSchema.parse({
        returns: [0.01],
        signals: [1],
        trainRatio: 0.05,
      })
    ).toThrow();

    expect(() =>
      WalkForwardInputSchema.parse({
        returns: [0.01],
        signals: [1],
        trainRatio: 0.99,
      })
    ).toThrow();
  });
});
