/**
 * Feature Flags Runtime
 *
 * Provides runtime evaluation of feature flags with support for:
 * - Environment-based overrides
 * - Instrument-specific targeting
 * - Percentage-based rollout
 * - Environment variable overrides
 * - Type-safe flag access
 *
 * @example
 * ```ts
 * const flags = createFlagEvaluator(config, "PAPER");
 *
 * if (flags.isEnabled("enable_options_trading")) {
 *   // Options trading enabled
 * }
 *
 * const reviewPct = flags.getPercentage("trade_review_percentage");
 * if (Math.random() * 100 < reviewPct) {
 *   // Escalate for review
 * }
 * ```
 */

import type {
  BuiltInFlagId,
  FeatureFlag,
  FeatureFlagsConfig,
} from "./schemas/flags.js";
import {
  BUILT_IN_FLAGS,
  DEFAULT_FLAGS,
  mergeFlagsWithDefaults,
} from "./schemas/flags.js";

// ============================================
// Types
// ============================================

/**
 * Environment type
 */
export type Environment = "BACKTEST" | "PAPER" | "LIVE";

/**
 * Flag evaluation context
 */
export interface FlagContext {
  /**
   * Current environment
   */
  environment: Environment;

  /**
   * Current instrument (optional, for instrument-specific flags)
   */
  instrument?: string;

  /**
   * User ID for percentage rollout (optional)
   *
   * Used for consistent percentage rollout across requests.
   */
  userId?: string;
}

/**
 * Flag evaluation result with metadata
 */
export interface FlagResult<T> {
  /**
   * Evaluated flag value
   */
  value: T;

  /**
   * Source of the value
   */
  source:
    | "default"
    | "environment_override"
    | "instrument_override"
    | "env_var";

  /**
   * Whether the flag is deprecated
   */
  deprecated: boolean;

  /**
   * Deprecation message if applicable
   */
  deprecationMessage?: string;
}

/**
 * Flag evaluator interface
 */
export interface FlagEvaluator {
  /**
   * Check if a boolean flag is enabled
   */
  isEnabled(flagId: string, instrument?: string): boolean;

  /**
   * Get a percentage flag value (0-100)
   */
  getPercentage(flagId: string, instrument?: string): number;

  /**
   * Get a string flag value
   */
  getString(flagId: string, instrument?: string): string;

  /**
   * Get flag value with full metadata
   */
  evaluate<T extends boolean | number | string>(
    flagId: string,
    instrument?: string
  ): FlagResult<T>;

  /**
   * Check if a percentage flag passes for a given seed
   *
   * Uses consistent hashing for repeatable results.
   */
  checkPercentage(flagId: string, seed: string, instrument?: string): boolean;

  /**
   * Get all flag values as a record
   */
  getAllFlags(): Record<string, boolean | number | string>;

  /**
   * Get the current environment
   */
  getEnvironment(): Environment;
}

// ============================================
// Environment Variable Parsing
// ============================================

/**
 * Get environment variable name for a flag
 */
function getFlagEnvVarName(flagId: string): string {
  return `CREAM_FLAG_${flagId.toUpperCase()}`;
}

/**
 * Parse environment variable value
 */
function parseEnvVarValue(
  value: string,
  type: "boolean" | "percentage" | "string"
): boolean | number | string | undefined {
  switch (type) {
    case "boolean": {
      const lower = value.toLowerCase();
      if (lower === "true" || lower === "1" || lower === "yes") {
        return true;
      }
      if (lower === "false" || lower === "0" || lower === "no") {
        return false;
      }
      return undefined;
    }
    case "percentage": {
      const num = Number(value);
      if (!Number.isNaN(num) && num >= 0 && num <= 100) {
        return num;
      }
      return undefined;
    }
    case "string":
      return value;
  }
}

/**
 * Get flag value from environment variable
 */
