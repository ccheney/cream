export const validTimestamp = "2026-01-04T16:30:00Z";

export const validQuote = {
	symbol: "AAPL",
	bid: 185.5,
	ask: 185.55,
	bidSize: 100,
	askSize: 200,
	last: 185.52,
	lastSize: 50,
	volume: 1000000,
	timestamp: validTimestamp,
};

export const validBar = {
	symbol: "AAPL",
	timestamp: validTimestamp,
	timeframeMinutes: 60,
	open: 185.0,
	high: 186.0,
	low: 184.5,
	close: 185.75,
	volume: 500000,
	vwap: 185.25,
	tradeCount: 1500,
};

export const validOptionContract = {
	underlying: "AAPL",
	expiration: "2026-01-17",
	strike: 190.0,
	optionType: "CALL" as const,
};
