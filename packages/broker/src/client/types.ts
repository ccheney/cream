/**
 * Alpaca Client Types
 *
 * Public interface types for the Alpaca broker client.
 */

import type { Account, Order, OrderRequest, Position, TradingEnvironment } from "../types.js";

/**
 * Options for filtering orders.
 */
export interface GetOrdersOptions {
	/** Filter by status: open, closed, or all (default: open) */
	status?: "open" | "closed" | "all";
	/** Maximum number of orders to return (default: 100, max: 500) */
	limit?: number;
	/** Sort direction: asc or desc (default: desc) */
	direction?: "asc" | "desc";
	/** Filter by symbols (comma-separated or array) */
	symbols?: string | string[];
	/** Filter by side */
	side?: "buy" | "sell";
	/** Include nested bracket order legs */
	nested?: boolean;
}

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
	 * Get orders with optional filtering.
	 *
	 * @param options - Filter options (status, limit, direction, symbols, side, nested)
	 */
	getOrders(options?: GetOrdersOptions): Promise<Order[]>;

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
