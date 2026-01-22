/**
 * Layer Boundary Validation
 *
 * Enforces architectural layer boundaries by validating import relationships
 * between packages and modules. Prevents coupling violations like:
 * - UI importing from database layer
 * - Domain depending on infrastructure
 * - Cross-layer imports that bypass abstraction
 *
 * Based on Clean Architecture and Hexagonal Architecture principles.
 */

// ============================================
// Types
// ============================================

/**
 * Architectural layer definition.
 */
export interface ArchitecturalLayer {
	/** Layer name */
	name: string;

	/** Layer description */
	description: string;

	/** Package patterns that belong to this layer */
	packages: string[];

	/** Layers this layer is allowed to import from */
	allowedDependencies: string[];

	/** Layers this layer must NOT import from */
	forbiddenDependencies: string[];
}

/**
 * Layer boundary violation.
 */
export interface LayerViolation {
	/** Source layer */
	sourceLayer: string;

	/** Source package/module */
	sourcePackage: string;

	/** Target layer */
	targetLayer: string;

	/** Target package/module */
	targetPackage: string;

	/** Import statement that caused the violation */
	importStatement: string;

	/** File path where violation occurred */
	filePath: string;

	/** Line number */
	lineNumber?: number;

	/** Severity */
	severity: "ERROR" | "WARNING";

	/** Explanation */
	message: string;
}

/**
 * Validation result.
 */
export interface LayerValidationResult {
	/** Whether validation passed */
	valid: boolean;

	/** Total files checked */
	filesChecked: number;

	/** Total imports analyzed */
	importsAnalyzed: number;

	/** Violations found */
	violations: LayerViolation[];

	/** Warning count */
	warningCount: number;

	/** Error count */
	errorCount: number;

	/** Layers analyzed */
	layers: string[];

	/** Timestamp */
	timestamp: string;
}

/**
 * Layer validation configuration.
 */
export interface LayerValidationConfig {
	/** Architectural layers */
	layers: ArchitecturalLayer[];

	/** File patterns to include */
	includePatterns: string[];

	/** File patterns to exclude */
	excludePatterns: string[];

	/** Treat unknown packages as warnings (not errors) */
	warnOnUnknown: boolean;

	/** Allow circular dependencies within same layer */
	allowIntraLayerCircular: boolean;
}

// ============================================
// Default Clean Architecture Layers
// ============================================

/**
 * Default layers following Clean Architecture principles.
 */
export const DEFAULT_LAYERS: ArchitecturalLayer[] = [
	{
		name: "domain",
		description: "Business logic and entities - no external dependencies",
		packages: ["@cream/domain", "packages/domain"],
		allowedDependencies: [], // Domain is the innermost layer
		forbiddenDependencies: ["infrastructure", "application", "presentation"],
	},
	{
		name: "application",
		description: "Use cases and application logic",
		packages: ["@cream/agents", "packages/agents"],
		allowedDependencies: ["domain"],
		forbiddenDependencies: ["infrastructure", "presentation"],
	},
	{
		name: "infrastructure",
		description: "External services, databases, APIs",
		packages: [
			"@cream/storage",
			"@cream/helix",
			"@cream/marketdata",
			"@cream/broker",
			"packages/storage",
			"packages/helix",
			"packages/marketdata",
			"packages/broker",
		],
		allowedDependencies: ["domain", "application"],
		forbiddenDependencies: ["presentation"],
	},
	{
		name: "config",
		description: "Configuration and cross-cutting concerns",
		packages: ["@cream/config", "packages/config"],
		allowedDependencies: ["domain"], // Config can use domain types
		forbiddenDependencies: [],
	},
	{
		name: "presentation",
		description: "UI and external interfaces",
		packages: ["apps/api", "apps/worker"],
		allowedDependencies: ["domain", "application", "infrastructure", "config"],
		forbiddenDependencies: [],
	},
];

