/**
 * Tests for strategy ranking by PBO
 */

import { describe, expect, test } from "bun:test";
import {
  generateSyntheticReturns,
  generateSyntheticSignals,
  rankStrategiesByPBO,
} from "../../src/synthesis/pbo.js";
import { MIN_SPLITS, STANDARD_DATA_SIZE } from "./fixtures.js";

describe("rankStrategiesByPBO", () => {
  test("ranks strategies by PBO (lowest first)", () => {
    const n = STANDARD_DATA_SIZE;
    const returns = generateSyntheticReturns(n, 0.0001, 0.02);

    const goodSignal = returns.map((r) => r + 0.001 * (Math.random() - 0.5));
    const badSignal = returns.map(() => Math.random() - 0.5);

    const strategies = [
      { name: "good", returns, signals: goodSignal },
      { name: "bad", returns, signals: badSignal },
    ];

    const ranked = rankStrategiesByPBO(strategies, MIN_SPLITS);

    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.pbo).toBeLessThanOrEqual(ranked[1]?.pbo ?? 0);
  });

  test("includes passed status for each strategy", () => {
    const n = STANDARD_DATA_SIZE;
    const returns = generateSyntheticReturns(n, 0.0001, 0.02);
    const signals = generateSyntheticSignals(returns, 0.05);

    const strategies = [{ name: "strategy1", returns, signals }];

    const ranked = rankStrategiesByPBO(strategies, MIN_SPLITS);

    expect(ranked[0]?.passed).toBeDefined();
    expect(typeof ranked[0]?.passed).toBe("boolean");
  });
});
