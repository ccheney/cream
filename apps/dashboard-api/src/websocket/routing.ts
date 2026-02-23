/**
 * Message Routing
 *
 * Routes incoming WebSocket messages to appropriate handlers.
 */

import { requireEnv } from "@cream/domain";
import { createScannerClient } from "@cream/domain/grpc";
import {
	CHANNELS,
	type Channel,
	type ClientMessage,
	ClientMessageSchema,
	type PingMessage,
	type RequestStateMessage,
	type SubscribeMessage,
	type UnsubscribeMessage,
} from "@cream/domain/websocket";
import { getCachedQuote } from "../streaming/market-data.js";
import { getConnectionCount, sendError, sendMessage } from "./channels.js";
import {
	handleAcknowledgeAlert,
	handleAgentsState,
	handleAlertsState,
	handleOrdersState,
	handlePortfolioState,
	handleSubscribeOptions,
	handleSubscribeSymbols,
	handleUnsubscribeOptions,
	handleUnsubscribeSymbols,
} from "./handlers/index.js";
import type { WebSocketWithMetadata } from "./types.js";

function requireStreamProxyUrl(): string {
	const streamProxyUrl = Bun.env.STREAM_PROXY_URL;
	if (!streamProxyUrl) {
		throw new Error("STREAM_PROXY_URL environment variable is required.");
	}
	return streamProxyUrl;
}

const scannerGrpcClient = createScannerClient(requireStreamProxyUrl(), {
	enableLogging: false,
	maxRetries: 1,
});

/**
 * Handle subscribe message.
 */
function handleSubscribe(ws: WebSocketWithMetadata, message: SubscribeMessage): void {
	const metadata = ws.data;

	for (const channelName of message.channels) {
		if (CHANNELS.includes(channelName as Channel)) {
			metadata.channels.add(channelName as Channel);
		} else {
			sendError(ws, `Invalid channel: ${channelName}`);
		}
	}

	sendMessage(ws, {
		type: "subscribed",
		channels: Array.from(metadata.channels),
	});
}

/**
 * Handle unsubscribe message.
 */
function handleUnsubscribe(ws: WebSocketWithMetadata, message: UnsubscribeMessage): void {
	const metadata = ws.data;

	for (const channelName of message.channels) {
		metadata.channels.delete(channelName as Channel);
	}

	sendMessage(ws, {
		type: "unsubscribed",
		channels: message.channels,
	});
}

/**
 * Handle ping message.
 */
function handlePing(ws: WebSocketWithMetadata, _message: PingMessage): void {
	const metadata = ws.data;
	metadata.lastPing = new Date();

	sendMessage(ws, {
		type: "pong",
		timestamp: new Date().toISOString(),
	});
}

function sendSystemState(ws: WebSocketWithMetadata): void {
	sendMessage(ws, {
		type: "system_status",
		data: {
			health: "healthy",
			uptimeSeconds: Math.floor(process.uptime()),
			activeConnections: getConnectionCount(),
			services: {},
			environment: requireEnv(),
			timestamp: new Date().toISOString(),
		},
	});
}

function sendCachedQuoteState(ws: WebSocketWithMetadata): void {
	const metadata = ws.data;
	for (const symbol of metadata.symbols) {
		const cached = getCachedQuote(symbol);
		if (!cached) {
			continue;
		}
		sendMessage(ws, {
			type: "quote",
			data: {
				symbol,
				bid: cached.bid,
				ask: cached.ask,
				last: cached.last,
				volume: cached.volume,
				timestamp: cached.timestamp.toISOString(),
			},
		});
	}
}

function sendDefaultRequestedChannelState(
	ws: WebSocketWithMetadata,
	message: RequestStateMessage,
): void {
	sendMessage(ws, {
		type: "subscribed",
		channels: [message.channel],
	});
}

function toScannerStatusMessage(
	status: Awaited<ReturnType<typeof scannerGrpcClient.getScannerStatus>>["data"],
) {
	return {
		type: "scanner_status" as const,
		data: {
			active: status.active,
			symbolsTracked: status.symbolsTracked,
			totalAlerts: Number(status.totalAlerts),
			alertsLastHour: Number(status.alertsLastHour),
			timestamp: new Date().toISOString(),
		},
	};
}

async function sendScannerState(ws: WebSocketWithMetadata): Promise<void> {
	try {
		const status = await scannerGrpcClient.getScannerStatus();
		sendMessage(ws, toScannerStatusMessage(status.data));
	} catch (error) {
		sendError(
			ws,
			`Failed to fetch scanner status: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Handle request state message.
 * Sends current state snapshot for the requested channel.
 */
async function handleRequestState(
	ws: WebSocketWithMetadata,
	message: RequestStateMessage,
): Promise<void> {
	switch (message.channel) {
		case "system": {
			sendSystemState(ws);
			break;
		}
		case "portfolio": {
			await handlePortfolioState(ws);
			break;
		}
		case "alerts": {
			await handleAlertsState(ws);
			break;
		}
		case "orders": {
			await handleOrdersState(ws);
			break;
		}
		case "quotes": {
			sendCachedQuoteState(ws);
			break;
		}
		case "agents": {
			await handleAgentsState(ws);
			break;
		}
		case "scanner": {
			await sendScannerState(ws);
			break;
		}
		default: {
			sendDefaultRequestedChannelState(ws, message);
		}
	}
}

/**
 * Route incoming message to appropriate handler.
 */
export function handleMessage(ws: WebSocketWithMetadata, rawMessage: string): void {
	let message: ClientMessage;

	try {
		const parsed = JSON.parse(rawMessage);
		const result = ClientMessageSchema.safeParse(parsed);

		if (!result.success) {
			sendError(ws, `Invalid message format: ${result.error.message}`);
			return;
		}

		message = result.data;
	} catch {
		sendError(ws, "Invalid JSON format");
		return;
	}

	ws.data.lastPing = new Date();

	switch (message.type) {
		case "subscribe":
			handleSubscribe(ws, message);
			break;
		case "unsubscribe":
			handleUnsubscribe(ws, message);
			break;
		case "subscribe_symbols":
			handleSubscribeSymbols(ws, message);
			break;
		case "unsubscribe_symbols":
			handleUnsubscribeSymbols(ws, message);
			break;
		case "subscribe_options":
			handleSubscribeOptions(ws, message);
			break;
		case "unsubscribe_options":
			handleUnsubscribeOptions(ws, message);
			break;
		case "ping":
			handlePing(ws, message);
			break;
		case "request_state":
			handleRequestState(ws, message);
			break;
		case "acknowledge_alert":
			handleAcknowledgeAlert(ws, message);
			break;
		default:
			sendError(ws, `Unknown message type: ${(message as ClientMessage).type}`);
	}
}
