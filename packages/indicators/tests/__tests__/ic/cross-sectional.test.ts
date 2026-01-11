/**
 * Tests for cross-sectional IC calculation
 */

import { describe, expect, test } from "bun:test";
import { crossSectionalIC } from "../../../src/synthesis/ic/index.js";

describe("crossSectionalIC", () => {
  test("calculates IC for perfectly predictive signal", () => {
    const signals = [1, 2, 3, 4, 5];
    const returns = [0.01, 0.02, 0.03, 0.04, 0.05];
    const result = crossSectionalIC(signals, returns);

    expect(result.ic).toBeCloseTo(1, 10);
    expect(result.nObservations).toBe(5);
    expect(result.isValid).toBe(false); // Less than 10 observations
  });

  test("calculates IC for anti-predictive signal", () => {
    const signals = [1, 2, 3, 4, 5];
    const returns = [0.05, 0.04, 0.03, 0.02, 0.01];
    const result = crossSectionalIC(signals, returns);

    expect(result.ic).toBeCloseTo(-1, 10);
  });

  test("returns isValid=true when >= 10 observations", () => {
    const signals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const returns = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1];
    const result = crossSectionalIC(signals, returns);

    expect(result.isValid).toBe(true);
    expect(result.nObservations).toBe(10);
  });

  test("filters out NaN values", () => {
    const signals = [1, 2, Number.NaN, 4, 5, 6, 7, 8, 9, 10, 11];
    const returns = [0.01, 0.02, 0.03, Number.NaN, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11];
    const result = crossSectionalIC(signals, returns);

    // 11 total - 2 NaN = 9 valid pairs
    expect(result.nObservations).toBe(9);
    expect(result.isValid).toBe(false);
  });

  test("throws for mismatched array lengths", () => {
    const signals = [1, 2, 3];
    const returns = [0.01, 0.02];
    expect(() => crossSectionalIC(signals, returns)).toThrow("same length");
  });
});
