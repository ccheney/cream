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
 * - 2: Runtime not found (Bun, Rust, Python missing)
 */

import { readdir, exists } from "node:fs/promises";
import { join, dirname } from "node:path";
import { parseArgs } from "node:util";

// ============================================
// Types
// ============================================

interface VersionConstraint {
  name: string;
  required: string;
  found: string | null;
  status: "pass" | "fail" | "warn" | "missing";
  fix?: string;
}

interface VersionConfig {
  runtimes: Record<string, string>;
  typescript: Record<string, string>;
  rust: Record<string, string>;
  python: Record<string, string>;
}

type CheckResult = {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  missing: number;
};

// ============================================
// ANSI Colors
// ============================================

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

// ============================================
// Version Comparison
// ============================================

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

function parseVersion(version: string): ParsedVersion | null {
  // Handle versions like "1.92.0", "3.15.2", "7.0.0-dev.20260104.1"
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) {
    // Try simpler format like "1.92" or "3.15"
    const simple = version.match(/^(\d+)\.(\d+)$/);
    if (simple) {
      return {
        major: parseInt(simple[1]),
        minor: parseInt(simple[2]),
        patch: 0,
        prerelease: null,
      };
    }
    return null;
  }
  return {
    major: parseInt(match[1]),
    minor: parseInt(match[2]),
    patch: parseInt(match[3]),
    prerelease: match[4] || null,
  };
}

function compareVersions(found: string, required: string): "pass" | "fail" | "warn" {
  const constraint = parseConstraint(required);
  const foundVersion = parseVersion(found);

  if (!foundVersion) {
    return "fail";
  }

  for (const { operator, version: reqVersion } of constraint) {
    const req = parseVersion(reqVersion);
    if (!req) continue;

    switch (operator) {
      case ">=": {
        if (foundVersion.major < req.major) return "fail";
        if (foundVersion.major > req.major) return "pass";
        if (foundVersion.minor < req.minor) return "fail";
        if (foundVersion.minor > req.minor) return "pass";
        if (foundVersion.patch < req.patch) return "fail";
        return "pass";
      }
      case "=": {
        if (
          foundVersion.major === req.major &&
          foundVersion.minor === req.minor &&
          foundVersion.patch === req.patch
        ) {
          return "pass";
        }
        return "fail";
      }
      case "~": {
        // ~1.2.3 means >=1.2.3 <1.3.0
        if (foundVersion.major !== req.major) return "fail";
        if (foundVersion.minor !== req.minor) return "fail";
        if (foundVersion.patch < req.patch) return "fail";
        return "pass";
      }
      case "^": {
        // ^1.2.3 means >=1.2.3 <2.0.0
        if (foundVersion.major !== req.major) return "fail";
        if (foundVersion.minor < req.minor) return "fail";
        if (foundVersion.minor === req.minor && foundVersion.patch < req.patch) return "fail";
        return "pass";
      }
    }
  }

  return "pass";
}

function parseConstraint(constraint: string): Array<{ operator: string; version: string }> {
  // Handle "|| " for OR constraints (e.g., "1.43.x || 1.47.x")
  if (constraint.includes("||")) {
    // For OR constraints, we just need to match one - simplified
    const parts = constraint.split("||").map((s) => s.trim());
    return parts.map((p) => parseConstraint(p)[0]).filter(Boolean);
  }

  // Handle ".x" wildcard
  if (constraint.includes(".x")) {
    const base = constraint.replace(".x", ".0");
    return [{ operator: "^", version: base }];
  }

  // Parse operator + version
  const match = constraint.match(/^(>=|<=|>|<|=|~|\^)?\s*(.+)$/);
  if (!match) {
    return [{ operator: ">=", version: constraint }];
  }

  return [{ operator: match[1] || "=", version: match[2] }];
}

// ============================================
// Runtime Version Checks
// ============================================

async function getCommandVersion(cmd: string, args: string[]): Promise<string | null> {
  try {
    const proc = Bun.spawn([cmd, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output.trim();
  } catch {
    return null;
  }
}

async function checkBunVersion(): Promise<VersionConstraint> {
  const output = await getCommandVersion("bun", ["--version"]);
  const found = output;

  return {
    name: "Bun",
    required: ">= 1.3.0",
    found,
    status: found ? compareVersions(found, ">= 1.3.0") : "missing",
    fix: found ? undefined : "curl -fsSL https://bun.sh/install | bash",
  };
}

async function checkRustVersion(): Promise<VersionConstraint> {
  const output = await getCommandVersion("rustc", ["--version"]);
  // Output: "rustc 1.92.0 (d9d5e15f7 2025-01-01)"
  const match = output?.match(/rustc (\d+\.\d+\.\d+)/);
  const found = match ? match[1] : null;

  return {
    name: "Rust",
    required: ">= 1.92.0",
    found,
    status: found ? compareVersions(found, ">= 1.92.0") : "missing",
    fix: found ? undefined : "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh",
  };
}

async function checkPythonVersion(): Promise<VersionConstraint> {
  const output = await getCommandVersion("python3", ["--version"]);
  // Output: "Python 3.15.2"
  const match = output?.match(/Python (\d+\.\d+\.\d+)/);
  const found = match ? match[1] : null;

  return {
    name: "Python",
    required: ">= 3.13.0",
    found,
    status: found ? compareVersions(found, ">= 3.13.0") : "missing",
    fix: found ? undefined : "brew install python@3.15 (or use pyenv)",
  };
}

async function checkUvVersion(): Promise<VersionConstraint> {
  const output = await getCommandVersion("uv", ["--version"]);
  // Output: "uv 0.5.x"
  const match = output?.match(/uv (\d+\.\d+\.\d+)/);
  const found = match ? match[1] : null;

  return {
    name: "uv (Python)",
    required: ">= 0.5.0",
    found,
    status: found ? compareVersions(found, ">= 0.5.0") : "warn",
    fix: "curl -LsSf https://astral.sh/uv/install.sh | sh",
  };
}

// ============================================
// Package Version Checks
// ============================================

async function readJson(path: string): Promise<unknown | null> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    return await file.json();
  } catch {
    return null;
  }
}

