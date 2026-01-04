/**
 * Execution Configuration Schema
 *
 * Defines configuration for order execution and broker settings.
 *
 * @see docs/plans/11-configuration.md for full specification
 */

import { z } from "zod";

// ============================================
// Order Types and Tactics
// ============================================

/**
 * Order type
 */
export const OrderType = z.enum(["LIMIT", "MARKET"]);
export type OrderType = z.infer<typeof OrderType>;

/**
 * Execution tactic
 */
export const ExecutionTactic = z.enum(["PASSIVE_LIMIT", "AGGRESSIVE_LIMIT", "MARKET", "TWAP"]);
export type ExecutionTactic = z.infer<typeof ExecutionTactic>;

/**
 * Broker identifier
 */
export const BrokerId = z.enum(["alpaca", "ibkr"]);
export type BrokerId = z.infer<typeof BrokerId>;

// ============================================
// Order Policy Configuration
// ============================================

/**
 * Default order type policy
 */
export const OrderPolicySchema = z.object({
  /**
   * Default order type for entries
   *
   * LIMIT preferred for better fills
   */
  entry_default: OrderType.default("LIMIT"),

  /**
   * Default order type for exits
   *
   * MARKET preferred for guaranteed execution
   */
  exit_default: OrderType.default("MARKET"),
});
export type OrderPolicy = z.infer<typeof OrderPolicySchema>;

// ============================================
// Tactics Configuration
// ============================================

/**
 * Execution tactics configuration
 */
export const TacticsConfigSchema = z.object({
  /**
   * Default execution tactic
   */
  default: ExecutionTactic.default("PASSIVE_LIMIT"),
});
export type TacticsConfig = z.infer<typeof TacticsConfigSchema>;

// ============================================
// Alpaca Broker Configuration
// ============================================

/**
 * Alpaca-specific configuration
 */
export const AlpacaConfigSchema = z.object({
  /**
   * Paper trading endpoint
   */
  paper_url: z.string().url().default("https://paper-api.alpaca.markets"),

  /**
   * Live trading endpoint
   */
  live_url: z.string().url().default("https://api.alpaca.markets"),
});
export type AlpacaConfig = z.infer<typeof AlpacaConfigSchema>;

// ============================================
// IBKR Broker Configuration
// ============================================

/**
 * Interactive Brokers-specific configuration
 */
export const IBKRConfigSchema = z.object({
  /**
   * TWS Gateway host
   */
  gateway_host: z.string().default("127.0.0.1"),

  /**
   * TWS Gateway port
   */
  gateway_port: z.number().int().positive().default(4001),

  /**
   * Client ID
   */
  client_id: z.number().int().nonnegative().default(1),
});
export type IBKRConfig = z.infer<typeof IBKRConfigSchema>;

// ============================================
// Complete Execution Configuration
// ============================================

/**
 * Complete execution configuration
 */
export const ExecutionConfigSchema = z.object({
  /**
   * Order type policy
   */
  order_policy: OrderPolicySchema.optional(),

  /**
   * Execution tactics
   */
  tactics: TacticsConfigSchema.optional(),

  /**
   * Broker selection
   */
  brokers: z
    .object({
      /**
       * Primary broker
       */
      primary: BrokerId.default("alpaca"),

      /**
       * Secondary/fallback broker
       */
      secondary: BrokerId.nullable().default(null),
    })
    .optional(),

  /**
   * Alpaca-specific settings
   */
  alpaca: AlpacaConfigSchema.optional(),

  /**
   * IBKR-specific settings
   */
  ibkr: IBKRConfigSchema.optional(),
});
export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>;
