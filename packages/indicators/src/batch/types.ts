/**
 * Shared types for batch jobs.
 */

/**
 * Result from running a batch job.
 */
export interface BatchJobResult {
	/** Number of symbols successfully processed */
	processed: number;
	/** Number of symbols that failed */
	failed: number;
	/** Individual error details */
	errors: Array<{ symbol: string; error: string }>;
	/** Total duration in milliseconds */
	durationMs: number;
}
