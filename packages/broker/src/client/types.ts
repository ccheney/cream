/**
 * Alpaca Client Types
 *
 * Public interface types for the Alpaca broker client.
 */

import type { Account, Order, OrderRequest, Position, TradingEnvironment } from "../types.js";

/**
 * Alpaca client configuration.
 */
export interface AlpacaClientConfig {
	/** API key (ALPACA_KEY env var) */
	apiKey: string;
	/** API secret (ALPACA_SECRET env var) */
	apiSecret: string;
	/** Trading environment */
	environment: TradingEnvironment;
	/** Order ID prefix for namespacing (default: environment prefix) */
	orderIdPrefix?: string;
	/** Require explicit confirmation for LIVE orders (default: true) */
	requireLiveConfirmation?: boolean;
}

/**
 * Alpaca broker client interface.
 */
export interface AlpacaClient {
	/**
	 * Get account information.
	 */
	getAccount(): Promise<Account>;

	/**
	 * Get all positions.
	 */
	getPositions(): Promise<Position[]>;

	/**
	 * Get a specific position by symbol.
	 */
	getPosition(symbol: string): Promise<Position | null>;

	/**
	 * Submit an order.
	 *
	 * @param request - Order request
	 * @returns Submitted order
	 * @throws BrokerError on failure
	 */
	submitOrder(request: OrderRequest): Promise<Order>;

	/**
	 * Cancel an order.
	 *
	 * @param orderId - Alpaca order ID or client order ID
	 */
	cancelOrder(orderId: string): Promise<void>;

	/**
	 * Get an order by ID.
	 */
	getOrder(orderId: string): Promise<Order | null>;

	/**
	 * Get all orders (optionally filtered by status).
	 */
	getOrders(status?: "open" | "closed" | "all"): Promise<Order[]>;

	/**
	 * Close a position.
	 *
	 * @param symbol - Symbol to close
	 * @param qty - Quantity to close (undefined = all)
	 */
	closePosition(symbol: string, qty?: number): Promise<Order>;

	/**
	 * Close all positions.
	 */
	closeAllPositions(): Promise<Order[]>;

	/**
	 * Check if the market is open.
	 */
	isMarketOpen(): Promise<boolean>;

	/**
	 * Get the trading environment.
	 */
	getEnvironment(): TradingEnvironment;

	/**
	 * Generate a unique client order ID with environment prefix.
	 */
	generateOrderId(): string;
}
