/**
 * Golden Dataset Loaders
 *
 * Functions for loading golden dataset inputs, outputs, and metadata.
 *
 * @see docs/plans/14-testing.md lines 328-364
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkStaleness,
  type GoldenAgentType,
  type GoldenCaseMetadata,
  type GoldenDatasetMetadata,
  GoldenDatasetMetadataSchema,
  type StalenessCheckResult,
} from "./schema.js";

// ============================================
// Path Resolution
// ============================================

/**
 * Get the golden datasets root directory
 */
function getGoldenRoot(): string {
  // Navigate from src/golden to golden/
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return join(currentDir, "..", "..", "golden");
}

/**
 * Get the path to an agent's golden directory
 */
function getAgentDir(agent: GoldenAgentType): string {
  return join(getGoldenRoot(), agent);
}

/**
 * Get the path to the metadata file
 */
function getMetadataPath(): string {
  return join(getGoldenRoot(), "metadata.json");
}

// ============================================
// Loaders
// ============================================

/**
 * Load the golden dataset metadata
 */
export function loadGoldenMetadata(): GoldenDatasetMetadata {
  const metadataPath = getMetadataPath();

  if (!existsSync(metadataPath)) {
    throw new Error(`Golden metadata not found: ${metadataPath}`);
  }

  const content = readFileSync(metadataPath, "utf-8");
  const parsed = JSON.parse(content);

  return GoldenDatasetMetadataSchema.parse(parsed);
}

/**
 * Load a golden input file
 *
 * @param agent Agent type (e.g., "trader")
 * @param caseId Case identifier without prefix (e.g., "001")
 * @returns Parsed JSON input
 */
export function loadGoldenInput<T = unknown>(agent: GoldenAgentType, caseId: string): T {
  const agentDir = getAgentDir(agent);
  const prefix = getAgentPrefix(agent);
  const filename = `${prefix}_input_${caseId}.json`;
  const filePath = join(agentDir, filename);

  if (!existsSync(filePath)) {
    throw new Error(`Golden input not found: ${filePath}`);
  }

  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content) as T;
}

/**
 * Load a golden output file
 *
 * @param agent Agent type (e.g., "trader")
 * @param caseId Case identifier without prefix (e.g., "001")
 * @returns Parsed JSON output
 */
export function loadGoldenOutput<T = unknown>(agent: GoldenAgentType, caseId: string): T {
  const agentDir = getAgentDir(agent);
  const prefix = getAgentPrefix(agent);
  const filename = `${prefix}_output_${caseId}.json`;
  const filePath = join(agentDir, filename);

  if (!existsSync(filePath)) {
    throw new Error(`Golden output not found: ${filePath}`);
  }

  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content) as T;
}

/**
 * Load both input and output for a golden case
 *
 * @param agent Agent type (e.g., "trader")
 * @param caseId Case identifier without prefix (e.g., "001")
 * @returns Object with input and output
 */
export function loadGoldenCase<TInput = unknown, TOutput = unknown>(
  agent: GoldenAgentType,
  caseId: string
): { input: TInput; output: TOutput; metadata: GoldenCaseMetadata | undefined } {
  const input = loadGoldenInput<TInput>(agent, caseId);
  const output = loadGoldenOutput<TOutput>(agent, caseId);

  // Try to find metadata for this case
  let metadata: GoldenCaseMetadata | undefined;
  try {
    const allMetadata = loadGoldenMetadata();
    const fullCaseId = `${getAgentPrefix(agent)}_${caseId}`;
    metadata = allMetadata.cases.find((c) => c.id === fullCaseId);
  } catch {
    // Metadata file may not exist yet
  }

  return { input, output, metadata };
}

/**
 * Get all golden cases for an agent
 *
 * @param agent Agent type
 * @returns Array of case IDs (without prefix)
 */
export function getAllGoldenCaseIds(agent: GoldenAgentType): string[] {
  const agentDir = getAgentDir(agent);

  if (!existsSync(agentDir)) {
    return [];
  }

  const prefix = getAgentPrefix(agent);
  const pattern = new RegExp(`^${prefix}_input_(\\d+)\\.json$`);

  // Use Bun's file reading
  const files = Bun.spawnSync(["ls", agentDir]).stdout.toString().trim().split("\n");

  const caseIds: string[] = [];
  for (const file of files) {
    const match = file.match(pattern);
    if (match) {
      caseIds.push(match[1]);
    }
  }

  return caseIds.sort();
}

/**
 * Get all golden cases with their metadata for an agent
 */
export function getAllGoldenCases<TInput = unknown, TOutput = unknown>(
  agent: GoldenAgentType
): Array<{
  caseId: string;
  input: TInput;
  output: TOutput;
  metadata: GoldenCaseMetadata | undefined;
}> {
  const caseIds = getAllGoldenCaseIds(agent);

  return caseIds.map((caseId) => ({
    caseId,
    ...loadGoldenCase<TInput, TOutput>(agent, caseId),
  }));
}

/**
 * Check if golden datasets are stale
 */
export function checkGoldenStaleness(): StalenessCheckResult {
  try {
    const metadata = loadGoldenMetadata();
    return checkStaleness(metadata.last_refreshed);
  } catch (error) {
    return {
      isStale: true,
      isCritical: true,
      ageMonths: Number.POSITIVE_INFINITY,
      message: `Cannot check staleness: ${error}`,
    };
  }
}

// ============================================
// Helpers
// ============================================

/**
 * Get the file prefix for an agent type
 */
function getAgentPrefix(agent: GoldenAgentType): string {
  const prefixes: Record<GoldenAgentType, string> = {
    trader: "trader",
    technical_analyst: "ta",
    news_analyst: "na",
    fundamentals_analyst: "fa",
    bullish_research: "bull",
    bearish_research: "bear",
    risk_manager: "rm",
    critic: "critic",
  };

  return prefixes[agent];
}

/**
 * Check if golden dataset directory exists
 */
export function hasGoldenDataset(agent: GoldenAgentType): boolean {
  const agentDir = getAgentDir(agent);
  return existsSync(agentDir) && getAllGoldenCaseIds(agent).length > 0;
}

/**
 * Get statistics about the golden dataset
 */
export function getGoldenDatasetStats(): {
  totalCases: number;
  byAgent: Record<GoldenAgentType, number>;
  byRegime: Record<string, number>;
  byScenario: Record<string, number>;
  adversarialCount: number;
} {
  try {
    const metadata = loadGoldenMetadata();

    const byAgent: Record<string, number> = {};
    const byRegime: Record<string, number> = {};
    const byScenario: Record<string, number> = {};
    let adversarialCount = 0;

    for (const case_ of metadata.cases) {
      byAgent[case_.agent] = (byAgent[case_.agent] ?? 0) + 1;
      byRegime[case_.regime] = (byRegime[case_.regime] ?? 0) + 1;
      byScenario[case_.scenario] = (byScenario[case_.scenario] ?? 0) + 1;
      if (case_.adversarial) {
        adversarialCount++;
      }
    }

    return {
      totalCases: metadata.cases.length,
      byAgent: byAgent as Record<GoldenAgentType, number>,
      byRegime,
      byScenario,
      adversarialCount,
    };
  } catch {
    return {
      totalCases: 0,
      byAgent: {} as Record<GoldenAgentType, number>,
      byRegime: {},
      byScenario: {},
      adversarialCount: 0,
    };
  }
}
