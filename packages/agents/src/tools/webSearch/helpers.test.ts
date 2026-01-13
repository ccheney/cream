/**
 * Web Search Helpers Tests
 */

import { describe, expect, test } from "bun:test";
import { calculateTimeRange, chunkArray, extractDomain } from "./helpers.js";

describe("extractDomain", () => {
  test("extracts domain from valid URL", () => {
    expect(extractDomain("https://www.example.com/page")).toBe("example.com");
    expect(extractDomain("https://news.example.com/article")).toBe("news.example.com");
  });

  test("strips www prefix", () => {
    expect(extractDomain("https://www.google.com/search")).toBe("google.com");
  });

  test("handles URLs without www", () => {
    expect(extractDomain("https://example.com/page")).toBe("example.com");
  });

  test("returns original string for invalid URL", () => {
    expect(extractDomain("not-a-url")).toBe("not-a-url");
  });
});

describe("calculateTimeRange", () => {
  test("returns day for 24 hours or less", () => {
    expect(calculateTimeRange(1)).toBe("day");
    expect(calculateTimeRange(12)).toBe("day");
    expect(calculateTimeRange(24)).toBe("day");
  });

  test("returns week for 25-168 hours", () => {
    expect(calculateTimeRange(25)).toBe("week");
    expect(calculateTimeRange(72)).toBe("week");
    expect(calculateTimeRange(168)).toBe("week");
  });

  test("returns month for more than 168 hours", () => {
    expect(calculateTimeRange(169)).toBe("month");
    expect(calculateTimeRange(720)).toBe("month");
  });
});

describe("chunkArray", () => {
  test("chunks array into specified size", () => {
    const arr = [1, 2, 3, 4, 5, 6];
    const chunks = chunkArray(arr, 2);
    expect(chunks).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  test("handles array smaller than chunk size", () => {
    const arr = [1, 2];
    const chunks = chunkArray(arr, 5);
    expect(chunks).toEqual([[1, 2]]);
  });

  test("handles empty array", () => {
    const chunks = chunkArray([], 3);
    expect(chunks).toEqual([]);
  });

  test("handles remainder in last chunk", () => {
    const arr = [1, 2, 3, 4, 5];
    const chunks = chunkArray(arr, 2);
    expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
  });
});
