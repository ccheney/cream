/**
 * @cream/domain - Core domain types and Zod schemas.
 */

export const PACKAGE_NAME = "@cream/domain";
export const VERSION = "0.0.1";

export * from "./grpc/public-exports-core.js";

// gRPC client exports are intentionally NOT re-exported from the main index
// to avoid build-time dependency on @cream/schema-gen subpath exports with CI issues.
// Import directly from "@cream/domain/grpc" instead.

export * from "./grpc/public-exports-extended.js";
