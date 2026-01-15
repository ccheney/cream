/**
 * WebSocket Types
 *
 * Core types for WebSocket connections, metadata, and authentication.
 */

import type { ServerWebSocket } from "bun";
import type { Channel } from "@cream/domain/websocket";

/**
 * Connection metadata attached to each WebSocket.
 */
export interface ConnectionMetadata {
	connectionId: string;
	userId: string;
	connectedAt: Date;
	lastPing: Date;
	channels: Set<Channel>;
	symbols: Set<string>;
	contracts: Set<string>;
}

/**
 * WebSocket with connection metadata.
 */
export type WebSocketWithMetadata = ServerWebSocket<ConnectionMetadata>;

/**
 * Authentication validation result.
 */
export interface AuthResult {
	valid: boolean;
	userId?: string;
	error?: string;
}

/**
 * Heartbeat interval in milliseconds (30 seconds).
 */
export const HEARTBEAT_INTERVAL_MS = 30000;

/**
 * Stale connection timeout in milliseconds (60 seconds).
 */
export const STALE_CONNECTION_TIMEOUT_MS = 60000;
