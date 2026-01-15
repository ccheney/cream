/**
 * Stub Providers
 *
 * No-op implementations for when external services aren't configured.
 */

export function createStubSharesProvider() {
	return {
		getSharesData: async () => null,
	};
}

export function createStubSentimentProvider() {
	return {
		getSentimentData: async () => [],
		getHistoricalSentiment: async () => [],
	};
}

export function createStubAlpacaClient() {
	return {
		getCorporateActions: async () => [],
		getCorporateActionsForSymbols: async () => [],
	};
}
