/**
 * Sync Positions from Alpaca to PostgreSQL
 *
 * Imports open positions from Alpaca and creates/updates them in the database.
 * Run with: cd apps/dashboard-api && bun run src/scripts/sync-alpaca-positions.ts
 *
 * Requires .env to be loaded (uses Bun's automatic .env loading from project root).
 */
import { createNodeLogger } from "@cream/logger";
import { DecisionsRepository, PositionsRepository, ThesisStateRepository } from "@cream/storage";

const log = createNodeLogger({
	service: "sync-alpaca-positions",
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

interface AlpacaPosition {
	asset_id: string;
	symbol: string;
	exchange: string;
	asset_class: string;
	avg_entry_price: string;
	qty: string;
	side: string;
	market_value: string;
	cost_basis: string;
	unrealized_pl: string;
	unrealized_plpc: string;
	unrealized_intraday_pl: string;
	unrealized_intraday_plpc: string;
	current_price: string;
	lastday_price: string;
	change_today: string;
}

interface AlpacaOrder {
	id: string;
	symbol: string;
	side: string;
	qty: string;
	filled_qty: string;
	filled_avg_price: string | null;
	status: string;
	filled_at: string | null;
}

async function main() {
	log.info({ environment: CREAM_ENV }, "Fetching positions and recent orders from Alpaca");

	// Fetch positions and recent filled orders in parallel
	const [positionsResponse, ordersResponse] = await Promise.all([
		fetch(`${ALPACA_BASE_URL}/v2/positions`, {
			headers: {
				"APCA-API-KEY-ID": ALPACA_KEY,
				"APCA-API-SECRET-KEY": ALPACA_SECRET,
			},
		}),
		fetch(`${ALPACA_BASE_URL}/v2/orders?status=closed&limit=200&direction=desc`, {
			headers: {
				"APCA-API-KEY-ID": ALPACA_KEY,
				"APCA-API-SECRET-KEY": ALPACA_SECRET,
			},
		}),
	]);

	if (!positionsResponse.ok) {
		throw new Error(
			`Alpaca positions API error: ${positionsResponse.status} ${await positionsResponse.text()}`,
		);
	}
	if (!ordersResponse.ok) {
		throw new Error(
			`Alpaca orders API error: ${ordersResponse.status} ${await ordersResponse.text()}`,
		);
	}

	const alpacaPositions = (await positionsResponse.json()) as AlpacaPosition[];
	const alpacaOrders = (await ordersResponse.json()) as AlpacaOrder[];
	log.info(
		{ positions: alpacaPositions.length, orders: alpacaOrders.length },
		"Fetched from Alpaca",
	);

	// Build a map of symbol -> most recent exit order (for closing positions)
	// Exit order is: sell for long positions, buy for short positions
	const recentExitOrders = new Map<string, AlpacaOrder>();
	for (const order of alpacaOrders) {
		if (order.status === "filled" && order.filled_avg_price) {
			// Only store the most recent (first in desc order)
			if (!recentExitOrders.has(order.symbol)) {
				recentExitOrders.set(order.symbol, order);
			}
		}
	}

	const positionsRepo = new PositionsRepository();
	const decisionsRepo = new DecisionsRepository();
	const thesisRepo = new ThesisStateRepository();
	let created = 0;
	let updated = 0;
	let skipped = 0;

	for (const ap of alpacaPositions) {
		const existing = await positionsRepo.findBySymbol(ap.symbol, CREAM_ENV);
		const alpacaQty = Math.abs(Number(ap.qty));
		const avgEntry = Number(ap.avg_entry_price);
		const currentPrice = Number(ap.current_price);

		if (existing) {
			// Sync from Alpaca (quantity, avgEntry, and price)
			if (existing.quantity !== alpacaQty || existing.avgEntryPrice !== avgEntry) {
				await positionsRepo.syncFromBroker(existing.id, {
					quantity: alpacaQty,
					avgEntryPrice: avgEntry,
					currentPrice,
				});
				log.info(
					{
						symbol: ap.symbol,
						oldQty: existing.quantity,
						newQty: alpacaQty,
						avgEntry,
					},
					"Synced position from Alpaca",
				);
			} else {
				await positionsRepo.updatePrice(existing.id, currentPrice);
				log.debug({ symbol: ap.symbol, price: currentPrice }, "Updated position price");
			}
			updated++;
		} else {
			// Look up the most recent decision for this symbol to link stop/target
			const recentDecisions = await decisionsRepo.findMany(
				{ symbol: ap.symbol },
				{ limit: 1, offset: 0 },
			);
			const decisionId = recentDecisions.data[0]?.id ?? null;

			// Look up active thesis for this symbol
			const activeThesis = await thesisRepo.findActiveForInstrument(ap.symbol, CREAM_ENV);
			const thesisId = activeThesis?.thesisId ?? null;

			// Create new position (use absolute qty since side indicates direction)
			const qty = Math.abs(Number(ap.qty));
			const position = await positionsRepo.create({
				symbol: ap.symbol,
				side: ap.side as "long" | "short",
				quantity: qty,
				avgEntryPrice: Number(ap.avg_entry_price),
				currentPrice: Number(ap.current_price),
				decisionId,
				thesisId,
				environment: CREAM_ENV,
			});
			created++;
			log.info(
				{
					symbol: ap.symbol,
					side: ap.side,
					qty,
					avgEntry: ap.avg_entry_price,
					id: position.id,
					decisionId,
					thesisId,
				},
				"Created position",
			);
		}
	}

	// Check for positions in DB that no longer exist in Alpaca (closed positions)
	const dbPositions = await positionsRepo.findOpen(CREAM_ENV);
	const alpacaSymbols = new Set(alpacaPositions.map((p) => p.symbol));

	for (const dbPos of dbPositions) {
		if (!alpacaSymbols.has(dbPos.symbol)) {
			// Position exists in DB but not in Alpaca - it was closed
			// Find the exit order to get the actual fill price
			const exitOrder = recentExitOrders.get(dbPos.symbol);
			const isExitOrder =
				exitOrder &&
				((dbPos.side === "long" && exitOrder.side === "sell") ||
					(dbPos.side === "short" && exitOrder.side === "buy"));

			const exitPrice =
				isExitOrder && exitOrder.filled_avg_price
					? Number(exitOrder.filled_avg_price)
					: (dbPos.currentPrice ?? dbPos.avgEntryPrice);

			log.info(
				{
					symbol: dbPos.symbol,
					exitPrice,
					fromOrder: isExitOrder,
					orderId: exitOrder?.id,
				},
				"Position no longer in Alpaca, marking as closed",
			);
			await positionsRepo.close(dbPos.id, exitPrice);
			skipped++;
		}
	}

	log.info({ created, updated, closed: skipped }, "Sync complete");
	process.exit(0);
}

main().catch((err) => {
	log.fatal({ error: err instanceof Error ? err.message : String(err) }, "Sync failed");
	process.exit(1);
});
