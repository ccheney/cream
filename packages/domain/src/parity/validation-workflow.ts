import {
	type DataConsistencyResult,
	type DataSourceMetadata,
	validateDataConsistency,
} from "./data-consistency";
import { compareFillModels, type FillModelComparisonResult, type FillRecord } from "./fill-models";
import { checkLookAheadBias, type LookAheadBiasResult, type ParityCandle } from "./look-ahead";
import {
	comparePerformanceMetrics,
	type ParityPerformanceMetrics,
	type StatisticalParityResult,
} from "./performance-metrics";
import {
	compareVersionRegistries,
	type VersionComparisonResult,
	type VersionRegistry,
} from "./version-registry";

export interface ParityValidationResult {
	passed: boolean;
	validatedAt: string;
	versionComparison?: VersionComparisonResult | undefined;
	lookAheadBiasCheck?: LookAheadBiasResult | undefined;
	fillModelComparison?: FillModelComparisonResult | undefined;
	statisticalParity?: StatisticalParityResult | undefined;
	dataConsistency?: DataConsistencyResult | undefined;
	recommendation: "APPROVE_FOR_LIVE" | "NEEDS_INVESTIGATION" | "NOT_READY";
	blockingIssues: string[];
	warnings: string[];
}

type ParityValidationParams = {
	researchRegistry?: VersionRegistry;
	liveRegistry?: VersionRegistry;
	candles?: ParityCandle[];
	decisionTimestamp?: string;
	researchFills?: FillRecord[];
	liveFills?: FillRecord[];
	researchMetrics?: ParityPerformanceMetrics;
	liveMetrics?: ParityPerformanceMetrics;
	historicalData?: DataSourceMetadata;
	realtimeData?: DataSourceMetadata;
	delistedSymbols?: string[];
};

interface ValidationState {
	blockingIssues: string[];
	warnings: string[];
	versionComparison?: VersionComparisonResult;
	lookAheadBiasCheck?: LookAheadBiasResult;
	fillModelComparison?: FillModelComparisonResult;
	statisticalParity?: StatisticalParityResult;
	dataConsistency?: DataConsistencyResult;
}

function createValidationState(): ValidationState {
	return {
		blockingIssues: [],
		warnings: [],
	};
}

function appendVersionComparisonIssues(
	versionComparison: VersionComparisonResult,
	state: ValidationState,
): void {
	if (versionComparison.match) {
		return;
	}

	if (versionComparison.mismatches.length > 0) {
		state.blockingIssues.push(
			`Indicator version mismatches: ${versionComparison.mismatches.map((mismatch) => mismatch.indicatorId).join(", ")}`,
		);
	}

	if (versionComparison.missingFromLive.length > 0) {
		state.blockingIssues.push(
			`Indicators missing from live: ${versionComparison.missingFromLive.join(", ")}`,
		);
	}

	if (versionComparison.missingFromResearch.length > 0) {
		state.warnings.push(
			`Indicators missing from research: ${versionComparison.missingFromResearch.join(", ")}`,
		);
	}
}

function evaluateVersionComparison(params: ParityValidationParams, state: ValidationState): void {
	if (!params.researchRegistry || !params.liveRegistry) {
		return;
	}

	state.versionComparison = compareVersionRegistries(params.researchRegistry, params.liveRegistry);
	appendVersionComparisonIssues(state.versionComparison, state);
}

function appendLookAheadIssues(
	lookAheadBiasCheck: LookAheadBiasResult,
	state: ValidationState,
): void {
	for (const violation of lookAheadBiasCheck.violations) {
		if (violation.type === "future_data" || violation.type === "peeking") {
			state.blockingIssues.push(`Look-ahead bias: ${violation.description}`);
		} else {
			state.warnings.push(`Data issue: ${violation.description}`);
		}
	}
}

function evaluateLookAheadBias(params: ParityValidationParams, state: ValidationState): void {
	if (!params.candles || !params.decisionTimestamp) {
		return;
	}

	state.lookAheadBiasCheck = checkLookAheadBias(params.candles, params.decisionTimestamp);
	if (!state.lookAheadBiasCheck.valid) {
		appendLookAheadIssues(state.lookAheadBiasCheck, state);
	}
}

function evaluateFillModelComparison(params: ParityValidationParams, state: ValidationState): void {
	if (!params.researchFills || !params.liveFills) {
		return;
	}

	state.fillModelComparison = compareFillModels(params.researchFills, params.liveFills);

	if (state.fillModelComparison.matchScore < 0.8) {
		state.warnings.push(
			`Fill model match score ${Math.round(state.fillModelComparison.matchScore * 100)}% is below 80% threshold`,
		);
	}

	for (const discrepancy of state.fillModelComparison.discrepancies) {
		state.warnings.push(
			`Fill discrepancy in ${discrepancy.field}: research=${discrepancy.researchValue}, live=${discrepancy.liveValue}`,
		);
	}
}

function evaluateStatisticalParity(params: ParityValidationParams, state: ValidationState): void {
	if (!params.researchMetrics || !params.liveMetrics) {
		return;
	}

	state.statisticalParity = comparePerformanceMetrics(params.researchMetrics, params.liveMetrics);

	if (state.statisticalParity.recommendation === "REJECT") {
		state.blockingIssues.push(state.statisticalParity.reason);
	}

	if (state.statisticalParity.recommendation === "INVESTIGATE") {
		state.warnings.push(state.statisticalParity.reason);
	}
}

function evaluateDataConsistency(params: ParityValidationParams, state: ValidationState): void {
	if (!params.historicalData || !params.realtimeData) {
		return;
	}

	state.dataConsistency = validateDataConsistency(
		params.historicalData,
		params.realtimeData,
		params.delistedSymbols,
	);

	for (const issue of state.dataConsistency.issues) {
		if (issue.severity === "error") {
			state.blockingIssues.push(issue.description);
		} else {
			state.warnings.push(issue.description);
		}
	}
}

function determineRecommendation(
	blockingIssues: string[],
	warnings: string[],
): ParityValidationResult["recommendation"] {
	if (blockingIssues.length > 0) {
		return "NOT_READY";
	}

	if (warnings.length > 0) {
		return "NEEDS_INVESTIGATION";
	}

	return "APPROVE_FOR_LIVE";
}

function runEvaluators(params: ParityValidationParams, state: ValidationState): void {
	evaluateVersionComparison(params, state);
	evaluateLookAheadBias(params, state);
	evaluateFillModelComparison(params, state);
	evaluateStatisticalParity(params, state);
	evaluateDataConsistency(params, state);
}

export function runParityValidation(params: ParityValidationParams): ParityValidationResult {
	const state = createValidationState();
	runEvaluators(params, state);

	return {
		passed: state.blockingIssues.length === 0,
		validatedAt: new Date().toISOString(),
		versionComparison: state.versionComparison,
		lookAheadBiasCheck: state.lookAheadBiasCheck,
		fillModelComparison: state.fillModelComparison,
		statisticalParity: state.statisticalParity,
		dataConsistency: state.dataConsistency,
		recommendation: determineRecommendation(state.blockingIssues, state.warnings),
		blockingIssues: state.blockingIssues,
		warnings: state.warnings,
	};
}
