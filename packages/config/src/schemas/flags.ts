/**
 * Feature Flags Schema
 *
 * Defines configuration for feature flags supporting gradual rollout,
 * environment-based overrides, and percentage-based targeting.
 *
 * Feature flags enable:
 * - Safe deployment of new features
 * - A/B testing and gradual rollout
 * - Quick feature disable in production
 * - Environment-specific behavior (BACKTEST vs PAPER vs LIVE)
 *
 * @see docs/plans/11-configuration.md for full specification
 */

import { z } from "zod";

// ============================================
// Flag Types
// ============================================

/**
 * Flag variant types
 *
 * - boolean: Simple on/off flag
 * - percentage: Percentage-based rollout (0-100)
 * - string: String variant for A/B testing
 */
export const FlagVariantType = z.enum(["boolean", "percentage", "string"]);
export type FlagVariantType = z.infer<typeof FlagVariantType>;

/**
 * Environment-specific flag override
 */
export const EnvironmentOverrideSchema = z.object({
  /**
   * Target environment
   */
  environment: z.enum(["BACKTEST", "PAPER", "LIVE"]),

  /**
   * Override value for this environment
   */
  value: z.union([z.boolean(), z.number(), z.string()]),
});
export type EnvironmentOverride = z.infer<typeof EnvironmentOverrideSchema>;

/**
 * Instrument-specific flag override
 *
 * Allows enabling/disabling features for specific instruments.
 */
export const InstrumentOverrideSchema = z.object({
  /**
   * Target instrument symbols
   */
  instruments: z.array(z.string().min(1)).min(1, "At least one instrument required"),

  /**
   * Override value for these instruments
   */
  value: z.union([z.boolean(), z.number(), z.string()]),
});
export type InstrumentOverride = z.infer<typeof InstrumentOverrideSchema>;

// ============================================
// Feature Flag Definition
// ============================================

/**
 * Single feature flag definition
 */
export const FeatureFlagSchema = z.object({
  /**
   * Flag identifier (lowercase, snake_case)
   */
  id: z
    .string()
    .min(1)
    .regex(/^[a-z][a-z0-9_]*$/, "Flag ID must be lowercase snake_case"),

  /**
   * Human-readable description
   */
  description: z.string().optional(),

  /**
   * Flag variant type
   */
  type: FlagVariantType,

  /**
   * Default value when no overrides match
   */
  default_value: z.union([z.boolean(), z.number(), z.string()]),

  /**
   * Environment-specific overrides
   *
   * Applied in order; first matching environment wins.
   */
  environment_overrides: z.array(EnvironmentOverrideSchema).optional(),

  /**
   * Instrument-specific overrides
   *
   * Applied after environment overrides; first matching instrument wins.
   */
  instrument_overrides: z.array(InstrumentOverrideSchema).optional(),

  /**
   * Whether this flag can be overridden via environment variable
   *
   * Env var format: CREAM_FLAG_<FLAG_ID_UPPERCASE>=value
   * Example: CREAM_FLAG_ENABLE_OPTIONS_TRADING=true
   *
   * @default true
   */
  allow_env_override: z.boolean().default(true),

  /**
   * Whether this flag is deprecated and should log warnings
   */
  deprecated: z.boolean().default(false),

  /**
   * Deprecation message if flag is deprecated
   */
  deprecation_message: z.string().optional(),
}).superRefine((data, ctx) => {
  // Validate default_value matches type
  if (data.type === "boolean" && typeof data.default_value !== "boolean") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Boolean flag must have boolean default_value",
      path: ["default_value"],
    });
  }
  if (data.type === "percentage") {
    if (typeof data.default_value !== "number") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Percentage flag must have number default_value",
        path: ["default_value"],
      });
    } else if (data.default_value < 0 || data.default_value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Percentage must be between 0 and 100",
        path: ["default_value"],
      });
    }
  }
  if (data.type === "string" && typeof data.default_value !== "string") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "String flag must have string default_value",
      path: ["default_value"],
    });
  }

  // Validate deprecated flags have deprecation message
  if (data.deprecated && !data.deprecation_message) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Deprecated flags must have deprecation_message",
      path: ["deprecation_message"],
    });
  }
});
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

// ============================================
// Feature Flags Configuration
// ============================================

/**
 * Complete feature flags configuration
 */
export const FeatureFlagsConfigSchema = z.object({
  /**
   * Array of feature flag definitions
   */
  flags: z.array(FeatureFlagSchema).default([]),

  /**
   * Global flag defaults
   */
  defaults: z
    .object({
      /**
       * Allow environment variable overrides globally
       *
       * @default true
       */
      allow_env_override: z.boolean().default(true),
    })
    .default({ allow_env_override: true }),
});
export type FeatureFlagsConfig = z.infer<typeof FeatureFlagsConfigSchema>;

// ============================================
// Built-in Flags
// ============================================

/**
 * Well-known feature flag IDs
 *
 * These are the core flags used by the system.
 */
