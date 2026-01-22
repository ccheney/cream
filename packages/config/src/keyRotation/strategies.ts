/**
 * Key selection strategy implementations.
 */

import type { ApiKey } from "./types.js";

/**
 * Select key using round-robin strategy.
 * Returns the key and the updated index.
 */
export function selectRoundRobin(
	keys: ApiKey[],
	currentIndex: number,
): { key: ApiKey; nextIndex: number } | null {
	if (keys.length === 0) {
		return null;
	}
	const index = currentIndex % keys.length;
	const key = keys[index];
	if (key === undefined) {
		return null;
	}
	return {
		key,
		nextIndex: index + 1,
	};
}

/**
 * Select the key with the fewest requests.
 */
export function selectLeastUsed(keys: ApiKey[]): ApiKey {
	return keys.reduce((min, k) => (k.requestCount < min.requestCount ? k : min));
}

/**
 * Select the key with the lowest error rate.
 */
export function selectHealthiest(keys: ApiKey[]): ApiKey {
	return keys.reduce((best, k) => {
		const kErrorRate = k.requestCount > 0 ? k.errorCount / k.requestCount : 0;
		const bestErrorRate = best.requestCount > 0 ? best.errorCount / best.requestCount : 0;
		return kErrorRate < bestErrorRate ? k : best;
	});
}

/**
 * Select the key with the most remaining rate limit.
 * Falls back to least-used if no rate limit info is available.
 */
export function selectRateLimitAware(keys: ApiKey[]): ApiKey {
	const withRateLimit = keys.filter((k) => k.rateLimitRemaining !== undefined);

	if (withRateLimit.length > 0) {
		return withRateLimit.reduce((best, k) =>
			(k.rateLimitRemaining ?? 0) > (best.rateLimitRemaining ?? 0) ? k : best,
		);
	}

	return selectLeastUsed(keys);
}
