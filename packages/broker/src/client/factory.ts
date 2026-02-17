/**
 * Alpaca Client Factory
 *
 * Creates configured Alpaca broker client instances.
 */

import { log } from "../logger.js";
import type { Account, Order, OrderRequest, Position, TradingEnvironment } from "../types.js";
import { BrokerError } from "../types.js";
import { generateOrderId, validateLegRatios } from "../utils.js";
import type {
	AlpacaAccountResponse,
	AlpacaClockResponse,
	AlpacaOrderRequest,
	AlpacaOrderResponse,
	AlpacaPositionResponse,
} from "./alpaca-types.js";
import { createRequestFn, type RequestFn } from "./http.js";
import { mapAccount, mapOrder, mapPosition } from "./mappers.js";
import type { AlpacaClient, AlpacaClientConfig, GetOrdersOptions } from "./types.js";

type ClientSettings = {
	environment: TradingEnvironment;
	orderIdPrefix: string;
	requireLiveConfirmation: boolean;
};

function requireCredentials(apiKey: string, apiSecret: string): void {
	if (!apiKey || !apiSecret) {
		throw new BrokerError("API key and secret are required", "INVALID_CREDENTIALS");
	}
}

function confirmLiveOrder(
	orderRequest: OrderRequest,
	environment: TradingEnvironment,
	requireLiveConfirmation: boolean,
): void {
	if (environment !== "LIVE" || !requireLiveConfirmation) {
		return;
	}

	if (orderRequest.clientOrderId.includes("-LIVE-CONFIRMED-")) {
		return;
	}

	throw new BrokerError(
		'LIVE orders require explicit confirmation. Include "-LIVE-CONFIRMED-" in clientOrderId or set requireLiveConfirmation: false',
		"LIVE_PROTECTION",
	);
}

