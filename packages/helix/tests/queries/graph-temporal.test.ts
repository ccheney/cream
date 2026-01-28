/**
 * Temporal Graph Traversal Tests
 *
 * Tests for point-in-time graph queries.
 *
 * @see docs/plans/04-memory-helixdb.md:863-864
 */

import { describe, expect, it } from "bun:test";
import {
	filterEdgesByTime,
	type GraphEdge,
	isEdgeActiveAtTime,
	wasEdgeRecordedBy,
} from "../../src/queries/graph.js";

// ============================================
// Test Helpers
// ============================================

const JAN_2024 = Date.parse("2024-01-01T00:00:00Z");
const FEB_2024 = Date.parse("2024-02-01T00:00:00Z");
const MAR_2024 = Date.parse("2024-03-01T00:00:00Z");
const APR_2024 = Date.parse("2024-04-01T00:00:00Z");
const MAY_2024 = Date.parse("2024-05-01T00:00:00Z");

function createEdge(overrides: Partial<GraphEdge> = {}): GraphEdge {
	return {
		id: "edge-1",
		type: "DEPENDS_ON",
		sourceId: "source-1",
		targetId: "target-1",
		properties: {},
		...overrides,
	};
}

// ============================================
// isEdgeActiveAtTime Tests
// ============================================

describe("isEdgeActiveAtTime", () => {
	it("returns true for edges without temporal properties", () => {
		const edge = createEdge({ properties: {} });

		expect(isEdgeActiveAtTime(edge, JAN_2024)).toBe(true);
		expect(isEdgeActiveAtTime(edge, MAR_2024)).toBe(true);
	});

	it("returns true for active edges (no valid_to)", () => {
		const edge = createEdge({
			properties: { valid_from: JAN_2024 },
		});

		expect(isEdgeActiveAtTime(edge, FEB_2024)).toBe(true);
		expect(isEdgeActiveAtTime(edge, MAR_2024)).toBe(true);
	});

	it("returns false before valid_from", () => {
		const edge = createEdge({
			properties: { valid_from: MAR_2024 },
		});

		expect(isEdgeActiveAtTime(edge, JAN_2024)).toBe(false);
		expect(isEdgeActiveAtTime(edge, FEB_2024)).toBe(false);
		expect(isEdgeActiveAtTime(edge, MAR_2024)).toBe(true); // At exactly valid_from
	});

	it("returns false after valid_to", () => {
		const edge = createEdge({
			properties: { valid_from: JAN_2024, valid_to: MAR_2024 },
		});

		expect(isEdgeActiveAtTime(edge, FEB_2024)).toBe(true);
		expect(isEdgeActiveAtTime(edge, MAR_2024)).toBe(false); // At exactly valid_to
		expect(isEdgeActiveAtTime(edge, APR_2024)).toBe(false);
	});

	it("handles null valid_to as undefined", () => {
		const edge = createEdge({
			properties: { valid_from: JAN_2024, valid_to: null },
		});

		expect(isEdgeActiveAtTime(edge, MAR_2024)).toBe(true);
		expect(isEdgeActiveAtTime(edge, MAY_2024)).toBe(true);
	});
});

// ============================================
// wasEdgeRecordedBy Tests
// ============================================

describe("wasEdgeRecordedBy", () => {
	it("returns true for edges without recorded_at", () => {
		const edge = createEdge({ properties: {} });

		expect(wasEdgeRecordedBy(edge, JAN_2024)).toBe(true);
		expect(wasEdgeRecordedBy(edge, MAR_2024)).toBe(true);
	});

	it("returns false before recorded_at", () => {
		const edge = createEdge({
			properties: { recorded_at: MAR_2024 },
		});

		expect(wasEdgeRecordedBy(edge, JAN_2024)).toBe(false);
		expect(wasEdgeRecordedBy(edge, FEB_2024)).toBe(false);
	});

	it("returns true at or after recorded_at", () => {
		const edge = createEdge({
			properties: { recorded_at: MAR_2024 },
		});

		expect(wasEdgeRecordedBy(edge, MAR_2024)).toBe(true);
		expect(wasEdgeRecordedBy(edge, APR_2024)).toBe(true);
	});
});

// ============================================
// filterEdgesByTime Tests
// ============================================

