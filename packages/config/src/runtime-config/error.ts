/**
 * Runtime Configuration Errors
 */

import type { RuntimeEnvironment, ValidationError } from "./types.js";

export class RuntimeConfigError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NOT_SEEDED"
      | "VALIDATION_FAILED"
      | "PROMOTION_FAILED"
      | "ROLLBACK_FAILED",
    public readonly environment?: RuntimeEnvironment,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "RuntimeConfigError";
  }

  static notSeeded(environment: RuntimeEnvironment): RuntimeConfigError {
    return new RuntimeConfigError(
      `No active config found for ${environment}. Run 'bun run db:seed' first.`,
      "NOT_SEEDED",
      environment
    );
  }

  static validationFailed(
    errors: ValidationError[],
    environment?: RuntimeEnvironment
  ): RuntimeConfigError {
    const errorMessages = errors.map((e) => `${e.field}: ${e.message}`).join("; ");
    return new RuntimeConfigError(
      `Config validation failed: ${errorMessages}`,
      "VALIDATION_FAILED",
      environment,
      errors
    );
  }
}
