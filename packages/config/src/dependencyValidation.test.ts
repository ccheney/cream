/**
 * Tests for Package Dependency Validation
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
	createDependencyValidator,
	DependencyValidator,
	type PackageInfo,
	parsePackageJson,
} from "./dependencyValidation";

// ============================================
// Helper Functions
// ============================================

function createPackage(
	name: string,
	dependencies: string[] = [],
	devDependencies: string[] = [],
): PackageInfo {
	return {
		name,
		path: `packages/${name.replace("@cream/", "")}/package.json`,
		dependencies: Object.fromEntries(
			dependencies.map((d) => [d, d.startsWith("@cream/") ? "workspace:*" : "^1.0.0"]),
		),
		devDependencies: Object.fromEntries(
			devDependencies.map((d) => [d, d.startsWith("@cream/") ? "workspace:*" : "^1.0.0"]),
		),
		workspaceDependencies: [],
	};
}

// ============================================
// DependencyValidator Tests
// ============================================

describe("DependencyValidator", () => {
	let validator: DependencyValidator;

	beforeEach(() => {
		validator = new DependencyValidator();
	});

	describe("addPackage", () => {
		it("should add a package to the validator", () => {
			const pkg = createPackage("@cream/domain");
			validator.addPackage(pkg);

			expect(validator.getPackages()).toHaveLength(1);
			expect(validator.getPackage("@cream/domain")).toBeDefined();
		});

		it("should track workspace dependencies", () => {
			const pkg = createPackage("@cream/config", ["@cream/domain", "zod"]);
			validator.addPackage(pkg);

			const info = validator.getPackage("@cream/config");
			expect(info?.workspaceDependencies).toContain("@cream/domain");
			expect(info?.workspaceDependencies).not.toContain("zod");
		});
	});

	describe("addPackages", () => {
		it("should add multiple packages", () => {
			const packages = [
				createPackage("@cream/domain"),
				createPackage("@cream/config", ["@cream/domain"]),
				createPackage("@cream/agents", ["@cream/domain", "@cream/config"]),
			];

			validator.addPackages(packages);

			expect(validator.getPackages()).toHaveLength(3);
		});
	});

	describe("validate - no violations", () => {
		it("should pass for valid dependency structure", () => {
			const packages = [
				createPackage("@cream/domain"),
				createPackage("@cream/config", ["@cream/domain"]),
				createPackage("@cream/app", ["@cream/domain", "@cream/config"]),
			];

			validator.addPackages(packages);
			const result = validator.validate();

			expect(result.valid).toBe(true);
			expect(result.errorCount).toBe(0);
			expect(result.circularDependencies).toHaveLength(0);
		});

		it("should report correct statistics", () => {
			const packages = [
				createPackage("@cream/domain"),
				createPackage("@cream/config", ["@cream/domain"]),
			];

			validator.addPackages(packages);
			const result = validator.validate();

			expect(result.packagesAnalyzed).toBe(2);
			expect(result.dependenciesAnalyzed).toBe(1);
		});
	});

	describe("validate - circular dependencies", () => {
		it("should detect simple circular dependency (A → B → A)", () => {
			const packages = [
				createPackage("@cream/a", ["@cream/b"]),
				createPackage("@cream/b", ["@cream/a"]),
			];

			validator.addPackages(packages);
			const result = validator.validate();

			expect(result.valid).toBe(false);
			expect(result.circularDependencies.length).toBeGreaterThan(0);
			expect(result.circularDependencies[0]?.message).toContain("Circular dependency");
		});

		it("should detect longer circular dependency (A → B → C → A)", () => {
			const packages = [
				createPackage("@cream/a", ["@cream/b"]),
				createPackage("@cream/b", ["@cream/c"]),
				createPackage("@cream/c", ["@cream/a"]),
			];

			validator.addPackages(packages);
			const result = validator.validate();

			expect(result.valid).toBe(false);
			expect(result.circularDependencies.length).toBeGreaterThan(0);
		});

		it("should detect multiple circular dependencies", () => {
			const packages = [
				createPackage("@cream/a", ["@cream/b"]),
				createPackage("@cream/b", ["@cream/a"]),
				createPackage("@cream/c", ["@cream/d"]),
				createPackage("@cream/d", ["@cream/c"]),
			];

			validator.addPackages(packages);
			const result = validator.validate();

			expect(result.valid).toBe(false);
			expect(result.circularDependencies.length).toBe(2);
		});

		it("should treat circular as warning when configured", () => {
			validator = new DependencyValidator({ circularAsError: false });

			const packages = [
				createPackage("@cream/a", ["@cream/b"]),
				createPackage("@cream/b", ["@cream/a"]),
			];

			validator.addPackages(packages);
			const result = validator.validate();

			expect(result.valid).toBe(true); // Warnings don't affect validity
			expect(result.warningCount).toBeGreaterThan(0);
		});
	});

	describe("validate - self reference", () => {
		it("should detect self-referencing package", () => {
			const pkg: PackageInfo = {
				name: "@cream/self",
				path: "packages/self/package.json",
				dependencies: { "@cream/self": "workspace:*" },
				devDependencies: {},
				workspaceDependencies: [],
			};

			validator.addPackage(pkg);
			const result = validator.validate();

			expect(result.valid).toBe(false);
			expect(result.violations.some((v) => v.type === "SELF_REFERENCE")).toBe(true);
		});
	});

	describe("validate - missing packages", () => {
		it("should warn about missing workspace packages", () => {
			const pkg = createPackage("@cream/app", ["@cream/missing"]);

			validator.addPackage(pkg);
			const result = validator.validate();

			expect(result.warningCount).toBeGreaterThan(0);
			expect(result.violations.some((v) => v.type === "MISSING_PACKAGE")).toBe(true);
		});
	});

	describe("wouldCreateCycle", () => {
		it("should return true if adding dependency would create cycle", () => {
			const packages = [
				createPackage("@cream/a", ["@cream/b"]),
				createPackage("@cream/b", ["@cream/c"]),
				createPackage("@cream/c"),
			];

			validator.addPackages(packages);

			// Adding c → a would create a cycle
			expect(validator.wouldCreateCycle("@cream/c", "@cream/a")).toBe(true);
		});

		it("should return false if adding dependency is safe", () => {
			const packages = [createPackage("@cream/a"), createPackage("@cream/b")];

			validator.addPackages(packages);

			expect(validator.wouldCreateCycle("@cream/a", "@cream/b")).toBe(false);
		});
	});

	describe("getTransitiveDependencies", () => {
		it("should return all transitive dependencies", () => {
			const packages = [
				createPackage("@cream/domain"),
				createPackage("@cream/config", ["@cream/domain"]),
				createPackage("@cream/app", ["@cream/config"]),
			];

			validator.addPackages(packages);

			const deps = validator.getTransitiveDependencies("@cream/app");

			expect(deps).toContain("@cream/config");
			expect(deps).toContain("@cream/domain");
		});

		it("should return empty for leaf package", () => {
			const packages = [createPackage("@cream/domain")];

			validator.addPackages(packages);

			const deps = validator.getTransitiveDependencies("@cream/domain");

			expect(deps).toHaveLength(0);
		});
	});

	describe("getDependents", () => {
		it("should return all packages that depend on given package", () => {
			const packages = [
				createPackage("@cream/domain"),
				createPackage("@cream/config", ["@cream/domain"]),
				createPackage("@cream/app", ["@cream/domain"]),
			];

			validator.addPackages(packages);

			const dependents = validator.getDependents("@cream/domain");

			expect(dependents).toContain("@cream/config");
			expect(dependents).toContain("@cream/app");
		});

		it("should return empty for root package", () => {
			const packages = [
				createPackage("@cream/domain"),
				createPackage("@cream/app", ["@cream/domain"]),
			];

			validator.addPackages(packages);

			const dependents = validator.getDependents("@cream/app");

			expect(dependents).toHaveLength(0);
		});
	});

	describe("getDepth", () => {
		it("should return 0 for leaf package", () => {
			const packages = [createPackage("@cream/domain")];

			validator.addPackages(packages);

			expect(validator.getDepth("@cream/domain")).toBe(0);
		});

		it("should return correct depth for nested dependencies", () => {
			const packages = [
				createPackage("@cream/domain"),
				createPackage("@cream/config", ["@cream/domain"]),
				createPackage("@cream/app", ["@cream/config"]),
			];

			validator.addPackages(packages);

			expect(validator.getDepth("@cream/app")).toBe(2);
			expect(validator.getDepth("@cream/config")).toBe(1);
			expect(validator.getDepth("@cream/domain")).toBe(0);
		});
	});

	describe("getTopologicalSort", () => {
		it("should return valid topological order", () => {
			const packages = [
				createPackage("@cream/domain"),
				createPackage("@cream/config", ["@cream/domain"]),
				createPackage("@cream/app", ["@cream/config"]),
			];

			validator.addPackages(packages);

			const sorted = validator.getTopologicalSort();

			expect(sorted).not.toBeNull();
			expect(sorted).toHaveLength(3);
			if (!sorted) {
				throw new Error("Expected topological sort to return a list");
			}

			// domain should come before config, config before app
			const domainIdx = sorted.indexOf("@cream/domain");
			const configIdx = sorted.indexOf("@cream/config");
			const appIdx = sorted.indexOf("@cream/app");

			expect(domainIdx).toBeLessThan(configIdx);
			expect(configIdx).toBeLessThan(appIdx);
		});

		it("should return null for cyclic dependencies", () => {
			const packages = [
				createPackage("@cream/a", ["@cream/b"]),
				createPackage("@cream/b", ["@cream/a"]),
			];

			validator.addPackages(packages);

			const sorted = validator.getTopologicalSort();

			expect(sorted).toBeNull();
		});
	});

	describe("getDependencyGraph", () => {
		it("should return the dependency graph", () => {
			const packages = [
				createPackage("@cream/domain"),
				createPackage("@cream/config", ["@cream/domain"]),
			];

			validator.addPackages(packages);

			const graph = validator.getDependencyGraph();

			expect(graph.get("@cream/config")).toContain("@cream/domain");
			expect(graph.get("@cream/domain")).toHaveLength(0);
		});
	});

	describe("graphSummary", () => {
		it("should calculate correct summary statistics", () => {
			const packages = [
				createPackage("@cream/domain"),
				createPackage("@cream/config", ["@cream/domain"]),
				createPackage("@cream/storage", ["@cream/domain"]),
				createPackage("@cream/app", ["@cream/config", "@cream/storage"]),
			];

			validator.addPackages(packages);
			const result = validator.validate();
			const summary = result.graphSummary;

			expect(summary.totalPackages).toBe(4);
			expect(summary.totalEdges).toBe(4); // config→domain, storage→domain, app→config, app→storage
			expect(summary.leafPackages).toContain("@cream/domain");
			expect(summary.rootPackages).toContain("@cream/app");
			expect(summary.mostDepended[0]?.name).toBe("@cream/domain");
			expect(summary.mostDepended[0]?.dependentCount).toBe(2);
		});
	});

	describe("includeDevDependencies", () => {
		it("should include devDependencies when configured", () => {
			validator = new DependencyValidator({ includeDevDependencies: true });

			const pkg = createPackage("@cream/app", [], ["@cream/test-utils"]);
			validator.addPackage(pkg);

			const info = validator.getPackage("@cream/app");
			expect(info?.workspaceDependencies).toContain("@cream/test-utils");
		});

		it("should exclude devDependencies by default", () => {
			const pkg = createPackage("@cream/app", [], ["@cream/test-utils"]);
			validator.addPackage(pkg);

			const info = validator.getPackage("@cream/app");
			expect(info?.workspaceDependencies).not.toContain("@cream/test-utils");
		});
	});

	describe("clear", () => {
		it("should clear all packages", () => {
			validator.addPackage(createPackage("@cream/domain"));
			expect(validator.getPackages()).toHaveLength(1);

			validator.clear();

			expect(validator.getPackages()).toHaveLength(0);
		});
	});
});

// ============================================
// parsePackageJson Tests
// ============================================

describe("parsePackageJson", () => {
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

// ============================================
// Factory Function Tests
// ============================================

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

		// Add packages to verify config is applied
		const packages = [
			createPackage("@cream/a", ["@cream/b"]),
			createPackage("@cream/b", ["@cream/a"]),
		];

		validator.addPackages(packages);
		const result = validator.validate();

		// With circularAsError: false, should be valid (warning only)
		expect(result.valid).toBe(true);
	});
});

// ============================================
// Integration Tests
// ============================================

describe("Integration", () => {
	it("should validate a realistic monorepo structure", () => {
		const validator = createDependencyValidator();

		// Simulate cream monorepo structure
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

		// Check graph summary
		expect(result.graphSummary.leafPackages).toContain("@cream/tsconfig");
		expect(result.graphSummary.leafPackages).toContain("@cream/proto");
		expect(result.graphSummary.mostDepended[0]?.name).toBe("@cream/domain");
	});

	it("should detect bad architecture (domain depending on infrastructure)", () => {
		const validator = createDependencyValidator();

		// Bad: domain depends on storage (infrastructure)
		const packages = [
			createPackage("@cream/storage"),
			createPackage("@cream/domain", ["@cream/storage"]), // Violation!
			createPackage("@cream/config", ["@cream/domain"]),
		];

		validator.addPackages(packages);
		const result = validator.validate();

		// No circular dependencies, but this is architecturally wrong
		// (Use LayerValidator for that check)
		expect(result.valid).toBe(true);
		expect(result.circularDependencies).toHaveLength(0);
	});
});
