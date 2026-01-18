/**
 * Indicator Ingestion Tool Implementation
 *
 * Provides functionality for searching, retrieving, and validating synthesized
 * indicators from HelixDB.
 */

import { type ExecutionContext, isTest } from "@cream/domain";
import { createIndicatorIngestionService, type IndicatorInput } from "@cream/helix";
import type { IndicatorCategory, IndicatorStatus } from "@cream/helix-schema";
import { getHelixClient } from "../clients.js";

// ============================================
// Types
// ============================================

/**
 * Indicator search result from HelixDB
 */
export interface IndicatorSearchResult {
	indicatorId: string;
	name: string;
	category: IndicatorCategory;
	status: IndicatorStatus;
	similarity: number;
	hypothesis: string;
	deflatedSharpe?: number;
	informationCoefficient?: number;
}

/**
 * Full indicator details
 */
export interface IndicatorDetails {
	indicatorId: string;
	name: string;
	category: IndicatorCategory;
	status: IndicatorStatus;
	hypothesis: string;
	economicRationale: string;
	deflatedSharpe?: number;
	probabilityOfOverfit?: number;
	informationCoefficient?: number;
	codeHash?: string;
	astSignature?: string;
}

// ============================================
// Search Similar Indicators
// ============================================

/**
 * Search for similar indicators in HelixDB by semantic similarity
 *
 * @param ctx - Execution context
 * @param query - Search query (hypothesis or economic rationale)
 * @param limit - Maximum results to return
 * @returns Search results with semantic similarity scores
 */
export async function searchSimilarIndicators(
	ctx: ExecutionContext,
	query: string,
	limit: number
): Promise<{
	query: string;
	indicators: IndicatorSearchResult[];
	totalFound: number;
	executionTimeMs: number;
}> {
	const startTime = performance.now();

	// In test mode, return empty results
	if (isTest(ctx)) {
		return {
			query,
			indicators: [],
			totalFound: 0,
			executionTimeMs: performance.now() - startTime,
		};
	}

	const client = getHelixClient();
	const service = createIndicatorIngestionService(client);

	const results = await service.searchSimilarIndicators(query, limit);

	return {
		query,
		indicators: results.map((r) => ({
			indicatorId: r.indicatorId,
			name: r.name,
			category: r.category,
			status: r.status,
			similarity: r.similarity,
			hypothesis: r.hypothesis,
			deflatedSharpe: r.deflatedSharpe,
			informationCoefficient: r.informationCoefficient,
		})),
		totalFound: results.length,
		executionTimeMs: performance.now() - startTime,
	};
}

// ============================================
// Search By Category
// ============================================

/**
 * Search for indicators by category
 *
 * @param ctx - Execution context
 * @param category - Indicator category
 * @param query - Optional query to filter within category
 * @param limit - Maximum results to return
 * @returns Search results filtered by category
 */
export async function searchIndicatorsByCategory(
	ctx: ExecutionContext,
	category: IndicatorCategory,
	query: string,
	limit: number
): Promise<{
	category: IndicatorCategory;
	query: string;
	indicators: IndicatorSearchResult[];
	totalFound: number;
	executionTimeMs: number;
}> {
	const startTime = performance.now();

	// In test mode, return empty results
	if (isTest(ctx)) {
		return {
			category,
			query,
			indicators: [],
			totalFound: 0,
			executionTimeMs: performance.now() - startTime,
		};
	}

	const client = getHelixClient();
	const service = createIndicatorIngestionService(client);

	const results = await service.searchByCategory(category, query, limit);

	return {
		category,
		query,
		indicators: results.map((r) => ({
			indicatorId: r.indicatorId,
			name: r.name,
			category: r.category,
			status: r.status,
			similarity: r.similarity,
			hypothesis: r.hypothesis,
			deflatedSharpe: r.deflatedSharpe,
			informationCoefficient: r.informationCoefficient,
		})),
		totalFound: results.length,
		executionTimeMs: performance.now() - startTime,
	};
}

// ============================================
// Get Indicator Details
// ============================================

