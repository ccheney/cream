/**
 * Temporal Edge Properties Tests
 *
 * Tests for bi-temporal model enabling point-in-time graph queries.
 *
 * @see docs/plans/04-memory-helixdb.md:863-864
 */

import { describe, expect, it } from "bun:test";
import {
  addTemporalPropertiesToEdge,
  calculateTemporalStats,
  createTemporalEdge,
  expireEdge,
  isEdgeActiveAt,
  matchesTemporalQuery,
  type TemporalEdgeProperties,
  wasEdgeKnownAt,
} from "../src/temporal.js";

// ============================================
// Test Helpers
// ============================================

const JAN_2024 = Date.parse("2024-01-01T00:00:00Z");
const FEB_2024 = Date.parse("2024-02-01T00:00:00Z");
const MAR_2024 = Date.parse("2024-03-01T00:00:00Z");
const APR_2024 = Date.parse("2024-04-01T00:00:00Z");
const MAY_2024 = Date.parse("2024-05-01T00:00:00Z");
const JUN_2024 = Date.parse("2024-06-01T00:00:00Z");

function createEdge(overrides: Partial<TemporalEdgeProperties> = {}): TemporalEdgeProperties {
  return {
    valid_from: JAN_2024,
    valid_to: undefined,
    recorded_at: FEB_2024,
    ...overrides,
  };
}

// ============================================
// isEdgeActiveAt Tests
// ============================================

describe("isEdgeActiveAt", () => {
  it("returns true for edges without temporal data (legacy edges)", () => {
    expect(isEdgeActiveAt({}, JAN_2024)).toBe(true);
    expect(isEdgeActiveAt({}, MAR_2024)).toBe(true);
  });

  it("returns true for current edges (no valid_to)", () => {
    const edge = createEdge({ valid_from: JAN_2024, valid_to: undefined });

    expect(isEdgeActiveAt(edge, FEB_2024)).toBe(true);
    expect(isEdgeActiveAt(edge, MAR_2024)).toBe(true);
    expect(isEdgeActiveAt(edge, JUN_2024)).toBe(true);
  });

  it("returns false for edges before valid_from", () => {
    const edge = createEdge({ valid_from: MAR_2024 });

    expect(isEdgeActiveAt(edge, JAN_2024)).toBe(false);
    expect(isEdgeActiveAt(edge, FEB_2024)).toBe(false);
  });

  it("returns true at exactly valid_from", () => {
    const edge = createEdge({ valid_from: MAR_2024 });

    expect(isEdgeActiveAt(edge, MAR_2024)).toBe(true);
  });

  it("returns false for expired edges (valid_to is set)", () => {
    const edge = createEdge({ valid_from: JAN_2024, valid_to: MAR_2024 });

    // Edge was valid from Jan to Mar
    expect(isEdgeActiveAt(edge, FEB_2024)).toBe(true);
    expect(isEdgeActiveAt(edge, MAR_2024)).toBe(false); // Expired at exactly MAR
    expect(isEdgeActiveAt(edge, APR_2024)).toBe(false);
  });

  it("handles null valid_to as undefined (current edge)", () => {
    const edge = { valid_from: JAN_2024, valid_to: null, recorded_at: JAN_2024 };

    expect(isEdgeActiveAt(edge as unknown as Partial<TemporalEdgeProperties>, MAR_2024)).toBe(true);
  });
});

// ============================================
// wasEdgeKnownAt Tests
// ============================================

describe("wasEdgeKnownAt", () => {
  it("returns true for edges without recorded_at (legacy edges)", () => {
    expect(wasEdgeKnownAt({}, JAN_2024)).toBe(true);
    expect(wasEdgeKnownAt({}, MAR_2024)).toBe(true);
  });

  it("returns false if recorded_at is after query time", () => {
    const edge = createEdge({ recorded_at: MAR_2024 });

    expect(wasEdgeKnownAt(edge, JAN_2024)).toBe(false);
    expect(wasEdgeKnownAt(edge, FEB_2024)).toBe(false);
  });

  it("returns true if recorded_at is before or at query time", () => {
    const edge = createEdge({ recorded_at: MAR_2024 });

    expect(wasEdgeKnownAt(edge, MAR_2024)).toBe(true);
    expect(wasEdgeKnownAt(edge, APR_2024)).toBe(true);
  });
});

// ============================================
// matchesTemporalQuery Tests
// ============================================

