#!/usr/bin/env bun
/**
 * CLI for validating package dependencies in the monorepo.
 *
 * Usage: bun packages/config/src/bin/validate-deps.ts [root-dir]
 *
 * Detects circular dependencies, missing workspace packages, and self-references.
 * Exit code 0 = valid, 1 = violations found.
 */

import { validatePackageDependencies } from "../dependencyValidation";

const rootDir = process.argv[2] ?? ".";

const result = await validatePackageDependencies(rootDir);

// Print summary
console.log(`Packages analyzed: ${result.packagesAnalyzed}`);
console.log(`Dependencies analyzed: ${result.dependenciesAnalyzed}`);

if (result.violations.length > 0) {
  console.log("");
  console.log("Violations:");
  for (const v of result.violations) {
    const icon = v.severity === "ERROR" ? "x" : "!";
    console.log(`  [${icon}] ${v.type}: ${v.message}`);
  }
}

if (result.errorCount > 0) {
  console.log("");
  console.log(`${result.errorCount} error(s), ${result.warningCount} warning(s)`);
  process.exit(1);
}

if (result.warningCount > 0) {
  console.log(`${result.warningCount} warning(s)`);
}

console.log("Dependency validation passed");
