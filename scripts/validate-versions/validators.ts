/**
 * Version validators for runtimes and packages.
 */

import { exists } from "node:fs/promises";
import { join } from "node:path";
import type { VersionConstraint } from "./types.js";
import { compareVersions, normalizeVersion } from "./version.js";

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

async function readJson(path: string): Promise<unknown | null> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    return await file.json();
  } catch {
    return null;
  }
}

// Runtime validators

export async function checkBunVersion(): Promise<VersionConstraint> {
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

export async function checkRustVersion(): Promise<VersionConstraint> {
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

export async function checkPythonVersion(): Promise<VersionConstraint> {
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

export async function checkUvVersion(): Promise<VersionConstraint> {
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

export function checkAllRuntimes(): Promise<VersionConstraint[]> {
  return Promise.all([
    checkBunVersion(),
    checkRustVersion(),
    checkPythonVersion(),
    checkUvVersion(),
  ]);
}

// Package validators

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const TS_PACKAGE_REQUIREMENTS: Record<string, { key: string; required: string }> = {
  "TypeScript (tsgo)": { key: "@typescript/native-preview", required: ">= 7.0.0" },
  Zod: { key: "zod", required: ">= 4.3.4" },
  Biome: { key: "@biomejs/biome", required: ">= 2.0.0" },
  Turbo: { key: "turbo", required: ">= 2.7.0" },
};

export async function checkTypeScriptPackages(rootDir: string): Promise<VersionConstraint[]> {
  const results: VersionConstraint[] = [];
  const pkgPath = join(rootDir, "package.json");
  const pkg = (await readJson(pkgPath)) as PackageJson | null;

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

  for (const [name, { key, required }] of Object.entries(TS_PACKAGE_REQUIREMENTS)) {
    const depVersion = deps[key];
    if (depVersion) {
      const version = depVersion.replace(/[\^~>=<]/g, "");
      results.push({
        name,
        required,
        found: version,
        status: compareVersions(version, required),
      });
    }
  }

  return results;
}

const RUST_CRATE_REQUIREMENTS: Record<string, string> = {
  tokio: ">= 1.43.0",
  tonic: ">= 0.14.0",
  prost: ">= 0.14.0",
  rayon: ">= 1.10.0",
  serde: ">= 1.0.0",
  thiserror: ">= 2.0.0",
  tracing: ">= 0.1.0",
};

export async function checkRustCrates(rootDir: string): Promise<VersionConstraint[]> {
  const results: VersionConstraint[] = [];

  const cargoFiles = [
    join(rootDir, "Cargo.toml"),
    join(rootDir, "apps/execution-engine/Cargo.toml"),
  ];

  for (const cargoPath of cargoFiles) {
    if (!(await exists(cargoPath))) continue;

    const content = await Bun.file(cargoPath).text();

    for (const [crate, required] of Object.entries(RUST_CRATE_REQUIREMENTS)) {
      // Parse simple version from Cargo.toml
      // Matches: tokio = "1.49" or tokio = { version = "1.49", ... }
      const simpleMatch = new RegExp(`${crate}\\s*=\\s*"([^"]+)"`).exec(content);
      const tableMatch = new RegExp(`${crate}\\s*=\\s*\\{[^}]*version\\s*=\\s*"([^"]+)"`).exec(
        content
      );

      const found = simpleMatch?.[1] || tableMatch?.[1];

      if (found) {
        const normalized = normalizeVersion(found);
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

const PYTHON_PACKAGE_REQUIREMENTS: Record<string, string> = {
  polars: ">= 1.3.0",
  pyarrow: ">= 15.0.0",
  numpy: ">= 2.0.0",
  pandas: ">= 2.0.0",
};

export async function checkPythonPackages(rootDir: string): Promise<VersionConstraint[]> {
  const results: VersionConstraint[] = [];

  const pyprojectPath = join(rootDir, "packages/research/pyproject.toml");
  if (!(await exists(pyprojectPath))) {
    return results;
  }

  const content = await Bun.file(pyprojectPath).text();

  for (const [pkg, required] of Object.entries(PYTHON_PACKAGE_REQUIREMENTS)) {
    // Match: "polars>=1.3" or "polars>=1.3.0"
    const match = new RegExp(`"${pkg}[><=~^]*([\\d.]+)"`).exec(content);
    const found = match?.[1];

    if (found) {
      const normalized = normalizeVersion(found);
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
