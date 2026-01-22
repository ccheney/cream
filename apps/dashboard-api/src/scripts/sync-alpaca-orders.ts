/**
 * Sync Orders from Alpaca to PostgreSQL
 *
 * One-time script to import historical orders from Alpaca.
 * Run with: cd apps/dashboard-api && CREAM_ENV=PAPER bun run src/scripts/sync-alpaca-orders.ts
 */
import { resolve } from "node:path";

// Load .env from project root before other imports that might need env vars
const envPath = resolve(import.meta.dirname, "../../../../.env");
const envFile = Bun.file(envPath);
const envContent = await envFile.text();
for (const line of envContent.split("\n")) {
	const trimmed = line.trim();
	if (trimmed && !trimmed.startsWith("#")) {
		const [key, ...valueParts] = trimmed.split("=");
		if (key && valueParts.length > 0) {
			process.env[key] = valueParts.join("=");
		}
	}
}

import { OrdersRepository } from "@cream/storage";

const _ALPACA_BASE_URL = process.env.ALPACA_BASE_URL;
const _ALPACA_KEY = process.env.ALPACA_KEY;
const _ALPACA_SECRET = process.env.ALPACA_SECRET;

if (!_ALPACA_BASE_URL || !_ALPACA_KEY || !_ALPACA_SECRET) {
	console.error("Missing ALPACA_BASE_URL, ALPACA_KEY, or ALPACA_SECRET in .env");
	process.exit(1);
}

const ALPACA_BASE_URL: string = _ALPACA_BASE_URL;
const ALPACA_KEY: string = _ALPACA_KEY;
const ALPACA_SECRET: string = _ALPACA_SECRET;

interface AlpacaOrder {
	id: string;
	client_order_id: string;
	symbol: string;
	qty: string;
	filled_qty: string;
	side: string;
	type: string;
	time_in_force: string;
	status: string;
	limit_price: string | null;
	stop_price: string | null;
	filled_avg_price: string | null;
	created_at: string;
	submitted_at: string | null;
	filled_at: string | null;
	canceled_at: string | null;
}

type StorageOrderStatus =
	| "pending"
	| "submitted"
	| "accepted"
	| "partial_fill"
	| "filled"
	| "cancelled"
	| "rejected"
	| "expired";

function mapStatus(alpacaStatus: string): StorageOrderStatus {
	switch (alpacaStatus) {
		case "new":
		case "pending_new":
			return "pending";
		case "accepted":
			return "accepted";
		case "partially_filled":
			return "partial_fill";
		case "filled":
			return "filled";
		case "canceled":
		case "pending_cancel":
			return "cancelled";
		case "rejected":
			return "rejected";
		case "expired":
		case "done_for_day":
			return "expired";
		default:
			return "submitted";
	}
}

function mapOrderType(alpacaType: string): "market" | "limit" | "stop" | "stop_limit" {
	switch (alpacaType) {
		case "limit":
			return "limit";
		case "stop":
			return "stop";
		case "stop_limit":
			return "stop_limit";
		default:
			return "market";
	}
}

function mapTimeInForce(tif: string): "day" | "gtc" | "ioc" | "fok" {
	switch (tif) {
		case "gtc":
			return "gtc";
		case "ioc":
			return "ioc";
		case "fok":
			return "fok";
		default:
			return "day";
	}
}

async function main() {
	console.log("Fetching orders from Alpaca...");

	const response = await fetch(`${ALPACA_BASE_URL}/v2/orders?status=all&limit=500`, {
		headers: {
			"APCA-API-KEY-ID": ALPACA_KEY,
			"APCA-API-SECRET-KEY": ALPACA_SECRET,
		},
	});

	if (!response.ok) {
		throw new Error(`Alpaca API error: ${response.status} ${await response.text()}`);
	}

	const alpacaOrders = (await response.json()) as AlpacaOrder[];
	console.log(`Found ${alpacaOrders.length} orders in Alpaca`);

	const ordersRepo = new OrdersRepository();
	let inserted = 0;
	let skipped = 0;

	for (const ao of alpacaOrders) {
		// Check if order already exists by broker_order_id
		const existing = await ordersRepo.findByBrokerOrderId(ao.id);

		if (existing) {
			skipped++;
			continue;
		}

		// Insert the order
		const order = await ordersRepo.create({
			symbol: ao.symbol,
			side: ao.side as "buy" | "sell",
			quantity: Number(ao.qty),
			orderType: mapOrderType(ao.type),
			limitPrice: ao.limit_price ? Number(ao.limit_price) : null,
			stopPrice: ao.stop_price ? Number(ao.stop_price) : null,
			timeInForce: mapTimeInForce(ao.time_in_force),
			environment: "PAPER",
		});

		// Update with broker order ID, status and fill info
		await ordersRepo.updateStatus(order.id, mapStatus(ao.status), ao.id);

		if (ao.filled_qty && Number(ao.filled_qty) > 0 && ao.filled_avg_price) {
			await ordersRepo.updateFill(order.id, Number(ao.filled_qty), Number(ao.filled_avg_price));
		}

		inserted++;
		console.log(`Inserted: ${ao.symbol} ${ao.side} ${ao.qty} @ ${ao.filled_avg_price || "market"}`);
	}

	console.log(`\nSync complete: ${inserted} inserted, ${skipped} already existed`);
	process.exit(0);
}

main().catch((err) => {
	console.error("Error:", err);
	process.exit(1);
});
