/**
 * Tests for LayerValidator core behavior
 */

import { describe, expect, it } from "bun:test";
import { type ArchitecturalLayer, LayerValidator } from "./layerValidation";

describe("LayerValidator constructor", () => {
	it("should create validator with default config", () => {
		const validator = new LayerValidator();
		expect(validator.getLayers()).toHaveLength(5);
	});

	it("should create validator with custom layers", () => {
		const customLayers: ArchitecturalLayer[] = [
			{
				name: "core",
				description: "Core layer",
				packages: ["@app/core"],
				allowedDependencies: [],
				forbiddenDependencies: [],
			},
			{
				name: "services",
				description: "Services layer",
				packages: ["@app/services"],
				allowedDependencies: ["core"],
				forbiddenDependencies: [],
			},
		];

		const validator = new LayerValidator({ layers: customLayers });
		expect(validator.getLayers()).toHaveLength(2);
	});
});

describe("LayerValidator validateImport rules", () => {
	it("should allow valid layer dependency", () => {
		const validator = new LayerValidator();

		const violation = validator.validateImport("packages/agents/src/agents.ts", "@cream/domain");

		expect(violation).toBeNull();
	});

	it("should detect forbidden dependency", () => {
		const validator = new LayerValidator();

		const violation = validator.validateImport("packages/domain/src/types.ts", "@cream/storage");

		expect(violation).not.toBeNull();
		expect(violation?.severity).toBe("ERROR");
		expect(violation?.sourceLayer).toBe("domain");
		expect(violation?.targetLayer).toBe("infrastructure");
	});

	it("should detect unlisted dependency", () => {
		const validator = new LayerValidator();

		const violation = validator.validateImport("packages/agents/src/workflow.ts", "apps/mastra");

		expect(violation).not.toBeNull();
		expect(violation?.severity).toBe("ERROR");
		expect(violation?.message).toContain("must not import from");
	});
});

describe("LayerValidator validateImport unknown and line metadata", () => {
	it("should allow same-layer imports", () => {
		const validator = new LayerValidator();

		const violation = validator.validateImport("packages/storage/src/client.ts", "@cream/helix");

		expect(violation).toBeNull();
	});

	it("should warn on unknown source file when configured", () => {
		const validator = new LayerValidator({ warnOnUnknown: true });

		const violation = validator.validateImport("unknown/path/file.ts", "@cream/domain");

		expect(violation).not.toBeNull();
		expect(violation?.severity).toBe("WARNING");
		expect(violation?.message).toContain("not mapped to any layer");
	});

	it("should include line number in violation", () => {
		const validator = new LayerValidator();

		const violation = validator.validateImport(
			"packages/domain/src/types.ts",
			"@cream/storage",
			42,
		);

		expect(violation?.lineNumber).toBe(42);
	});
});

describe("LayerValidator validateImport unknown disabled", () => {
	it("should not warn on unknown when disabled", () => {
		const validator = new LayerValidator({ warnOnUnknown: false });

		const violation = validator.validateImport("unknown/path/file.ts", "@cream/domain");

		expect(violation).toBeNull();
	});
});

describe("LayerValidator validateFile", () => {
	it("should validate multiple imports", () => {
		const validator = new LayerValidator();

		const violations = validator.validateFile("packages/domain/src/entities.ts", [
			{ path: "@cream/storage", line: 1 },
			{ path: "./types", line: 2 },
			{ path: "@cream/helix", line: 3 },
		]);

		expect(violations).toHaveLength(2);
	});

	it("should return empty array for valid file", () => {
		const validator = new LayerValidator();

		const violations = validator.validateFile("packages/agents/src/agents.ts", [
			{ path: "@cream/domain", line: 1 },
			{ path: "./types", line: 2 },
		]);

		expect(violations).toHaveLength(0);
	});
});

describe("LayerValidator validateFiles summary", () => {
	it("should validate multiple files", () => {
		const validator = new LayerValidator();

		const result = validator.validateFiles([
			{
				path: "packages/domain/src/types.ts",
				imports: [{ path: "@cream/storage", line: 1 }],
			},
			{
				path: "packages/agents/src/agents.ts",
				imports: [{ path: "@cream/domain", line: 1 }],
			},
		]);

		expect(result.filesChecked).toBe(2);
		expect(result.importsAnalyzed).toBe(2);
		expect(result.errorCount).toBe(1);
		expect(result.valid).toBe(false);
	});

	it("should return valid when no violations", () => {
		const validator = new LayerValidator();

		const result = validator.validateFiles([
			{
				path: "packages/agents/src/agents.ts",
				imports: [{ path: "@cream/domain", line: 1 }],
			},
			{
				path: "packages/storage/src/client.ts",
				imports: [{ path: "@cream/domain", line: 1 }],
			},
		]);

		expect(result.valid).toBe(true);
		expect(result.errorCount).toBe(0);
	});
});

