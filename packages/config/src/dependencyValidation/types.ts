/**
 * Type definitions for package dependency validation.
 */

/**
 * Package information extracted from package.json.
 */
export interface PackageInfo {
	/** Package name (e.g., "@cream/domain") */
	name: string;

	/** Package path relative to monorepo root */
	path: string;

	/** Direct dependencies (name -> version) */
	dependencies: Record<string, string>;

	/** Dev dependencies (name -> version) */
	devDependencies: Record<string, string>;

	/** All workspace dependencies */
	workspaceDependencies: string[];
}

/**
 * Circular dependency detected.
 */
export interface CircularDependency {
	/** The cycle path (e.g., ["A", "B", "C", "A"]) */
	cycle: string[];

	/** Human-readable description */
	message: string;

	/** Severity */
	severity: "ERROR" | "WARNING";
}

/**
 * Package dependency violation.
 */
export interface DependencyViolation {
	/** Package with the violation */
	package: string;

	/** Type of violation */
	type: "CIRCULAR" | "INVALID_WORKSPACE" | "SELF_REFERENCE" | "MISSING_PACKAGE";

	/** Detailed message */
	message: string;

	/** Related packages */
	relatedPackages: string[];

	/** Severity */
	severity: "ERROR" | "WARNING";
}

/**
 * Dependency graph summary statistics.
 */
export interface DependencyGraphSummary {
	/** Total packages in graph */
	totalPackages: number;

	/** Total edges (dependencies) */
	totalEdges: number;

	/** Maximum depth of dependency tree */
	maxDepth: number;

	/** Packages with most dependents */
	mostDepended: Array<{ name: string; dependentCount: number }>;

	/** Packages with most dependencies */
	mostDependencies: Array<{ name: string; dependencyCount: number }>;

	/** Leaf packages (no dependencies) */
	leafPackages: string[];

	/** Root packages (nothing depends on them) */
	rootPackages: string[];
}

/**
 * Dependency validation result.
 */
export interface DependencyValidationResult {
	/** Whether validation passed (no errors) */
	valid: boolean;

	/** Total packages analyzed */
	packagesAnalyzed: number;

	/** Total dependencies analyzed */
	dependenciesAnalyzed: number;

	/** Circular dependencies found */
	circularDependencies: CircularDependency[];

	/** All violations found */
	violations: DependencyViolation[];

	/** Error count */
	errorCount: number;

	/** Warning count */
	warningCount: number;

	/** Dependency graph summary */
	graphSummary: DependencyGraphSummary;

	/** Timestamp */
	timestamp: string;
}

/**
 * Dependency validator configuration.
 */
export interface DependencyValidationConfig {
	/** Include devDependencies in analysis */
	includeDevDependencies: boolean;

	/** Workspace package prefix (e.g., "@cream/") */
	workspacePrefix: string;

	/** Treat circular dependencies as errors */
	circularAsError: boolean;

	/** Maximum allowed dependency depth */
	maxDepth: number;
}

export const DEFAULT_CONFIG: DependencyValidationConfig = {
	includeDevDependencies: false,
	workspacePrefix: "@cream/",
	circularAsError: true,
	maxDepth: 10,
};
