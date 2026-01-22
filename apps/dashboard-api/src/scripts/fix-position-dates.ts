/**
 * Fix Position Dates from Alpaca Orders
 *
 * Updates position `openedAt` timestamps with actual fill dates from Alpaca.
 * Run with: cd apps/dashboard-api && bun run src/scripts/fix-position-dates.ts
 */
import { createNodeLogger } from "@cream/logger";
import { PositionsRepository } from "@cream/storage";

const log = createNodeLogger({
	service: "fix-position-dates",
	level: "info",
	environment: Bun.env.CREAM_ENV ?? "PAPER",
	pretty: true,
});

const _ALPACA_BASE_URL = Bun.env.ALPACA_BASE_URL;
const _ALPACA_KEY = Bun.env.ALPACA_KEY;
const _ALPACA_SECRET = Bun.env.ALPACA_SECRET;
const _CREAM_ENV = Bun.env.CREAM_ENV ?? "PAPER";

if (!_ALPACA_BASE_URL || !_ALPACA_KEY || !_ALPACA_SECRET) {
	log.fatal("Missing ALPACA_BASE_URL, ALPACA_KEY, or ALPACA_SECRET in .env");
	process.exit(1);
}

const ALPACA_BASE_URL: string = _ALPACA_BASE_URL;
const ALPACA_KEY: string = _ALPACA_KEY;
const ALPACA_SECRET: string = _ALPACA_SECRET;
const CREAM_ENV: string = _CREAM_ENV;

interface AlpacaOrder {
	id: string;
	client_order_id: string;
	symbol: string;
	side: string;
	type: string;
	qty: string;
	filled_qty: string;
	filled_avg_price: string;
	status: string;
	created_at: string;
	updated_at: string;
	submitted_at: string;
	filled_at: string | null;
}

async function main() {
	log.info({ environment: CREAM_ENV }, "Fetching filled orders from Alpaca");

	// Fetch all filled orders
	const response = await fetch(`${ALPACA_BASE_URL}/v2/orders?status=filled&limit=500`, {
		headers: {
			"APCA-API-KEY-ID": ALPACA_KEY,
			"APCA-API-SECRET-KEY": ALPACA_SECRET,
		},
	});

	if (!response.ok) {
		throw new Error(`Alpaca API error: ${response.status} ${await response.text()}`);
	}

	const orders = (await response.json()) as AlpacaOrder[];
	log.info({ count: orders.length }, "Found filled orders in Alpaca");

	// Group by symbol and find earliest fill date
	// Long positions are opened by buy orders, short positions by sell orders
	const earliestFillBySymbol = new Map<string, Date>();

	for (const order of orders) {
		if (!order.filled_at) continue;

		const filledAt = new Date(order.filled_at);
		const existing = earliestFillBySymbol.get(order.symbol);

		if (!existing || filledAt < existing) {
			earliestFillBySymbol.set(order.symbol, filledAt);
		}
	}

	log.info({ symbols: Array.from(earliestFillBySymbol.keys()) }, "Found earliest fill dates");

	// Update positions in database
	const positionsRepo = new PositionsRepository();
	const dbPositions = await positionsRepo.findOpen(CREAM_ENV);
	let updated = 0;

	for (const position of dbPositions) {
		const fillDate = earliestFillBySymbol.get(position.symbol);
		if (!fillDate) {
			log.warn({ symbol: position.symbol }, "No fill date found for position");
			continue;
		}

		await positionsRepo.updateOpenedAt(position.id, fillDate);
		updated++;
		log.info(
			{ symbol: position.symbol, openedAt: fillDate.toISOString() },
			"Updated position openedAt",
		);
	}

	log.info({ updated }, "Fix complete");
	process.exit(0);
}

main().catch((err) => {
	log.fatal({ error: err instanceof Error ? err.message : String(err) }, "Fix failed");
	process.exit(1);
});
