/**
 * Package Dependency Validation
 *
 * Validates package dependencies in the monorepo, detecting:
 * - Circular dependencies between packages
 * - Invalid workspace references
 * - Dependency graph analysis
 * - Dependency depth and coupling metrics
 */

// ============================================
// Types
// ============================================

/**
 * Package information extracted from package.json.
 */
export interface PackageInfo {
  /** Package name (e.g., "@cream/domain") */
  name: string;

  /** Package path relative to monorepo root */
  path: string;

  /** Direct dependencies (name → version) */
  dependencies: Record<string, string>;

  /** Dev dependencies (name → version) */
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

const DEFAULT_CONFIG: DependencyValidationConfig = {
  includeDevDependencies: false,
  workspacePrefix: "@cream/",
  circularAsError: true,
  maxDepth: 10,
};

// ============================================
// Dependency Validator
// ============================================

/**
 * Validates package dependencies and detects circular dependencies.
 */
export class DependencyValidator {
  private readonly config: DependencyValidationConfig;
  private readonly packages: Map<string, PackageInfo> = new Map();
  private readonly dependencyGraph: Map<string, Set<string>> = new Map();
  private readonly reverseDependencyGraph: Map<string, Set<string>> = new Map();

  constructor(config: Partial<DependencyValidationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add a package to the validator.
   */
  addPackage(info: PackageInfo): void {
    this.packages.set(info.name, info);
    this.buildGraphForPackage(info);
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
    this.dependencyGraph.clear();
    this.reverseDependencyGraph.clear();
  }

  /**
   * Validate all loaded packages.
   */
  validate(): DependencyValidationResult {
    const violations: DependencyViolation[] = [];
    const circularDependencies: CircularDependency[] = [];

    // Check for self-references
    for (const [name, info] of this.packages) {
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

    // Check for missing workspace packages
    for (const [name, info] of this.packages) {
      for (const dep of info.workspaceDependencies) {
        if (!this.packages.has(dep) && dep.startsWith(this.config.workspacePrefix)) {
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

    // Detect circular dependencies
    const cycles = this.findAllCycles();
    for (const cycle of cycles) {
      const circular: CircularDependency = {
        cycle,
        message: `Circular dependency: ${cycle.join(" → ")}`,
        severity: this.config.circularAsError ? "ERROR" : "WARNING",
      };
      circularDependencies.push(circular);

      violations.push({
        package: cycle[0]!,
        type: "CIRCULAR",
        message: circular.message,
        relatedPackages: cycle.slice(1),
        severity: circular.severity,
      });
    }

    const errorCount = violations.filter((v) => v.severity === "ERROR").length;
    const warningCount = violations.filter((v) => v.severity === "WARNING").length;

    // Calculate dependency count
    let dependenciesAnalyzed = 0;
    for (const info of this.packages.values()) {
      dependenciesAnalyzed += info.workspaceDependencies.length;
    }

    return {
      valid: errorCount === 0,
      packagesAnalyzed: this.packages.size,
      dependenciesAnalyzed,
      circularDependencies,
      violations,
      errorCount,
      warningCount,
      graphSummary: this.getGraphSummary(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check if adding a dependency would create a cycle.
   */
  wouldCreateCycle(from: string, to: string): boolean {
    // If 'to' can reach 'from', adding from→to creates a cycle
    return this.canReach(to, from);
  }

  /**
   * Get all dependencies for a package (transitive).
   */
  getTransitiveDependencies(packageName: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (name: string): void => {
      if (visited.has(name)) return;
      visited.add(name);

      const deps = this.dependencyGraph.get(name);
      if (deps) {
        for (const dep of deps) {
          result.push(dep);
          visit(dep);
        }
      }
    };

    visit(packageName);
    return result;
  }

  /**
   * Get all dependents of a package (packages that depend on it).
   */
  getDependents(packageName: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (name: string): void => {
      if (visited.has(name)) return;
      visited.add(name);

      const dependents = this.reverseDependencyGraph.get(name);
      if (dependents) {
        for (const dep of dependents) {
          result.push(dep);
          visit(dep);
        }
      }
    };

    visit(packageName);
    return result;
  }

  /**
   * Get the dependency depth for a package.
   */
  getDepth(packageName: string): number {
    const visited = new Set<string>();

    const calculateDepth = (name: string): number => {
      if (visited.has(name)) return 0;
      visited.add(name);

      const deps = this.dependencyGraph.get(name);
      if (!deps || deps.size === 0) return 0;

      let maxChildDepth = 0;
      for (const dep of deps) {
        const childDepth = calculateDepth(dep);
        maxChildDepth = Math.max(maxChildDepth, childDepth);
      }

      return maxChildDepth + 1;
    };

    return calculateDepth(packageName);
  }

  /**
   * Get the dependency graph.
   */
  getDependencyGraph(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const [name, deps] of this.dependencyGraph) {
      result.set(name, [...deps]);
    }
    return result;
  }

  /**
   * Get topological sort of packages (dependency order).
   */
  getTopologicalSort(): string[] | null {
    const visited = new Set<string>();
    const temp = new Set<string>();
    const result: string[] = [];
    let hasCycle = false;

    const visit = (name: string): void => {
      if (hasCycle) return;
      if (temp.has(name)) {
        hasCycle = true;
        return;
      }
      if (visited.has(name)) return;

      temp.add(name);
      const deps = this.dependencyGraph.get(name);
      if (deps) {
        for (const dep of deps) {
          visit(dep);
        }
      }
      temp.delete(name);
      visited.add(name);
      result.push(name);
    };

    for (const name of this.packages.keys()) {
      if (!visited.has(name)) {
        visit(name);
      }
    }

    return hasCycle ? null : result;
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

  // ============================================
  // Private Methods
  // ============================================

  private buildGraphForPackage(info: PackageInfo): void {
    // Collect workspace dependencies
    const deps = new Set<string>();

    for (const dep of Object.keys(info.dependencies)) {
      if (dep.startsWith(this.config.workspacePrefix)) {
        deps.add(dep);
      }
    }

    if (this.config.includeDevDependencies) {
      for (const dep of Object.keys(info.devDependencies)) {
        if (dep.startsWith(this.config.workspacePrefix)) {
          deps.add(dep);
        }
      }
    }

    // Update package info
    info.workspaceDependencies = [...deps];

    // Update forward graph
    this.dependencyGraph.set(info.name, deps);

    // Update reverse graph
    for (const dep of deps) {
      if (!this.reverseDependencyGraph.has(dep)) {
        this.reverseDependencyGraph.set(dep, new Set());
      }
      this.reverseDependencyGraph.get(dep)!.add(info.name);
    }
  }

  private findAllCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): void => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = this.dependencyGraph.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            dfs(neighbor);
          } else if (recStack.has(neighbor)) {
            // Found a cycle
            const cycleStart = path.indexOf(neighbor);
            const cycle = [...path.slice(cycleStart), neighbor];
            // Normalize cycle to start with smallest element
            const normalized = this.normalizeCycle(cycle);
            // Check if we've already found this cycle
            if (!cycles.some((c) => this.cyclesEqual(c, normalized))) {
              cycles.push(normalized);
            }
          }
        }
      }

      path.pop();
      recStack.delete(node);
    };

    for (const node of this.packages.keys()) {
      if (!visited.has(node)) {
        dfs(node);
      }
    }

    return cycles;
  }

  private normalizeCycle(cycle: string[]): string[] {
    if (cycle.length <= 1) return cycle;

    // Remove the repeated last element
    const withoutLast = cycle.slice(0, -1);

    // Find the minimum element
    let minIndex = 0;
    for (let i = 1; i < withoutLast.length; i++) {
      if (withoutLast[i]! < withoutLast[minIndex]!) {
        minIndex = i;
      }
    }

    // Rotate to start with minimum
    const rotated = [
      ...withoutLast.slice(minIndex),
      ...withoutLast.slice(0, minIndex),
      withoutLast[minIndex]!,
    ];

    return rotated;
  }

  private cyclesEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((val, i) => val === b[i]);
  }

  private canReach(from: string, to: string): boolean {
    const visited = new Set<string>();
    const queue = [from];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === to) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const deps = this.dependencyGraph.get(current);
      if (deps) {
        for (const dep of deps) {
          if (!visited.has(dep)) {
            queue.push(dep);
          }
        }
      }
    }

