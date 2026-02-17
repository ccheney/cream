/**
 * Tests for Layer Boundary Validation (utilities + integration)
 */

import { describe, expect, it } from "bun:test";
import {
	type ArchitecturalLayer,
	createLayerConfig,
	createLayerValidator,
	DEFAULT_LAYERS,
	parseImports,
} from "./layerValidation";

describe("parseImports module syntaxes", () => {
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
});

describe("parseImports dynamic and mixed styles", () => {
	it("should parse dynamic imports", () => {
		const source = `
const module = await import('@cream/domain');
import('@cream/storage').then((module) => module.foo());
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

describe("parseImports relative paths", () => {
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
});

describe("createLayerValidator", () => {
	it("should create validator with defaults", () => {
		const validator = createLayerValidator();
		expect(validator.getLayers()).toHaveLength(5);
	});

	it("should create validator with custom config", () => {
		const validator = createLayerValidator({
			warnOnUnknown: false,
		});

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
	it("should define standard layers", () => {
		expect(DEFAULT_LAYERS).toHaveLength(5);

		const layerNames = DEFAULT_LAYERS.map((layer) => layer.name);
		expect(layerNames).toContain("domain");
		expect(layerNames).toContain("application");
		expect(layerNames).toContain("infrastructure");
		expect(layerNames).toContain("config");
		expect(layerNames).toContain("presentation");
	});

	it("should have domain with no allowed dependencies", () => {
		const domain = DEFAULT_LAYERS.find((layer) => layer.name === "domain");
		expect(domain?.allowedDependencies).toHaveLength(0);
	});

	it("should have presentation with all dependencies allowed", () => {
		const presentation = DEFAULT_LAYERS.find((layer) => layer.name === "presentation");
		expect(presentation?.allowedDependencies).toContain("domain");
		expect(presentation?.allowedDependencies).toContain("application");
		expect(presentation?.allowedDependencies).toContain("infrastructure");
	});
});

describe("layer validation integration - valid architecture", () => {
	it("should validate a typical codebase structure", () => {
		const validator = createLayerValidator();

		const result = validator.validateFiles([
			{
				path: "packages/domain/src/types.ts",
				imports: [{ path: "./schemas", line: 1 }],
			},
			{
				path: "packages/agents/src/agents.ts",
				imports: [
					{ path: "@cream/domain", line: 1 },
					{ path: "./types", line: 2 },
				],
			},
			{
				path: "packages/storage/src/client.ts",
				imports: [
					{ path: "@cream/domain", line: 1 },
					{ path: "@cream/agents", line: 2 },
				],
			},
			{
				path: "apps/mastra/src/routes.ts",
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
});

describe("layer validation integration - invalid architecture", () => {
	it("should detect violations in bad architecture", () => {
		const validator = createLayerValidator();

		const result = validator.validateFiles([
			{
				path: "packages/domain/src/entities.ts",
				imports: [{ path: "@cream/storage", line: 5 }],
			},
			{
				path: "packages/agents/src/workflow.ts",
				imports: [{ path: "apps/mastra", line: 10 }],
			},
		]);

		expect(result.valid).toBe(false);
		expect(result.errorCount).toBe(2);
		expect(result.violations[0]?.sourceLayer).toBe("domain");
		expect(result.violations[0]?.targetLayer).toBe("infrastructure");
	});
});
