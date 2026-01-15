/**
 * Expiration Monitoring Types
 */

import type {
	ExpirationEvaluation,
	ExpirationPolicyConfig,
	ExpiringPosition,
} from "@cream/domain/schemas";

export interface PortfolioPosition {
	positionId: string;
	osiSymbol: string;
	underlyingSymbol: string;
	expirationDate: string;
	strike: number;
	right: "CALL" | "PUT";
	quantity: number;
	isSpread: boolean;
	isUncovered: boolean;
}

export interface UnderlyingQuote {
	symbol: string;
	price: number;
	timestamp: string;
}

export interface ScheduledExpirationAction {
	position: ExpiringPosition;
	evaluation: ExpirationEvaluation;
	scheduledTime: string;
	executed: boolean;
}

export interface ExpirationMonitorState {
	lastCheck: string | null;
	expiringPositions: ExpiringPosition[];
	scheduledActions: ScheduledExpirationAction[];
	config: ExpirationPolicyConfig;
}