export const BUILT_IN_FLAGS = {
  /** Enable options trading (multi-leg strategies) */
  ENABLE_OPTIONS_TRADING: "enable_options_trading",

  /** Enable live execution (vs paper/backtest only) */
  ENABLE_LIVE_EXECUTION: "enable_live_execution",

  /** Enable experimental agent features */
  ENABLE_EXPERIMENTAL_AGENTS: "enable_experimental_agents",

  /** Enable case-based reasoning memory */
  ENABLE_CBR_MEMORY: "enable_cbr_memory",

  /** Enable HelixDB graph queries */
  ENABLE_GRAPH_QUERIES: "enable_graph_queries",

  /** Enable Arrow Flight data transport */
  ENABLE_ARROW_FLIGHT: "enable_arrow_flight",

  /** Enable real-time market data streaming */
  ENABLE_REALTIME_STREAMING: "enable_realtime_streaming",

  /** Enable human-in-the-loop escalation */
  ENABLE_HITL_ESCALATION: "enable_hitl_escalation",

  /** Percentage of trades to escalate for review */
  TRADE_REVIEW_PERCENTAGE: "trade_review_percentage",

  /** Enable verbose debug logging */
  ENABLE_DEBUG_LOGGING: "enable_debug_logging",
} as const;

export type BuiltInFlagId = (typeof BUILT_IN_FLAGS)[keyof typeof BUILT_IN_FLAGS];

// ============================================
// Default Flag Definitions
// ============================================

/**
 * Default feature flag definitions
 *
 * These are the built-in flags with sensible defaults.
 */
export const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    id: BUILT_IN_FLAGS.ENABLE_OPTIONS_TRADING,
    description: "Enable options trading with multi-leg strategies",
    type: "boolean",
    default_value: false,
    environment_overrides: [
      { environment: "BACKTEST", value: true },
      { environment: "PAPER", value: true },
      { environment: "LIVE", value: false },
    ],
    allow_env_override: true,
    deprecated: false,
  },
  {
    id: BUILT_IN_FLAGS.ENABLE_LIVE_EXECUTION,
    description: "Enable live order execution (vs paper/backtest)",
    type: "boolean",
    default_value: false,
    environment_overrides: [
      { environment: "BACKTEST", value: false },
      { environment: "PAPER", value: false },
      { environment: "LIVE", value: true },
    ],
    allow_env_override: false, // Safety: don't allow env override
    deprecated: false,
  },
  {
    id: BUILT_IN_FLAGS.ENABLE_EXPERIMENTAL_AGENTS,
    description: "Enable experimental agent features (may be unstable)",
    type: "boolean",
    default_value: false,
    allow_env_override: true,
    deprecated: false,
  },
  {
    id: BUILT_IN_FLAGS.ENABLE_CBR_MEMORY,
    description: "Enable case-based reasoning memory retrieval",
    type: "boolean",
    default_value: true,
    allow_env_override: true,
    deprecated: false,
  },
  {
    id: BUILT_IN_FLAGS.ENABLE_GRAPH_QUERIES,
    description: "Enable HelixDB graph relationship queries",
    type: "boolean",
    default_value: true,
    allow_env_override: true,
    deprecated: false,
  },
  {
    id: BUILT_IN_FLAGS.ENABLE_ARROW_FLIGHT,
    description: "Enable Arrow Flight for high-performance data transport",
    type: "boolean",
    default_value: false,
    environment_overrides: [
      { environment: "BACKTEST", value: true },
    ],
    allow_env_override: true,
    deprecated: false,
  },
  {
    id: BUILT_IN_FLAGS.ENABLE_REALTIME_STREAMING,
    description: "Enable real-time market data streaming",
    type: "boolean",
    default_value: false,
    environment_overrides: [
      { environment: "PAPER", value: true },
      { environment: "LIVE", value: true },
    ],
    allow_env_override: true,
    deprecated: false,
  },
  {
    id: BUILT_IN_FLAGS.ENABLE_HITL_ESCALATION,
    description: "Enable human-in-the-loop escalation for high-risk trades",
    type: "boolean",
    default_value: false,
    environment_overrides: [
      { environment: "LIVE", value: true },
    ],
    allow_env_override: true,
    deprecated: false,
  },
  {
    id: BUILT_IN_FLAGS.TRADE_REVIEW_PERCENTAGE,
    description: "Percentage of trades to escalate for human review (0-100)",
    type: "percentage",
    default_value: 0,
    environment_overrides: [
      { environment: "LIVE", value: 10 },
    ],
    allow_env_override: true,
    deprecated: false,
  },
  {
    id: BUILT_IN_FLAGS.ENABLE_DEBUG_LOGGING,
    description: "Enable verbose debug logging",
    type: "boolean",
    default_value: false,
    allow_env_override: true,
    deprecated: false,
  },
];

// ============================================
// Utility Functions
// ============================================

/**
 * Get default feature flags configuration
 */
export function getDefaultFlagsConfig(): FeatureFlagsConfig {
  return {
    flags: DEFAULT_FLAGS,
    defaults: {
      allow_env_override: true,
    },
  };
}

/**
 * Merge user flags with default flags
 *
 * User flags override defaults with the same ID.
 */
export function mergeFlagsWithDefaults(
  userFlags: FeatureFlag[]
): FeatureFlag[] {
  const flagMap = new Map<string, FeatureFlag>();

  // Add defaults first
  for (const flag of DEFAULT_FLAGS) {
    flagMap.set(flag.id, flag);
  }

  // Override with user flags
  for (const flag of userFlags) {
    flagMap.set(flag.id, flag);
  }

  return Array.from(flagMap.values());
}

/**
 * Validate all flags have unique IDs
 */
export function validateUniqueFlags(flags: FeatureFlag[]): boolean {
  const ids = new Set<string>();
  for (const flag of flags) {
    if (ids.has(flag.id)) {
      return false;
    }
    ids.add(flag.id);
  }
  return true;
}