function validateLegs(orderRequest: OrderRequest): void {
	if (!orderRequest.legs || orderRequest.legs.length === 0) {
		return;
	}

	if (orderRequest.legs.length > 4) {
		throw new BrokerError("Multi-leg orders support a maximum of 4 legs", "VALIDATION_ERROR");
	}

	if (!validateLegRatios(orderRequest.legs)) {
		throw new BrokerError("Leg ratios must be simplified (GCD = 1)", "VALIDATION_ERROR");
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

	if (orderRequest.symbol !== undefined) payload.symbol = orderRequest.symbol;
	if (orderRequest.limitPrice !== undefined) payload.limit_price = String(orderRequest.limitPrice);
	if (orderRequest.stopPrice !== undefined) payload.stop_price = String(orderRequest.stopPrice);
	if (orderRequest.trailPercent !== undefined)
		payload.trail_percent = String(orderRequest.trailPercent);
	if (orderRequest.trailPrice !== undefined) payload.trail_price = String(orderRequest.trailPrice);
	if (orderRequest.extendedHours !== undefined) payload.extended_hours = orderRequest.extendedHours;

	if (orderRequest.legs && orderRequest.legs.length > 0) {
		payload.legs = orderRequest.legs.map((leg) => ({
			symbol: leg.symbol,
			ratio: leg.ratio,
			side: leg.ratio > 0 ? "buy" : "sell",
		}));
	}

	return payload;
}

function mapNotFoundAsNull(error: unknown): null {
	if (error instanceof BrokerError && error.code === "ORDER_NOT_FOUND") {
		return null;
	}
	throw error;
}

function buildOrdersQueryParams(options: GetOrdersOptions): URLSearchParams {
	const params = new URLSearchParams();
	params.set("status", options.status ?? "open");
	if (options.limit !== undefined) params.set("limit", String(Math.min(options.limit, 500)));
	if (options.direction !== undefined) params.set("direction", options.direction);
	if (options.symbols !== undefined) {
		params.set(
			"symbols",
			Array.isArray(options.symbols) ? options.symbols.join(",") : options.symbols,
		);
	}
	if (options.side !== undefined) params.set("side", options.side);
	if (options.nested !== undefined) params.set("nested", String(options.nested));
	if (options.after !== undefined) params.set("after", options.after);
	return params;
}

class AlpacaClientImpl implements AlpacaClient {
	public constructor(
		private readonly request: RequestFn,
		private readonly settings: ClientSettings,
	) {}

	public async getAccount(): Promise<Account> {
		const data = await this.request<AlpacaAccountResponse>("GET", "/v2/account");
		return mapAccount(data);
	}

	public async getPositions(): Promise<Position[]> {
		const data = await this.request<AlpacaPositionResponse[]>("GET", "/v2/positions");
		return data.map(mapPosition);
	}

	public async getPosition(symbol: string): Promise<Position | null> {
		try {
			const data = await this.request<AlpacaPositionResponse>("GET", `/v2/positions/${symbol}`);
			return mapPosition(data);
		} catch (error) {
			return mapNotFoundAsNull(error);
		}
	}

	public async submitOrder(orderRequest: OrderRequest): Promise<Order> {
		confirmLiveOrder(
			orderRequest,
			this.settings.environment,
			this.settings.requireLiveConfirmation,
		);
		validateLegs(orderRequest);
		log.info(
			{
				clientOrderId: orderRequest.clientOrderId,
				symbol: orderRequest.symbol,
				side: orderRequest.side,
				qty: orderRequest.qty,
				type: orderRequest.type,
				environment: this.settings.environment,
			},
			"Submitting order",
		);
		const data = await this.request<AlpacaOrderResponse>(
			"POST",
			"/v2/orders",
			buildOrderPayload(orderRequest),
		);
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
	}

	public async cancelOrder(orderId: string): Promise<void> {
		log.info({ orderId, environment: this.settings.environment }, "Cancelling order");
		await this.request<void>("DELETE", `/v2/orders/${orderId}`);
		log.info({ orderId }, "Order cancelled");
	}

	public async getOrder(orderId: string): Promise<Order | null> {
		try {
			const data = await this.request<AlpacaOrderResponse>("GET", `/v2/orders/${orderId}`);
			return mapOrder(data);
		} catch (error) {
			return mapNotFoundAsNull(error);
		}
	}

	public async getOrders(options: GetOrdersOptions = {}): Promise<Order[]> {
		const params = buildOrdersQueryParams(options);
		const data = await this.request<AlpacaOrderResponse[]>(
			"GET",
			`/v2/orders?${params.toString()}`,
		);
		return data.map(mapOrder);
	}

	public async getAllOrders(
		options: Omit<GetOrdersOptions, "limit" | "after"> = {},
	): Promise<Order[]> {
		const allOrders: Order[] = [];
		let after: string | undefined;
		const batchSize = 500;
		while (true) {
			const batch = await this.getOrders({ ...options, limit: batchSize, after });
			if (batch.length === 0) break;
			allOrders.push(...batch);
			if (batch.length < batchSize) break;
			after = batch.at(-1)?.id;
			if (!after) break;
		}
		log.debug({ totalOrders: allOrders.length, status: options.status }, "Fetched all orders");
		return allOrders;
	}

	public async closePosition(symbol: string, qty?: number): Promise<Order> {
		log.info({ symbol, qty, environment: this.settings.environment }, "Closing position");
		const path =
			qty !== undefined ? `/v2/positions/${symbol}?qty=${qty}` : `/v2/positions/${symbol}`;
		const data = await this.request<AlpacaOrderResponse>("DELETE", path);
		const order = mapOrder(data);
		log.info({ symbol, orderId: order.id, status: order.status }, "Position close order submitted");
		return order;
	}

	public async closeAllPositions(): Promise<Order[]> {
		log.info({ environment: this.settings.environment }, "Closing all positions");
		const data = await this.request<AlpacaOrderResponse[]>("DELETE", "/v2/positions");
		const orders = data.map(mapOrder);
		log.info({ orderCount: orders.length }, "All positions close orders submitted");
		return orders;
	}

	public async isMarketOpen(): Promise<boolean> {
		const data = await this.request<AlpacaClockResponse>("GET", "/v2/clock");
		return data.is_open;
	}

	public getEnvironment(): TradingEnvironment {
		return this.settings.environment;
	}

	public generateOrderId(): string {
		return generateOrderId(this.settings.orderIdPrefix);
	}
}

export function createAlpacaClient(config: AlpacaClientConfig): AlpacaClient {
	const { apiKey, apiSecret, environment } = config;
	requireCredentials(apiKey, apiSecret);
	const orderIdPrefix = config.orderIdPrefix ?? environment.toLowerCase();
	const requireLiveConfirmation = config.requireLiveConfirmation ?? true;
	const request = createRequestFn({ apiKey, apiSecret, environment });
	return new AlpacaClientImpl(request, { environment, orderIdPrefix, requireLiveConfirmation });
}
