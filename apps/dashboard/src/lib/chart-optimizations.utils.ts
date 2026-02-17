/**
 * Shared chart optimization utilities.
 */

export class LRUCache<K, V> {
	private cache = new Map<K, V>();
	private maxSize: number;

	constructor(maxSize = 100) {
		this.maxSize = maxSize;
	}

	get(key: K): V | undefined {
		const value = this.cache.get(key);
		if (value === undefined) {
			return undefined;
		}

		this.cache.delete(key);
		this.cache.set(key, value);
		return value;
	}

	set(key: K, value: V): void {
		if (this.cache.has(key)) {
			this.cache.delete(key);
		} else if (this.cache.size >= this.maxSize) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) {
				this.cache.delete(firstKey);
			}
		}

		this.cache.set(key, value);
	}

	has(key: K): boolean {
		return this.cache.has(key);
	}

	clear(): void {
		this.cache.clear();
	}

	get size(): number {
		return this.cache.size;
	}
}

export function memoize<Args extends unknown[], Result>(
	fn: (...args: Args) => Result,
	keyFn?: (...args: Args) => string,
	maxSize = 100,
): (...args: Args) => Result {
	const cache = new LRUCache<string, Result>(maxSize);

	return (...args: Args): Result => {
		const key = keyFn ? keyFn(...args) : JSON.stringify(args);
		const cached = cache.get(key);

		if (cached !== undefined) {
			return cached;
		}

		const result = fn(...args);
		cache.set(key, result);
		return result;
	};
}

export async function processBatched<T, R>(
	data: T[],
	processor: (item: T) => R,
	batchSize = 1000,
): Promise<R[]> {
	const results: R[] = [];

	for (let i = 0; i < data.length; i += batchSize) {
		const batch = data.slice(i, i + batchSize);
		const batchResults = batch.map(processor);
		results.push(...batchResults);

		if (i + batchSize < data.length) {
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	}

	return results;
}

export function throttle<T extends (...args: unknown[]) => unknown>(
	fn: T,
	limit: number,
): (...args: Parameters<T>) => void {
	let inThrottle = false;
	let lastArgs: Parameters<T> | null = null;

	return (...args: Parameters<T>) => {
		if (!inThrottle) {
			fn(...args);
			inThrottle = true;
			setTimeout(() => {
				inThrottle = false;
				if (lastArgs) {
					fn(...lastArgs);
					lastArgs = null;
				}
			}, limit);
			return;
		}

		lastArgs = args;
	};
}