function getEnvVarOverride(
  flag: FeatureFlag,
  allowGlobal: boolean
): { value: boolean | number | string; source: "env_var" } | undefined {
  if (!flag.allow_env_override || !allowGlobal) {
    return undefined;
  }

  const envVarName = getFlagEnvVarName(flag.id);
  const envValue = process.env[envVarName];

  if (envValue === undefined) {
    return undefined;
  }

  const parsed = parseEnvVarValue(envValue, flag.type);
  if (parsed === undefined) {
    console.warn(
      `Invalid value for env var ${envVarName}="${envValue}" (expected ${flag.type})`
    );
    return undefined;
  }

  return { value: parsed, source: "env_var" };
}

// ============================================
// Consistent Hashing for Percentage Rollout
// ============================================

/**
 * Simple hash function for consistent percentage rollout
 *
 * Uses FNV-1a hash for fast, well-distributed results.
 */
function hashString(str: string): number {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // FNV prime, unsigned
  }
  return hash;
}

/**
 * Get a percentage (0-100) from a seed string
 */
function getPercentageFromSeed(seed: string): number {
  const hash = hashString(seed);
  return hash % 100;
}

// ============================================
// Flag Evaluator Implementation
// ============================================

/**
 * Create a flag evaluator
 *
 * @param config - Feature flags configuration
 * @param environment - Current environment
 * @returns Flag evaluator instance
 */
export function createFlagEvaluator(
  config: FeatureFlagsConfig | undefined,
  environment: Environment
): FlagEvaluator {
  // Merge user flags with defaults
  const userFlags = config?.flags ?? [];
  const flags = mergeFlagsWithDefaults(userFlags);
  const flagMap = new Map<string, FeatureFlag>();
  for (const flag of flags) {
    flagMap.set(flag.id, flag);
  }

  const allowGlobalEnvOverride = config?.defaults?.allow_env_override ?? true;

  /**
   * Evaluate a flag value
   */
  function evaluateFlag<T extends boolean | number | string>(
    flagId: string,
    instrument?: string
  ): FlagResult<T> {
    const flag = flagMap.get(flagId);

    if (!flag) {
      // Unknown flag - return false for boolean, 0 for percentage, empty for string
      console.warn(`Unknown feature flag: ${flagId}`);
      return {
        value: false as T,
        source: "default",
        deprecated: false,
      };
    }

    // Check for environment variable override first (highest priority)
    const envOverride = getEnvVarOverride(flag, allowGlobalEnvOverride);
    if (envOverride) {
      return {
        value: envOverride.value as T,
        source: "env_var",
        deprecated: flag.deprecated,
        deprecationMessage: flag.deprecation_message,
      };
    }

    // Check for instrument-specific override
    if (instrument && flag.instrument_overrides) {
      for (const override of flag.instrument_overrides) {
        if (override.instruments.includes(instrument)) {
          return {
            value: override.value as T,
            source: "instrument_override",
            deprecated: flag.deprecated,
            deprecationMessage: flag.deprecation_message,
          };
        }
      }
    }

    // Check for environment-specific override
    if (flag.environment_overrides) {
      for (const override of flag.environment_overrides) {
        if (override.environment === environment) {
          return {
            value: override.value as T,
            source: "environment_override",
            deprecated: flag.deprecated,
            deprecationMessage: flag.deprecation_message,
          };
        }
      }
    }

    // Return default value
    return {
      value: flag.default_value as T,
      source: "default",
      deprecated: flag.deprecated,
      deprecationMessage: flag.deprecation_message,
    };
  }

  /**
   * Log deprecation warning if flag is deprecated
   */
  function warnIfDeprecated(result: FlagResult<unknown>, flagId: string): void {
    if (result.deprecated) {
      console.warn(
        `Feature flag "${flagId}" is deprecated: ${result.deprecationMessage ?? "No message provided"}`
      );
    }
  }

  return {
    isEnabled(flagId: string, instrument?: string): boolean {
      const result = evaluateFlag<boolean>(flagId, instrument);
      warnIfDeprecated(result, flagId);
      return Boolean(result.value);
    },

    getPercentage(flagId: string, instrument?: string): number {
      const result = evaluateFlag<number>(flagId, instrument);
      warnIfDeprecated(result, flagId);
      return Number(result.value);
    },

    getString(flagId: string, instrument?: string): string {
      const result = evaluateFlag<string>(flagId, instrument);
      warnIfDeprecated(result, flagId);
      return String(result.value);
    },

    evaluate<T extends boolean | number | string>(
      flagId: string,
      instrument?: string
    ): FlagResult<T> {
      const result = evaluateFlag<T>(flagId, instrument);
      warnIfDeprecated(result, flagId);
      return result;
    },

    checkPercentage(
      flagId: string,
      seed: string,
      instrument?: string
    ): boolean {
      const percentage = this.getPercentage(flagId, instrument);
      if (percentage === 0) return false;
      if (percentage >= 100) return true;

      const seedPercentage = getPercentageFromSeed(seed);
      return seedPercentage < percentage;
    },

    getAllFlags(): Record<string, boolean | number | string> {
      const result: Record<string, boolean | number | string> = {};
      for (const flag of flags) {
        const evaluated = evaluateFlag(flag.id);
        result[flag.id] = evaluated.value;
      }
      return result;
    },

    getEnvironment(): Environment {
      return environment;
    },
  };
}