describe("matchesTemporalQuery", () => {
  it("returns true when no options provided", () => {
    const edge = createEdge();

    expect(matchesTemporalQuery(edge, {})).toBe(true);
  });

  it("filters by asOfTimestamp", () => {
    const edge = createEdge({ valid_from: MAR_2024, valid_to: MAY_2024 });

    expect(matchesTemporalQuery(edge, { asOfTimestamp: FEB_2024 })).toBe(false); // Not yet valid
    expect(matchesTemporalQuery(edge, { asOfTimestamp: APR_2024 })).toBe(true); // Active
    expect(matchesTemporalQuery(edge, { asOfTimestamp: JUN_2024 })).toBe(false); // Expired
  });

  it("includes expired edges when includeExpired is true", () => {
    const edge = createEdge({ valid_from: JAN_2024, valid_to: MAR_2024 });

    expect(matchesTemporalQuery(edge, { asOfTimestamp: APR_2024 })).toBe(false);
    expect(matchesTemporalQuery(edge, { asOfTimestamp: APR_2024, includeExpired: true })).toBe(
      true
    );
  });

  it("filters by knownAsOfTimestamp", () => {
    const edge = createEdge({ recorded_at: MAR_2024 });

    expect(matchesTemporalQuery(edge, { knownAsOfTimestamp: FEB_2024 })).toBe(false);
    expect(matchesTemporalQuery(edge, { knownAsOfTimestamp: APR_2024 })).toBe(true);
  });

  it("combines asOfTimestamp and knownAsOfTimestamp", () => {
    // Edge started in Jan, recorded in Mar
    const edge = createEdge({ valid_from: JAN_2024, recorded_at: MAR_2024 });

    // Asking about Feb, but we didn't know about it until Mar
    expect(
      matchesTemporalQuery(edge, {
        asOfTimestamp: FEB_2024,
        knownAsOfTimestamp: FEB_2024,
      })
    ).toBe(false); // Didn't know yet

    // Asking about Feb, but with knowledge as of Apr (when we knew)
    expect(
      matchesTemporalQuery(edge, {
        asOfTimestamp: FEB_2024,
        knownAsOfTimestamp: APR_2024,
      })
    ).toBe(true); // Knew about it by then
  });
});

// ============================================
// createTemporalEdge Tests
// ============================================

describe("createTemporalEdge", () => {
  it("creates edge with current timestamp as valid_from by default", () => {
    const before = Date.now();
    const edge = createTemporalEdge();
    const after = Date.now();

    expect(edge.valid_from).toBeGreaterThanOrEqual(before);
    expect(edge.valid_from).toBeLessThanOrEqual(after);
    expect(edge.valid_to).toBeUndefined();
    expect(edge.recorded_at).toBeGreaterThanOrEqual(before);
  });

  it("creates edge with specified valid_from", () => {
    const edge = createTemporalEdge(JAN_2024);

    expect(edge.valid_from).toBe(JAN_2024);
    expect(edge.valid_to).toBeUndefined();
  });

  it("creates edge with specified valid_from and valid_to", () => {
    const edge = createTemporalEdge(JAN_2024, MAR_2024);

    expect(edge.valid_from).toBe(JAN_2024);
    expect(edge.valid_to).toBe(MAR_2024);
  });
});

// ============================================
// expireEdge Tests
// ============================================

describe("expireEdge", () => {
  it("sets valid_to on an active edge", () => {
    const original = createEdge({ valid_from: JAN_2024, valid_to: undefined });
    const expired = expireEdge(original, MAR_2024);

    expect(expired.valid_from).toBe(JAN_2024);
    expect(expired.valid_to).toBe(MAR_2024);
    expect(expired.recorded_at).toBe(original.recorded_at);
  });

  it("uses current timestamp if no expiredAt provided", () => {
    const before = Date.now();
    const original = createEdge({ valid_from: JAN_2024 });
    const expired = expireEdge(original);
    const after = Date.now();

    expect(expired.valid_to).toBeGreaterThanOrEqual(before);
    expect(expired.valid_to).toBeLessThanOrEqual(after);
  });
});

// ============================================
// addTemporalPropertiesToEdge Tests (Migration)
// ============================================

