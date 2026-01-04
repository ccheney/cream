/**
 * @cream/domain - Core domain types and Zod schemas
 *
 * This package contains:
 * - Zod schemas that mirror Protobuf contracts
 * - Environment variable validation
 * - Core type definitions
 */

export const PACKAGE_NAME = "@cream/domain";
export const VERSION = "0.0.1";

// Environment configuration
export {
  env,
  envSchema,
  isBacktest,
  isPaper,
  isLive,
  getAlpacaBaseUrl,
  getEnvDatabaseSuffix,
  CreamEnvironment,
  CreamBroker,
  type EnvConfig,
} from "./env";