    return false;
  }

  private getGraphSummary(): DependencyGraphSummary {
    // Calculate total edges
    let totalEdges = 0;
    for (const deps of this.dependencyGraph.values()) {
      totalEdges += deps.size;
    }

    // Calculate max depth
    let maxDepth = 0;
    for (const name of this.packages.keys()) {
      const depth = this.getDepth(name);
      maxDepth = Math.max(maxDepth, depth);
    }

    // Find most depended packages
    const dependentCounts = new Map<string, number>();
    for (const name of this.packages.keys()) {
      const dependents = this.reverseDependencyGraph.get(name);
      dependentCounts.set(name, dependents?.size ?? 0);
    }
    const mostDepended = [...dependentCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, dependentCount: count }));

    // Find packages with most dependencies
    const dependencyCounts = new Map<string, number>();
    for (const [name, deps] of this.dependencyGraph) {
      dependencyCounts.set(name, deps.size);
    }
    const mostDependencies = [...dependencyCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, dependencyCount: count }));

    // Find leaf packages (no dependencies)
    const leafPackages: string[] = [];
    for (const [name, deps] of this.dependencyGraph) {
      if (deps.size === 0) {
        leafPackages.push(name);
      }
    }

    // Find root packages (nothing depends on them)
    const rootPackages: string[] = [];
    for (const name of this.packages.keys()) {
      const dependents = this.reverseDependencyGraph.get(name);
      if (!dependents || dependents.size === 0) {
        rootPackages.push(name);
      }
    }

    return {
      totalPackages: this.packages.size,
      totalEdges,
      maxDepth,
      mostDepended,
      mostDependencies,
      leafPackages: leafPackages.sort(),
      rootPackages: rootPackages.sort(),
    };
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Parse a package.json file into PackageInfo.
 */
