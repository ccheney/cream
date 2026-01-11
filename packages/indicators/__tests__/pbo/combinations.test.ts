/**
 * Tests for combination generator functions
 */

import { describe, expect, test } from "bun:test";
import { combinations, nCr } from "../../src/synthesis/pbo.js";

describe("combinations", () => {
  test("generates correct combinations for C(4,2)", () => {
    const result = combinations(4, 2);
    expect(result).toHaveLength(6);
    expect(result).toContainEqual([0, 1]);
    expect(result).toContainEqual([0, 2]);
    expect(result).toContainEqual([0, 3]);
    expect(result).toContainEqual([1, 2]);
    expect(result).toContainEqual([1, 3]);
    expect(result).toContainEqual([2, 3]);
  });

  test("generates correct combinations for C(5,3)", () => {
    const result = combinations(5, 3);
    expect(result).toHaveLength(10);
  });

  test("generates correct combinations for C(8,4)", () => {
    const result = combinations(8, 4);
    expect(result).toHaveLength(70);
  });

  test("C(n,0) returns empty array with one element", () => {
    const result = combinations(5, 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual([]);
  });

  test("C(n,n) returns one combination with all elements", () => {
    const result = combinations(4, 4);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual([0, 1, 2, 3]);
  });
});

describe("nCr", () => {
  test("calculates C(8,4) = 70", () => {
    expect(nCr(8, 4)).toBe(70);
  });

  test("calculates C(10,5) = 252", () => {
    expect(nCr(10, 5)).toBe(252);
  });

  test("calculates C(16,8) = 12870", () => {
    expect(nCr(16, 8)).toBe(12870);
  });

  test("C(n,0) = 1", () => {
    expect(nCr(10, 0)).toBe(1);
  });

  test("C(n,n) = 1", () => {
    expect(nCr(10, 10)).toBe(1);
  });

  test("C(n,1) = n", () => {
    expect(nCr(10, 1)).toBe(10);
  });

  test("handles k > n", () => {
    expect(nCr(5, 10)).toBe(0);
  });

  test("handles negative k", () => {
    expect(nCr(5, -1)).toBe(0);
  });
});