async function checkTypeScriptPackages(rootDir: string): Promise<VersionConstraint[]> {
  const results: VersionConstraint[] = [];
  const pkgPath = join(rootDir, "package.json");
  const pkg = (await readJson(pkgPath)) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null;

  if (!pkg) {
    return [
      {
        name: "package.json",
        required: "exists",
        found: null,
        status: "missing",
      },
    ];
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Check TypeScript (tsgo)
  const tsVersion = deps["@typescript/native-preview"];
  if (tsVersion) {
    const version = tsVersion.replace(/[\^~>=<]/g, "");
    results.push({
      name: "TypeScript (tsgo)",
      required: ">= 7.0.0",
      found: version,
      status: compareVersions(version, ">= 7.0.0"),
    });
  }

  // Check Zod
  const zodVersion = deps["zod"];
  if (zodVersion) {
    const version = zodVersion.replace(/[\^~>=<]/g, "");
    results.push({
      name: "Zod",
      required: ">= 4.3.4",
      found: version,
      status: compareVersions(version, ">= 4.3.4"),
    });
  }

  // Check Biome
  const biomeVersion = deps["@biomejs/biome"];
  if (biomeVersion) {
    const version = biomeVersion.replace(/[\^~>=<]/g, "");
    results.push({
      name: "Biome",
      required: ">= 2.0.0",
      found: version,
      status: compareVersions(version, ">= 2.0.0"),
    });
  }

  // Check Turbo
  const turboVersion = deps["turbo"];
  if (turboVersion) {
    const version = turboVersion.replace(/[\^~>=<]/g, "");
    results.push({
      name: "Turbo",
      required: ">= 2.7.0",
      found: version,
      status: compareVersions(version, ">= 2.7.0"),
    });
  }

  return results;
}

async function checkRustCrates(rootDir: string): Promise<VersionConstraint[]> {
  const results: VersionConstraint[] = [];

  // Find Cargo.toml files
  const cargoFiles = [
    join(rootDir, "Cargo.toml"),
    join(rootDir, "apps/execution-engine/Cargo.toml"),
  ];

  const requiredCrates: Record<string, string> = {
    tokio: ">= 1.43.0",
    tonic: ">= 0.14.0",
    prost: ">= 0.14.0",
    arrow: ">= 57.0.0",
    "arrow-flight": ">= 57.0.0",
    rayon: ">= 1.10.0",
    serde: ">= 1.0.0",
    thiserror: ">= 2.0.0",
    tracing: ">= 0.1.0",
  };

  for (const cargoPath of cargoFiles) {
    if (!(await exists(cargoPath))) continue;

    const content = await Bun.file(cargoPath).text();

    for (const [crate, required] of Object.entries(requiredCrates)) {
      // Parse simple version from Cargo.toml
      // Matches: tokio = "1.49" or tokio = { version = "1.49", ... }
      const simpleMatch = new RegExp(`${crate}\\s*=\\s*"([^"]+)"`).exec(content);
      const tableMatch = new RegExp(`${crate}\\s*=\\s*\\{[^}]*version\\s*=\\s*"([^"]+)"`).exec(
        content
      );

      const found = simpleMatch?.[1] || tableMatch?.[1];

      if (found) {
        // Normalize version (handle "1.49" -> "1.49.0")
        const normalized = found.includes(".") && found.split(".").length === 2 ? `${found}.0` : found;
        results.push({
          name: `${crate} (Rust)`,
          required,
          found: normalized,
          status: compareVersions(normalized, required),
          fix: `cargo update ${crate}`,
        });
      }
    }
  }

  return results;
}

async function checkPythonPackages(rootDir: string): Promise<VersionConstraint[]> {
  const results: VersionConstraint[] = [];

  // Check packages/research pyproject.toml
  const pyprojectPath = join(rootDir, "packages/research/pyproject.toml");
  if (!(await exists(pyprojectPath))) {
    return results;
  }

  const content = await Bun.file(pyprojectPath).text();

  const requiredPackages: Record<string, string> = {
    polars: ">= 1.3.0",
    pyarrow: ">= 15.0.0",
    numpy: ">= 2.0.0",
    pandas: ">= 2.0.0",
  };

  for (const [pkg, required] of Object.entries(requiredPackages)) {
    // Match: "polars>=1.3" or "polars>=1.3.0"
    const match = new RegExp(`"${pkg}[><=~^]*([\\d.]+)"`).exec(content);
    const found = match?.[1];

    if (found) {
      // Normalize version
      const normalized = found.split(".").length === 2 ? `${found}.0` : found;
      results.push({
        name: `${pkg} (Python)`,
        required,
        found: normalized,
        status: compareVersions(normalized, required),
        fix: `uv add "${pkg}>=${required.replace(">= ", "")}"`,
      });
    }
  }

  return results;
}

// ============================================
// Output Formatting
// ============================================

function formatResult(result: VersionConstraint): string {
  const icon =
    result.status === "pass"
      ? colors.green("✓")
      : result.status === "warn"
        ? colors.yellow("⚠")
        : colors.red("✗");

  const name = colors.bold(result.name.padEnd(25));
  const found = result.found ? colors.cyan(result.found) : colors.red("not found");
  const required = colors.dim(`(required: ${result.required})`);

  let line = `${icon} ${name} ${found} ${required}`;

  if (result.status === "fail" && result.fix) {
    line += `\n   ${colors.dim("Fix:")} ${result.fix}`;
  }

  return line;
}

function printSummary(results: CheckResult): void {
  console.log("\n" + colors.bold("━".repeat(60)));
  console.log(colors.bold("Summary"));
  console.log(colors.bold("━".repeat(60)));

  const total = `Total checks: ${results.total}`;
  const passed = colors.green(`✓ Passed: ${results.passed}`);
  const failed = results.failed > 0 ? colors.red(`✗ Failed: ${results.failed}`) : `✗ Failed: 0`;
  const warnings =
    results.warnings > 0 ? colors.yellow(`⚠ Warnings: ${results.warnings}`) : `⚠ Warnings: 0`;
  const missing =
    results.missing > 0 ? colors.red(`? Missing: ${results.missing}`) : `? Missing: 0`;

  console.log(`${total} | ${passed} | ${failed} | ${warnings} | ${missing}`);
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      fix: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(`
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
    process.exit(0);
  }

  console.log(colors.bold("\n🔍 Validating versions...\n"));

  // Find project root (where package.json is)
  let rootDir = process.cwd();
  while (!(await exists(join(rootDir, "package.json")))) {
    const parent = dirname(rootDir);
    if (parent === rootDir) {
      console.error(colors.red("Could not find project root (package.json)"));
      process.exit(2);
    }
    rootDir = parent;
  }

  const allResults: VersionConstraint[] = [];
  const summary: CheckResult = {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0,
    missing: 0,
  };

  // Runtime checks
  console.log(colors.bold("Runtimes"));
  console.log("─".repeat(60));

  const runtimeChecks = await Promise.all([
    checkBunVersion(),
    checkRustVersion(),
    checkPythonVersion(),
    checkUvVersion(),
  ]);

  for (const result of runtimeChecks) {
    console.log(formatResult(result));
    allResults.push(result);
  }

  // TypeScript packages
  console.log("\n" + colors.bold("TypeScript Packages"));
  console.log("─".repeat(60));

  const tsResults = await checkTypeScriptPackages(rootDir);
  for (const result of tsResults) {
    console.log(formatResult(result));
    allResults.push(result);
  }

  // Rust crates
  console.log("\n" + colors.bold("Rust Crates"));
  console.log("─".repeat(60));

  const rustResults = await checkRustCrates(rootDir);
  if (rustResults.length === 0) {
    console.log(colors.dim("  No Cargo.toml found or no crates to check"));
  } else {
    for (const result of rustResults) {
      console.log(formatResult(result));
      allResults.push(result);
    }
  }

  // Python packages
  console.log("\n" + colors.bold("Python Packages"));
  console.log("─".repeat(60));

  const pyResults = await checkPythonPackages(rootDir);
  if (pyResults.length === 0) {
    console.log(colors.dim("  No pyproject.toml found or no packages to check"));
  } else {
    for (const result of pyResults) {
      console.log(formatResult(result));
      allResults.push(result);
    }
  }

  // Calculate summary
  for (const result of allResults) {
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

  printSummary(summary);

  // Determine exit code
  const runtimeMissing = runtimeChecks.some(
    (r) => r.status === "missing" && ["Bun", "Rust", "Python"].includes(r.name)
  );

  if (runtimeMissing) {
    console.log(colors.red("\n❌ Required runtime not found. Install missing runtimes first."));
    process.exit(2);
  }

  if (summary.failed > 0) {
    console.log(colors.red("\n❌ Version validation failed. Fix the issues above."));
    process.exit(1);
  }

  if (summary.warnings > 0) {
    console.log(colors.yellow("\n⚠️  Version validation passed with warnings."));
  } else {
    console.log(colors.green("\n✅ All versions validated successfully!"));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(colors.red("Fatal error:"), err);
  process.exit(1);
});
