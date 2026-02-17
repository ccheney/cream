import { decode as msgpackDecode } from "@msgpack/msgpack";

import type { AlpacaWsData } from "./alpaca-websocket.schemas";

function parseJson(text: string): unknown[] {
	try {
		const parsed = JSON.parse(text);
		return Array.isArray(parsed) ? parsed : [parsed];
	} catch {
		return [];
	}
}

function toBytes(data: AlpacaWsData): Uint8Array | null {
	if (data instanceof ArrayBuffer) {
		return new Uint8Array(data);
	}
	if (Buffer.isBuffer(data)) {
		return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	}
	return null;
}

function decodeMsgpack(bytes: Uint8Array): unknown[] {
	try {
		const decoded = msgpackDecode(bytes);
		return Array.isArray(decoded) ? decoded : [decoded];
	} catch {
		return [];
	}
}

function parseMsgpackFallback(data: AlpacaWsData, bytes: Uint8Array | null): unknown[] {
	if (bytes) {
		const decoded = decodeMsgpack(bytes);
		if (decoded.length > 0) {
			return decoded;
		}
		return parseJson(new TextDecoder().decode(bytes));
	}
	if (typeof data === "string") {
		const fromJson = parseJson(data);
		if (fromJson.length > 0) {
			return fromJson;
		}
		return decodeMsgpack(new TextEncoder().encode(data));
	}
	return [];
}

export function parseIncomingMessages(data: AlpacaWsData, usesMsgpack: boolean): unknown[] {
	const bytes = toBytes(data);
	if (usesMsgpack) {
		return parseMsgpackFallback(data, bytes);
	}
	if (typeof data === "string") {
		return parseJson(data);
	}
	if (bytes) {
		return parseJson(new TextDecoder().decode(bytes));
	}
	return [];
}
