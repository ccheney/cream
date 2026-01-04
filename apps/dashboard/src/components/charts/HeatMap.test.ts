/**
 * HeatMap Component Tests
 *
 * Tests for correlation heat map data processing and rendering.
 *
 * @see docs/plans/ui/26-data-viz.md lines 139-149
 */

import { describe, expect, it } from "bun:test";
import { type CorrelationMatrix, SAMPLE_CORRELATION_DATA } from "./HeatMap.js";

// ============================================
// Sample Data Tests
// ============================================

describe("SAMPLE_CORRELATION_DATA", () => {
  it("has 5 assets", () => {
    const keys = Object.keys(SAMPLE_CORRELATION_DATA);
    expect(keys.length).toBe(5);
  });

  it("includes expected assets", () => {
    const keys = Object.keys(SAMPLE_CORRELATION_DATA);
    expect(keys).toContain("AAPL");
    expect(keys).toContain("MSFT");
    expect(keys).toContain("GOOGL");
    expect(keys).toContain("AMZN");
    expect(keys).toContain("NVDA");
  });

  it("has symmetric correlations", () => {
    const keys = Object.keys(SAMPLE_CORRELATION_DATA);
    for (const a of keys) {
      for (const b of keys) {
        expect(SAMPLE_CORRELATION_DATA[a][b]).toBe(SAMPLE_CORRELATION_DATA[b][a]);
      }
    }
  });

  it("has diagonal values of 1.0", () => {
    const keys = Object.keys(SAMPLE_CORRELATION_DATA);
    for (const key of keys) {
      expect(SAMPLE_CORRELATION_DATA[key][key]).toBe(1.0);
    }
  });

  it("has correlations in valid range [-1, 1]", () => {
    const keys = Object.keys(SAMPLE_CORRELATION_DATA);
    for (const a of keys) {
      for (const b of keys) {
        const value = SAMPLE_CORRELATION_DATA[a][b];
        expect(value).toBeGreaterThanOrEqual(-1);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ============================================
// Matrix Structure Tests
// ============================================

describe("CorrelationMatrix structure", () => {
  it("can create empty matrix", () => {
    const matrix: CorrelationMatrix = {};
    expect(Object.keys(matrix).length).toBe(0);
  });

  it("can create single asset matrix", () => {
    const matrix: CorrelationMatrix = {
      AAPL: { AAPL: 1.0 },
    };
    expect(matrix.AAPL.AAPL).toBe(1.0);
  });

  it("can create 2x2 matrix", () => {
    const matrix: CorrelationMatrix = {
      AAPL: { AAPL: 1.0, MSFT: 0.75 },
      MSFT: { AAPL: 0.75, MSFT: 1.0 },
    };
    expect(matrix.AAPL.MSFT).toBe(0.75);
    expect(matrix.MSFT.AAPL).toBe(0.75);
  });

  it("handles negative correlations", () => {
    const matrix: CorrelationMatrix = {
      AAPL: { AAPL: 1.0, INVERSE: -0.8 },
      INVERSE: { AAPL: -0.8, INVERSE: 1.0 },
    };
    expect(matrix.AAPL.INVERSE).toBe(-0.8);
  });
});

// ============================================
// Matrix Key Extraction Tests
// ============================================

describe("Matrix key operations", () => {
  it("extracts sorted keys", () => {
    const keys = Object.keys(SAMPLE_CORRELATION_DATA).sort();
    expect(keys[0]).toBe("AAPL");
    expect(keys[4]).toBe("NVDA");
  });

  it("counts correct number of cells", () => {
    const keys = Object.keys(SAMPLE_CORRELATION_DATA);
    const cellCount = keys.length * keys.length;
    expect(cellCount).toBe(25);
  });

  it("counts diagonal cells", () => {
    const keys = Object.keys(SAMPLE_CORRELATION_DATA);
    const diagonalCount = keys.length;
    expect(diagonalCount).toBe(5);
  });

  it("counts non-diagonal cells", () => {
    const keys = Object.keys(SAMPLE_CORRELATION_DATA);
    const totalCells = keys.length * keys.length;
    const diagonalCells = keys.length;
    const nonDiagonalCells = totalCells - diagonalCells;
    expect(nonDiagonalCells).toBe(20);
  });
});

// ============================================
// High Correlation Detection Tests
// ============================================

describe("High correlation detection", () => {
  const threshold = 0.7;

  it("finds high positive correlations", () => {
    const highPositive: string[] = [];
    const keys = Object.keys(SAMPLE_CORRELATION_DATA);

    for (const a of keys) {
      for (const b of keys) {
        if (a !== b) {
          const value = SAMPLE_CORRELATION_DATA[a][b];
          if (value > threshold) {
            highPositive.push(`${a}-${b}`);
          }
        }
      }
    }

    expect(highPositive.length).toBeGreaterThan(0);
    expect(highPositive).toContain("AAPL-MSFT");
    expect(highPositive).toContain("AAPL-NVDA");
  });

  it("identifies AAPL-NVDA as highest correlation", () => {
    const keys = Object.keys(SAMPLE_CORRELATION_DATA);
    let maxCorr = -Infinity;
    let maxPair = "";

    for (const a of keys) {
      for (const b of keys) {
        if (a !== b && a < b) {
          const value = SAMPLE_CORRELATION_DATA[a][b];
          if (value > maxCorr) {
            maxCorr = value;
            maxPair = `${a}-${b}`;
          }
        }
      }
    }

    expect(maxPair).toBe("AAPL-NVDA");
    expect(maxCorr).toBe(0.82);
  });

  it("identifies AMZN-NVDA as lowest correlation", () => {
    const keys = Object.keys(SAMPLE_CORRELATION_DATA);
    let minCorr = Infinity;
    let minPair = "";

    for (const a of keys) {
      for (const b of keys) {
        if (a !== b && a < b) {
          const value = SAMPLE_CORRELATION_DATA[a][b];
          if (value < minCorr) {
            minCorr = value;
            minPair = `${a}-${b}`;
          }
        }
      }
    }

    expect(minPair).toBe("AMZN-NVDA");
    expect(minCorr).toBe(0.45);
  });
});

// ============================================
// Cell Value Processing Tests
// ============================================

describe("Cell value processing", () => {
  it("handles undefined cell values", () => {
    const matrix: CorrelationMatrix = {
      AAPL: { AAPL: 1.0 },
      MSFT: { MSFT: 1.0 },
    };
    // Accessing non-existent correlation
    const value = matrix.AAPL?.MSFT ?? 0;
    expect(value).toBe(0);
  });

  it("counts unique pair correlations", () => {
    const keys = Object.keys(SAMPLE_CORRELATION_DATA);
    const uniquePairs = (keys.length * (keys.length - 1)) / 2;
    expect(uniquePairs).toBe(10);
  });

  it("calculates average correlation", () => {
    const keys = Object.keys(SAMPLE_CORRELATION_DATA);
    let sum = 0;
    let count = 0;

    for (const a of keys) {
      for (const b of keys) {
        if (a < b) {
          sum += SAMPLE_CORRELATION_DATA[a][b];
          count++;
        }
      }
    }

    const average = sum / count;
    expect(average).toBeCloseTo(0.633, 2);
  });
});

// ============================================
// Dimension Calculation Tests
// ============================================

describe("Dimension calculations", () => {
  const cellSize = 50;
  const cellGap = 1;
  const labelWidth = 60;

  it("calculates grid width", () => {
    const keys = Object.keys(SAMPLE_CORRELATION_DATA);
    const gridWidth = keys.length * (cellSize + cellGap);
    expect(gridWidth).toBe(255);
  });

  it("calculates total width with labels", () => {
    const keys = Object.keys(SAMPLE_CORRELATION_DATA);
    const gridWidth = keys.length * (cellSize + cellGap);
    const totalWidth = labelWidth + gridWidth;
    expect(totalWidth).toBe(315);
  });

  it("scales with cell size", () => {
    const smallCellSize = 30;
    const keys = Object.keys(SAMPLE_CORRELATION_DATA);
    const gridWidth = keys.length * (smallCellSize + cellGap);
    expect(gridWidth).toBe(155);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge cases", () => {
  it("handles empty matrix", () => {
    const matrix: CorrelationMatrix = {};
    expect(Object.keys(matrix).length).toBe(0);
  });

  it("handles very large matrix keys", () => {
    const longName = "A".repeat(100);
    const matrix: CorrelationMatrix = {
      [longName]: { [longName]: 1.0 },
    };
    expect(Object.keys(matrix)[0]).toBe(longName);
  });

  it("handles special characters in keys", () => {
    const matrix: CorrelationMatrix = {
      "BRK.A": { "BRK.A": 1.0, "BRK.B": 0.99 },
      "BRK.B": { "BRK.A": 0.99, "BRK.B": 1.0 },
    };
    expect(matrix["BRK.A"]["BRK.B"]).toBe(0.99);
  });

  it("handles near-zero correlations", () => {
    const matrix: CorrelationMatrix = {
      A: { A: 1.0, B: 0.001 },
      B: { A: 0.001, B: 1.0 },
    };
    expect(matrix.A.B).toBeCloseTo(0, 2);
  });

  it("handles perfect negative correlation", () => {
    const matrix: CorrelationMatrix = {
      LONG: { LONG: 1.0, SHORT: -1.0 },
      SHORT: { LONG: -1.0, SHORT: 1.0 },
    };
    expect(matrix.LONG.SHORT).toBe(-1.0);
  });
});
