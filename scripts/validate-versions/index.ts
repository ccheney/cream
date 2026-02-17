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

import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { colors } from "./colors.js";
import { createLogger } from "./logger.js";
import {
	calculateSummary,
	print,
	printEmptySection,
	printHelp,
	printResults,
	printSectionHeader,
	printSummary,
} from "./reporters.js";
import type { VersionConstraint } from "./types.js";
import { checkAllRuntimes, checkRustCrates, checkTypeScriptPackages } from "./validators.js";

const log = createLogger();

const REQUIRED_RUNTIMES = ["Bun", "Rust"];

async function findProjectRoot(): Promise<string> {
	let rootDir = process.cwd();
	while (!(await Bun.file(join(rootDir, "package.json")).exists())) {
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
	const { allResults, runtimeChecks } = await collectValidationResults(rootDir);
	const summary = calculateSummary(allResults);
	printSummaryWithLogging(summary);
	decideExitCode(runtimeChecks, summary);
}

async function collectValidationResults(rootDir: string): Promise<{
	runtimeChecks: VersionConstraint[];
	allResults: VersionConstraint[];
}> {
	const allResults: VersionConstraint[] = [];

	printSectionHeader("Runtimes");
	const runtimeChecks = await checkAllRuntimes();
	printResults(runtimeChecks);
	allResults.push(...runtimeChecks);

	print("");
	printSectionHeader("TypeScript Packages");
	const tsResults = await checkTypeScriptPackages(rootDir);
	printResults(tsResults);
	allResults.push(...tsResults);

	print("");
	printSectionHeader("Rust Crates");
	const rustResults = await checkRustCrates(rootDir);
	if (rustResults.length === 0) {
		printEmptySection("No Cargo.toml found or no crates to check");
	} else {
		printResults(rustResults);
		allResults.push(...rustResults);
	}

	return { runtimeChecks, allResults };
}

function printSummaryWithLogging(summary: ReturnType<typeof calculateSummary>) {
	log.info(
		{
			total: summary.total,
			passed: summary.passed,
			failed: summary.failed,
			warnings: summary.warnings,
			missing: summary.missing,
		},
		"Version validation complete",
	);

	printSummary(summary);
}

function decideExitCode(
	runtimeChecks: VersionConstraint[],
	summary: { total: number; passed: number; failed: number; warnings: number; missing: number },
) {
	const runtimeMissing = runtimeChecks.some(
		(r) => r.status === "missing" && REQUIRED_RUNTIMES.includes(r.name),
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
		"Fatal error during version validation",
	);
	print(`${colors.red("Fatal error:")} ${String(err)}`);
	process.exit(1);
});
