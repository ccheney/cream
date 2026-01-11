/**
 * Tests for rank computation
 */

import { describe, expect, test } from "bun:test";
import { computeRanks } from "../../../src/synthesis/ic/index.js";

describe("computeRanks", () => {
  test("computes ranks for simple array", () => {
    const arr = [3, 1, 4, 1, 5];
    const ranks = computeRanks(arr);
    // Sorted order: 1, 1, 3, 4, 5 -> indices 1, 3, 0, 2, 4
    // Ranks: 1, 2 (tied), 3, 4, 5
    // For tied values (1, 1), average rank = (1+2)/2 = 1.5
    expect(ranks[0]).toBe(3); // 3 is 3rd smallest
    expect(ranks[1]).toBe(1.5); // 1 tied for 1st-2nd
    expect(ranks[2]).toBe(4); // 4 is 4th smallest
    expect(ranks[3]).toBe(1.5); // 1 tied for 1st-2nd
    expect(ranks[4]).toBe(5); // 5 is largest
  });

  test("handles all same values (all tied)", () => {
    const arr = [5, 5, 5, 5];
    const ranks = computeRanks(arr);
    // All tied, average rank = (1+2+3+4)/4 = 2.5
    expect(ranks).toEqual([2.5, 2.5, 2.5, 2.5]);
  });

  test("handles already sorted array", () => {
    const arr = [1, 2, 3, 4, 5];
    const ranks = computeRanks(arr);
    expect(ranks).toEqual([1, 2, 3, 4, 5]);
  });

  test("handles reverse sorted array", () => {
    const arr = [5, 4, 3, 2, 1];
    const ranks = computeRanks(arr);
    expect(ranks).toEqual([5, 4, 3, 2, 1]);
  });

  test("handles single element", () => {
    const arr = [42];
    const ranks = computeRanks(arr);
    expect(ranks).toEqual([1]);
  });
});
