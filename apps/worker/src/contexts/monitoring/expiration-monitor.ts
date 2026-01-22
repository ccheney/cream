/**
 * Expiration Monitor
 *
 * Monitors option positions approaching expiration and triggers appropriate actions:
 * - Minimum DTE threshold enforcement
 * - Expiration Friday timeline scheduling (12 PM, 2 PM, 3 PM ET)
 * - Pin risk detection and avoidance
 * - Auto-close ITM positions
 * - Force close remaining positions
 *
 * Timeline (all times ET):
 * - 9:30 AM: Evaluate all expiring positions
 * - 12:00 PM: Auto-close ITM positions (unless exercise intended)
 * - 2:00 PM: Final warning for all expiring positions
 * - 3:00 PM: Force close any remaining positions
 * - 4:00 PM: Market close
 * - 5:30 PM: OCC exercise deadline
 */

import {
	DEFAULT_EXPIRATION_POLICY,
	EXPIRATION_CHECKPOINT_TIMES,
	type ExpirationEvaluation,
	type ExpirationPolicyConfig,
	type ExpiringPosition,
	parseETTimeToMinutes,
} from "@cream/domain/schemas";
import { toDateOnly } from "@cream/domain/time";
import { buildExpiringPosition, evaluateExpirationAction } from "./evaluation.js";
import type { ExpirationMonitorState, PortfolioPosition, UnderlyingQuote } from "./types.js";

export class ExpirationMonitor {
	private state: ExpirationMonitorState;

	constructor(config: ExpirationPolicyConfig = DEFAULT_EXPIRATION_POLICY) {
		this.state = {
			lastCheck: null,
			expiringPositions: [],
			scheduledActions: [],
			config,
		};
	}

	getState(): ExpirationMonitorState {
		return { ...this.state };
	}

	updateConfig(config: Partial<ExpirationPolicyConfig>): void {
		this.state.config = { ...this.state.config, ...config };
	}

	checkPositions(
		positions: PortfolioPosition[],
		quotes: Map<string, UnderlyingQuote>,
		currentTime: string,
	): ExpirationEvaluation[] {
		if (this.state.config.disabled) {
			return [];
		}

		this.state.lastCheck = currentTime;
		const evaluations: ExpirationEvaluation[] = [];
		const expiringPositions: ExpiringPosition[] = [];

		for (const position of positions) {
			const quote = quotes.get(position.underlyingSymbol);
			if (!quote) {
				continue;
			}

			const expiringPosition = buildExpiringPosition(
				position,
				quote,
				currentTime,
				this.state.config,
			);

			if (!expiringPosition) {
				continue;
			}

			expiringPositions.push(expiringPosition);

			const evaluation = evaluateExpirationAction(expiringPosition, currentTime, this.state.config);

			if (evaluation.priority > 1) {
				evaluations.push(evaluation);
			}
		}

		this.state.expiringPositions = expiringPositions;

		return evaluations.toSorted((a, b) => b.priority - a.priority);
	}

	getExpiringWithinDTE(maxDTE: number): ExpiringPosition[] {
		return this.state.expiringPositions.filter((p) => p.dte <= maxDTE);
	}

	getPositionsInPinRisk(): ExpiringPosition[] {
		return this.state.expiringPositions.filter((p) => p.isPinRisk && p.isExpirationDay);
	}

	getForcedActions(currentTime: string): ExpirationEvaluation[] {
		const evaluations: ExpirationEvaluation[] = [];

		for (const position of this.state.expiringPositions) {
			const evaluation = evaluateExpirationAction(position, currentTime, this.state.config);

			if (evaluation.isForced) {
				evaluations.push(evaluation);
			}
		}

		return evaluations.toSorted((a, b) => b.priority - a.priority);
	}

	isExpirationFriday(currentTime: string): boolean {
		const date = new Date(currentTime);
		const dayOfWeek = date.getUTCDay();

		if (dayOfWeek !== 5) {
			return false;
		}

		const today = toDateOnly(date);
		return this.state.expiringPositions.some((p) => p.expirationDate === today);
	}

	getMinutesUntilNextCheckpoint(
		currentTime: string,
	): { checkpoint: string; minutes: number } | null {
		const date = new Date(currentTime);
		const etHour = date.getUTCHours() - 5;
		const etMinutes = date.getUTCMinutes();
		const etTimeMinutes = (etHour < 0 ? etHour + 24 : etHour) * 60 + etMinutes;

		const checkpoints: Array<{ name: string; time: string }> = [
			{ name: "AUTO_CLOSE_ITM", time: EXPIRATION_CHECKPOINT_TIMES.AUTO_CLOSE_ITM },
			{ name: "FINAL_WARNING", time: EXPIRATION_CHECKPOINT_TIMES.FINAL_WARNING },
			{ name: "FORCE_CLOSE", time: EXPIRATION_CHECKPOINT_TIMES.FORCE_CLOSE },
			{ name: "MARKET_CLOSE", time: EXPIRATION_CHECKPOINT_TIMES.MARKET_CLOSE },
		];

		for (const checkpoint of checkpoints) {
			const checkpointMinutes = parseETTimeToMinutes(checkpoint.time);
			if (etTimeMinutes < checkpointMinutes) {
				return {
					checkpoint: checkpoint.name,
					minutes: checkpointMinutes - etTimeMinutes,
				};
			}
		}

		return null;
	}
}

export function createExpirationMonitor(
	config?: Partial<ExpirationPolicyConfig>,
): ExpirationMonitor {
	const fullConfig = config
		? { ...DEFAULT_EXPIRATION_POLICY, ...config }
		: DEFAULT_EXPIRATION_POLICY;

	return new ExpirationMonitor(fullConfig);
}