describe("LayerValidator validateFiles warnings", () => {
	it("should separate warnings and errors", () => {
		const validator = new LayerValidator({ warnOnUnknown: true });

		const result = validator.validateFiles([
			{
				path: "unknown/file.ts",
				imports: [{ path: "@cream/domain", line: 1 }],
			},
			{
				path: "packages/domain/src/types.ts",
				imports: [{ path: "@cream/storage", line: 1 }],
			},
		]);

		expect(result.warningCount).toBe(1);
		expect(result.errorCount).toBe(1);
		expect(result.valid).toBe(false);
	});
});

describe("LayerValidator findLayerForFile", () => {
	it("should find layer by package path", () => {
		const validator = new LayerValidator();

		expect(validator.findLayerForFile("packages/domain/src/types.ts")?.name).toBe("domain");
		expect(validator.findLayerForFile("packages/storage/src/client.ts")?.name).toBe(
			"infrastructure",
		);
		expect(validator.findLayerForFile("apps/mastra/src/index.ts")?.name).toBe("presentation");
	});

	it("should return null for unknown path", () => {
		const validator = new LayerValidator();

		expect(validator.findLayerForFile("unknown/path.ts")).toBeNull();
	});
});

describe("LayerValidator findLayerForImport", () => {
	it("should find layer by package import", () => {
		const validator = new LayerValidator();

		expect(validator.findLayerForImport("@cream/domain")?.name).toBe("domain");
		expect(validator.findLayerForImport("@cream/storage")?.name).toBe("infrastructure");
		expect(validator.findLayerForImport("@cream/agents")?.name).toBe("application");
	});

	it("should handle package subpaths", () => {
		const validator = new LayerValidator();

		expect(validator.findLayerForImport("@cream/domain/types")?.name).toBe("domain");
	});

	it("should return null for relative imports", () => {
		const validator = new LayerValidator();

		expect(validator.findLayerForImport("./types")).toBeNull();
		expect(validator.findLayerForImport("../utils")).toBeNull();
	});
});

describe("LayerValidator findLayerForImport external packages", () => {
	it("should return null for external packages", () => {
		const validator = new LayerValidator();

		expect(validator.findLayerForImport("lodash")).toBeNull();
		expect(validator.findLayerForImport("react")).toBeNull();
	});
});

describe("LayerValidator isViolation", () => {
	it("should return true for forbidden dependency", () => {
		const validator = new LayerValidator();

		expect(validator.isViolation("domain", "infrastructure")).toBe(true);
		expect(validator.isViolation("application", "presentation")).toBe(true);
	});

	it("should return false for allowed dependency", () => {
		const validator = new LayerValidator();

		expect(validator.isViolation("application", "domain")).toBe(false);
		expect(validator.isViolation("infrastructure", "domain")).toBe(false);
	});

	it("should return false for same layer", () => {
		const validator = new LayerValidator();

		expect(validator.isViolation("domain", "domain")).toBe(false);
		expect(validator.isViolation("infrastructure", "infrastructure")).toBe(false);
	});
});

describe("LayerValidator getDependencyGraph", () => {
	it("should return dependency graph", () => {
		const validator = new LayerValidator();

		const graph = validator.getDependencyGraph();

		expect(graph.get("domain")).toEqual([]);
		expect(graph.get("application")).toEqual(["domain"]);
		expect(graph.get("infrastructure")).toContain("domain");
		expect(graph.get("infrastructure")).toContain("application");
	});
});

describe("LayerValidator getLayer", () => {
	it("should return layer by name", () => {
		const validator = new LayerValidator();

		const domain = validator.getLayer("domain");
		expect(domain?.name).toBe("domain");
		expect(domain?.packages).toContain("@cream/domain");
	});

	it("should return undefined for unknown layer", () => {
		const validator = new LayerValidator();

		expect(validator.getLayer("unknown")).toBeUndefined();
	});
});