describe("addTemporalPropertiesToEdge", () => {
  it("uses created_at string if available", () => {
    const existing = { created_at: "2024-01-15T10:30:00Z" };
    const temporal = addTemporalPropertiesToEdge(existing, MAR_2024);

    expect(temporal.valid_from).toBe(Date.parse("2024-01-15T10:30:00Z"));
    expect(temporal.valid_to).toBeUndefined();
    expect(temporal.recorded_at).toBe(MAR_2024);
  });

  it("uses created_at number if available", () => {
    const existing = { created_at: JAN_2024 };
    const temporal = addTemporalPropertiesToEdge(existing, MAR_2024);

    expect(temporal.valid_from).toBe(JAN_2024);
  });

  it("uses timestamp string as fallback", () => {
    const existing = { timestamp: "2024-02-15T10:30:00Z" };
    const temporal = addTemporalPropertiesToEdge(existing, MAR_2024);

    expect(temporal.valid_from).toBe(Date.parse("2024-02-15T10:30:00Z"));
  });

  it("uses timestamp number as fallback", () => {
    const existing = { timestamp: FEB_2024 };
    const temporal = addTemporalPropertiesToEdge(existing, MAR_2024);

    expect(temporal.valid_from).toBe(FEB_2024);
  });

  it("uses migration timestamp if no existing timestamp found", () => {
    const existing = { some_other_field: "value" };
    const temporal = addTemporalPropertiesToEdge(existing, MAR_2024);

    expect(temporal.valid_from).toBe(MAR_2024);
    expect(temporal.recorded_at).toBe(MAR_2024);
  });

  it("handles invalid date strings gracefully", () => {
    const existing = { created_at: "not-a-date" };
    const temporal = addTemporalPropertiesToEdge(existing, MAR_2024);

    // Should fall back to migration timestamp
    expect(temporal.valid_from).toBe(MAR_2024);
  });
});

// ============================================
// calculateTemporalStats Tests
// ============================================

describe("calculateTemporalStats", () => {
  it("returns zeros for empty array", () => {
    const stats = calculateTemporalStats([]);

    expect(stats.totalEdges).toBe(0);
    expect(stats.temporalEdges).toBe(0);
    expect(stats.legacyEdges).toBe(0);
    expect(stats.activeEdges).toBe(0);
    expect(stats.expiredEdges).toBe(0);
    expect(stats.earliestValidFrom).toBeUndefined();
    expect(stats.latestValidTo).toBeUndefined();
  });

  it("counts legacy edges (no valid_from)", () => {
    const edges = [{}, {}, {}];
    const stats = calculateTemporalStats(edges);

    expect(stats.totalEdges).toBe(3);
    expect(stats.legacyEdges).toBe(3);
    expect(stats.temporalEdges).toBe(0);
    expect(stats.activeEdges).toBe(3); // Legacy treated as active
  });

  it("counts active and expired edges", () => {
    const edges = [
      { valid_from: JAN_2024 }, // Active (no valid_to)
      { valid_from: FEB_2024, valid_to: undefined }, // Active
      { valid_from: MAR_2024, valid_to: APR_2024 }, // Expired
      { valid_from: MAR_2024, valid_to: MAY_2024 }, // Expired
    ];
    const stats = calculateTemporalStats(edges);

    expect(stats.totalEdges).toBe(4);
    expect(stats.temporalEdges).toBe(4);
    expect(stats.activeEdges).toBe(2);
    expect(stats.expiredEdges).toBe(2);
  });

  it("finds earliest valid_from", () => {
    const edges = [{ valid_from: MAR_2024 }, { valid_from: JAN_2024 }, { valid_from: FEB_2024 }];
    const stats = calculateTemporalStats(edges);

    expect(stats.earliestValidFrom).toBe(JAN_2024);
  });

  it("finds latest valid_to among expired edges", () => {
    const edges = [
      { valid_from: JAN_2024, valid_to: MAR_2024 },
      { valid_from: FEB_2024, valid_to: MAY_2024 },
      { valid_from: MAR_2024, valid_to: APR_2024 },
    ];
    const stats = calculateTemporalStats(edges);

    expect(stats.latestValidTo).toBe(MAY_2024);
  });

  it("handles mixed legacy and temporal edges", () => {
    const edges = [
      {}, // Legacy
      { valid_from: JAN_2024 }, // Temporal, active
      { valid_from: FEB_2024, valid_to: MAR_2024 }, // Temporal, expired
    ];
    const stats = calculateTemporalStats(edges);

    expect(stats.totalEdges).toBe(3);
    expect(stats.legacyEdges).toBe(1);
    expect(stats.temporalEdges).toBe(2);
    expect(stats.activeEdges).toBe(2); // Legacy + temporal active
    expect(stats.expiredEdges).toBe(1);
  });
});
