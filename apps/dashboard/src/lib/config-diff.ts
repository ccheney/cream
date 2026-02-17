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

type DiffStats = DiffResult["stats"];

// ============================================
// Deep Object Diff
// ============================================

function createStats(): DiffStats {
	return { added: 0, removed: 0, changed: 0, unchanged: 0 };
}

function mergeStats(target: DiffStats, delta: DiffStats): void {
	target.added += delta.added;
	target.removed += delta.removed;
	target.changed += delta.changed;
	target.unchanged += delta.unchanged;
}

function hasOwnValue(source: Record<string, unknown>, key: string): boolean {
	return Object.hasOwn(source, key);
}

function compareSharedKey(
	key: string,
	oldValue: unknown,
	newValue: unknown,
	currentPath: string[],
): { entry?: DiffEntry; stats: DiffStats } {
	if (isObject(oldValue) && isObject(newValue)) {
		const childResult = calculateDiff(oldValue, newValue, currentPath);
		if (childResult.entries.length === 0) {
			return { stats: { ...createStats(), unchanged: 1 } };
		}

		const hasNestedChanges = childResult.entries.some((entry) => entry.type !== "unchanged");
		return {
			entry: {
				path: currentPath,
				key,
				type: hasNestedChanges ? "changed" : "unchanged",
				children: childResult.entries,
			},
			stats: childResult.stats,
		};
	}

	if (Array.isArray(oldValue) && Array.isArray(newValue)) {
		const hasChanged = JSON.stringify(oldValue) !== JSON.stringify(newValue);
		return {
			entry: hasChanged
				? { path: currentPath, key, type: "changed", oldValue, newValue }
				: undefined,
			stats: hasChanged ? { ...createStats(), changed: 1 } : { ...createStats(), unchanged: 1 },
		};
	}

	if (oldValue !== newValue) {
		return {
			entry: { path: currentPath, key, type: "changed", oldValue, newValue },
			stats: { ...createStats(), changed: 1 },
		};
	}

	return {
		entry: { path: currentPath, key, type: "unchanged", oldValue, newValue },
		stats: { ...createStats(), unchanged: 1 },
	};
}

function diffKey(
	before: Record<string, unknown>,
	after: Record<string, unknown>,
	key: string,
	path: string[],
): { entry?: DiffEntry; stats: DiffStats } {
	const oldValue = before[key];
	const newValue = after[key];
	const currentPath = [...path, key];

	if (!hasOwnValue(after, key)) {
		return {
			entry: { path: currentPath, key, type: "removed", oldValue },
			stats: { ...createStats(), removed: countLeafNodes(oldValue) },
		};
	}

	if (!hasOwnValue(before, key)) {
		return {
			entry: { path: currentPath, key, type: "added", newValue },
			stats: { ...createStats(), added: countLeafNodes(newValue) },
		};
	}

	return compareSharedKey(key, oldValue, newValue, currentPath);
}

/**
 * Calculate deep differences between two objects.
 * Recursively walks the object tree and identifies changes.
 */
export function calculateDiff(
	before: Record<string, unknown>,
	after: Record<string, unknown>,
	path: string[] = [],
): DiffResult {
	const entries: DiffEntry[] = [];
	const stats = createStats();

	const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
	for (const key of allKeys) {
		const result = diffKey(before, after, key, path);
		if (result.entry) {
			entries.push(result.entry);
		}
		mergeStats(stats, result.stats);
	}

	return { entries, stats };
}

// ============================================
// Value Formatting
// ============================================

/**
 * Format a value for human-readable display with type awareness.
 */
function formatNumberValue(value: number): string {
	if (value >= 1_000_000) {
		return `$${(value / 1_000_000).toFixed(1)}M`;
	}
	if (value >= 1_000) {
		return `$${(value / 1_000).toFixed(0)}K`;
	}
	if (value > 0 && value <= 1 && value !== Math.floor(value)) {
		return `${(value * 100).toFixed(0)}%`;
	}
	return value.toLocaleString();
}

function formatArrayValue(value: unknown[]): string {
	if (value.length === 0) {
		return "[]";
	}
	const allScalars = value.every((item) => typeof item === "string" || typeof item === "number");
	if (value.length <= 3 && allScalars) {
		return `[${value.join(", ")}]`;
	}
	return `[${value.length} items]`;
}

function formatObjectValue(value: Record<string, unknown>): string {
	const keyCount = Object.keys(value).length;
	return keyCount === 0 ? "{}" : `{${keyCount} properties}`;
}

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
		return formatNumberValue(value);
	}
	if (typeof value === "string") {
		return value;
	}
	if (Array.isArray(value)) {
		return formatArrayValue(value);
	}
	if (isObject(value)) {
		return formatObjectValue(value);
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
				.trim(),
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
	oldValue: unknown,
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