/**
 * Get full details for a specific indicator
 *
 * @param ctx - Execution context
 * @param indicatorId - Indicator identifier
 * @returns Full indicator details or null if not found
 */
export async function getIndicator(
	ctx: ExecutionContext,
	indicatorId: string
): Promise<{
	found: boolean;
	indicator: IndicatorDetails | null;
	executionTimeMs: number;
}> {
	const startTime = performance.now();

	// In test mode, return not found
	if (isTest(ctx)) {
		return {
			found: false,
			indicator: null,
			executionTimeMs: performance.now() - startTime,
		};
	}

	const client = getHelixClient();
	const service = createIndicatorIngestionService(client);

	const indicator = await service.getIndicatorById(indicatorId);

	if (!indicator) {
		return {
			found: false,
			indicator: null,
			executionTimeMs: performance.now() - startTime,
		};
	}

	return {
		found: true,
		indicator: {
			indicatorId: indicator.indicatorId,
			name: indicator.name,
			category: indicator.category,
			status: indicator.status,
			hypothesis: indicator.hypothesis,
			economicRationale: indicator.economicRationale,
			deflatedSharpe: indicator.deflatedSharpe,
			probabilityOfOverfit: indicator.probabilityOfOverfit,
			informationCoefficient: indicator.informationCoefficient,
			codeHash: indicator.codeHash,
			astSignature: indicator.astSignature,
		},
		executionTimeMs: performance.now() - startTime,
	};
}

// ============================================
// Get Validated Indicators
// ============================================

/**
 * Get indicators that pass validation thresholds
 *
 * @param ctx - Execution context
 * @param limit - Maximum results to return
 * @returns Validated indicators meeting performance thresholds
 */
export async function getValidatedIndicators(
	ctx: ExecutionContext,
	limit: number
): Promise<{
	indicators: Array<{
		indicatorId: string;
		name: string;
		category: IndicatorCategory;
		deflatedSharpe: number;
		probabilityOfOverfit: number;
		informationCoefficient: number;
	}>;
	totalFound: number;
	executionTimeMs: number;
}> {
	const startTime = performance.now();

	// In test mode, return empty results
	if (isTest(ctx)) {
		return {
			indicators: [],
			totalFound: 0,
			executionTimeMs: performance.now() - startTime,
		};
	}

	const client = getHelixClient();
	const service = createIndicatorIngestionService(client);

	const results = await service.getValidatedIndicators(undefined, limit);

	return {
		indicators: results,
		totalFound: results.length,
		executionTimeMs: performance.now() - startTime,
	};
}

// ============================================
// Ingest Indicator
// ============================================

/**
 * Ingest a synthesized indicator into HelixDB
 *
 * @param ctx - Execution context
 * @param indicator - Indicator to ingest
 * @returns Ingestion result
 */
export async function ingestIndicator(
	ctx: ExecutionContext,
	indicator: IndicatorInput
): Promise<{
	success: boolean;
	indicatorId: string;
	duplicateFound: boolean;
	similarIndicators: IndicatorSearchResult[];
	executionTimeMs: number;
	errors: string[];
}> {
	const startTime = performance.now();

	// In test mode, skip ingestion
	if (isTest(ctx)) {
		return {
			success: false,
			indicatorId: indicator.indicatorId,
			duplicateFound: false,
			similarIndicators: [],
			executionTimeMs: performance.now() - startTime,
			errors: ["Test mode - ingestion skipped"],
		};
	}

	const client = getHelixClient();
	const service = createIndicatorIngestionService(client);

	const result = await service.ingestIndicator(indicator);

	return {
		success: result.indicatorsIngested > 0,
		indicatorId: indicator.indicatorId,
		duplicateFound: result.duplicatesSkipped > 0,
		similarIndicators: result.similarIndicators.map((s) => ({
			indicatorId: s.indicatorId,
			name: s.name,
			category: s.category,
			status: s.status,
			similarity: s.similarity,
			hypothesis: s.hypothesis,
			deflatedSharpe: s.deflatedSharpe,
			informationCoefficient: s.informationCoefficient,
		})),
		executionTimeMs: performance.now() - startTime,
		errors: result.errors,
	};
}
