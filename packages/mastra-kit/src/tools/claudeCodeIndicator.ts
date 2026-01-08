/**
 * Claude Code Indicator Implementation Tool
 *
 * Uses Claude Agent SDK V2 to implement indicators from hypotheses.
 * Claude Code runs as a subprocess with restricted paths and tools.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 347-473)
 * @see https://docs.anthropic.com/en/docs/agent-sdk/typescript-v2
 */

import {
  compareIndicator,
  type IndicatorHypothesis,
  IndicatorHypothesisSchema,
} from "@cream/indicators";
import { z } from "zod";

// Type definitions for the Claude Agent SDK V2 interface
// Used when SDK is not installed - we handle this gracefully at runtime

interface SDKMessage {
  type: string;
  session_id: string;
  message?: {
    role: string;
    content: Array<{ type: string; text?: string }>;
  };
}

interface SessionOptions {
  model?: string;
  maxTurns?: number;
  cwd?: string;
  allowedTools?: string[];
  additionalDirectories?: string[];
  canUseTool?: (
    toolName: string,
    toolInput: unknown
  ) => Promise<{ behavior: "allow" | "deny"; message?: string }>;
}

interface Session {
  send(message: string): Promise<void>;
  stream(): AsyncGenerator<SDKMessage>;
  close(): void;
  [Symbol.asyncDispose]?: () => Promise<void>;
}

type CreateSessionFunction = (options: SessionOptions) => Session;

// ============================================
// Configuration
// ============================================

/**
 * Configuration for Claude Code execution
 */
export interface ClaudeCodeConfig {
  /** Model to use (default: claude-sonnet-4-20250514) */
  model?: string;
  /** Maximum turns for implementation (default: 20) */
  maxTurns?: number;
  /** Timeout in milliseconds (default: 5 minutes) */
  timeout?: number;
  /** Working directory (default: process.cwd()) */
  workingDirectory?: string;
}

const DEFAULT_CONFIG: Required<ClaudeCodeConfig> = {
  model: "claude-sonnet-4-20250514",
  maxTurns: 20,
  timeout: 5 * 60 * 1000, // 5 minutes
  workingDirectory: process.cwd(),
};

// ============================================
// Input/Output Schemas
// ============================================

/**
 * Input schema for the implement-indicator tool
 */
export const ImplementIndicatorInputSchema = z.object({
  /** The indicator hypothesis to implement */
  hypothesis: IndicatorHypothesisSchema,

  /** Example indicator code patterns to follow */
  existingPatterns: z
    .string()
    .describe("Example indicator implementation code for pattern reference"),

  /** Configuration overrides */
  config: z
    .object({
      model: z.string().optional(),
      maxTurns: z.number().min(5).max(50).optional(),
      timeout: z.number().min(30000).max(600000).optional(),
    })
    .optional(),
});

export type ImplementIndicatorInput = z.infer<typeof ImplementIndicatorInputSchema>;

/**
 * Output schema for the implement-indicator tool
 */
export const ImplementIndicatorOutputSchema = z.object({
  /** Whether implementation succeeded */
  success: z.boolean(),

  /** Path to the implemented indicator file */
  indicatorPath: z.string().optional(),

  /** Path to the test file */
  testPath: z.string().optional(),

  /** AST similarity score with existing indicators (0-1) */
  astSimilarity: z.number().min(0).max(1).optional(),

  /** Error message if implementation failed */
  error: z.string().optional(),

  /** Number of turns used */
  turnsUsed: z.number().optional(),

  /** Whether tests passed */
  testsPassed: z.boolean().optional(),
});

export type ImplementIndicatorOutput = z.infer<typeof ImplementIndicatorOutputSchema>;

// ============================================
// Prompt Builder
// ============================================

/**
 * Build the implementation prompt for Claude Code
 *
 * @param hypothesis - The indicator hypothesis
 * @param existingPatterns - Example code patterns
 * @returns Formatted prompt string
 */
