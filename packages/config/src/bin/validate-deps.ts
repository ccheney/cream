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

if (result.violations.length > 0) {
  for (const v of result.violations) {
    const _icon = v.severity === "ERROR" ? "x" : "!";
  }
}

if (result.errorCount > 0) {
  process.exit(1);
}

if (result.warningCount > 0) {
}
