export function requireValue<T>(value: T | null | undefined, label = "value"): T {
	if (value == null) {
		throw new Error(`Expected ${label} to be defined`);
	}
	return value;
}

export function requireArrayItem<T>(items: readonly T[], index: number, label = "item"): T {
	const value = items[index];
	if (value === undefined) {
		throw new Error(`Expected ${label} at index ${index}`);
	}
	return value;
}
