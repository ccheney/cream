/**
 * Contradiction resolution for HelixDB retrieved data.
 * @module
 */

import type { ContradictionResult } from "./types.js";

/**
 * Detect contradiction between retrieved and current data.
 *
 * Rule: Current market data takes precedence.
 * Retrieved context is used for historical patterns only.
 *
 * @param retrievedValue - Value from retrieved context
 * @param currentValue - Current market value
 * @param tolerance - Tolerance for comparison (e.g., 0.1 = 10%)
 * @returns Contradiction detection result
 */
export function detectContradiction(
	retrievedValue: number,
	currentValue: number,
	tolerance = 0.1
): ContradictionResult {
	if (currentValue === 0) {
		return {
			hasContradiction: retrievedValue !== 0,
			resolution: "current",
			reason: "Current value is zero, cannot calculate relative difference",
		};
	}

	const relativeDiff = Math.abs(retrievedValue - currentValue) / Math.abs(currentValue);
	const hasContradiction = relativeDiff > tolerance;

	return {
		hasContradiction,
		description: hasContradiction
			? `Retrieved value (${retrievedValue.toFixed(2)}) differs from current (${currentValue.toFixed(2)}) by ${(relativeDiff * 100).toFixed(1)}%`
			: undefined,
		resolution: "current",
		reason: "Current market data takes precedence per contradiction resolution rule",
	};
}

/**
 * Resolve contradiction by choosing current data.
 *
 * @param retrievedData - Data from retrieval
 * @param currentData - Current market data
 * @param contradictionFields - Fields to check for contradictions
 * @returns Resolved data with contradictions flagged
 */
export function resolveContradictions<T extends Record<string, unknown>>(
	retrievedData: T,
	currentData: Partial<T>,
	contradictionFields: (keyof T)[]
): { resolved: T; contradictions: ContradictionResult[] } {
	const resolved = { ...retrievedData };
	const contradictions: ContradictionResult[] = [];

	for (const field of contradictionFields) {
		const retrievedValue = retrievedData[field];
		const currentValue = currentData[field];

		if (typeof retrievedValue === "number" && typeof currentValue === "number") {
			const contradiction = detectContradiction(retrievedValue, currentValue);
			if (contradiction.hasContradiction) {
				(resolved as Record<string, unknown>)[field as string] = currentValue;
				contradictions.push({
					...contradiction,
					description: `Field "${String(field)}": ${contradiction.description}`,
				});
			}
		}
	}

	return { resolved, contradictions };
}