export function parsePackageJson(
  content: string,
  path: string
): PackageInfo | null {
  try {
    const json = JSON.parse(content) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    if (!json.name) return null;

    return {
      name: json.name,
      path,
      dependencies: json.dependencies ?? {},
      devDependencies: json.devDependencies ?? {},
      workspaceDependencies: [],
    };
  } catch {
    return null;
  }
}

/**
 * Scan a directory for package.json files.
 */
export async function scanPackages(
  rootDir: string,
  patterns: string[] = ["packages/*/package.json", "apps/*/package.json"]
): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];

  // Use Bun.Glob for file discovery
  for (const pattern of patterns) {
    const glob = new Bun.Glob(pattern);
    for await (const file of glob.scan({ cwd: rootDir })) {
      const fullPath = `${rootDir}/${file}`;
      const content = await Bun.file(fullPath).text();
      const info = parsePackageJson(content, file);
      if (info) {
        packages.push(info);
      }
    }
  }

  return packages;
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a dependency validator with default config.
 */
export function createDependencyValidator(
  config?: Partial<DependencyValidationConfig>
): DependencyValidator {
  return new DependencyValidator(config);
}

/**
 * Validate packages from a directory.
 */
export async function validatePackageDependencies(
  rootDir: string,
  config?: Partial<DependencyValidationConfig>
): Promise<DependencyValidationResult> {
  const validator = createDependencyValidator(config);
  const packages = await scanPackages(rootDir);
  validator.addPackages(packages);
  return validator.validate();
}

// ============================================
// Exports
// ============================================

export default {
  DependencyValidator,
  parsePackageJson,
  scanPackages,
  createDependencyValidator,
  validatePackageDependencies,
};