const DEFAULT_CONFIG: LayerValidationConfig = {
	layers: DEFAULT_LAYERS,
	includePatterns: ["**/*.ts", "**/*.tsx"],
	excludePatterns: ["**/*.test.ts", "**/*.spec.ts", "**/node_modules/**"],
	warnOnUnknown: true,
	allowIntraLayerCircular: true,
};

// ============================================
// Layer Validator
// ============================================

/**
 * Validates architectural layer boundaries.
 */
export class LayerValidator {
	private readonly config: LayerValidationConfig;
	private readonly layerMap: Map<string, ArchitecturalLayer>;

	constructor(config: Partial<LayerValidationConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.layerMap = new Map();

		for (const layer of this.config.layers) {
			this.layerMap.set(layer.name, layer);
		}
	}

	/**
	 * Validate a single import statement.
	 */
	validateImport(
		sourceFile: string,
		importPath: string,
		lineNumber?: number,
	): LayerViolation | null {
		const sourceLayer = this.findLayerForFile(sourceFile);
		const targetLayer = this.findLayerForImport(importPath);

		// Can't validate if we don't know the layers
		if (!sourceLayer || !targetLayer) {
			if (!this.config.warnOnUnknown) {
				return null;
			}

			if (!sourceLayer) {
				return {
					sourceLayer: "unknown",
					sourcePackage: sourceFile,
					targetLayer: targetLayer?.name ?? "unknown",
					targetPackage: importPath,
					importStatement: `import from '${importPath}'`,
					filePath: sourceFile,
					lineNumber,
					severity: "WARNING",
					message: `Source file not mapped to any layer: ${sourceFile}`,
				};
			}

			return null;
		}

		// Same layer is allowed (unless circular check is enabled)
		if (sourceLayer.name === targetLayer.name) {
			return null;
		}

		// Check forbidden dependencies
		if (sourceLayer.forbiddenDependencies.includes(targetLayer.name)) {
			return {
				sourceLayer: sourceLayer.name,
				sourcePackage: sourceFile,
				targetLayer: targetLayer.name,
				targetPackage: importPath,
				importStatement: `import from '${importPath}'`,
				filePath: sourceFile,
				lineNumber,
				severity: "ERROR",
				message: `Layer '${sourceLayer.name}' must not import from '${targetLayer.name}' layer`,
			};
		}

		// Check if dependency is allowed
		if (
			sourceLayer.allowedDependencies.length > 0 &&
			!sourceLayer.allowedDependencies.includes(targetLayer.name)
		) {
			return {
				sourceLayer: sourceLayer.name,
				sourcePackage: sourceFile,
				targetLayer: targetLayer.name,
				targetPackage: importPath,
				importStatement: `import from '${importPath}'`,
				filePath: sourceFile,
				lineNumber,
				severity: "ERROR",
				message: `Layer '${sourceLayer.name}' is not allowed to import from '${targetLayer.name}' layer`,
			};
		}

		return null;
	}

	/**
	 * Validate a file's imports.
	 */
	validateFile(
		filePath: string,
		imports: Array<{ path: string; line?: number }>,
	): LayerViolation[] {
		const violations: LayerViolation[] = [];

		for (const imp of imports) {
			const violation = this.validateImport(filePath, imp.path, imp.line);
			if (violation) {
				violations.push(violation);
			}
		}

		return violations;
	}

	/**
	 * Validate multiple files.
	 */
	validateFiles(
		files: Array<{
			path: string;
			imports: Array<{ path: string; line?: number }>;
		}>,
	): LayerValidationResult {
		const violations: LayerViolation[] = [];
		let importsAnalyzed = 0;

		for (const file of files) {
			importsAnalyzed += file.imports.length;
			violations.push(...this.validateFile(file.path, file.imports));
		}

		const errorCount = violations.filter((v) => v.severity === "ERROR").length;
		const warningCount = violations.filter((v) => v.severity === "WARNING").length;

		return {
			valid: errorCount === 0,
			filesChecked: files.length,
			importsAnalyzed,
			violations,
			errorCount,
			warningCount,
			layers: this.config.layers.map((l) => l.name),
			timestamp: new Date().toISOString(),
		};
	}

