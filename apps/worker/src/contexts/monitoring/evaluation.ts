/**
 * Expiration Evaluation Logic
 *
 * Pure domain logic for evaluating option positions approaching expiration.
 * No side effects - takes inputs, returns evaluations.
 */

import {
	checkPinRisk,
	classifyMoneyness,
	DEFAULT_EXPIRATION_POLICY,
	EXPIRATION_CHECKPOINT_TIMES,
	type ExpirationAction,
	type ExpirationEvaluation,
	type ExpirationPolicyConfig,
	type ExpirationReason,
	type ExpiringPosition,
	getMinimumDTE,
	getPinRiskThreshold,
	isPastCheckpoint,
	type PositionTypeForDTE,
	parseETTimeToMinutes,
	shouldLetExpireWorthless,
} from "@cream/domain/schemas";
import { daysToExpiration } from "@cream/domain/time";
import type { PortfolioPosition, UnderlyingQuote } from "./types.js";

// ============================================
// Position Type Classification
// ============================================

export function classifyPositionType(position: PortfolioPosition): PositionTypeForDTE {
	const isLong = position.quantity > 0;
	const isShort = position.quantity < 0;

	if (position.isSpread) {
		return "DEFINED_RISK_SPREAD";
	}

	if (isShort && position.isUncovered) {
		return "SHORT_UNCOVERED";
	}

	if (isLong) {
		return "LONG_OPTION";
	}

	return "COMPLEX_STRATEGY";
}

// ============================================
// Expiring Position Builder
// ============================================

export function buildExpiringPosition(
	position: PortfolioPosition,
	quote: UnderlyingQuote,
	currentTime: string,
	config: ExpirationPolicyConfig = DEFAULT_EXPIRATION_POLICY
): ExpiringPosition | null {
	const dte = daysToExpiration(position.expirationDate, currentTime);

	const positionType = classifyPositionType(position);
	const minDTE = getMinimumDTE(positionType, config.minimumDTE);

	if (dte > minDTE * 2) {
		return null;
	}

	const moneyness = classifyMoneyness(quote.price, position.strike, position.right);
	const distanceFromStrike = Math.abs(quote.price - position.strike);
	const isPinRisk = checkPinRisk(quote.price, position.strike, config.pinRisk);
	const isExpirationDay = dte <= 1;

	return {
		positionId: position.positionId,
		osiSymbol: position.osiSymbol,
		underlyingSymbol: position.underlyingSymbol,
		expirationDate: position.expirationDate,
		strike: position.strike,
		right: position.right,
		quantity: position.quantity,
		underlyingPrice: quote.price,
		dte,
		positionType,
		moneyness,
		distanceFromStrike,
		isPinRisk,
		isExpirationDay,
	};
}

// ============================================
// Expiration Evaluation
// ============================================

export function evaluateExpirationAction(
	position: ExpiringPosition,
	currentTime: string,
	config: ExpirationPolicyConfig = DEFAULT_EXPIRATION_POLICY
): ExpirationEvaluation {
	const minDTE = getMinimumDTE(position.positionType, config.minimumDTE);
	const isLong = position.quantity > 0;
	const isShort = position.quantity < 0;

	const date = new Date(currentTime);
	const etHour = date.getUTCHours() - 5;
	const etMinutes = date.getUTCMinutes();
	const etTimeMinutes = (etHour < 0 ? etHour + 24 : etHour) * 60 + etMinutes;

	if (position.isExpirationDay) {
		return evaluateExpirationDay(position, config, etTimeMinutes, isLong, isShort);
	}

	return evaluateApproachingExpiration(position, config, minDTE, isShort);
}

