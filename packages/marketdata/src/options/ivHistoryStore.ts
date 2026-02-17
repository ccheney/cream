import type { IVHistoryProvider, IVObservation } from "./ivPercentile.js";

/**
 * Simple in-memory IV history store.
 * Useful for testing or when caching calculated IVs.
 */
export class InMemoryIVHistoryStore {
	private store: Map<string, IVObservation[]> = new Map();

	/**
	 * Add IV observation for a symbol.
	 */
	addObservation(symbol: string, observation: IVObservation): void {
		const history = this.store.get(symbol) ?? [];
		history.push(observation);
		history.sort((a, b) => a.date.localeCompare(b.date));
		this.store.set(symbol, history);
	}

	/**
	 * Set complete history for a symbol.
	 */
	setHistory(symbol: string, history: IVObservation[]): void {
		const sorted = history.toSorted((a, b) => a.date.localeCompare(b.date));
		this.store.set(symbol, sorted);
	}

	/**
	 * Get history provider function.
	 */
	getProvider(): IVHistoryProvider {
		return async (symbol: string, lookbackDays: number): Promise<IVObservation[]> => {
			const history = this.store.get(symbol) ?? [];
			const cutoffDate = new Date();
			cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
			const cutoffStr = cutoffDate.toISOString().slice(0, 10);

			return history.filter((obs) => obs.date >= cutoffStr);
		};
	}

	/**
	 * Clear store.
	 */
	clear(): void {
		this.store.clear();
	}
}
