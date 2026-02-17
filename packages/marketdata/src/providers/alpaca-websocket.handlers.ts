import {
	AlpacaWsBarMessageSchema,
	AlpacaWsErrorMessageSchema,
	type AlpacaWsEvent,
	AlpacaWsNewsMessageSchema,
	AlpacaWsQuoteMessageSchema,
	AlpacaWsStatusMessageSchema,
	AlpacaWsSubscriptionMessageSchema,
	AlpacaWsTradeMessageSchema,
} from "./alpaca-websocket.schemas";

export type ParsedWsMessage =
	| { kind: "connected" }
	| { kind: "authenticated" }
	| { kind: "event"; event: AlpacaWsEvent };

function parseSuccessMessage(msgObj: Record<string, unknown>): ParsedWsMessage | null {
	if (msgObj.T !== "success") {
		return null;
	}
	if (msgObj.msg === "connected") {
		return { kind: "connected" };
	}
	if (msgObj.msg === "authenticated") {
		return { kind: "authenticated" };
	}
	return null;
}

function parseErrorEvent(msgObj: Record<string, unknown>): ParsedWsMessage | null {
	if (msgObj.T !== "error") {
		return null;
	}
	const parsed = AlpacaWsErrorMessageSchema.safeParse(msgObj);
	if (!parsed.success) {
		return null;
	}
	return {
		kind: "event",
		event: {
			type: "error",
			code: parsed.data.code,
			message: parsed.data.msg,
		},
	};
}

function parseSubscriptionEvent(msgObj: Record<string, unknown>): ParsedWsMessage | null {
	if (msgObj.T !== "subscription") {
		return null;
	}
	const parsed = AlpacaWsSubscriptionMessageSchema.safeParse(msgObj);
	if (!parsed.success) {
		return null;
	}
	return {
		kind: "event",
		event: {
			type: "subscribed",
			subscriptions: parsed.data,
		},
	};
}

function parseQuoteEvent(msgObj: Record<string, unknown>): ParsedWsMessage | null {
	if (msgObj.T !== "q") {
		return null;
	}
	const parsed = AlpacaWsQuoteMessageSchema.safeParse(msgObj);
	return parsed.success ? { kind: "event", event: { type: "quote", message: parsed.data } } : null;
}

function parseTradeEvent(msgObj: Record<string, unknown>): ParsedWsMessage | null {
	if (msgObj.T !== "t") {
		return null;
	}
	const parsed = AlpacaWsTradeMessageSchema.safeParse(msgObj);
	return parsed.success ? { kind: "event", event: { type: "trade", message: parsed.data } } : null;
}

function parseBarEvent(msgObj: Record<string, unknown>): ParsedWsMessage | null {
	if (msgObj.T !== "b" && msgObj.T !== "d" && msgObj.T !== "u") {
		return null;
	}
	const parsed = AlpacaWsBarMessageSchema.safeParse(msgObj);
	return parsed.success ? { kind: "event", event: { type: "bar", message: parsed.data } } : null;
}

function parseStatusEvent(msgObj: Record<string, unknown>): ParsedWsMessage | null {
	if (msgObj.T !== "s") {
		return null;
	}
	const parsed = AlpacaWsStatusMessageSchema.safeParse(msgObj);
	return parsed.success ? { kind: "event", event: { type: "status", message: parsed.data } } : null;
}

function parseNewsEvent(msgObj: Record<string, unknown>): ParsedWsMessage | null {
	if (msgObj.T !== "n") {
		return null;
	}
	const parsed = AlpacaWsNewsMessageSchema.safeParse(msgObj);
	return parsed.success ? { kind: "event", event: { type: "news", message: parsed.data } } : null;
}

export function parseWsMessage(msgObj: Record<string, unknown>): ParsedWsMessage | null {
	return (
		parseSuccessMessage(msgObj) ??
		parseErrorEvent(msgObj) ??
		parseSubscriptionEvent(msgObj) ??
		parseQuoteEvent(msgObj) ??
		parseTradeEvent(msgObj) ??
		parseBarEvent(msgObj) ??
		parseStatusEvent(msgObj) ??
		parseNewsEvent(msgObj)
	);
}
