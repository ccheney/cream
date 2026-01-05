/**
 * Role-Based Authorization Tests
 */

import { describe, expect, it } from "bun:test";
import {
  hasMinimumRole,
  hasExactRole,
  hasOneOfRoles,
} from "./roles.js";

describe("hasMinimumRole", () => {
  it("viewer has minimum viewer", () => {
    expect(hasMinimumRole("viewer", "viewer")).toBe(true);
  });

  it("viewer does not have minimum operator", () => {
    expect(hasMinimumRole("viewer", "operator")).toBe(false);
  });

  it("viewer does not have minimum admin", () => {
    expect(hasMinimumRole("viewer", "admin")).toBe(false);
  });

  it("operator has minimum viewer", () => {
    expect(hasMinimumRole("operator", "viewer")).toBe(true);
  });

  it("operator has minimum operator", () => {
    expect(hasMinimumRole("operator", "operator")).toBe(true);
  });

  it("operator does not have minimum admin", () => {
    expect(hasMinimumRole("operator", "admin")).toBe(false);
  });

  it("admin has minimum viewer", () => {
    expect(hasMinimumRole("admin", "viewer")).toBe(true);
  });

  it("admin has minimum operator", () => {
    expect(hasMinimumRole("admin", "operator")).toBe(true);
  });

  it("admin has minimum admin", () => {
    expect(hasMinimumRole("admin", "admin")).toBe(true);
  });
});

describe("hasExactRole", () => {
  it("viewer matches viewer", () => {
    expect(hasExactRole("viewer", "viewer")).toBe(true);
  });

  it("viewer does not match operator", () => {
    expect(hasExactRole("viewer", "operator")).toBe(false);
  });

  it("admin matches admin", () => {
    expect(hasExactRole("admin", "admin")).toBe(true);
  });

  it("admin does not match viewer", () => {
    expect(hasExactRole("admin", "viewer")).toBe(false);
  });
});

describe("hasOneOfRoles", () => {
  it("viewer is in [viewer]", () => {
    expect(hasOneOfRoles("viewer", ["viewer"])).toBe(true);
  });

  it("viewer is in [viewer, operator]", () => {
    expect(hasOneOfRoles("viewer", ["viewer", "operator"])).toBe(true);
  });

  it("viewer is not in [operator, admin]", () => {
    expect(hasOneOfRoles("viewer", ["operator", "admin"])).toBe(false);
  });

  it("admin is in [viewer, admin]", () => {
    expect(hasOneOfRoles("admin", ["viewer", "admin"])).toBe(true);
  });

  it("handles empty array", () => {
    expect(hasOneOfRoles("viewer", [])).toBe(false);
  });
});
