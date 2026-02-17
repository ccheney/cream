import type { Action } from "./decision";

/**
 * Result of mapping a decision action to broker order side.
 */
export interface BrokerOrderMapping {
	/** Broker order side (BUY or SELL) */
	side: "BUY" | "SELL";
	/** Absolute quantity for the order */
	quantity: number;
	/** Description of what this order does */
	description: string;
}

/**
 * Error when action cannot be mapped to broker order.
 */
export class ActionMappingError extends Error {
	constructor(
		message: string,
		public readonly action: Action,
		public readonly currentPosition: number,
		public readonly targetPosition: number,
	) {
		super(message);
		this.name = "ActionMappingError";
	}
}

function mapBuy(
	action: Action,
	currentPosition: number,
	targetPosition: number,
): BrokerOrderMapping {
	if (currentPosition !== 0) {
		throw new ActionMappingError(
			`BUY action requires flat position (currentPosition=${currentPosition})`,
			action,
			currentPosition,
			targetPosition,
		);
	}

	if (targetPosition <= 0) {
		throw new ActionMappingError(
			`BUY action requires positive target position (targetPosition=${targetPosition})`,
			action,
			currentPosition,
			targetPosition,
		);
	}

	return {
		side: "BUY",
		quantity: targetPosition,
		description: `Establish long position of ${targetPosition} units`,
	};
}

function mapSell(
	action: Action,
	currentPosition: number,
	targetPosition: number,
): BrokerOrderMapping {
	if (currentPosition !== 0) {
		throw new ActionMappingError(
			`SELL action requires flat position (currentPosition=${currentPosition})`,
			action,
			currentPosition,
			targetPosition,
		);
	}

	if (targetPosition >= 0) {
		throw new ActionMappingError(
			`SELL action requires negative target position (targetPosition=${targetPosition})`,
			action,
			currentPosition,
			targetPosition,
		);
	}

	const quantity = Math.abs(targetPosition);
	return {
		side: "SELL",
		quantity,
		description: `Establish short position of ${quantity} units`,
	};
}

function mapIncrease(
	action: Action,
	currentPosition: number,
	targetPosition: number,
	positionDelta: number,
): BrokerOrderMapping {
	if (currentPosition === 0) {
		throw new ActionMappingError(
			`INCREASE action requires existing position (currentPosition=${currentPosition})`,
			action,
			currentPosition,
			targetPosition,
		);
	}

	const isLong = currentPosition > 0;
	const isTargetSameDirection = isLong
		? targetPosition > currentPosition
		: targetPosition < currentPosition;

	if (!isTargetSameDirection) {
		throw new ActionMappingError(
			"INCREASE action requires target to extend position in same direction",
			action,
			currentPosition,
			targetPosition,
		);
	}

	const quantity = Math.abs(positionDelta);
	return {
		side: isLong ? "BUY" : "SELL",
		quantity,
		description: isLong
			? `Add ${quantity} units to long position`
			: `Add ${quantity} units to short position`,
	};
}

function mapReduce(
	action: Action,
	currentPosition: number,
	targetPosition: number,
	positionDelta: number,
): BrokerOrderMapping {
	if (currentPosition === 0) {
		throw new ActionMappingError(
			`REDUCE action requires existing position (currentPosition=${currentPosition})`,
			action,
			currentPosition,
			targetPosition,
		);
	}

	const isLong = currentPosition > 0;
	const isReducing = isLong
		? targetPosition < currentPosition && targetPosition >= 0
		: targetPosition > currentPosition && targetPosition <= 0;

	if (!isReducing) {
		throw new ActionMappingError(
			"REDUCE action requires target to decrease position magnitude towards flat",
			action,
			currentPosition,
			targetPosition,
		);
	}

	const quantity = Math.abs(positionDelta);
	return {
		side: isLong ? "SELL" : "BUY",
		quantity,
		description: isLong
			? `Reduce long position by ${quantity} units`
			: `Cover short position by ${quantity} units`,
	};
}

/**
 * Map a decision action to a broker order side.
 */
export function mapActionToBrokerOrder(
	action: Action,
	currentPosition: number,
	targetPosition: number,
): BrokerOrderMapping | null {
	const positionDelta = targetPosition - currentPosition;

	switch (action) {
		case "HOLD":
		case "NO_TRADE":
			return null;
		case "BUY":
			return mapBuy(action, currentPosition, targetPosition);
		case "SELL":
			return mapSell(action, currentPosition, targetPosition);
		case "INCREASE":
			return mapIncrease(action, currentPosition, targetPosition, positionDelta);
		case "REDUCE":
			return mapReduce(action, currentPosition, targetPosition, positionDelta);
		default:
			throw new ActionMappingError(
				`Unknown action: ${action}`,
				action,
				currentPosition,
				targetPosition,
			);
	}
}

function deriveActionFromLongPosition(currentPosition: number, targetPosition: number): Action {
	if (targetPosition > currentPosition) {
		return "INCREASE";
	}

	if (targetPosition >= 0) {
		return "REDUCE";
	}

	throw new ActionMappingError(
		"Cannot flip from long to short in single action",
		"REDUCE",
		currentPosition,
		targetPosition,
	);
}

function deriveActionFromShortPosition(currentPosition: number, targetPosition: number): Action {
	if (targetPosition < currentPosition) {
		return "INCREASE";
	}

	if (targetPosition <= 0) {
		return "REDUCE";
	}

	throw new ActionMappingError(
		"Cannot flip from short to long in single action",
		"REDUCE",
		currentPosition,
		targetPosition,
	);
}

/**
 * Derive the action from current and target positions.
 */
export function deriveActionFromPositions(
	currentPosition: number,
	targetPosition: number,
): Action | null {
	if (currentPosition === targetPosition) {
		return currentPosition === 0 ? "NO_TRADE" : "HOLD";
	}

	if (currentPosition === 0) {
		return targetPosition > 0 ? "BUY" : "SELL";
	}

	return currentPosition > 0
		? deriveActionFromLongPosition(currentPosition, targetPosition)
		: deriveActionFromShortPosition(currentPosition, targetPosition);
}