function evaluateExpirationDay(
	position: ExpiringPosition,
	config: ExpirationPolicyConfig,
	etTimeMinutes: number,
	isLong: boolean,
	isShort: boolean
): ExpirationEvaluation {
	if (isPastCheckpoint("FORCE_CLOSE", etTimeMinutes)) {
		return buildEvaluation(
			position,
			"CLOSE",
			"FORCE_CLOSE",
			10,
			`Force close triggered at ${EXPIRATION_CHECKPOINT_TIMES.FORCE_CLOSE} ET - all positions must be closed`,
			true,
			EXPIRATION_CHECKPOINT_TIMES.FORCE_CLOSE
		);
	}

	const autoCloseMinutes = parseETTimeToMinutes(config.autoCloseITMTime);
	if (
		etTimeMinutes >= autoCloseMinutes &&
		(position.moneyness === "ITM" || position.moneyness === "DEEP_ITM")
	) {
		if (config.allowExercise && isLong) {
			return buildEvaluation(
				position,
				"EXERCISE",
				"ITM_EXPIRATION",
				8,
				`ITM ${position.right} - exercise allowed per configuration`,
				false,
				EXPIRATION_CHECKPOINT_TIMES.MARKET_CLOSE
			);
		}

		return buildEvaluation(
			position,
			"CLOSE",
			"ITM_EXPIRATION",
			9,
			`ITM ${position.right} at ${config.autoCloseITMTime} ET - auto-close to avoid exercise/assignment`,
			true,
			config.autoCloseITMTime
		);
	}

	if (position.isPinRisk && isShort) {
		const threshold = getPinRiskThreshold(position.underlyingPrice, config.pinRisk);
		return buildEvaluation(
			position,
			"CLOSE",
			"PIN_RISK",
			9,
			`Short ${position.right} within $${threshold.toFixed(2)} of strike - pin risk at expiration`,
			true,
			EXPIRATION_CHECKPOINT_TIMES.FORCE_CLOSE
		);
	}

	if (isPastCheckpoint("FINAL_WARNING", etTimeMinutes)) {
		if (shouldLetExpireWorthless(position)) {
			return buildEvaluation(
				position,
				"LET_EXPIRE",
				"TIMELINE_TRIGGER",
				3,
				`Long OTM ${position.right} - letting expire worthless`,
				false
			);
		}

		return buildEvaluation(
			position,
			"CLOSE",
			"TIMELINE_TRIGGER",
			7,
			`Final warning at ${EXPIRATION_CHECKPOINT_TIMES.FINAL_WARNING} ET - close before force close at 3 PM`,
			false,
			EXPIRATION_CHECKPOINT_TIMES.FORCE_CLOSE
		);
	}

	return evaluateApproachingExpiration(
		position,
		config,
		getMinimumDTE(position.positionType, config.minimumDTE),
		position.quantity < 0
	);
}

function evaluateApproachingExpiration(
	position: ExpiringPosition,
	config: ExpirationPolicyConfig,
	minDTE: number,
	isShort: boolean
): ExpirationEvaluation {
	if (position.dte <= minDTE) {
		if (shouldLetExpireWorthless(position)) {
			return buildEvaluation(
				position,
				"LET_EXPIRE",
				"MINIMUM_DTE",
				2,
				`Long OTM ${position.right} at ${position.dte.toFixed(1)} DTE - letting expire worthless`,
				false
			);
		}

		if (position.isPinRisk && isShort) {
			const threshold = getPinRiskThreshold(position.underlyingPrice, config.pinRisk);
			return buildEvaluation(
				position,
				"CLOSE",
				"PIN_RISK",
				9,
				`Short ${position.right} at ${position.dte.toFixed(1)} DTE within $${threshold.toFixed(2)} of strike - close to avoid pin risk`,
				true
			);
		}

		if (isShort || position.positionType === "COMPLEX_STRATEGY") {
			return buildEvaluation(
				position,
				"ROLL",
				"MINIMUM_DTE",
				6,
				`${position.positionType} at ${position.dte.toFixed(1)} DTE (minimum: ${minDTE}) - recommend rolling`,
				false
			);
		}

		if (position.moneyness === "ITM" || position.moneyness === "DEEP_ITM") {
			return buildEvaluation(
				position,
				"CLOSE",
				"MINIMUM_DTE",
				5,
				`Long ITM ${position.right} at ${position.dte.toFixed(1)} DTE - close to capture remaining value`,
				false
			);
		}

		return buildEvaluation(
			position,
			"CLOSE",
			"MINIMUM_DTE",
			4,
			`${position.positionType} at ${position.dte.toFixed(1)} DTE (minimum: ${minDTE}) - recommend closing`,
			false
		);
	}

	if (position.dte <= minDTE * 1.5) {
		return buildEvaluation(
			position,
			"CLOSE",
			"MINIMUM_DTE",
			3,
			`${position.positionType} approaching minimum DTE (${position.dte.toFixed(1)} vs ${minDTE}) - consider closing/rolling`,
			false
		);
	}

	return buildEvaluation(
		position,
		"CLOSE",
		"MINIMUM_DTE",
		1,
		`${position.positionType} at ${position.dte.toFixed(1)} DTE - monitoring`,
		false
	);
}

function buildEvaluation(
	position: ExpiringPosition,
	action: ExpirationAction,
	reason: ExpirationReason,
	priority: number,
	explanation: string,
	isForced: boolean,
	deadline?: string
): ExpirationEvaluation {
	return {
		position,
		action,
		reason,
		priority,
		explanation,
		deadline: deadline ? `${position.expirationDate}T${deadline}:00.000Z` : undefined,
		isForced,
	};
}
