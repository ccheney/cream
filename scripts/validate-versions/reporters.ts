/**
 * Output formatting and reporting utilities.
 */

import { colors } from "./colors.js";
import type { CheckResult, VersionConstraint } from "./types.js";

export function print(message: string): void {
	process.stdout.write(`${message}\n`);
}

function getStatusIcon(status: VersionConstraint["status"]): string {
	switch (status) {
		case "pass":
			return colors.green("✓");
		case "warn":
			return colors.yellow("⚠");
		case "fail":
		case "missing":
			return colors.red("✗");
	}
}

export function formatResult(result: VersionConstraint): string {
	const icon = getStatusIcon(result.status);
	const name = colors.bold(result.name.padEnd(25));
	const found = result.found ? colors.cyan(result.found) : colors.red("not found");
	const required = colors.dim(`(required: ${result.required})`);

	let line = `${icon} ${name} ${found} ${required}`;

	if (result.status === "fail" && result.fix) {
		line += `\n   ${colors.dim("Fix:")} ${result.fix}`;
	}

	return line;
}

export function printSectionHeader(title: string): void {
	print(colors.bold(title));
	print("─".repeat(60));
}

export function printEmptySection(message: string): void {
	print(colors.dim(`  ${message}`));
}

export function printResults(results: VersionConstraint[]): void {
	for (const result of results) {
		print(formatResult(result));
	}
}

export function printSummary(results: CheckResult): void {
	print(`\n${colors.bold("━".repeat(60))}`);
	print(colors.bold("Summary"));
	print(colors.bold("━".repeat(60)));

	const total = `Total checks: ${results.total}`;
	const passed = colors.green(`✓ Passed: ${results.passed}`);
	const failed = results.failed > 0 ? colors.red(`✗ Failed: ${results.failed}`) : `✗ Failed: 0`;
	const warnings =
		results.warnings > 0 ? colors.yellow(`⚠ Warnings: ${results.warnings}`) : `⚠ Warnings: 0`;
	const missing =
		results.missing > 0 ? colors.red(`? Missing: ${results.missing}`) : `? Missing: 0`;

	print(`${total} | ${passed} | ${failed} | ${warnings} | ${missing}`);
}

export function calculateSummary(results: VersionConstraint[]): CheckResult {
	const summary: CheckResult = {
		total: 0,
		passed: 0,
		failed: 0,
		warnings: 0,
		missing: 0,
	};

	for (const result of results) {
		summary.total++;
		switch (result.status) {
			case "pass":
				summary.passed++;
				break;
			case "fail":
				summary.failed++;
				break;
			case "warn":
				summary.warnings++;
				break;
			case "missing":
				summary.missing++;
				break;
		}
	}

	return summary;
}

export function printHelp(): void {
	print(`
${colors.bold("Version Validation Script")}

Validates all runtime and package versions against requirements.

${colors.bold("Usage:")}
  bun run validate [options]
  bun scripts/validate-versions.ts [options]

${colors.bold("Options:")}
  --fix     Show fix commands for failed checks
  -h, --help  Show this help message

${colors.bold("Exit Codes:")}
  0 - All versions valid
  1 - One or more version failures
  2 - Required runtime not found
`);
}