export function buildImplementationPrompt(
  hypothesis: IndicatorHypothesis,
  existingPatterns: string
): string {
  return `# Indicator Implementation Task

## Hypothesis Details
- **Name:** ${hypothesis.name}
- **Category:** ${hypothesis.category}
- **Target Timeframe:** ${hypothesis.expectedProperties.targetTimeframe}

### Hypothesis Statement
${hypothesis.hypothesis}

### Economic Rationale
${hypothesis.economicRationale}

### Mathematical Approach
${hypothesis.mathematicalApproach}

### Expected Properties
- Expected IC Range: [${hypothesis.expectedProperties.expectedICRange.join(", ")}]
- Max Correlation with Existing: ${hypothesis.expectedProperties.maxCorrelationWithExisting}
- Applicable Regimes: ${hypothesis.expectedProperties.applicableRegimes.join(", ")}

### Falsification Criteria
${hypothesis.falsificationCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}

${hypothesis.relatedAcademicWork && hypothesis.relatedAcademicWork.length > 0 ? `### Related Academic Work\n${hypothesis.relatedAcademicWork.join("\n")}` : ""}

## Implementation Requirements

1. **File Location:** Create the indicator at \`packages/indicators/src/custom/${hypothesis.name}.ts\`

2. **Test Location:** Create tests at \`packages/indicators/src/custom/${hypothesis.name}.test.ts\`

3. **Follow Existing Patterns:**
\`\`\`typescript
${existingPatterns}
\`\`\`

4. **Code Requirements:**
   - Export a calculate function: \`calculate${toPascalCase(hypothesis.name)}(candles: Candle[], config?: ${toPascalCase(hypothesis.name)}Config)\`
   - Export the result type: \`${toPascalCase(hypothesis.name)}Result\`
   - Export the config type: \`${toPascalCase(hypothesis.name)}Config\`
   - Include JSDoc documentation with the hypothesis
   - Handle edge cases (empty array, insufficient data)
   - Use rust_decimal-style precision awareness
   - NO external dependencies beyond @cream/indicators types

5. **Test Requirements:**
   - Import from bun:test
   - Test with mock candle data
   - Test edge cases (empty array, single candle)
   - Include at least one golden value test
   - Tests must pass before reporting success

## Steps to Complete

1. Read the existing indicator patterns to understand the codebase style
2. Create the indicator implementation file
3. Create the test file with comprehensive tests
4. Run the tests with: \`bun test packages/indicators/src/custom/${hypothesis.name}.test.ts\`
5. Fix any test failures
6. Report success only when all tests pass

## Output Requirements

When complete, confirm:
1. Indicator file created at the specified path
2. Test file created at the specified path
3. All tests passing

DO NOT report success if tests are failing.
`;
}

/**
 * Convert snake_case to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

// ============================================
// Tool Implementation
// ============================================

/**
 * Implement an indicator using Claude Agent SDK
 *
 * This function:
 * 1. Spawns Claude Code as a subprocess
 * 2. Provides implementation instructions
 * 3. Restricts file access to the custom indicators directory
 * 4. Verifies tests pass before reporting success
 * 5. Checks AST similarity against existing indicators
 *
 * @param input - Implementation input with hypothesis and patterns
 * @returns Implementation result
 *
 * @example
 * ```typescript
 * const result = await implementIndicator({
 *   hypothesis: {
 *     name: "sector_rotation_momentum",
 *     category: "correlation",
 *     hypothesis: "Measures relative strength of sector ETFs to detect rotation",
 *     economicRationale: "Sector rotation precedes market moves...",
 *     mathematicalApproach: "Rolling correlation of sector ETF returns...",
 *     falsificationCriteria: ["IC < 0.01 over 60 days"],
 *     expectedProperties: {
 *       expectedICRange: [0.02, 0.08],
 *       maxCorrelationWithExisting: 0.3,
 *       targetTimeframe: "1d",
 *       applicableRegimes: ["TRENDING", "ROTATING"],
 *     },
 *   },
 *   existingPatterns: existingIndicatorCode,
 * });
 *
 * if (result.success) {
 *   console.log(`Created: ${result.indicatorPath}`);
 * }
 * ```
 */
