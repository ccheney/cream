/**
 * Channel Management
 *
 * Connection tracking, broadcasting, and channel subscription logic.
 */

import type { Channel, ServerMessage } from "@cream/domain/websocket";
import log from "../logger.js";
import type { ConnectionMetadata, WebSocketWithMetadata } from "./types.js";
import { HEARTBEAT_INTERVAL_MS, STALE_CONNECTION_TIMEOUT_MS } from "./types.js";

const connections = new Map<string, WebSocketWithMetadata>();

let heartbeatInterval: Timer | null = null;

/**
 * Generate unique connection ID.
 */
export function generateConnectionId(): string {
	return `conn-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Create metadata for a new connection.
 */
export function createConnectionMetadata(userId: string): ConnectionMetadata {
	return {
		connectionId: generateConnectionId(),
		userId,
		connectedAt: new Date(),
		lastPing: new Date(),
		channels: new Set(),
		symbols: new Set(),
		contracts: new Set(),
	};
}

/**
 * Get total connection count.
 */
export function getConnectionCount(): number {
	return connections.size;
}

/**
 * Get all connection IDs.
 */
export function getConnectionIds(): string[] {
	return Array.from(connections.keys());
}

/**
 * Get connection by ID.
 */
export function getConnection(connectionId: string): WebSocketWithMetadata | undefined {
	return connections.get(connectionId);
}

/**
 * Register a new connection.
 */
export function addConnection(ws: WebSocketWithMetadata): void {
	connections.set(ws.data.connectionId, ws);
}

/**
 * Remove a connection.
 */
export function removeConnection(connectionId: string): void {
	connections.delete(connectionId);
}

/**
 * Send message to a single connection.
 */
export function sendMessage(
	ws: WebSocketWithMetadata,
	message: ServerMessage | Record<string, unknown>
): boolean {
	try {
		ws.send(JSON.stringify(message));
		return true;
	} catch {
		return false;
	}
}

/**
 * Send error message to connection.
 */
export function sendError(ws: WebSocketWithMetadata, message: string): void {
	sendMessage(ws, {
		type: "error",
		code: "ERROR",
		message,
	});
}

/**
 * Broadcast to all connections subscribed to a channel.
 */
export function broadcast(channel: Channel, message: ServerMessage): number {
	let sent = 0;
	const deadConnections: string[] = [];

	for (const [connectionId, ws] of connections) {
		if (ws.data.channels.has(channel)) {
			if (sendMessage(ws, message)) {
				sent++;
			} else {
				deadConnections.push(connectionId);
			}
		}
	}

	for (const connectionId of deadConnections) {
		removeConnection(connectionId);
	}

	return sent;
}

/**
 * Broadcast to connections subscribed to a specific symbol.
 */
export function broadcastQuote(symbol: string, message: ServerMessage): number {
	let sent = 0;
	const deadConnections: string[] = [];
	const upperSymbol = symbol.toUpperCase();

	for (const [connectionId, ws] of connections) {
		if (ws.data.channels.has("quotes") && ws.data.symbols.has(upperSymbol)) {
			if (sendMessage(ws, message)) {
				sent++;
			} else {
				deadConnections.push(connectionId);
			}
		}
	}

	for (const connectionId of deadConnections) {
		removeConnection(connectionId);
	}

	return sent;
}

/**
 * Broadcast options quote to connections subscribed to a specific contract.
 */
export function broadcastOptionsQuote(contract: string, message: ServerMessage): number {
	let sent = 0;
	const deadConnections: string[] = [];
	const upperContract = contract.toUpperCase();

	for (const [connectionId, ws] of connections) {
		const hasOptionsChannel = ws.data.channels.has("options");
		const hasContract = ws.data.contracts.has(upperContract);

		if (hasOptionsChannel && hasContract) {
			if (sendMessage(ws, message)) {
				sent++;
			} else {
				deadConnections.push(connectionId);
			}
		}
	}

	for (const connectionId of deadConnections) {
		removeConnection(connectionId);
	}

	return sent;
}

/**
 * Broadcast trade to connections subscribed to a specific symbol.
 */
export function broadcastTrade(symbol: string, message: ServerMessage): number {
	let sent = 0;
	const deadConnections: string[] = [];
	const upperSymbol = symbol.toUpperCase();

	for (const [connectionId, ws] of connections) {
		if (ws.data.channels.has("trades") && ws.data.symbols.has(upperSymbol)) {
			if (sendMessage(ws, message)) {
				sent++;
			} else {
				deadConnections.push(connectionId);
			}
		}
	}

	for (const connectionId of deadConnections) {
		removeConnection(connectionId);
	}

	return sent;
}

/**
 * Broadcast indicator to connections subscribed to a specific symbol.
 */
export function broadcastIndicator(symbol: string, message: ServerMessage): number {
	let sent = 0;
	const deadConnections: string[] = [];
	const upperSymbol = symbol.toUpperCase();

	for (const [connectionId, ws] of connections) {
		if (ws.data.channels.has("indicators") && ws.data.symbols.has(upperSymbol)) {
			if (sendMessage(ws, message)) {
				sent++;
			} else {
				deadConnections.push(connectionId);
			}
		}
	}

	for (const connectionId of deadConnections) {
		removeConnection(connectionId);
	}

	return sent;
}

/**
 * Broadcast aggregate to connections subscribed to a specific symbol.
 * Reuses 'quotes' channel because chart subscribers use the same symbol subscription logic.
 */
export function broadcastAggregate(symbol: string, message: ServerMessage): number {
	let sent = 0;
	const deadConnections: string[] = [];
	const upperSymbol = symbol.toUpperCase();

	for (const [connectionId, ws] of connections) {
		if (ws.data.channels.has("quotes") && ws.data.symbols.has(upperSymbol)) {
			if (sendMessage(ws, message)) {
				sent++;
			} else {
				deadConnections.push(connectionId);
			}
		}
	}

	for (const connectionId of deadConnections) {
		removeConnection(connectionId);
	}

	return sent;
}

/**
 * Broadcast to all connections.
 */
export function broadcastAll(message: ServerMessage): number {
	let sent = 0;
	const deadConnections: string[] = [];

	for (const [connectionId, ws] of connections) {
		if (sendMessage(ws, message)) {
			sent++;
		} else {
			deadConnections.push(connectionId);
		}
	}

	for (const connectionId of deadConnections) {
		removeConnection(connectionId);
	}

	return sent;
}

/**
 * Broadcast cycle progress to connections subscribed to cycles channel.
 */
export function broadcastCycleProgress(message: ServerMessage): number {
	return broadcast("cycles", message);
}

/**
 * Broadcast cycle result to connections subscribed to cycles channel.
 */
export function broadcastCycleResult(message: ServerMessage): number {
	return broadcast("cycles", message);
}

/**
 * Broadcast agent output to connections subscribed to cycles channel.
 */
export function broadcastAgentOutput(message: ServerMessage): number {
	return broadcast("cycles", message);
}

/**
 * Broadcast agent tool call to connections subscribed to cycles channel.
 */
export function broadcastAgentToolCall(message: ServerMessage): number {
	return broadcast("cycles", message);
}

/**
 * Broadcast agent tool result to connections subscribed to cycles channel.
 */
export function broadcastAgentToolResult(message: ServerMessage): number {
	return broadcast("cycles", message);
}

/**
 * Broadcast agent reasoning to connections subscribed to cycles channel.
 */
export function broadcastAgentReasoning(message: ServerMessage): number {
	return broadcast("cycles", message);
}

/**
 * Broadcast agent text delta to connections subscribed to cycles channel.
 */
export function broadcastAgentTextDelta(message: ServerMessage): number {
	return broadcast("cycles", message);
}

/**
 * Broadcast agent source to connections subscribed to cycles channel.
 */
export function broadcastAgentSource(message: ServerMessage): number {
	return broadcast("cycles", message);
}

/**
 * Broadcast decision plan to connections subscribed to cycles channel.
 */
export function broadcastDecisionPlan(message: ServerMessage): number {
	return broadcast("cycles", message);
}

/**
 * Broadcast phase start event to connections subscribed to cycles channel.
 */
export function broadcastPhaseStart(message: ServerMessage): number {
	return broadcast("cycles", message);
}

/**
 * Broadcast phase complete event to connections subscribed to cycles channel.
 */
export function broadcastPhaseComplete(message: ServerMessage): number {
	return broadcast("cycles", message);
}

/**
 * Broadcast data flow event to connections subscribed to cycles channel.
 */
export function broadcastDataFlow(message: ServerMessage): number {
	return broadcast("cycles", message);
}

/**
 * Broadcast agent status to connections subscribed to agents channel.
 */
export function broadcastAgentStatus(message: ServerMessage): number {
	return broadcast("agents", message);
}

/**
 * Broadcast filings sync progress to connections subscribed to filings channel.
 */
export function broadcastFilingsSyncProgress(message: ServerMessage): number {
	return broadcast("filings", message);
}

/**
 * Broadcast filings sync completion to connections subscribed to filings channel.
 */
export function broadcastFilingsSyncComplete(message: ServerMessage): number {
	return broadcast("filings", message);
}

/**
 * Broadcast account update to connections subscribed to portfolio channel.
 */
export function broadcastAccountUpdate(message: ServerMessage): number {
	return broadcast("portfolio", message);
}

/**
 * Broadcast position update to connections subscribed to portfolio channel.
 */
export function broadcastPositionUpdate(message: ServerMessage): number {
	return broadcast("portfolio", message);
}

/**
 * Broadcast order update to connections subscribed to orders channel.
 */
export function broadcastOrderUpdate(message: ServerMessage): number {
	return broadcast("orders", message);
}

/**
 * Broadcast synthesis progress to connections subscribed to synthesis channel.
 */
export function broadcastSynthesisProgress(message: ServerMessage): number {
	return broadcast("synthesis", message);
}

/**
 * Broadcast synthesis complete to connections subscribed to synthesis channel.
 */
export function broadcastSynthesisComplete(message: ServerMessage): number {
	return broadcast("synthesis", message);
}

/**
 * Broadcast worker run update to connections subscribed to workers channel.
 */
export function broadcastWorkerRunUpdate(message: ServerMessage): number {
	return broadcast("workers", message);
}

/**
 * Server-initiated ping to all connections.
 */
export function pingAllConnections(): void {
	const now = new Date();

	for (const [connectionId, ws] of connections) {
		try {
			ws.send(JSON.stringify({ type: "ping", timestamp: now.toISOString() }));
		} catch {
			removeConnection(connectionId);
		}
	}
}

/**
 * Close stale connections that haven't responded.
 */
export function closeStaleConnections(): number {
	const now = Date.now();
	let closed = 0;

	for (const [connectionId, ws] of connections) {
		const lastPing = ws.data.lastPing.getTime();
		if (now - lastPing > STALE_CONNECTION_TIMEOUT_MS) {
			try {
				ws.close(1000, "Connection timed out");
			} catch {
				// Already closed
			}
			removeConnection(connectionId);
			closed++;
		}
	}

	if (closed > 0) {
		log.info(
			{ closedCount: closed, remainingConnections: connections.size },
			"Closed stale WebSocket connections"
		);
	}

	return closed;
}

/**
 * Start heartbeat interval.
 */
export function startHeartbeat(): void {
	if (heartbeatInterval) {
		return;
	}

	heartbeatInterval = setInterval(() => {
		closeStaleConnections();
		pingAllConnections();
	}, HEARTBEAT_INTERVAL_MS);
}

/**
 * Stop heartbeat interval.
 */
export function stopHeartbeat(): void {
	if (heartbeatInterval) {
		clearInterval(heartbeatInterval);
		heartbeatInterval = null;
	}
}

/**
 * Close all connections gracefully.
 */
export function closeAllConnections(reason = "Server shutting down"): void {
	const connectionCount = connections.size;
	log.info({ connectionCount, reason }, "Closing all WebSocket connections");

	for (const [, ws] of connections) {
		try {
			ws.close(1001, reason);
		} catch {
			// Already closed
		}
	}

	connections.clear();
	stopHeartbeat();
	log.info("All WebSocket connections closed");
}
