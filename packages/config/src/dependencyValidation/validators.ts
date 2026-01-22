/**
 * Validation functions for package dependencies.
 */

import type { DependencyGraph } from "./graph.js";
import type {
	CircularDependency,
	DependencyValidationConfig,
	DependencyValidationResult,
	DependencyViolation,
	PackageInfo,
} from "./types.js";

/**
 * Check for self-referencing packages.
 */
export function validateSelfReferences(packages: Map<string, PackageInfo>): DependencyViolation[] {
	const violations: DependencyViolation[] = [];

	for (const [name, info] of packages) {
		if (info.workspaceDependencies.includes(name)) {
			violations.push({
				package: name,
				type: "SELF_REFERENCE",
				message: `Package '${name}' references itself`,
				relatedPackages: [name],
				severity: "ERROR",
			});
		}
	}

	return violations;
}

/**
 * Check for missing workspace packages.
 */
export function validateMissingPackages(
	packages: Map<string, PackageInfo>,
	workspacePrefix: string,
): DependencyViolation[] {
	const violations: DependencyViolation[] = [];

	for (const [name, info] of packages) {
		for (const dep of info.workspaceDependencies) {
			if (!packages.has(dep) && dep.startsWith(workspacePrefix)) {
				violations.push({
					package: name,
					type: "MISSING_PACKAGE",
					message: `Package '${name}' depends on '${dep}' which is not in the workspace`,
					relatedPackages: [dep],
					severity: "WARNING",
				});
			}
		}
	}

	return violations;
}

/**
 * Convert detected cycles to CircularDependency and DependencyViolation objects.
 */
export function validateCircularDependencies(
	cycles: string[][],
	circularAsError: boolean,
): { circularDependencies: CircularDependency[]; violations: DependencyViolation[] } {
	const circularDependencies: CircularDependency[] = [];
	const violations: DependencyViolation[] = [];
	const severity = circularAsError ? "ERROR" : "WARNING";

	for (const cycle of cycles) {
		const firstPackage = cycle[0];
		if (firstPackage === undefined) {
			continue;
		}

		const circular: CircularDependency = {
			cycle,
			message: `Circular dependency: ${cycle.join(" -> ")}`,
			severity,
		};
		circularDependencies.push(circular);

		violations.push({
			package: firstPackage,
			type: "CIRCULAR",
			message: circular.message,
			relatedPackages: cycle.slice(1),
			severity,
		});
	}

	return { circularDependencies, violations };
}

/**
 * Run all validations and return a complete result.
 */
export function runValidation(
	packages: Map<string, PackageInfo>,
	graph: DependencyGraph,
	config: DependencyValidationConfig,
): DependencyValidationResult {
	const violations: DependencyViolation[] = [];

	violations.push(...validateSelfReferences(packages));
	violations.push(...validateMissingPackages(packages, config.workspacePrefix));

	const cycles = graph.findAllCycles();
	const { circularDependencies, violations: circularViolations } = validateCircularDependencies(
		cycles,
		config.circularAsError,
	);
	violations.push(...circularViolations);

	const errorCount = violations.filter((v) => v.severity === "ERROR").length;
	const warningCount = violations.filter((v) => v.severity === "WARNING").length;

	let dependenciesAnalyzed = 0;
	for (const info of packages.values()) {
		dependenciesAnalyzed += info.workspaceDependencies.length;
	}

	return {
		valid: errorCount === 0,
		packagesAnalyzed: packages.size,
		dependenciesAnalyzed,
		circularDependencies,
		violations,
		errorCount,
		warningCount,
		graphSummary: graph.getSummary(),
		timestamp: new Date().toISOString(),
	};
}
