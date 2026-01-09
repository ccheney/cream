/**
 * Security Scanner for Generated Indicator Code
 *
 * Scans Claude Code-generated indicator files for potential security vulnerabilities
 * including code injection, system access, and forbidden patterns.
 *
 * All generated indicators MUST pass security scanning before validation.
 *
 * @see docs/plans/19-dynamic-indicator-synthesis.md (lines 1439-1467)
 */

import ts from "typescript";
import { z } from "zod";

const FORBIDDEN_PATTERNS: Array<{
  pattern: RegExp;
  description: string;
  severity: "critical" | "warning";
}> = [
  // Process/system access
  {
    pattern: /import\s+\{[^}]*\}\s+from\s+['"]child_process['"]/,
    description: "child_process import",
    severity: "critical",
  },
  {
    pattern: /import\s+\{[^}]*\}\s+from\s+['"]fs['"]/,
    description: "fs import",
    severity: "critical",
  },
  {
    pattern: /import\s+\{[^}]*\}\s+from\s+['"]fs\/promises['"]/,
    description: "fs/promises import",
    severity: "critical",
  },
  {
    pattern: /require\s*\(\s*['"]child_process['"]/,
    description: "child_process require",
    severity: "critical",
  },
  { pattern: /require\s*\(\s*['"]fs['"]/, description: "fs require", severity: "critical" },
  {
    pattern: /import\s+\*\s+as\s+\w+\s+from\s+['"]fs['"]/,
    description: "fs namespace import",
    severity: "critical",
  },

  // Environment/eval
  { pattern: /process\.env/, description: "process.env access", severity: "critical" },
  { pattern: /\beval\s*\(/, description: "eval() call", severity: "critical" },
  { pattern: /\bFunction\s*\(/, description: "Function constructor", severity: "critical" },
  { pattern: /new\s+Function\s*\(/, description: "new Function constructor", severity: "critical" },

  // Path disclosure
  { pattern: /\b__dirname\b/, description: "__dirname access", severity: "warning" },
  { pattern: /\b__filename\b/, description: "__filename access", severity: "warning" },

  // Network access
  {
    pattern: /import\s+\{[^}]*\}\s+from\s+['"]net['"]/,
    description: "net import",
    severity: "critical",
  },
  {
    pattern: /import\s+\{[^}]*\}\s+from\s+['"]http['"]/,
    description: "http import",
    severity: "critical",
  },
  {
    pattern: /import\s+\{[^}]*\}\s+from\s+['"]https['"]/,
    description: "https import",
    severity: "critical",
  },
  {
    pattern: /import\s+\{[^}]*\}\s+from\s+['"]node:net['"]/,
    description: "node:net import",
    severity: "critical",
  },
  {
    pattern: /import\s+\{[^}]*\}\s+from\s+['"]node:http['"]/,
    description: "node:http import",
    severity: "critical",
  },
  {
    pattern: /import\s+\{[^}]*\}\s+from\s+['"]node:https['"]/,
    description: "node:https import",
    severity: "critical",
  },
  { pattern: /\bfetch\s*\(/, description: "fetch() call", severity: "critical" },
  { pattern: /XMLHttpRequest/, description: "XMLHttpRequest usage", severity: "critical" },

  // Dynamic imports of absolute paths
  {
    pattern: /import\s*\(\s*['"][^./]/,
    description: "dynamic import of non-relative path",
    severity: "critical",
  },

  // Prototype pollution
  {
    pattern: /Object\.prototype\s*\./,
    description: "Object.prototype modification",
    severity: "critical",
  },
  {
    pattern: /Array\.prototype\s*\./,
    description: "Array.prototype modification",
    severity: "critical",
  },
  { pattern: /\.__proto__/, description: "__proto__ access", severity: "critical" },
  { pattern: /\["__proto__"\]/, description: "__proto__ bracket access", severity: "critical" },

  // Constructor access
  { pattern: /\.constructor\s*\[/, description: "dynamic constructor access", severity: "warning" },
  { pattern: /\["constructor"\]/, description: "constructor bracket access", severity: "warning" },

  // Bun/Deno specific runtime APIs (outside tests)
  {
    pattern: /Bun\.(file|write|spawn|serve|shell|sleep)/,
    description: "Bun runtime API",
    severity: "critical",
  },
  {
    pattern: /Deno\.(readFile|writeFile|run|listen)/,
    description: "Deno runtime API",
    severity: "critical",
  },

  // Shell execution
  { pattern: /\$`[^`]*`/, description: "shell template literal", severity: "critical" },
  { pattern: /execSync\s*\(/, description: "execSync call", severity: "critical" },
  { pattern: /spawnSync\s*\(/, description: "spawnSync call", severity: "critical" },
];

const ALLOWED_IMPORT_PREFIXES = ["./", "../", "@cream/"];

const ALLOWED_EXTERNAL_PACKAGES = ["zod", "decimal.js"];

export const SecurityIssueSchema = z.object({
  type: z.enum(["forbidden_pattern", "disallowed_import", "ast_violation", "type_safety"]),
  description: z.string(),
  severity: z.enum(["critical", "warning", "info"]),
  line: z.number().optional(),
  column: z.number().optional(),
  snippet: z.string().optional(),
});

export type SecurityIssue = z.infer<typeof SecurityIssueSchema>;

export const SecurityScanResultSchema = z.object({
  safe: z.boolean(),
  issues: z.array(SecurityIssueSchema),
  severity: z.enum(["critical", "warning", "info"]),
  linesScanned: z.number().int(),
  scanDurationMs: z.number(),
});

export type SecurityScanResult = z.infer<typeof SecurityScanResultSchema>;

export function scanIndicatorCode(source: string, fileName = "indicator.ts"): SecurityScanResult {
  const startTime = performance.now();
  const issues: SecurityIssue[] = [];

  issues.push(...checkForbiddenPatterns(source));
  issues.push(...checkImports(source, fileName));
  issues.push(...performASTAnalysis(source, fileName));
  issues.push(...checkTypeSafety(source, fileName));

  let severity: "critical" | "warning" | "info" = "info";
  for (const issue of issues) {
    if (issue.severity === "critical") {
      severity = "critical";
      break;
    }
    if (issue.severity === "warning") {
      severity = "warning";
      // Don't break - continue checking for critical issues
    }
  }

  return {
    safe: issues.filter((i) => i.severity === "critical").length === 0,
    issues,
    severity,
    linesScanned: source.split("\n").length,
    scanDurationMs: performance.now() - startTime,
  };
}

function checkForbiddenPatterns(source: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const lines = source.split("\n");

  for (const { pattern, description, severity } of FORBIDDEN_PATTERNS) {
    if (pattern.test(source)) {
      let lineNumber: number | undefined;
      let snippet: string | undefined;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line && pattern.test(line)) {
          lineNumber = i + 1;
          snippet = line.trim();
          break;
        }
      }

      issues.push({
        type: "forbidden_pattern",
        description: `Forbidden pattern detected: ${description}`,
        severity,
        line: lineNumber,
        snippet,
      });
    }
  }

  return issues;
}

function checkImports(source: string, fileName: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  try {
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);

    function visit(node: ts.Node): void {
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        if (ts.isStringLiteral(moduleSpecifier)) {
          const importPath = moduleSpecifier.text;

          if (!isAllowedImport(importPath)) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            issues.push({
              type: "disallowed_import",
              description: `Disallowed import: "${importPath}". Only relative paths, @cream/* packages, and whitelisted packages are allowed.`,
              severity: "critical",
              line: line + 1,
              snippet: node.getText(sourceFile),
            });
          }
        }
      }

      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          const importPath = arg.text;
          if (!isAllowedImport(importPath)) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            issues.push({
              type: "disallowed_import",
              description: `Disallowed dynamic import: "${importPath}"`,
              severity: "critical",
              line: line + 1,
              snippet: node.getText(sourceFile),
            });
          }
        } else if (arg && !ts.isStringLiteral(arg)) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: "disallowed_import",
            description: "Dynamic import with non-literal path is forbidden",
            severity: "critical",
            line: line + 1,
            snippet: node.getText(sourceFile),
          });
        }
      }

      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require"
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          const requirePath = arg.text;
          if (!isAllowedImport(requirePath)) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            issues.push({
              type: "disallowed_import",
              description: `Disallowed require: "${requirePath}"`,
              severity: "critical",
              line: line + 1,
              snippet: node.getText(sourceFile),
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  } catch {
    issues.push({
      type: "ast_violation",
      description: "Failed to parse source code for import analysis",
      severity: "warning",
    });
  }

  return issues;
}

function isAllowedImport(importPath: string): boolean {
  for (const prefix of ALLOWED_IMPORT_PREFIXES) {
    if (importPath.startsWith(prefix)) {
      return true;
    }
  }

  for (const pkg of ALLOWED_EXTERNAL_PACKAGES) {
    if (importPath === pkg || importPath.startsWith(`${pkg}/`)) {
      return true;
    }
  }

  return false;
}

function performASTAnalysis(source: string, fileName: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  try {
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);

    function visit(node: ts.Node): void {
      if (ts.isElementAccessExpression(node)) {
        const argument = node.argumentExpression;

        if (ts.isIdentifier(argument)) {
          const argText = argument.text;
          if (
            ["key", "prop", "property", "field", "name", "attr"].includes(argText.toLowerCase())
          ) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            issues.push({
              type: "ast_violation",
              description: `Potentially unsafe dynamic property access: ${node.getText(sourceFile)}`,
              severity: "warning",
              line: line + 1,
              snippet: node.getText(sourceFile),
            });
          }
        }
      }

      if (ts.isPropertyAccessExpression(node)) {
        const propName = node.name.text;
        if (propName === "constructor") {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: "ast_violation",
            description: "Direct constructor access is potentially unsafe",
            severity: "warning",
            line: line + 1,
            snippet: node.getText(sourceFile),
          });
        }
      }

      if (ts.isIdentifier(node) && node.text === "globalThis") {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        issues.push({
          type: "ast_violation",
          description: "globalThis access is forbidden in indicator code",
          severity: "critical",
          line: line + 1,
        });
      }

      if (ts.isIdentifier(node) && node.text === "window") {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        issues.push({
          type: "ast_violation",
          description: "window access is forbidden in indicator code",
          severity: "critical",
          line: line + 1,
        });
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  } catch {
    issues.push({
      type: "ast_violation",
      description: "Failed to parse source code for AST analysis",
      severity: "warning",
    });
  }

  return issues;
}

function checkTypeSafety(source: string, fileName: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  try {
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);

    function visit(node: ts.Node): void {
      if (ts.isTypeReferenceNode(node)) {
        const typeName = node.typeName;
        if (ts.isIdentifier(typeName) && typeName.text === "any") {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: "type_safety",
            description: "Use of 'any' type reduces type safety",
            severity: "warning",
            line: line + 1,
            snippet: node.getText(sourceFile),
          });
        }
      }

      if (node.kind === ts.SyntaxKind.AnyKeyword) {
        const parent = node.parent;
        // Only flag in type positions, not comments
        if (
          parent &&
          (ts.isTypeNode(parent) || ts.isParameter(parent) || ts.isVariableDeclaration(parent))
        ) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: "type_safety",
            description: "Explicit 'any' type annotation reduces type safety",
            severity: "warning",
            line: line + 1,
          });
        }
      }

      if (ts.isAsExpression(node)) {
        const typeNode = node.type;
        if (typeNode.kind === ts.SyntaxKind.AnyKeyword) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          issues.push({
            type: "type_safety",
            description: "Type assertion to 'any' bypasses type checking",
            severity: "warning",
            line: line + 1,
            snippet: node.getText(sourceFile),
          });
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  } catch {
    issues.push({
      type: "type_safety",
      description: "Failed to parse source code for type safety analysis",
      severity: "warning",
    });
  }

  return issues;
}

export function isCodeSafe(source: string): boolean {
  const result = scanIndicatorCode(source);
  return result.safe;
}

export function getCriticalIssues(source: string): SecurityIssue[] {
  const result = scanIndicatorCode(source);
  return result.issues.filter((i) => i.severity === "critical");
}

export function validateIndicatorFile(source: string): {
  safe: boolean;
  issues: string[];
  severity: "critical" | "warning" | "info";
} {
  const result = scanIndicatorCode(source);
  return {
    safe: result.safe,
    issues: result.issues.map((i) => {
      const location = i.line ? ` (line ${i.line})` : "";
      return `[${i.severity.toUpperCase()}] ${i.description}${location}`;
    }),
    severity: result.severity,
  };
}
