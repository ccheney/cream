/**
 * Tests for Package Dependency Validation (utilities + integration)
 */

import { describe, expect, it } from "bun:test";
import {
	createDependencyValidator,
	DependencyValidator,
	type PackageInfo,
	parsePackageJson,
} from "./dependencyValidation";

function createPackage(
	name: string,
	dependencies: string[] = [],
	devDependencies: string[] = [],
): PackageInfo {
	return {
		name,
		path: `packages/${name.replace("@cream/", "")}/package.json`,
		dependencies: Object.fromEntries(
			dependencies.map((dep) => [dep, dep.startsWith("@cream/") ? "workspace:*" : "^1.0.0"]),
		),
		devDependencies: Object.fromEntries(
			devDependencies.map((dep) => [dep, dep.startsWith("@cream/") ? "workspace:*" : "^1.0.0"]),
		),
		workspaceDependencies: [],
	};
}

describe("parsePackageJson valid input", () => {
	it("should parse valid package.json", () => {
		const content = JSON.stringify({
			name: "@cream/domain",
			version: "1.0.0",
			dependencies: {
				zod: "^3.0.0",
				"@cream/proto": "workspace:*",
			},
			devDependencies: {
				typescript: "^5.0.0",
			},
		});

		const result = parsePackageJson(content, "packages/domain/package.json");

		expect(result).not.toBeNull();
		expect(result?.name).toBe("@cream/domain");
		expect(result?.dependencies).toHaveProperty("zod");
		expect(result?.dependencies).toHaveProperty("@cream/proto");
		expect(result?.devDependencies).toHaveProperty("typescript");
	});

	it("should handle missing dependencies", () => {
		const content = JSON.stringify({
			name: "@cream/minimal",
		});

		const result = parsePackageJson(content, "packages/minimal/package.json");

		expect(result).not.toBeNull();
		expect(result?.dependencies).toEqual({});
		expect(result?.devDependencies).toEqual({});
	});
});

describe("parsePackageJson invalid input", () => {
	it("should return null for invalid JSON", () => {
		const result = parsePackageJson("not json", "packages/bad/package.json");

		expect(result).toBeNull();
	});

	it("should return null for missing name", () => {
		const content = JSON.stringify({
			version: "1.0.0",
		});

		const result = parsePackageJson(content, "packages/noname/package.json");

		expect(result).toBeNull();
	});
});

describe("createDependencyValidator", () => {
	it("should create validator with default config", () => {
		const validator = createDependencyValidator();

		expect(validator).toBeInstanceOf(DependencyValidator);
	});

	it("should create validator with custom config", () => {
		const validator = createDependencyValidator({
			includeDevDependencies: true,
			circularAsError: false,
		});

		const packages = [
			createPackage("@cream/a", ["@cream/b"]),
			createPackage("@cream/b", ["@cream/a"]),
		];
		validator.addPackages(packages);

		const result = validator.validate();

		expect(result.valid).toBe(true);
	});
});

describe("dependency validation integration - realistic monorepo", () => {
	it("should validate a realistic monorepo structure", () => {
		const validator = createDependencyValidator();
		const packages = [
			createPackage("@cream/tsconfig"),
			createPackage("@cream/proto"),
			createPackage("@cream/proto-gen", ["@cream/proto"]),
			createPackage("@cream/domain", ["@cream/proto-gen"]),
			createPackage("@cream/config", ["@cream/domain"]),
			createPackage("@cream/storage", ["@cream/domain"]),
			createPackage("@cream/marketdata", ["@cream/domain"]),
			createPackage("@cream/broker", ["@cream/domain"]),
			createPackage("@cream/agents", ["@cream/domain", "@cream/config"]),
			createPackage("@cream/indicators", ["@cream/domain"]),
			createPackage("@cream/regime", ["@cream/domain", "@cream/indicators"]),
		];

		validator.addPackages(packages);
		const result = validator.validate();

		expect(result.valid).toBe(true);
		expect(result.packagesAnalyzed).toBe(11);
		expect(result.circularDependencies).toHaveLength(0);
		expect(result.graphSummary.leafPackages).toContain("@cream/tsconfig");
		expect(result.graphSummary.leafPackages).toContain("@cream/proto");
		expect(result.graphSummary.mostDepended[0]?.name).toBe("@cream/domain");
	});
});

describe("dependency validation integration - architecture caveat", () => {
	it("should not flag non-cyclic architectural violations", () => {
		const validator = createDependencyValidator();
		const packages = [
			createPackage("@cream/storage"),
			createPackage("@cream/domain", ["@cream/storage"]),
			createPackage("@cream/config", ["@cream/domain"]),
		];

		validator.addPackages(packages);
		const result = validator.validate();

		expect(result.valid).toBe(true);
		expect(result.circularDependencies).toHaveLength(0);
	});
});
