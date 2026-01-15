import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);

/**
 * Resolve the workspace path for the @cream/research package.
 */
export function getResearchPath(): string {
	return dirname(require.resolve("@cream/research/package.json"));
}