// ============================================
// Singleton Instance
// ============================================

let globalEvaluator: FlagEvaluator | undefined;

/**
 * Initialize the global flag evaluator
 *
 * Should be called once at application startup.
 */
export function initializeFlags(
  config: FeatureFlagsConfig | undefined,
  environment: Environment
): FlagEvaluator {
  globalEvaluator = createFlagEvaluator(config, environment);
  return globalEvaluator;
}

/**
 * Get the global flag evaluator
 *
 * @throws Error if flags not initialized
 */
export function getFlags(): FlagEvaluator {
  if (!globalEvaluator) {
    throw new Error(
      "Feature flags not initialized. Call initializeFlags() first."
    );
  }
  return globalEvaluator;
}

/**
 * Check if flags are initialized
 */
export function areFlagsInitialized(): boolean {
  return globalEvaluator !== undefined;
}

/**
 * Reset global flags (for testing)
 */
export function resetFlags(): void {
  globalEvaluator = undefined;
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Check if a built-in flag is enabled
 */
export function isBuiltInFlagEnabled(
  flagId: BuiltInFlagId,
  instrument?: string
): boolean {
  return getFlags().isEnabled(flagId, instrument);
}

/**
 * Check if options trading is enabled
 */
export function isOptionsEnabled(instrument?: string): boolean {
  return isBuiltInFlagEnabled(BUILT_IN_FLAGS.ENABLE_OPTIONS_TRADING, instrument);
}

/**
 * Check if live execution is enabled
 */
export function isLiveExecutionEnabled(): boolean {
  return isBuiltInFlagEnabled(BUILT_IN_FLAGS.ENABLE_LIVE_EXECUTION);
}

/**
 * Check if CBR memory is enabled
 */
export function isCBRMemoryEnabled(): boolean {
  return isBuiltInFlagEnabled(BUILT_IN_FLAGS.ENABLE_CBR_MEMORY);
}

/**
 * Check if HITL escalation is enabled
 */
export function isHITLEnabled(): boolean {
  return isBuiltInFlagEnabled(BUILT_IN_FLAGS.ENABLE_HITL_ESCALATION);
}

/**
 * Check if debug logging is enabled
 */
export function isDebugLoggingEnabled(): boolean {
  return isBuiltInFlagEnabled(BUILT_IN_FLAGS.ENABLE_DEBUG_LOGGING);
}

// Re-export types and constants
export { BUILT_IN_FLAGS } from "./schemas/flags.js";
export type { BuiltInFlagId, FeatureFlag, FeatureFlagsConfig } from "./schemas/flags.js";