describe("filterEdgesByTime", () => {
	it("returns all edges when no options provided", () => {
		const edges = [
			createEdge({ id: "e1", properties: { valid_from: JAN_2024 } }),
			createEdge({ id: "e2", properties: { valid_from: MAR_2024 } }),
		];

		const { filtered, stats } = filterEdgesByTime(edges, {});

		expect(filtered.length).toBe(2);
		expect(stats.beforeFiltering).toBe(2);
		expect(stats.afterFiltering).toBe(2);
		expect(stats.notYetValid).toBe(0);
		expect(stats.expired).toBe(0);
		expect(stats.notYetRecorded).toBe(0);
	});

	it("filters out edges not yet valid", () => {
		const edges = [
			createEdge({ id: "e1", properties: { valid_from: JAN_2024 } }),
			createEdge({ id: "e2", properties: { valid_from: MAR_2024 } }),
			createEdge({ id: "e3", properties: { valid_from: MAY_2024 } }),
		];

		const { filtered, stats } = filterEdgesByTime(edges, { asOfTimestamp: FEB_2024 });

		expect(filtered.length).toBe(1);
		expect(filtered[0]?.id).toBe("e1");
		expect(stats.notYetValid).toBe(2);
	});

	it("filters out expired edges", () => {
		const edges = [
			createEdge({ id: "e1", properties: { valid_from: JAN_2024 } }), // Active
			createEdge({ id: "e2", properties: { valid_from: JAN_2024, valid_to: FEB_2024 } }), // Expired
			createEdge({ id: "e3", properties: { valid_from: JAN_2024, valid_to: APR_2024 } }), // Active at MAR
		];

		const { filtered, stats } = filterEdgesByTime(edges, { asOfTimestamp: MAR_2024 });

		expect(filtered.length).toBe(2);
		expect(filtered.map((e) => e.id).toSorted()).toEqual(["e1", "e3"]);
		expect(stats.expired).toBe(1);
	});

	it("includes expired edges when includeExpired is true", () => {
		const edges = [
			createEdge({ id: "e1", properties: { valid_from: JAN_2024, valid_to: FEB_2024 } }),
		];

		// Without includeExpired
		const { filtered: filtered1 } = filterEdgesByTime(edges, { asOfTimestamp: MAR_2024 });
		expect(filtered1.length).toBe(0);

		// With includeExpired
		const { filtered: filtered2 } = filterEdgesByTime(edges, {
			asOfTimestamp: MAR_2024,
			includeExpired: true,
		});
		expect(filtered2.length).toBe(1);
	});

	it("filters by knownAsOfTimestamp", () => {
		const edges = [
			createEdge({ id: "e1", properties: { recorded_at: JAN_2024 } }),
			createEdge({ id: "e2", properties: { recorded_at: MAR_2024 } }),
			createEdge({ id: "e3", properties: { recorded_at: MAY_2024 } }),
		];

		const { filtered, stats } = filterEdgesByTime(edges, { knownAsOfTimestamp: FEB_2024 });

		expect(filtered.length).toBe(1);
		expect(filtered[0]?.id).toBe("e1");
		expect(stats.notYetRecorded).toBe(2);
	});

	it("combines asOfTimestamp and knownAsOfTimestamp", () => {
		// Edge 1: Started Jan, recorded Jan - visible at Feb
		// Edge 2: Started Jan, recorded Mar - not visible at Feb (didn't know yet)
		// Edge 3: Started Mar, recorded Jan - not visible at Feb (not yet valid)
		const edges = [
			createEdge({ id: "e1", properties: { valid_from: JAN_2024, recorded_at: JAN_2024 } }),
			createEdge({ id: "e2", properties: { valid_from: JAN_2024, recorded_at: MAR_2024 } }),
			createEdge({ id: "e3", properties: { valid_from: MAR_2024, recorded_at: JAN_2024 } }),
		];

		const { filtered, stats } = filterEdgesByTime(edges, {
			asOfTimestamp: FEB_2024,
			knownAsOfTimestamp: FEB_2024,
		});

		expect(filtered.length).toBe(1);
		expect(filtered[0]?.id).toBe("e1");
		expect(stats.notYetValid).toBe(1);
		expect(stats.notYetRecorded).toBe(1);
	});

	it("handles legacy edges without temporal properties", () => {
		const edges = [
			createEdge({ id: "e1", properties: {} }), // Legacy
			createEdge({ id: "e2", properties: { valid_from: MAR_2024 } }),
		];

		const { filtered } = filterEdgesByTime(edges, { asOfTimestamp: FEB_2024 });

		// Legacy edge should be included (treated as always active)
		expect(filtered.length).toBe(1);
		expect(filtered[0]?.id).toBe("e1");
	});
});
