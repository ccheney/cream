/**
 * Type definitions for version validation.
 */

export interface VersionConstraint {
  name: string;
  required: string;
  found: string | null;
  status: "pass" | "fail" | "warn" | "missing";
  fix?: string;
}

export interface VersionConfig {
  runtimes: Record<string, string>;
  typescript: Record<string, string>;
  rust: Record<string, string>;
  python: Record<string, string>;
}

export interface CheckResult {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  missing: number;
}

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

export interface VersionConstraintPart {
  operator: string;
  version: string;
}

export type VersionStatus = "pass" | "fail" | "warn" | "missing";
