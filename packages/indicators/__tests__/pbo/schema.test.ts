/**
 * Tests for PBO input schema validation
 */

import { describe, expect, test } from "bun:test";
import { PBOInputSchema } from "../../src/synthesis/pbo.js";

describe("PBOInputSchema", () => {
  test("accepts valid input with defaults", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
    };
    const parsed = PBOInputSchema.parse(input);
    expect(parsed.nSplits).toBe(8);
  });

  test("accepts custom nSplits", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
      nSplits: 16,
    };
    const parsed = PBOInputSchema.parse(input);
    expect(parsed.nSplits).toBe(16);
  });

  test("rejects odd nSplits", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
      nSplits: 7,
    };
    expect(() => PBOInputSchema.parse(input)).toThrow();
  });

  test("rejects negative nSplits", () => {
    const input = {
      returns: [0.01, -0.02, 0.015],
      signals: [1, -1, 1],
      nSplits: -2,
    };
    expect(() => PBOInputSchema.parse(input)).toThrow();
  });
});
