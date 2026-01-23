/**
 * Version parsing and comparison utilities.
 */

import type { ParsedVersion, VersionConstraintPart, VersionStatus } from "./types.js";

export function parseVersion(version: string): ParsedVersion | null {
	// Handle versions like "1.92.0", "3.15.2", "7.0.0-dev.20260104.1"
	const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
	if (match) {
		return {
			major: parseInt(match[1], 10),
			minor: parseInt(match[2], 10),
			patch: parseInt(match[3], 10),
			prerelease: match[4] || null,
		};
	}

	// Try simpler format like "1.92" or "3.15"
	const simple = version.match(/^(\d+)\.(\d+)$/);
	if (simple) {
		return {
			major: parseInt(simple[1], 10),
			minor: parseInt(simple[2], 10),
			patch: 0,
			prerelease: null,
		};
	}

	return null;
}

export function parseConstraint(constraint: string): VersionConstraintPart[] {
	// Handle "|| " for OR constraints (e.g., "1.43.x || 1.47.x")
	if (constraint.includes("||")) {
		const parts = constraint.split("||").map((s) => s.trim());
		return parts.map((p) => parseConstraint(p)[0]).filter(Boolean);
	}

	// Handle ".x" wildcard
	if (constraint.includes(".x")) {
		const base = constraint.replace(".x", ".0");
		return [{ operator: "^", version: base }];
	}

	// Parse operator + version
	const match = constraint.match(/^(>=|<=|>|<|=|~|\^)?\s*(.+)$/);
	if (!match) {
		return [{ operator: ">=", version: constraint }];
	}

	return [{ operator: match[1] || "=", version: match[2] }];
}

function compareGreaterOrEqual(found: ParsedVersion, req: ParsedVersion): VersionStatus {
	if (found.major < req.major) return "fail";
	if (found.major > req.major) return "pass";
	if (found.minor < req.minor) return "fail";
	if (found.minor > req.minor) return "pass";
	if (found.patch < req.patch) return "fail";
	return "pass";
}

function compareExact(found: ParsedVersion, req: ParsedVersion): VersionStatus {
	if (found.major === req.major && found.minor === req.minor && found.patch === req.patch) {
		return "pass";
	}
	return "fail";
}

function compareTilde(found: ParsedVersion, req: ParsedVersion): VersionStatus {
	// ~1.2.3 means >=1.2.3 <1.3.0
	if (found.major !== req.major) return "fail";
	if (found.minor !== req.minor) return "fail";
	if (found.patch < req.patch) return "fail";
	return "pass";
}

function compareCaret(found: ParsedVersion, req: ParsedVersion): VersionStatus {
	// ^1.2.3 means >=1.2.3 <2.0.0
	if (found.major !== req.major) return "fail";
	if (found.minor < req.minor) return "fail";
	if (found.minor === req.minor && found.patch < req.patch) return "fail";
	return "pass";
}

export function compareVersions(found: string, required: string): VersionStatus {
	const constraint = parseConstraint(required);
	const foundVersion = parseVersion(found);

	if (!foundVersion) {
		return "fail";
	}

	for (const { operator, version: reqVersion } of constraint) {
		const req = parseVersion(reqVersion);
		if (!req) continue;

		switch (operator) {
			case ">=":
				return compareGreaterOrEqual(foundVersion, req);
			case "=":
				return compareExact(foundVersion, req);
			case "~":
				return compareTilde(foundVersion, req);
			case "^":
				return compareCaret(foundVersion, req);
		}
	}

	return "pass";
}

export function normalizeVersion(version: string): string {
	const parts = version.split(".");
	if (parts.length === 2) {
		return `${version}.0`;
	}
	return version;
}
