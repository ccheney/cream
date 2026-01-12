/**
 * Security Scan Utility for Generated Indicators
 *
 * Validates generated indicator code for dangerous patterns before
 * allowing paper trading. Part of the indicator synthesis workflow
 * security guardrails.
 *
 * @see docs/plans/36-dynamic-indicator-synthesis-workflow.md
 */

// ============================================
// Types
// ============================================

/**
 * Result of security scanning an indicator file
 */
export interface SecurityScanResult {
  /** Whether the code is considered safe */
  safe: boolean;
  /** List of security issues found */
  issues: string[];
  /** ISO timestamp when scan was performed */
  scannedAt: string;
  /** File size in bytes */
  fileSize: number;
  /** Number of lines in the file */
  lineCount: number;
}

/**
 * Configuration for security scan
 */
export interface SecurityScanConfig {
  /** Maximum allowed file size in bytes (default: 50KB) */
  maxFileSize?: number;
  /** Maximum allowed line count (default: 1000) */
  maxLineCount?: number;
  /** Additional patterns to block */
  additionalPatterns?: Array<{ pattern: RegExp; message: string }>;
}

// ============================================
// Dangerous Patterns
// ============================================

interface DangerousPattern {
  pattern: RegExp;
  message: string;
}

/**
 * Patterns that are not allowed in generated indicator code
 */
const DANGEROUS_PATTERNS: DangerousPattern[] = [
  // Code execution
  { pattern: /eval\s*\(/, message: "eval() is not allowed" },
  { pattern: /new\s+Function\s*\(/, message: "new Function() is not allowed" },
  { pattern: /import\s*\(/, message: "Dynamic imports are not allowed" },

  // Module system abuse
  { pattern: /require\s*\(/, message: "require() is not allowed - use static imports" },
  { pattern: /__dirname/, message: "__dirname is not allowed" },
  { pattern: /__filename/, message: "__filename is not allowed" },

  // Environment access
  { pattern: /process\.env/, message: "process.env access is not allowed" },
  { pattern: /process\.exit/, message: "process.exit is not allowed" },
  { pattern: /process\.cwd/, message: "process.cwd is not allowed" },

  // Filesystem access
  { pattern: /\bfs\s*\./, message: "fs module access is not allowed" },
  { pattern: /\bfs\/promises/, message: "fs/promises is not allowed" },
  {
    pattern: /readFile|writeFile|unlink|mkdir|rmdir/,
    message: "Filesystem operations are not allowed",
  },

  // Process spawning
  { pattern: /child_process/, message: "child_process is not allowed" },
  { pattern: /\bexec\s*\(/, message: "exec() is not allowed" },
  { pattern: /\bspawn\s*\(/, message: "spawn() is not allowed" },
  { pattern: /\bexecSync\s*\(/, message: "execSync() is not allowed" },

  // Network access
  { pattern: /\bfetch\s*\(/, message: "Network calls (fetch) are not allowed in indicators" },
  { pattern: /XMLHttpRequest/, message: "XMLHttpRequest is not allowed" },
  { pattern: /WebSocket/, message: "WebSocket connections are not allowed" },
  { pattern: /\bhttp\s*\./, message: "http module is not allowed" },
  { pattern: /\bhttps\s*\./, message: "https module is not allowed" },

  // Dangerous globals
  { pattern: /\bglobal\s*\./, message: "global object access is not allowed" },
  { pattern: /\bglobalThis\s*\./, message: "globalThis access is not allowed" },

  // Prototype pollution
  { pattern: /__proto__/, message: "__proto__ access is not allowed" },
  { pattern: /Object\.setPrototypeOf/, message: "Prototype modification is not allowed" },

  // Reflection/meta-programming
  { pattern: /Reflect\./, message: "Reflect API is not allowed" },
  { pattern: /Proxy\s*\(/, message: "Proxy is not allowed" },
];

/**
 * Allowed import sources for indicators
 */
const ALLOWED_IMPORTS = [
  // Internal types
  '"../../types"',
  "'../../types'",
  '"../types"',
  "'../types'",
  '"./types"',
  "'./types'",

  // Standard math/utility
  '"decimal.js"',
  "'decimal.js'",
];

// ============================================
// Main Functions
// ============================================

/**
 * Validate an indicator source file for security issues
 *
 * @param source - Source code to validate
 * @param config - Optional configuration
 * @returns Scan result with issues and metadata
 *
 * @example
 * ```typescript
 * const result = validateIndicatorFile(sourceCode);
 * if (!result.safe) {
 *   console.error("Security issues:", result.issues);
 * }
 * ```
 */
export function validateIndicatorFile(
  source: string,
  config: SecurityScanConfig = {}
): SecurityScanResult {
  const { maxFileSize = 50 * 1024, maxLineCount = 1000, additionalPatterns = [] } = config;

  const issues: string[] = [];
  const fileSize = new TextEncoder().encode(source).length;
  const lineCount = source.split("\n").length;

  // Check file size
  if (fileSize > maxFileSize) {
    issues.push(`File size (${fileSize} bytes) exceeds maximum (${maxFileSize} bytes)`);
  }

  // Check line count
  if (lineCount > maxLineCount) {
    issues.push(`Line count (${lineCount}) exceeds maximum (${maxLineCount})`);
  }

  // Check for dangerous patterns
  const allPatterns = [...DANGEROUS_PATTERNS, ...additionalPatterns];
  for (const { pattern, message } of allPatterns) {
    if (pattern.test(source)) {
      issues.push(message);
    }
  }

  // Check for suspicious imports
  const importMatches = source.matchAll(/import\s+.*?\s+from\s+(['"][^'"]+['"])/g);
  for (const match of importMatches) {
    const importPath = match[1];
    if (importPath) {
      const isAllowed = ALLOWED_IMPORTS.some(
        (allowed) => importPath === allowed || importPath.startsWith('"@cream/')
      );
      if (!isAllowed && !importPath.startsWith('".')) {
        issues.push(`Import from ${importPath} is not allowed - only internal types permitted`);
      }
    }
  }

  return {
    safe: issues.length === 0,
    issues,
    scannedAt: new Date().toISOString(),
    fileSize,
    lineCount,
  };
}

/**
 * Read and validate an indicator file from disk
 *
 * @param filePath - Path to the indicator file
 * @param config - Optional configuration
 * @returns Scan result with issues and metadata
 */
export async function validateIndicatorFileFromPath(
  filePath: string,
  config: SecurityScanConfig = {}
): Promise<SecurityScanResult> {
  const file = Bun.file(filePath);
  const source = await file.text();
  return validateIndicatorFile(source, config);
}

// ============================================
// Exports
// ============================================

export default validateIndicatorFile;
