/**
 * Access Tracking Tests
 *
 * Tests for recording access and calculating days since last access.
 */

import { describe, expect, it } from "bun:test";
import { daysSinceLastAccess, recordAccess } from "../../src/retention/forgetting.js";

describe("recordAccess", () => {
  it("creates new record for first access", () => {
    const accessTime = new Date();
    const record = recordAccess(undefined, "node-1", accessTime);

    expect(record.nodeId).toBe("node-1");
    expect(record.accessCount).toBe(1);
    expect(record.firstAccessedAt).toEqual(accessTime);
    expect(record.lastAccessedAt).toEqual(accessTime);
  });

  it("increments count for existing record", () => {
    const firstAccess = new Date("2024-01-01");
    const secondAccess = new Date("2024-01-15");

    const first = recordAccess(undefined, "node-1", firstAccess);
    const second = recordAccess(first, "node-1", secondAccess);

    expect(second.accessCount).toBe(2);
    expect(second.firstAccessedAt).toEqual(firstAccess);
    expect(second.lastAccessedAt).toEqual(secondAccess);
  });
});

describe("daysSinceLastAccess", () => {
  it("calculates days since last access", () => {
    const record = {
      nodeId: "node-1",
      accessCount: 5,
      firstAccessedAt: new Date("2024-01-01"),
      lastAccessedAt: new Date("2024-01-01"),
    };

    const refDate = new Date("2024-01-31");
    const days = daysSinceLastAccess(record, refDate);

    expect(days).toBe(30);
  });
});
