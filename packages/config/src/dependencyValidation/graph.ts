/**
 * Dependency graph operations and analysis.
 */

import type { DependencyGraphSummary, DependencyValidationConfig, PackageInfo } from "./types.js";

/**
 * Manages the dependency graph for package analysis.
 */
export class DependencyGraph {
  private readonly config: DependencyValidationConfig;
  private readonly packages: Map<string, PackageInfo>;
  private readonly forwardGraph: Map<string, Set<string>> = new Map();
  private readonly reverseGraph: Map<string, Set<string>> = new Map();

  constructor(config: DependencyValidationConfig, packages: Map<string, PackageInfo>) {
    this.config = config;
    this.packages = packages;
  }

  /**
   * Build the dependency graph for a package.
   */
  buildForPackage(info: PackageInfo): void {
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

    info.workspaceDependencies = [...deps];
    this.forwardGraph.set(info.name, deps);

    for (const dep of deps) {
      if (!this.reverseGraph.has(dep)) {
        this.reverseGraph.set(dep, new Set());
      }
      this.reverseGraph.get(dep)?.add(info.name);
    }
  }

  /**
   * Clear all graph data.
   */
  clear(): void {
    this.forwardGraph.clear();
    this.reverseGraph.clear();
  }

  /**
   * Get forward dependencies for a package.
   */
  getDependencies(packageName: string): Set<string> | undefined {
    return this.forwardGraph.get(packageName);
  }

  /**
   * Get reverse dependencies (dependents) for a package.
   */
  getReverseDependencies(packageName: string): Set<string> | undefined {
    return this.reverseGraph.get(packageName);
  }

  /**
   * Check if 'from' can reach 'to' in the graph.
   */
  canReach(from: string, to: string): boolean {
    const visited = new Set<string>();
    const queue = [from];

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        continue;
      }
      if (current === to) {
        return true;
      }
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      const deps = this.forwardGraph.get(current);
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

  /**
   * Find all cycles in the graph.
   */
  findAllCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): void => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = this.forwardGraph.get(node);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            dfs(neighbor);
          } else if (recStack.has(neighbor)) {
            const cycleStart = path.indexOf(neighbor);
            const cycle = [...path.slice(cycleStart), neighbor];
            const normalized = this.normalizeCycle(cycle);
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

  /**
   * Get transitive dependencies for a package.
   */
  getTransitiveDependencies(packageName: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (name: string): void => {
      if (visited.has(name)) {
        return;
      }
      visited.add(name);

      const deps = this.forwardGraph.get(name);
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
   * Get all transitive dependents of a package.
   */
  getTransitiveDependents(packageName: string): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (name: string): void => {
      if (visited.has(name)) {
        return;
      }
      visited.add(name);

      const dependents = this.reverseGraph.get(name);
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
   * Calculate dependency depth for a package.
   */
  getDepth(packageName: string): number {
    const visited = new Set<string>();

    const calculateDepth = (name: string): number => {
      if (visited.has(name)) {
        return 0;
      }
      visited.add(name);

      const deps = this.forwardGraph.get(name);
      if (!deps || deps.size === 0) {
        return 0;
      }

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
   * Get topological sort of packages (dependency order).
   * Returns null if there is a cycle.
   */
  getTopologicalSort(): string[] | null {
    const visited = new Set<string>();
    const temp = new Set<string>();
    const result: string[] = [];
    let hasCycle = false;

    const visit = (name: string): void => {
      if (hasCycle) {
        return;
      }
      if (temp.has(name)) {
        hasCycle = true;
        return;
      }
      if (visited.has(name)) {
        return;
      }

      temp.add(name);
      const deps = this.forwardGraph.get(name);
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
   * Get a copy of the forward dependency graph.
   */
  getGraph(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const [name, deps] of this.forwardGraph) {
      result.set(name, [...deps]);
    }
    return result;
  }

  /**
   * Generate a summary of the dependency graph.
   */
  getSummary(): DependencyGraphSummary {
    let totalEdges = 0;
    for (const deps of this.forwardGraph.values()) {
      totalEdges += deps.size;
    }

    let maxDepth = 0;
    for (const name of this.packages.keys()) {
      const depth = this.getDepth(name);
      maxDepth = Math.max(maxDepth, depth);
    }

    const dependentCounts = new Map<string, number>();
    for (const name of this.packages.keys()) {
      const dependents = this.reverseGraph.get(name);
      dependentCounts.set(name, dependents?.size ?? 0);
    }
    const mostDepended = [...dependentCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, dependentCount: count }));

    const dependencyCounts = new Map<string, number>();
    for (const [name, deps] of this.forwardGraph) {
      dependencyCounts.set(name, deps.size);
    }
    const mostDependencies = [...dependencyCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, dependencyCount: count }));

    const leafPackages: string[] = [];
    for (const [name, deps] of this.forwardGraph) {
      if (deps.size === 0) {
        leafPackages.push(name);
      }
    }

    const rootPackages: string[] = [];
    for (const name of this.packages.keys()) {
      const dependents = this.reverseGraph.get(name);
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

  private normalizeCycle(cycle: string[]): string[] {
    if (cycle.length <= 1) {
      return cycle;
    }

    const withoutLast = cycle.slice(0, -1);

    let minIndex = 0;
    for (let i = 1; i < withoutLast.length; i++) {
      const current = withoutLast[i];
      const minElement = withoutLast[minIndex];
      if (current !== undefined && minElement !== undefined && current < minElement) {
        minIndex = i;
      }
    }

    const minElement = withoutLast[minIndex];
    const rotated = [
      ...withoutLast.slice(minIndex),
      ...withoutLast.slice(0, minIndex),
      ...(minElement !== undefined ? [minElement] : []),
    ];

    return rotated;
  }

  private cyclesEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((val, i) => val === b[i]);
  }
}
