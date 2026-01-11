/**
 * Utility functions for package dependency validation.
 */

import type { PackageInfo } from "./types.js";

/**
 * Parse a package.json file into PackageInfo.
 */
export function parsePackageJson(content: string, path: string): PackageInfo | null {
  try {
    const json = JSON.parse(content) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    if (!json.name) {
      return null;
    }

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
