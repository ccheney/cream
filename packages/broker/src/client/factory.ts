/**
 * Alpaca Client Factory
 *
 * Creates configured Alpaca broker client instances.
 */

import { log } from "../logger.js";
import type { Account, Order, OrderRequest, Position } from "../types.js";
import { BrokerError } from "../types.js";
import { generateOrderId, validateLegRatios } from "../utils.js";
import type {
	AlpacaAccountResponse,
	AlpacaClockResponse,
	AlpacaOrderRequest,
	AlpacaOrderResponse,
	AlpacaPositionResponse,
} from "./alpaca-types.js";
import { createRequestFn } from "./http.js";
import { mapAccount, mapOrder, mapPosition } from "./mappers.js";
import type { AlpacaClient, AlpacaClientConfig, GetOrdersOptions } from "./types.js";

/**
 * Create an Alpaca broker client.
 *
 * @param config - Client configuration
 * @returns Alpaca client instance
 *
 * @example
 * ```typescript
 * const client = createAlpacaClient({
 *   apiKey: Bun.env.ALPACA_KEY!,
 *   apiSecret: Bun.env.ALPACA_SECRET!,
 *   environment: "PAPER",
 * });
 *
 * // Submit an order
 * const order = await client.submitOrder({
 *   clientOrderId: client.generateOrderId(),
 *   symbol: "AAPL",
 *   qty: 10,
 *   side: "buy",
 *   type: "limit",
 *   timeInForce: "day",
 *   limitPrice: 150.00,
 * });
 * ```
 */
