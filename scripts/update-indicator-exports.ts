#!/usr/bin/env bun
/**
 * Update Indicator Exports
 *
 * Updates the category index.ts file to export a newly promoted indicator.
 * Used by the indicator-promotion workflow after moving files.
 *
 * Usage: bun run scripts/update-indicator-exports.ts <indicator_name> <category>
 *
 * Example:
 *   bun run scripts/update-indicator-exports.ts adaptiveMomentum momentum
 *
 * This will add an export statement to packages/indicators/src/momentum/index.ts
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md
 */

import { readFile, writeFile, exists } from "node:fs/promises";
import { join } from "node:path";
import { createNodeLogger, type LifecycleLogger } from "@cream/logger";

const log: LifecycleLogger = createNodeLogger({
  service: "update-indicator-exports",
  level: "info",
  environment: Bun.env.CREAM_ENV ?? "PAPER",
  pretty: true,
});

// ============================================
// Types
// ============================================

type Category = "momentum" | "trend" | "volatility" | "volume" | "custom";

const VALID_CATEGORIES: Category[] = ["momentum", "trend", "volatility", "volume", "custom"];

// ============================================
// Path Resolution
// ============================================

function getIndicatorsPath(): string {
  // Support running from project root or scripts directory
  const cwd = process.cwd();
  if (cwd.endsWith("/scripts")) {
    return join(cwd, "..", "packages", "indicators", "src");
  }
  return join(cwd, "packages", "indicators", "src");
}

function getCategoryIndexPath(category: Category): string {
  return join(getIndicatorsPath(), category, "index.ts");
}

function getIndicatorPath(name: string, category: Category): string {
  return join(getIndicatorsPath(), category, `${name}.ts`);
}

// ============================================
// Export Generation
// ============================================

/**
 * Parse an indicator file to find exported symbols.
 * Looks for: export function, export const, export class, export interface, export type
 */
async function findExportedSymbols(filePath: string): Promise<string[]> {
  const content = await readFile(filePath, "utf-8");
  const symbols: string[] = [];

  // Match export declarations
  const patterns = [
    /export\s+(?:async\s+)?function\s+(\w+)/g, // export function foo
    /export\s+const\s+(\w+)/g, // export const FOO
    /export\s+class\s+(\w+)/g, // export class Foo
    /export\s+interface\s+(\w+)/g, // export interface Foo
    /export\s+type\s+(\w+)/g, // export type Foo
    /export\s+enum\s+(\w+)/g, // export enum Foo
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const symbol = match[1];
      if (symbol && !symbols.includes(symbol)) {
        symbols.push(symbol);
      }
    }
  }

  // Also look for re-exports from the same file
  const reexportPattern = /export\s*\{([^}]+)\}/g;
  let match;
  while ((match = reexportPattern.exec(content)) !== null) {
    const exports = match[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim());
    for (const exp of exports) {
      if (exp && !symbols.includes(exp) && !exp.startsWith("type ")) {
        // Handle "type Foo" syntax
        const cleanExp = exp.replace(/^type\s+/, "");
        if (!symbols.includes(cleanExp)) {
          symbols.push(cleanExp);
        }
      }
    }
  }

  return symbols.sort();
}

/**
 * Generate an export statement for the indicator.
 */
function generateExportStatement(name: string, symbols: string[]): string {
  if (symbols.length === 0) {
    // Fallback to wildcard export
    return `export * from "./${name}";\n`;
  }

  // Group types and values
  const types = symbols.filter(
    (s) => s.startsWith("I") || s.endsWith("Config") || s.endsWith("Options") || s.endsWith("Result")
  );
  const values = symbols.filter((s) => !types.includes(s));

  // Format with named exports
  const exports: string[] = [];
  for (const symbol of values) {
    exports.push(`  ${symbol},`);
  }
  for (const symbol of types) {
    exports.push(`  type ${symbol},`);
  }

  return `export {\n${exports.join("\n")}\n} from "./${name}";\n`;
}

// ============================================
// Index Update
// ============================================

async function updateCategoryIndex(name: string, category: Category): Promise<void> {
  const indexPath = getCategoryIndexPath(category);
  const indicatorPath = getIndicatorPath(name, category);

  // Verify indicator file exists
  if (!(await exists(indicatorPath))) {
    log.error({ indicatorPath }, "Indicator file not found");
    process.exit(1);
  }

  // Read existing index
  let indexContent = "";
  if (await exists(indexPath)) {
    indexContent = await readFile(indexPath, "utf-8");
  } else {
    // Create new index with header
    indexContent = `/**
 * ${category.charAt(0).toUpperCase() + category.slice(1)} Indicators
 */

`;
  }

  // Check if already exported
  if (indexContent.includes(`from "./${name}"`)) {
    log.info({ name, category }, "Indicator already exported from index");
    return;
  }

  // Find exported symbols from the indicator file
  log.info({ indicatorPath }, "Analyzing exports");
  const symbols = await findExportedSymbols(indicatorPath);
  log.info({ count: symbols.length, symbols: symbols.join(", ") }, "Found exports");

  // Generate export statement
  const exportStatement = generateExportStatement(name, symbols);

  // Append to index
  const newContent = indexContent.trimEnd() + "\n\n" + exportStatement;

  await writeFile(indexPath, newContent, "utf-8");
  log.info({ indexPath }, "Updated index file");
}

// ============================================
// Custom Index (remove from custom)
// ============================================

async function removeFromCustomIndex(name: string): Promise<void> {
  const customIndexPath = getCategoryIndexPath("custom");

  if (!(await exists(customIndexPath))) {
    return;
  }

  let content = await readFile(customIndexPath, "utf-8");

  // Remove export line for this indicator
  const patterns = [
    new RegExp(`export\\s*\\{[^}]*\\}\\s*from\\s*['"]\\.\\/${name}['"];?\\n?`, "g"),
    new RegExp(`export\\s*\\*\\s*from\\s*['"]\\.\\/${name}['"];?\\n?`, "g"),
  ];

  for (const pattern of patterns) {
    content = content.replace(pattern, "");
  }

  // Clean up double newlines
  content = content.replace(/\n{3,}/g, "\n\n");

  await writeFile(customIndexPath, content, "utf-8");
  log.info({ name }, "Removed from custom/index.ts");
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    log.error(
      { usage: "bun run scripts/update-indicator-exports.ts <name> <category>", categories: VALID_CATEGORIES },
      "Invalid arguments"
    );
    process.exit(1);
  }

  const [name, categoryArg] = args;
  const category = categoryArg as Category;

  if (!VALID_CATEGORIES.includes(category)) {
    log.error({ category, validCategories: VALID_CATEGORIES }, "Invalid category");
    process.exit(1);
  }

  log.info({ name, category }, "Updating exports for indicator");

  // Update category index
  await updateCategoryIndex(name, category);

  // Remove from custom if moving to another category
  if (category !== "custom") {
    await removeFromCustomIndex(name);
  }

  log.info({}, "Done");
}

main().catch((error) => {
  log.error({ error: error instanceof Error ? error.message : String(error) }, "Error");
  process.exit(1);
});
