#!/usr/bin/env bun
/**
 * Version Validation Script
 *
 * Validates all runtime and package versions against requirements from
 * docs/plans/16-tech-stack.md. Run with `bun run validate` or `bun scripts/validate-versions.ts`.
 *
 * Exit codes:
 * - 0: All versions valid
 * - 1: One or more version failures
 * - 2: Runtime not found (Bun or Rust missing)
 */

import { exists } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

import type { VersionConstraint } from "./types.js";
import { colors } from "./colors.js";
import { createLogger } from "./logger.js";
import { checkAllRuntimes, checkTypeScriptPackages, checkRustCrates } from "./validators.js";
import {
  print,
  printSectionHeader,
  printEmptySection,
  printResults,
  printSummary,
  printHelp,
  calculateSummary,
} from "./reporters.js";

const log = createLogger();

const REQUIRED_RUNTIMES = ["Bun", "Rust"];

async function findProjectRoot(): Promise<string> {
  let rootDir = process.cwd();
  while (!(await exists(join(rootDir, "package.json")))) {
    const parent = dirname(rootDir);
    if (parent === rootDir) {
      log.error("Could not find project root (package.json)");
      print(colors.red("Could not find project root (package.json)"));
      process.exit(2);
    }
    rootDir = parent;
  }
  return rootDir;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      fix: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  log.info("Starting version validation");
  print(colors.bold("\n🔍 Validating versions...\n"));

  const rootDir = await findProjectRoot();
  const allResults: VersionConstraint[] = [];

  // Runtime checks
  printSectionHeader("Runtimes");
  const runtimeChecks = await checkAllRuntimes();
  printResults(runtimeChecks);
  allResults.push(...runtimeChecks);

  // TypeScript packages
  print("");
  printSectionHeader("TypeScript Packages");
  const tsResults = await checkTypeScriptPackages(rootDir);
  printResults(tsResults);
  allResults.push(...tsResults);

  // Rust crates
  print("");
  printSectionHeader("Rust Crates");
  const rustResults = await checkRustCrates(rootDir);
  if (rustResults.length === 0) {
    printEmptySection("No Cargo.toml found or no crates to check");
  } else {
    printResults(rustResults);
    allResults.push(...rustResults);
  }

  // Calculate and print summary
  const summary = calculateSummary(allResults);
  printSummary(summary);

  log.info(
    {
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed,
      warnings: summary.warnings,
      missing: summary.missing,
    },
    "Version validation complete"
  );

  // Determine exit code
  const runtimeMissing = runtimeChecks.some(
    (r) => r.status === "missing" && REQUIRED_RUNTIMES.includes(r.name)
  );

  if (runtimeMissing) {
    const missingNames = runtimeChecks.filter((r) => r.status === "missing").map((r) => r.name);
    log.error({ missing: missingNames }, "Required runtime not found");
    print(colors.red("\n❌ Required runtime not found. Install missing runtimes first."));
    process.exit(2);
  }

  if (summary.failed > 0) {
    log.error({ failed: summary.failed }, "Version validation failed");
    print(colors.red("\n❌ Version validation failed. Fix the issues above."));
    process.exit(1);
  }

  if (summary.warnings > 0) {
    log.warn({ warnings: summary.warnings }, "Version validation passed with warnings");
    print(colors.yellow("\n⚠️  Version validation passed with warnings."));
  } else {
    print(colors.green("\n✅ All versions validated successfully!"));
  }

  process.exit(0);
}

main().catch((err) => {
  log.error(
    { error: err instanceof Error ? err.message : String(err) },
    "Fatal error during version validation"
  );
  print(colors.red("Fatal error:") + " " + String(err));
  process.exit(1);
});