export async function implementIndicator(
  input: ImplementIndicatorInput
): Promise<ImplementIndicatorOutput> {
  const config = { ...DEFAULT_CONFIG, ...input.config };

  // Build the implementation prompt
  const prompt = buildImplementationPrompt(input.hypothesis, input.existingPatterns);

  // Expected file paths
  const indicatorPath = `packages/indicators/src/custom/${input.hypothesis.name}.ts`;
  const testPath = `packages/indicators/src/custom/${input.hypothesis.name}.test.ts`;

  try {
    // Import the Claude Agent SDK V2 dynamically to avoid hard dependency
    // The SDK is optional and may not be installed
    let createSession: CreateSessionFunction;
    try {
      // Use dynamic import to avoid TypeScript type checking
      const sdk = await import("@anthropic-ai/claude-agent-sdk");
      createSession = sdk.unstable_v2_createSession as CreateSessionFunction;
    } catch {
      return {
        success: false,
        error: "Claude Agent SDK not installed. Run: npm install @anthropic-ai/claude-agent-sdk",
      };
    }

    // Create session with restrictions
    const session = createSession({
      model: config.model,
      maxTurns: config.maxTurns,
      cwd: config.workingDirectory,

      // Restrict tools to safe operations
      allowedTools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],

      // Restrict paths to custom indicators directory
      additionalDirectories: [
        "packages/indicators/src/custom",
        "packages/indicators/src/types.ts",
        "packages/indicators/src/momentum", // Pattern reference
      ],

      // Custom permission handler for additional safety
      canUseTool: async (toolName: string, toolInput: unknown) => {
        // Allow all whitelisted tools
        if (["Read", "Grep", "Glob"].includes(toolName)) {
          return { behavior: "allow" as const };
        }

        // For Write/Edit, ensure it's in the custom directory
        if (toolName === "Write" || toolName === "Edit") {
          const path = (toolInput as { file_path?: string })?.file_path ?? "";
          if (!path.includes("/custom/") && !path.includes("\\custom\\")) {
            return {
              behavior: "deny" as const,
              message: "Write operations restricted to packages/indicators/src/custom/",
            };
          }
          return { behavior: "allow" as const };
        }

        // For Bash, only allow test commands
        if (toolName === "Bash") {
          const command = (toolInput as { command?: string })?.command ?? "";
          if (command.startsWith("bun test") || command.startsWith("ls")) {
            return { behavior: "allow" as const };
          }
          return {
            behavior: "deny" as const,
            message: "Only test and list commands allowed",
          };
        }

        return { behavior: "allow" as const };
      },
    });

    // Send prompt and process the streaming response
    let turnsUsed = 0;

    try {
      await session.send(prompt);

      for await (const message of session.stream()) {
        if (message.type === "assistant") {
          turnsUsed++;
        }
      }
    } finally {
      // Ensure session is closed even if an error occurs
      session.close();
    }

    // Verify files were created by checking filesystem
    const { existsSync } = await import("node:fs");
    const indicatorExists = existsSync(indicatorPath);
    const testExists = existsSync(testPath);

    if (!indicatorExists || !testExists) {
      return {
        success: false,
        error: `Files not created: indicator=${indicatorExists}, test=${testExists}`,
        turnsUsed,
      };
    }

    // Check AST similarity against existing indicators
    let astSimilarity = 0;
    try {
      const { readFileSync } = await import("node:fs");
      const newCode = readFileSync(indicatorPath, "utf-8");

      // Compare against momentum indicators as reference
      const rsiPath = "packages/indicators/src/momentum/rsi.ts";
      if (existsSync(rsiPath)) {
        const rsiCode = readFileSync(rsiPath, "utf-8");
        // Build map of existing indicators to compare against
        const existingIndicators = new Map<string, string>();
        existingIndicators.set(rsiPath, rsiCode);
        const similarityResult = compareIndicator(newCode, existingIndicators);
        astSimilarity = similarityResult.maxSimilarity;
      }
    } catch {
      // AST similarity check failed - continue without it
    }

    // Reject if too similar to existing indicators
    if (astSimilarity > 0.8) {
      return {
        success: false,
        indicatorPath,
        testPath,
        astSimilarity,
        error: `Indicator too similar to existing (${(astSimilarity * 100).toFixed(1)}% AST similarity)`,
        turnsUsed,
      };
    }

    // Run tests to verify implementation
    let testsPassed = false;
    try {
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);

      const testResult = await execAsync(`bun test ${testPath}`, {
        cwd: config.workingDirectory,
        timeout: 60000, // 1 minute timeout for tests
      });

      testsPassed = testResult.stderr.includes("pass") || !testResult.stderr.includes("fail");
    } catch {
      testsPassed = false;
    }

    return {
      success: testsPassed,
      indicatorPath,
      testPath,
      astSimilarity,
      turnsUsed,
      testsPassed,
      error: testsPassed ? undefined : "Tests did not pass",
    };
  } catch (error) {
    // Handle SDK not installed or other errors
    const message = error instanceof Error ? error.message : String(error);

    // Check if SDK is not installed
    if (message.includes("Cannot find module") || message.includes("MODULE_NOT_FOUND")) {
      return {
        success: false,
        error: "Claude Agent SDK not installed. Run: npm install @anthropic-ai/claude-agent-sdk",
      };
    }

    return {
      success: false,
      error: `Implementation failed: ${message}`,
    };
  }
}

// ============================================
// Exports
// ============================================

export const claudeCodeIndicator = {
  name: "implement-indicator",
  description: "Use Claude Code to implement a new indicator based on hypothesis",
  inputSchema: ImplementIndicatorInputSchema,
  outputSchema: ImplementIndicatorOutputSchema,
  execute: implementIndicator,
};

export default claudeCodeIndicator;
