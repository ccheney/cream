/**
 * Indicator service utility helpers.
 */

/**
 * Chunk an array into smaller arrays of specified size.
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < array.length; index += size) {
		chunks.push(array.slice(index, index + size));
	}
	return chunks;
}

/**
 * Convert Date to YYYY-MM-DD string.
 */
export function toDateString(date: Date): string {
	return date.toISOString().slice(0, 10);
}
