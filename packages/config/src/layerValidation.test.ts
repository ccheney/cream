/**
 * Tests for Layer Boundary Validation
 */

import { describe, expect, it } from "bun:test";
import {
	type ArchitecturalLayer,
	createLayerConfig,
	createLayerValidator,
	DEFAULT_LAYERS,
	LayerValidator,
	parseImports,
} from "./layerValidation";

// ============================================
// LayerValidator Tests
// ============================================

describe("LayerValidator", () => {
	describe("constructor", () => {
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

	describe("validateImport", () => {
		it("should allow valid layer dependency", () => {
			const validator = new LayerValidator();

			// Application layer importing from domain layer (allowed)
			const violation = validator.validateImport("packages/agents/src/agents.ts", "@cream/domain");

			expect(violation).toBeNull();
		});

		it("should detect forbidden dependency", () => {
			const validator = new LayerValidator();

			// Domain layer importing from infrastructure (forbidden)
			const violation = validator.validateImport("packages/domain/src/types.ts", "@cream/storage");

			expect(violation).not.toBeNull();
			expect(violation?.severity).toBe("ERROR");
			expect(violation?.sourceLayer).toBe("domain");
			expect(violation?.targetLayer).toBe("infrastructure");
		});

		it("should detect unlisted dependency", () => {
			const validator = new LayerValidator();

			// Application layer importing from presentation (not allowed)
			const violation = validator.validateImport("packages/agents/src/workflow.ts", "apps/api");

			expect(violation).not.toBeNull();
			expect(violation?.severity).toBe("ERROR");
			expect(violation?.message).toContain("must not import from");
		});

		it("should allow same-layer imports", () => {
			const validator = new LayerValidator();

			// Infrastructure importing from infrastructure
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

		it("should not warn on unknown when disabled", () => {
			const validator = new LayerValidator({ warnOnUnknown: false });

			const violation = validator.validateImport("unknown/path/file.ts", "@cream/domain");

			expect(violation).toBeNull();
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

	describe("validateFile", () => {
		it("should validate multiple imports", () => {
			const validator = new LayerValidator();

			const violations = validator.validateFile("packages/domain/src/entities.ts", [
				{ path: "@cream/storage", line: 1 }, // Violation
				{ path: "./types", line: 2 }, // OK (relative)
				{ path: "@cream/helix", line: 3 }, // Violation
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

	describe("validateFiles", () => {
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
			expect(result.valid).toBe(false); // Only errors affect validity
		});
	});

	describe("findLayerForFile", () => {
		it("should find layer by package path", () => {
			const validator = new LayerValidator();

			expect(validator.findLayerForFile("packages/domain/src/types.ts")?.name).toBe("domain");
			expect(validator.findLayerForFile("packages/storage/src/client.ts")?.name).toBe(
				"infrastructure",
			);
			expect(validator.findLayerForFile("apps/api/src/index.ts")?.name).toBe("presentation");
		});

		it("should return null for unknown path", () => {
			const validator = new LayerValidator();

			expect(validator.findLayerForFile("unknown/path.ts")).toBeNull();
		});
	});

	describe("findLayerForImport", () => {
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

		it("should return null for external packages", () => {
			const validator = new LayerValidator();

			expect(validator.findLayerForImport("lodash")).toBeNull();
			expect(validator.findLayerForImport("react")).toBeNull();
		});
	});

	describe("isViolation", () => {
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

	describe("getDependencyGraph", () => {
		it("should return dependency graph", () => {
			const validator = new LayerValidator();

			const graph = validator.getDependencyGraph();

			expect(graph.get("domain")).toEqual([]);
			expect(graph.get("application")).toEqual(["domain"]);
			expect(graph.get("infrastructure")).toContain("domain");
			expect(graph.get("infrastructure")).toContain("application");
		});
	});

	describe("getLayer", () => {
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
});

// ============================================
// parseImports Tests
// ============================================

describe("parseImports", () => {
	it("should parse ES module imports", () => {
		const source = `
import { foo } from '@cream/domain';
import bar from '@cream/storage';
import * as baz from '@cream/helix';
`;

		const imports = parseImports(source);

		expect(imports).toHaveLength(3);
		expect(imports[0]?.path).toBe("@cream/domain");
		expect(imports[1]?.path).toBe("@cream/storage");
		expect(imports[2]?.path).toBe("@cream/helix");
	});

	it("should parse export from statements", () => {
		const source = `
export { foo } from '@cream/domain';
export * from '@cream/storage';
`;

		const imports = parseImports(source);

		expect(imports).toHaveLength(2);
		expect(imports[0]?.path).toBe("@cream/domain");
		expect(imports[1]?.path).toBe("@cream/storage");
	});

	it("should parse require statements", () => {
		const source = `
const foo = require('@cream/domain');
const { bar } = require('@cream/storage');
`;

		const imports = parseImports(source);

		expect(imports).toHaveLength(2);
		expect(imports[0]?.path).toBe("@cream/domain");
		expect(imports[1]?.path).toBe("@cream/storage");
	});

	it("should parse dynamic imports", () => {
		const source = `
const module = await import('@cream/domain');
import('@cream/storage').then(m => m.foo());
`;

		const imports = parseImports(source);

		expect(imports).toHaveLength(2);
		expect(imports[0]?.path).toBe("@cream/domain");
		expect(imports[1]?.path).toBe("@cream/storage");
	});

	it("should include line numbers", () => {
		const source = `import { foo } from '@cream/domain';

import { bar } from '@cream/storage';`;

		const imports = parseImports(source);

		expect(imports[0]?.line).toBe(1);
		expect(imports[1]?.line).toBe(3);
	});

	it("should handle relative imports", () => {
		const source = `
import { foo } from './types';
import { bar } from '../utils';
`;

		const imports = parseImports(source);

		expect(imports).toHaveLength(2);
		expect(imports[0]?.path).toBe("./types");
		expect(imports[1]?.path).toBe("../utils");
	});

	it("should handle mixed import styles", () => {
		const source = `
import { foo } from '@cream/domain';
const bar = require('@cream/storage');
export * from '@cream/helix';
const baz = await import('@cream/config');
`;

		const imports = parseImports(source);

		expect(imports).toHaveLength(4);
	});
});

// ============================================
// Factory Functions Tests
// ============================================

describe("createLayerValidator", () => {
	it("should create validator with defaults", () => {
		const validator = createLayerValidator();
		expect(validator.getLayers()).toHaveLength(5);
	});

	it("should create validator with custom config", () => {
		const validator = createLayerValidator({
			warnOnUnknown: false,
		});

		// Should not warn on unknown
		const violation = validator.validateImport("unknown/file.ts", "@cream/domain");
		expect(violation).toBeNull();
	});
});

describe("createLayerConfig", () => {
	it("should create config with custom layers", () => {
		const layers: ArchitecturalLayer[] = [
			{
				name: "custom",
				description: "Custom layer",
				packages: ["@app/custom"],
				allowedDependencies: [],
				forbiddenDependencies: [],
			},
		];

		const config = createLayerConfig(layers);

		expect(config.layers).toHaveLength(1);
		expect(config.layers[0]?.name).toBe("custom");
	});
});

describe("DEFAULT_LAYERS", () => {
	it("should define standard Clean Architecture layers", () => {
		expect(DEFAULT_LAYERS).toHaveLength(5);

		const layerNames = DEFAULT_LAYERS.map((l) => l.name);
		expect(layerNames).toContain("domain");
		expect(layerNames).toContain("application");
		expect(layerNames).toContain("infrastructure");
		expect(layerNames).toContain("config");
		expect(layerNames).toContain("presentation");
	});

	it("should have domain with no allowed dependencies", () => {
		const domain = DEFAULT_LAYERS.find((l) => l.name === "domain");
		expect(domain?.allowedDependencies).toHaveLength(0);
	});

	it("should have presentation with all dependencies allowed", () => {
		const presentation = DEFAULT_LAYERS.find((l) => l.name === "presentation");
		expect(presentation?.allowedDependencies).toContain("domain");
		expect(presentation?.allowedDependencies).toContain("application");
		expect(presentation?.allowedDependencies).toContain("infrastructure");
	});
});

// ============================================
// Integration Tests
// ============================================

describe("Integration", () => {
	it("should validate a typical codebase structure", () => {
		const validator = createLayerValidator();

		// Simulate validating imports across the codebase
		const result = validator.validateFiles([
			// Domain should have no external deps
			{
				path: "packages/domain/src/types.ts",
				imports: [{ path: "./schemas", line: 1 }],
			},
			// Application depends on domain
			{
				path: "packages/agents/src/agents.ts",
				imports: [
					{ path: "@cream/domain", line: 1 },
					{ path: "./types", line: 2 },
				],
			},
			// Infrastructure depends on domain and application
			{
				path: "packages/storage/src/client.ts",
				imports: [
					{ path: "@cream/domain", line: 1 },
					{ path: "@cream/agents", line: 2 },
				],
			},
			// Presentation can depend on all
			{
				path: "apps/api/src/routes.ts",
				imports: [
					{ path: "@cream/domain", line: 1 },
					{ path: "@cream/agents", line: 2 },
					{ path: "@cream/storage", line: 3 },
				],
			},
		]);

		expect(result.valid).toBe(true);
		expect(result.errorCount).toBe(0);
		expect(result.filesChecked).toBe(4);
	});

	it("should detect violations in bad architecture", () => {
		const validator = createLayerValidator();

		const result = validator.validateFiles([
			// Domain importing from infrastructure - BAD!
			{
				path: "packages/domain/src/entities.ts",
				imports: [{ path: "@cream/storage", line: 5 }],
			},
			// Application importing from presentation - BAD!
			{
				path: "packages/agents/src/workflow.ts",
				imports: [{ path: "apps/api", line: 10 }],
			},
		]);

		expect(result.valid).toBe(false);
		expect(result.errorCount).toBe(2);
		expect(result.violations[0]?.sourceLayer).toBe("domain");
		expect(result.violations[0]?.targetLayer).toBe("infrastructure");
	});
});
