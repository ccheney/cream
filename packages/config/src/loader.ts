/**
 * Configuration Loader
 *
 * Loads and merges YAML configuration files with environment-specific overrides.
 *
 * @see docs/plans/11-configuration.md for full specification
 */

import { parse } from "yaml";
import { readFile } from "fs/promises";
import { deepmerge } from "deepmerge-ts";
import { CreamConfigSchema, type CreamConfig } from "./validate";

/**
 * Environment type for config loading
 */
export type ConfigEnvironment = "development" | "production";

/**
 * Load and parse a YAML file
 *
 * @param path - Path to the YAML file
 * @returns Parsed YAML content
 * @throws Error if file cannot be read or parsed
 */
async function loadYaml(path: string): Promise<unknown> {
  try {
    const content = await readFile(path, "utf-8");
    return parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load YAML from ${path}: ${message}`);
  }
}

/**
 * Load configuration with environment-specific overrides
 *
 * Loads base configuration from default.yaml, then merges with
 * environment-specific overrides (development.yaml or production.yaml).
 *
 * @param environment - The environment to load config for
 * @param configDir - Base directory for config files (default: "configs")
 * @returns Validated configuration object
 * @throws Error if validation fails
 */
export async function loadConfig(
  environment: ConfigEnvironment,
  configDir = "configs"
): Promise<CreamConfig> {
  // Load base configuration
  const base = await loadYaml(`${configDir}/default.yaml`);

  // Load environment-specific overrides
  let override: unknown = {};
  try {
    override = await loadYaml(`${configDir}/${environment}.yaml`);
  } catch {
    // Environment override is optional
    console.warn(`No ${environment}.yaml found, using defaults only`);
  }

  // Deep merge with type safety - override takes precedence
  const merged = deepmerge(base as object, override as object);

  // Runtime validation with Zod - throws with detailed error messages
  const validated = CreamConfigSchema.parse(merged);

  return validated;
}

/**
 * Load configuration from a specific file
 *
 * @param path - Path to the configuration file
 * @returns Validated configuration object
 * @throws Error if validation fails
 */
export async function loadConfigFromFile(path: string): Promise<CreamConfig> {
  const content = await loadYaml(path);
  return CreamConfigSchema.parse(content);
}

/**
 * Load configuration from environment variables and files
 *
 * Precedence (highest to lowest):
 * 1. Environment variables (CREAM_CONFIG_*)
 * 2. Environment-specific YAML (development.yaml, production.yaml)
 * 3. Default YAML (default.yaml)
 *
 * @param configDir - Base directory for config files
 * @returns Validated configuration object
 */
export async function loadConfigWithEnv(
  configDir = "configs"
): Promise<CreamConfig> {
  // Determine environment from CREAM_ENV or NODE_ENV
  const creamEnv = process.env.CREAM_ENV;
  const nodeEnv = process.env.NODE_ENV;

  let environment: ConfigEnvironment = "development";
  if (creamEnv === "LIVE" || nodeEnv === "production") {
    environment = "production";
  }

  return loadConfig(environment, configDir);
}
