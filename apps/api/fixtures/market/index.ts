/**
 * Market Test Fixtures
 *
 * Exports deterministic market data fixtures for use in test mode.
 * These fixtures ensure reproducible test behavior without external API calls.
 *
 * @example
 * ```ts
 * import { getSnapshotFixture, getCandleFixtures } from "../fixtures/market";
 *
 * // Get snapshot for a symbol
 * const snapshot = getSnapshotFixture("AAPL");
 *
 * // Get candles for a symbol
 * const candles = getCandleFixtures("AAPL", 100);
 * ```
 */

export {
	AAPL_CANDLES,
	AMZN_CANDLES,
	GOOGL_CANDLES,
	getCandleFixtures,
	getCandleFixturesMap,
	JNJ_CANDLES,
	JPM_CANDLES,
	MSFT_CANDLES,
	NVDA_CANDLES,
	QQQ_CANDLES,
	SPY_CANDLES,
	TSLA_CANDLES,
} from "./candles.fixture";
export {
	FIXTURE_TIMESTAMP,
	getSnapshotFixture,
	getSnapshotFixtures,
	type InternalSnapshot,
	SNAPSHOT_FIXTURES,
} from "./snapshot.fixture";
