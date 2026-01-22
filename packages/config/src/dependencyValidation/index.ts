/**
 * Package Dependency Validation
 *
 * Validates package dependencies in the monorepo, detecting:
 * - Circular dependencies between packages
 * - Invalid workspace references
 * - Dependency graph analysis
 * - Dependency depth and coupling metrics
 */

export { DependencyGraph } from "./graph.js";
export type {
	CircularDependency,
	DependencyGraphSummary,
	DependencyValidationConfig,
	DependencyValidationResult,
	DependencyViolation,
	PackageInfo,
} from "./types.js";
export { DEFAULT_CONFIG } from "./types.js";
export { parsePackageJson, scanPackages } from "./utils.js";
export {
	runValidation,
	validateCircularDependencies,
	validateMissingPackages,
	validateSelfReferences,
} from "./validators.js";

import { DependencyGraph } from "./graph.js";
import type {
	DependencyValidationConfig,
	DependencyValidationResult,
	PackageInfo,
} from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { parsePackageJson, scanPackages } from "./utils.js";
import { runValidation } from "./validators.js";

/**
 * Validates package dependencies and detects circular dependencies.
 */
export class DependencyValidator {
	private readonly config: DependencyValidationConfig;
	private readonly packages: Map<string, PackageInfo> = new Map();
	private readonly graph: DependencyGraph;

	constructor(config: Partial<DependencyValidationConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.graph = new DependencyGraph(this.config, this.packages);
	}

	/**
	 * Add a package to the validator.
	 */
	addPackage(info: PackageInfo): void {
		this.packages.set(info.name, info);
		this.graph.buildForPackage(info);
	}

	/**
	 * Add multiple packages.
	 */
	addPackages(packages: PackageInfo[]): void {
		for (const pkg of packages) {
			this.addPackage(pkg);
		}
	}

	/**
	 * Clear all packages.
	 */
	clear(): void {
		this.packages.clear();
		this.graph.clear();
	}

	/**
	 * Validate all loaded packages.
	 */
	validate(): DependencyValidationResult {
		return runValidation(this.packages, this.graph, this.config);
	}

	/**
	 * Check if adding a dependency would create a cycle.
	 */
	wouldCreateCycle(from: string, to: string): boolean {
		return this.graph.canReach(to, from);
	}

	/**
	 * Get all dependencies for a package (transitive).
	 */
	getTransitiveDependencies(packageName: string): string[] {
		return this.graph.getTransitiveDependencies(packageName);
	}

	/**
	 * Get all dependents of a package (packages that depend on it).
	 */
	getDependents(packageName: string): string[] {
		return this.graph.getTransitiveDependents(packageName);
	}

	/**
	 * Get the dependency depth for a package.
	 */
	getDepth(packageName: string): number {
		return this.graph.getDepth(packageName);
	}

	/**
	 * Get the dependency graph.
	 */
	getDependencyGraph(): Map<string, string[]> {
		return this.graph.getGraph();
	}

	/**
	 * Get topological sort of packages (dependency order).
	 */
	getTopologicalSort(): string[] | null {
		return this.graph.getTopologicalSort();
	}

	/**
	 * Get all loaded packages.
	 */
	getPackages(): PackageInfo[] {
		return [...this.packages.values()];
	}

	/**
	 * Get a specific package.
	 */
	getPackage(name: string): PackageInfo | undefined {
		return this.packages.get(name);
	}
}

/**
 * Create a dependency validator with default config.
 */
export function createDependencyValidator(
	config?: Partial<DependencyValidationConfig>,
): DependencyValidator {
	return new DependencyValidator(config);
}

/**
 * Validate packages from a directory.
 */
export async function validatePackageDependencies(
	rootDir: string,
	config?: Partial<DependencyValidationConfig>,
): Promise<DependencyValidationResult> {
	const validator = createDependencyValidator(config);
	const packages = await scanPackages(rootDir);
	validator.addPackages(packages);
	return validator.validate();
}

export default {
	DependencyValidator,
	parsePackageJson,
	scanPackages,
	createDependencyValidator,
	validatePackageDependencies,
};