export function createAlpacaClient(config: AlpacaClientConfig): AlpacaClient {
	const {
		apiKey,
		apiSecret,
		environment,
		orderIdPrefix = environment.toLowerCase(),
		requireLiveConfirmation = true,
	} = config;

	if (!apiKey || !apiSecret) {
		throw new BrokerError("API key and secret are required", "INVALID_CREDENTIALS");
	}

	const request = createRequestFn({ apiKey, apiSecret, environment });

	function confirmLiveOrder(orderRequest: OrderRequest): void {
		if (environment === "LIVE" && requireLiveConfirmation) {
			if (!orderRequest.clientOrderId.includes("-LIVE-CONFIRMED-")) {
				throw new BrokerError(
					'LIVE orders require explicit confirmation. Include "-LIVE-CONFIRMED-" in clientOrderId or set requireLiveConfirmation: false',
					"LIVE_PROTECTION",
				);
			}
		}
	}

	function buildOrderPayload(orderRequest: OrderRequest): AlpacaOrderRequest {
		const payload: AlpacaOrderRequest = {
			client_order_id: orderRequest.clientOrderId,
			qty: String(orderRequest.qty),
			side: orderRequest.side,
			type: orderRequest.type,
			time_in_force: orderRequest.timeInForce,
		};

		if (orderRequest.symbol !== undefined) {
			payload.symbol = orderRequest.symbol;
		}
		if (orderRequest.limitPrice !== undefined) {
			payload.limit_price = String(orderRequest.limitPrice);
		}
		if (orderRequest.stopPrice !== undefined) {
			payload.stop_price = String(orderRequest.stopPrice);
		}
		if (orderRequest.trailPercent !== undefined) {
			payload.trail_percent = String(orderRequest.trailPercent);
		}
		if (orderRequest.trailPrice !== undefined) {
			payload.trail_price = String(orderRequest.trailPrice);
		}
		if (orderRequest.extendedHours !== undefined) {
			payload.extended_hours = orderRequest.extendedHours;
		}

		if (orderRequest.legs && orderRequest.legs.length > 0) {
			payload.legs = orderRequest.legs.map((leg) => ({
				symbol: leg.symbol,
				ratio: leg.ratio,
				side: leg.ratio > 0 ? "buy" : "sell",
			}));
		}

		return payload;
	}

	return {
		async getAccount(): Promise<Account> {
			const data = await request<AlpacaAccountResponse>("GET", "/v2/account");
			return mapAccount(data);
		},

		async getPositions(): Promise<Position[]> {
			const data = await request<AlpacaPositionResponse[]>("GET", "/v2/positions");
			return data.map(mapPosition);
		},

		async getPosition(symbol: string): Promise<Position | null> {
			try {
				const data = await request<AlpacaPositionResponse>("GET", `/v2/positions/${symbol}`);
				return mapPosition(data);
			} catch (error) {
				if (error instanceof BrokerError && error.code === "ORDER_NOT_FOUND") {
					return null;
				}
				throw error;
			}
		},

		async submitOrder(orderRequest: OrderRequest): Promise<Order> {
			confirmLiveOrder(orderRequest);

			if (orderRequest.legs && orderRequest.legs.length > 0) {
				if (orderRequest.legs.length > 4) {
					throw new BrokerError("Multi-leg orders support a maximum of 4 legs", "VALIDATION_ERROR");
				}
				if (!validateLegRatios(orderRequest.legs)) {
					throw new BrokerError("Leg ratios must be simplified (GCD = 1)", "VALIDATION_ERROR");
				}
			}

			const payload = buildOrderPayload(orderRequest);

			log.info(
				{
					clientOrderId: orderRequest.clientOrderId,
					symbol: orderRequest.symbol,
					side: orderRequest.side,
					qty: orderRequest.qty,
					type: orderRequest.type,
					environment,
				},
				"Submitting order",
			);

			const data = await request<AlpacaOrderResponse>("POST", "/v2/orders", payload);
			const order = mapOrder(data);

			log.info(
				{
					orderId: order.id,
					clientOrderId: order.clientOrderId,
					symbol: order.symbol,
					status: order.status,
				},
				"Order submitted",
			);

			return order;
		},

		async cancelOrder(orderId: string): Promise<void> {
			log.info({ orderId, environment }, "Cancelling order");
			await request<void>("DELETE", `/v2/orders/${orderId}`);
			log.info({ orderId }, "Order cancelled");
		},

		async getOrder(orderId: string): Promise<Order | null> {
			try {
				const data = await request<AlpacaOrderResponse>("GET", `/v2/orders/${orderId}`);
				return mapOrder(data);
			} catch (error) {
				if (error instanceof BrokerError && error.code === "ORDER_NOT_FOUND") {
					return null;
				}
				throw error;
			}
		},

		async getOrders(options: GetOrdersOptions = {}): Promise<Order[]> {
			const params = new URLSearchParams();

			params.set("status", options.status ?? "open");

			if (options.limit !== undefined) {
				params.set("limit", String(Math.min(options.limit, 500)));
			}
			if (options.direction !== undefined) {
				params.set("direction", options.direction);
			}
			if (options.symbols !== undefined) {
				const symbolsStr = Array.isArray(options.symbols)
					? options.symbols.join(",")
					: options.symbols;
				params.set("symbols", symbolsStr);
			}
			if (options.side !== undefined) {
				params.set("side", options.side);
			}
			if (options.nested !== undefined) {
				params.set("nested", String(options.nested));
			}

			const data = await request<AlpacaOrderResponse[]>("GET", `/v2/orders?${params.toString()}`);
			return data.map(mapOrder);
		},

		async closePosition(symbol: string, qty?: number): Promise<Order> {
			log.info({ symbol, qty, environment }, "Closing position");
			const path =
				qty !== undefined ? `/v2/positions/${symbol}?qty=${qty}` : `/v2/positions/${symbol}`;
			const data = await request<AlpacaOrderResponse>("DELETE", path);
			const order = mapOrder(data);
			log.info(
				{ symbol, orderId: order.id, status: order.status },
				"Position close order submitted",
			);
			return order;
		},

		async closeAllPositions(): Promise<Order[]> {
			log.info({ environment }, "Closing all positions");
			const data = await request<AlpacaOrderResponse[]>("DELETE", "/v2/positions");
			const orders = data.map(mapOrder);
			log.info({ orderCount: orders.length }, "All positions close orders submitted");
			return orders;
		},

		async isMarketOpen(): Promise<boolean> {
			const data = await request<AlpacaClockResponse>("GET", "/v2/clock");
			return data.is_open;
		},

		getEnvironment() {
			return environment;
		},

		generateOrderId() {
			return generateOrderId(orderIdPrefix);
		},
	};
}
