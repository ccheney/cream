/**
 * Sync Positions from Alpaca to PostgreSQL
 *
 * Imports open positions from Alpaca and creates/updates them in the database.
 * Run with: cd apps/dashboard-api && bun run src/scripts/sync-alpaca-positions.ts
 *
 * Requires .env to be loaded (uses Bun's automatic .env loading from project root).
 */
import { createNodeLogger } from "@cream/logger";
import { DecisionsRepository, PositionsRepository } from "@cream/storage";

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

async function main() {
	log.info({ environment: CREAM_ENV }, "Fetching positions from Alpaca");

	const response = await fetch(`${ALPACA_BASE_URL}/v2/positions`, {
		headers: {
			"APCA-API-KEY-ID": ALPACA_KEY,
			"APCA-API-SECRET-KEY": ALPACA_SECRET,
		},
	});

	if (!response.ok) {
		throw new Error(`Alpaca API error: ${response.status} ${await response.text()}`);
	}

	const alpacaPositions = (await response.json()) as AlpacaPosition[];
	log.info({ count: alpacaPositions.length }, "Found positions in Alpaca");

	const positionsRepo = new PositionsRepository();
	const decisionsRepo = new DecisionsRepository();
	let created = 0;
	let updated = 0;
	let skipped = 0;

	for (const ap of alpacaPositions) {
		const existing = await positionsRepo.findBySymbol(ap.symbol, CREAM_ENV);

		if (existing) {
			// Update existing position with current prices
			await positionsRepo.updatePrice(existing.id, Number(ap.current_price));
			updated++;
			log.debug({ symbol: ap.symbol, price: ap.current_price }, "Updated position");
		} else {
			// Look up the most recent decision for this symbol to link stop/target
			const recentDecisions = await decisionsRepo.findMany(
				{ symbol: ap.symbol },
				{ limit: 1, offset: 0 },
			);
			const decisionId = recentDecisions.data[0]?.id ?? null;

			// Create new position (use absolute qty since side indicates direction)
			const qty = Math.abs(Number(ap.qty));
			const position = await positionsRepo.create({
				symbol: ap.symbol,
				side: ap.side as "long" | "short",
				quantity: qty,
				avgEntryPrice: Number(ap.avg_entry_price),
				currentPrice: Number(ap.current_price),
				decisionId,
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
			log.info({ symbol: dbPos.symbol }, "Position no longer in Alpaca, marking as closed");
			await positionsRepo.close(dbPos.id, dbPos.currentPrice ?? dbPos.avgEntryPrice);
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
