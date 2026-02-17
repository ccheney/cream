/**
 * Tests for DependencyValidator behaviors
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { DependencyValidator, type PackageInfo } from "./dependencyValidation";

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

describe("DependencyValidator addPackage", () => {
	let validator: DependencyValidator;

	beforeEach(() => {
		validator = new DependencyValidator();
	});

	it("should add a package to the validator", () => {
		validator.addPackage(createPackage("@cream/domain"));

		expect(validator.getPackages()).toHaveLength(1);
		expect(validator.getPackage("@cream/domain")).toBeDefined();
	});

	it("should track workspace dependencies", () => {
		validator.addPackage(createPackage("@cream/config", ["@cream/domain", "zod"]));

		const info = validator.getPackage("@cream/config");
		expect(info?.workspaceDependencies).toContain("@cream/domain");
		expect(info?.workspaceDependencies).not.toContain("zod");
	});
});

describe("DependencyValidator addPackages", () => {
	it("should add multiple packages", () => {
		const validator = new DependencyValidator();
		validator.addPackages([
			createPackage("@cream/domain"),
			createPackage("@cream/config", ["@cream/domain"]),
			createPackage("@cream/agents", ["@cream/domain", "@cream/config"]),
		]);

		expect(validator.getPackages()).toHaveLength(3);
	});
});

describe("DependencyValidator validate valid structures", () => {
	let validator: DependencyValidator;

	beforeEach(() => {
		validator = new DependencyValidator();
	});

	it("should pass for valid dependency structure", () => {
		validator.addPackages([
			createPackage("@cream/domain"),
			createPackage("@cream/config", ["@cream/domain"]),
			createPackage("@cream/app", ["@cream/domain", "@cream/config"]),
		]);

		const result = validator.validate();

		expect(result.valid).toBe(true);
		expect(result.errorCount).toBe(0);
		expect(result.circularDependencies).toHaveLength(0);
	});

	it("should report correct statistics", () => {
		validator.addPackages([
			createPackage("@cream/domain"),
			createPackage("@cream/config", ["@cream/domain"]),
		]);

		const result = validator.validate();

		expect(result.packagesAnalyzed).toBe(2);
		expect(result.dependenciesAnalyzed).toBe(1);
	});
});

describe("DependencyValidator validate circular dependencies", () => {
	let validator: DependencyValidator;

	beforeEach(() => {
		validator = new DependencyValidator();
	});

	it("should detect simple circular dependency (A -> B -> A)", () => {
		validator.addPackages([
			createPackage("@cream/a", ["@cream/b"]),
			createPackage("@cream/b", ["@cream/a"]),
		]);

		const result = validator.validate();

		expect(result.valid).toBe(false);
		expect(result.circularDependencies.length).toBeGreaterThan(0);
		expect(result.circularDependencies[0]?.message).toContain("Circular dependency");
	});

	it("should detect longer circular dependency (A -> B -> C -> A)", () => {
		validator.addPackages([
			createPackage("@cream/a", ["@cream/b"]),
			createPackage("@cream/b", ["@cream/c"]),
			createPackage("@cream/c", ["@cream/a"]),
		]);

		const result = validator.validate();

		expect(result.valid).toBe(false);
		expect(result.circularDependencies.length).toBeGreaterThan(0);
	});
});

describe("DependencyValidator validate circular dependency variants", () => {
	it("should detect multiple circular dependencies", () => {
		const validator = new DependencyValidator();
		validator.addPackages([
			createPackage("@cream/a", ["@cream/b"]),
			createPackage("@cream/b", ["@cream/a"]),
			createPackage("@cream/c", ["@cream/d"]),
			createPackage("@cream/d", ["@cream/c"]),
		]);

		const result = validator.validate();

		expect(result.valid).toBe(false);
		expect(result.circularDependencies.length).toBe(2);
	});

	it("should treat circular dependencies as warnings when configured", () => {
		const validator = new DependencyValidator({ circularAsError: false });
		validator.addPackages([
			createPackage("@cream/a", ["@cream/b"]),
			createPackage("@cream/b", ["@cream/a"]),
		]);

		const result = validator.validate();

		expect(result.valid).toBe(true);
		expect(result.warningCount).toBeGreaterThan(0);
	});
});

describe("DependencyValidator validate self and missing package rules", () => {
	let validator: DependencyValidator;

	beforeEach(() => {
		validator = new DependencyValidator();
	});

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
		expect(result.violations.some((violation) => violation.type === "SELF_REFERENCE")).toBe(true);
	});

	it("should warn about missing workspace packages", () => {
		validator.addPackage(createPackage("@cream/app", ["@cream/missing"]));

		const result = validator.validate();

		expect(result.warningCount).toBeGreaterThan(0);
		expect(result.violations.some((violation) => violation.type === "MISSING_PACKAGE")).toBe(true);
	});
});

describe("DependencyValidator wouldCreateCycle", () => {
	it("should return true if adding dependency would create cycle", () => {
		const validator = new DependencyValidator();
		validator.addPackages([
			createPackage("@cream/a", ["@cream/b"]),
			createPackage("@cream/b", ["@cream/c"]),
			createPackage("@cream/c"),
		]);

		expect(validator.wouldCreateCycle("@cream/c", "@cream/a")).toBe(true);
	});

	it("should return false if adding dependency is safe", () => {
		const validator = new DependencyValidator();
		validator.addPackages([createPackage("@cream/a"), createPackage("@cream/b")]);

		expect(validator.wouldCreateCycle("@cream/a", "@cream/b")).toBe(false);
	});
});

describe("DependencyValidator getTransitiveDependencies", () => {
	it("should return all transitive dependencies", () => {
		const validator = new DependencyValidator();
		validator.addPackages([
			createPackage("@cream/domain"),
			createPackage("@cream/config", ["@cream/domain"]),
			createPackage("@cream/app", ["@cream/config"]),
		]);

		const deps = validator.getTransitiveDependencies("@cream/app");

		expect(deps).toContain("@cream/config");
		expect(deps).toContain("@cream/domain");
	});

	it("should return empty for leaf package", () => {
		const validator = new DependencyValidator();
		validator.addPackages([createPackage("@cream/domain")]);

		const deps = validator.getTransitiveDependencies("@cream/domain");

		expect(deps).toHaveLength(0);
	});
});

describe("DependencyValidator getDependents", () => {
	it("should return all packages that depend on given package", () => {
		const validator = new DependencyValidator();
		validator.addPackages([
			createPackage("@cream/domain"),
			createPackage("@cream/config", ["@cream/domain"]),
			createPackage("@cream/app", ["@cream/domain"]),
		]);

		const dependents = validator.getDependents("@cream/domain");

		expect(dependents).toContain("@cream/config");
		expect(dependents).toContain("@cream/app");
	});

	it("should return empty for root package", () => {
		const validator = new DependencyValidator();
		validator.addPackages([
			createPackage("@cream/domain"),
			createPackage("@cream/app", ["@cream/domain"]),
		]);

		const dependents = validator.getDependents("@cream/app");

		expect(dependents).toHaveLength(0);
	});
});

describe("DependencyValidator getDepth", () => {
	it("should return 0 for leaf package", () => {
		const validator = new DependencyValidator();
		validator.addPackages([createPackage("@cream/domain")]);

		expect(validator.getDepth("@cream/domain")).toBe(0);
	});

	it("should return correct depth for nested dependencies", () => {
		const validator = new DependencyValidator();
		validator.addPackages([
			createPackage("@cream/domain"),
			createPackage("@cream/config", ["@cream/domain"]),
			createPackage("@cream/app", ["@cream/config"]),
		]);

		expect(validator.getDepth("@cream/app")).toBe(2);
		expect(validator.getDepth("@cream/config")).toBe(1);
		expect(validator.getDepth("@cream/domain")).toBe(0);
	});
});

describe("DependencyValidator getTopologicalSort", () => {
	it("should return valid topological order", () => {
		const validator = new DependencyValidator();
		validator.addPackages([
			createPackage("@cream/domain"),
			createPackage("@cream/config", ["@cream/domain"]),
			createPackage("@cream/app", ["@cream/config"]),
		]);

		const sorted = validator.getTopologicalSort();

		expect(sorted).not.toBeNull();
		expect(sorted).toHaveLength(3);
		if (!sorted) {
			throw new Error("Expected topological sort to return a list");
		}

		const domainIdx = sorted.indexOf("@cream/domain");
		const configIdx = sorted.indexOf("@cream/config");
		const appIdx = sorted.indexOf("@cream/app");

		expect(domainIdx).toBeLessThan(configIdx);
		expect(configIdx).toBeLessThan(appIdx);
	});

	it("should return null for cyclic dependencies", () => {
		const validator = new DependencyValidator();
		validator.addPackages([
			createPackage("@cream/a", ["@cream/b"]),
			createPackage("@cream/b", ["@cream/a"]),
		]);

		const sorted = validator.getTopologicalSort();

		expect(sorted).toBeNull();
	});
});

describe("DependencyValidator getDependencyGraph", () => {
	it("should return the dependency graph", () => {
		const validator = new DependencyValidator();
		validator.addPackages([
			createPackage("@cream/domain"),
			createPackage("@cream/config", ["@cream/domain"]),
		]);

		const graph = validator.getDependencyGraph();

		expect(graph.get("@cream/config")).toContain("@cream/domain");
		expect(graph.get("@cream/domain")).toHaveLength(0);
	});
});

describe("DependencyValidator graphSummary", () => {
	it("should calculate correct summary statistics", () => {
		const validator = new DependencyValidator();
		validator.addPackages([
			createPackage("@cream/domain"),
			createPackage("@cream/config", ["@cream/domain"]),
			createPackage("@cream/storage", ["@cream/domain"]),
			createPackage("@cream/app", ["@cream/config", "@cream/storage"]),
		]);

		const summary = validator.validate().graphSummary;

		expect(summary.totalPackages).toBe(4);
		expect(summary.totalEdges).toBe(4);
		expect(summary.leafPackages).toContain("@cream/domain");
		expect(summary.rootPackages).toContain("@cream/app");
		expect(summary.mostDepended[0]?.name).toBe("@cream/domain");
		expect(summary.mostDepended[0]?.dependentCount).toBe(2);
	});
});

describe("DependencyValidator includeDevDependencies", () => {
	it("should include devDependencies when configured", () => {
		const validator = new DependencyValidator({ includeDevDependencies: true });
		validator.addPackage(createPackage("@cream/app", [], ["@cream/test-utils"]));

		const info = validator.getPackage("@cream/app");
		expect(info?.workspaceDependencies).toContain("@cream/test-utils");
	});

	it("should exclude devDependencies by default", () => {
		const validator = new DependencyValidator();
		validator.addPackage(createPackage("@cream/app", [], ["@cream/test-utils"]));

		const info = validator.getPackage("@cream/app");
		expect(info?.workspaceDependencies).not.toContain("@cream/test-utils");
	});
});

describe("DependencyValidator clear", () => {
	it("should clear all packages", () => {
		const validator = new DependencyValidator();
		validator.addPackage(createPackage("@cream/domain"));
		expect(validator.getPackages()).toHaveLength(1);

		validator.clear();

		expect(validator.getPackages()).toHaveLength(0);
	});
});