	/**
	 * Get layer for a file path.
	 */
	findLayerForFile(filePath: string): ArchitecturalLayer | null {
		for (const layer of this.config.layers) {
			for (const pkg of layer.packages) {
				if (filePath.includes(pkg)) {
					return layer;
				}
			}
		}
		return null;
	}

	/**
	 * Get layer for an import path.
	 */
	findLayerForImport(importPath: string): ArchitecturalLayer | null {
		// Handle relative imports
		if (importPath.startsWith(".")) {
			return null; // Can't determine layer from relative import alone
		}

		for (const layer of this.config.layers) {
			for (const pkg of layer.packages) {
				if (importPath === pkg || importPath.startsWith(`${pkg}/`)) {
					return layer;
				}
			}
		}
		return null;
	}

	/**
	 * Get the layer dependency graph.
	 */
	getDependencyGraph(): Map<string, string[]> {
		const graph = new Map<string, string[]>();

		for (const layer of this.config.layers) {
			graph.set(layer.name, [...layer.allowedDependencies]);
		}

		return graph;
	}

	/**
	 * Check if import would violate layer boundaries.
	 */
	isViolation(fromLayer: string, toLayer: string): boolean {
		const source = this.layerMap.get(fromLayer);
		if (!source) {
			return false;
		}

		// Same layer is OK
		if (fromLayer === toLayer) {
			return false;
		}

		// Check forbidden
		if (source.forbiddenDependencies.includes(toLayer)) {
			return true;
		}

		// Check allowed (if specified)
		if (source.allowedDependencies.length > 0) {
			return !source.allowedDependencies.includes(toLayer);
		}

		return false;
	}

	/**
	 * Get layer info.
	 */
	getLayer(name: string): ArchitecturalLayer | undefined {
		return this.layerMap.get(name);
	}

	/**
	 * Get all layers.
	 */
	getLayers(): ArchitecturalLayer[] {
		return [...this.config.layers];
	}
}

// ============================================
// Import Parser
// ============================================

/**
 * Parse imports from TypeScript/JavaScript source code.
 */
export function parseImports(source: string): Array<{ path: string; line: number }> {
	const imports: Array<{ path: string; line: number }> = [];
	const lines = source.split("\n");

	// Match import statements
	const importRegex = /(?:import|export)\s+.*?from\s+['"]([^'"]+)['"]/g;
	const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
	const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line === undefined) {
			continue;
		}
		const lineNumber = i + 1;

		// Check import/export from
		importRegex.lastIndex = 0;
		let match = importRegex.exec(line);
		while (match !== null) {
			const path = match[1];
			if (path !== undefined) {
				imports.push({ path, line: lineNumber });
			}
			match = importRegex.exec(line);
		}

		// Check require()
		requireRegex.lastIndex = 0;
		match = requireRegex.exec(line);
		while (match !== null) {
			const path = match[1];
			if (path !== undefined) {
				imports.push({ path, line: lineNumber });
			}
			match = requireRegex.exec(line);
		}

		// Check dynamic import()
		dynamicImportRegex.lastIndex = 0;
		match = dynamicImportRegex.exec(line);
		while (match !== null) {
			const path = match[1];
			if (path !== undefined) {
				imports.push({ path, line: lineNumber });
			}
			match = dynamicImportRegex.exec(line);
		}
	}

	return imports;
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a layer validator with default Clean Architecture config.
 */
export function createLayerValidator(config?: Partial<LayerValidationConfig>): LayerValidator {
	return new LayerValidator(config);
}

/**
 * Create custom layers configuration.
 */
export function createLayerConfig(layers: ArchitecturalLayer[]): LayerValidationConfig {
	return {
		...DEFAULT_CONFIG,
		layers,
	};
}

// ============================================
// Exports
// ============================================

export default {
	LayerValidator,
	parseImports,
	createLayerValidator,
	createLayerConfig,
	DEFAULT_LAYERS,
};
