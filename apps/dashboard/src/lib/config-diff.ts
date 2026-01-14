/**
 * Config Diff Utilities
 *
 * Deep object comparison for configuration diffs with path tracking
 * and human-readable value formatting.
 */

// ============================================
// Types
// ============================================

export type DiffType = "added" | "removed" | "changed" | "unchanged";

export interface DiffEntry {
	path: string[];
	key: string;
	type: DiffType;
	oldValue?: unknown;
	newValue?: unknown;
	children?: DiffEntry[];
}

export interface DiffResult {
	entries: DiffEntry[];
	stats: {
		added: number;
		removed: number;
		changed: number;
		unchanged: number;
	};
}

// ============================================
// Deep Object Diff
// ============================================

/**
 * Calculate deep differences between two objects.
 * Recursively walks the object tree and identifies changes.
 */
export function calculateDiff(
	before: Record<string, unknown>,
	after: Record<string, unknown>,
	path: string[] = []
): DiffResult {
	const entries: DiffEntry[] = [];
	const stats = { added: 0, removed: 0, changed: 0, unchanged: 0 };

	const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

	for (const key of allKeys) {
		const oldValue = before[key];
		const newValue = after[key];
		const currentPath = [...path, key];

		// Key only in before (removed)
		if (!(key in after)) {
			entries.push({
				path: currentPath,
				key,
				type: "removed",
				oldValue,
			});
			stats.removed += countLeafNodes(oldValue);
			continue;
		}

		// Key only in after (added)
		if (!(key in before)) {
			entries.push({
				path: currentPath,
				key,
				type: "added",
				newValue,
			});
			stats.added += countLeafNodes(newValue);
			continue;
		}

		// Both exist - compare values
		if (isObject(oldValue) && isObject(newValue)) {
			// Recurse into nested objects
			const childResult = calculateDiff(
				oldValue as Record<string, unknown>,
				newValue as Record<string, unknown>,
				currentPath
			);

			if (childResult.entries.length > 0) {
				const hasChanges = childResult.entries.some((e) => e.type !== "unchanged");
				entries.push({
					path: currentPath,
					key,
					type: hasChanges ? "changed" : "unchanged",
					children: childResult.entries,
				});
				stats.added += childResult.stats.added;
				stats.removed += childResult.stats.removed;
				stats.changed += childResult.stats.changed;
				stats.unchanged += childResult.stats.unchanged;
			} else {
				stats.unchanged++;
			}
		} else if (Array.isArray(oldValue) && Array.isArray(newValue)) {
			// Compare arrays
			if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
				entries.push({
					path: currentPath,
					key,
					type: "changed",
					oldValue,
					newValue,
				});
				stats.changed++;
			} else {
				stats.unchanged++;
			}
		} else if (oldValue !== newValue) {
			// Primitive value changed
			entries.push({
				path: currentPath,
				key,
				type: "changed",
				oldValue,
				newValue,
			});
			stats.changed++;
		} else {
			// Values are equal
			entries.push({
				path: currentPath,
				key,
				type: "unchanged",
				oldValue,
				newValue,
			});
			stats.unchanged++;
		}
	}

	return { entries, stats };
}

// ============================================
// Value Formatting
// ============================================

/**
 * Format a value for human-readable display with type awareness.
 */
export function formatValue(value: unknown): string {
	if (value === null) {
		return "null";
	}
	if (value === undefined) {
		return "undefined";
	}
	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}
	if (typeof value === "number") {
		// Check if it looks like a dollar amount (large number)
		if (value >= 1_000_000) {
			return `$${(value / 1_000_000).toFixed(1)}M`;
		}
		if (value >= 1_000) {
			return `$${(value / 1_000).toFixed(0)}K`;
		}
		// Check if it looks like a percentage (0-1 range with decimals)
		if (value > 0 && value <= 1 && value !== Math.floor(value)) {
			return `${(value * 100).toFixed(0)}%`;
		}
		return value.toLocaleString();
	}
	if (typeof value === "string") {
		return value;
	}
	if (Array.isArray(value)) {
		if (value.length === 0) {
			return "[]";
		}
		if (value.length <= 3 && value.every((v) => typeof v === "string" || typeof v === "number")) {
			return `[${value.join(", ")}]`;
		}
		return `[${value.length} items]`;
	}
	if (isObject(value)) {
		const keys = Object.keys(value);
		if (keys.length === 0) {
			return "{}";
		}
		return `{${keys.length} properties}`;
	}
	return String(value);
}

/**
 * Get a display label for a config key path.
 */
export function formatKeyPath(path: string[]): string {
	return path
		.map((key) =>
			key
				.replace(/([A-Z])/g, " $1")
				.replace(/^./, (s) => s.toUpperCase())
				.trim()
		)
		.join(" → ");
}

/**
 * Get a short label for a key.
 */
export function formatKey(key: string): string {
	return key
		.replace(/([A-Z])/g, " $1")
		.replace(/^./, (s) => s.toUpperCase())
		.trim();
}

// ============================================
// Filter Functions
// ============================================

/**
 * Filter diff entries to show only changes (not unchanged).
 */
export function filterChangesOnly(entries: DiffEntry[]): DiffEntry[] {
	return entries
		.filter((entry) => entry.type !== "unchanged" || (entry.children && entry.children.length > 0))
		.map((entry) => {
			if (entry.children) {
				return {
					...entry,
					children: filterChangesOnly(entry.children),
				};
			}
			return entry;
		})
		.filter((entry) => entry.type !== "unchanged" || (entry.children && entry.children.length > 0));
}

/**
 * Check if an entry or its children have any changes.
 */
export function hasChanges(entry: DiffEntry): boolean {
	if (entry.type !== "unchanged") {
		return true;
	}
	if (entry.children) {
		return entry.children.some(hasChanges);
	}
	return false;
}

// ============================================
// Revert Helpers
// ============================================

/**
 * Apply a revert to a config object at a given path.
 * Returns a new object with the old value restored.
 */
export function revertChange(
	config: Record<string, unknown>,
	path: string[],
	oldValue: unknown
): Record<string, unknown> {
	if (path.length === 0) {
		return config;
	}

	const [firstKey, ...rest] = path;
	if (firstKey === undefined) {
		return config;
	}

	const result = { ...config };

	if (rest.length === 0) {
		// At the target key
		if (oldValue === undefined) {
			// Was added, so remove it
			delete result[firstKey];
		} else {
			result[firstKey] = oldValue;
		}
	} else {
		// Recurse
		const nested = config[firstKey];
		if (isObject(nested)) {
			result[firstKey] = revertChange(nested as Record<string, unknown>, rest, oldValue);
		}
	}

	return result;
}

// ============================================
// Helpers
// ============================================

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countLeafNodes(value: unknown): number {
	if (isObject(value)) {
		return Object.values(value).reduce<number>((sum, v) => sum + countLeafNodes(v), 0);
	}
	if (Array.isArray(value)) {
		return value.reduce<number>((sum, v) => sum + countLeafNodes(v), 0);
	}
	return 1;
}
