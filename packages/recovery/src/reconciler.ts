/**
 * Order Reconciliation
 *
 * Reconciles orders between the checkpoint state and the broker
 * to determine what happened during a crash.
 */

import type {
  BrokerOrder,
  ExecutionState,
  OrderCheckpoint,
  ReconciliationResult,
  RecoveryConfig,
} from "./types.js";
import { DEFAULT_RECOVERY_CONFIG } from "./types.js";

/**
 * Interface for fetching orders from the broker.
 * Implement this to connect to your broker API.
 */
export interface BrokerOrderFetcher {
  /**
   * Fetch orders from the broker within the lookback period.
   * @param lookbackMs How far back to look (in milliseconds)
   */
  fetchRecentOrders(lookbackMs: number): Promise<BrokerOrder[]>;

  /**
   * Fetch a specific order by client order ID.
   */
  fetchOrderByClientId(clientOrderId: string): Promise<BrokerOrder | null>;
}

/**
 * Reconciler compares checkpoint state with broker state.
 */
export class OrderReconciler {
  private readonly config: RecoveryConfig;

  constructor(
    private readonly brokerFetcher: BrokerOrderFetcher,
    config: Partial<RecoveryConfig> = {}
  ) {
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
  }

  /**
   * Reconcile execution state with broker orders.
   */
  async reconcile(executionState: ExecutionState): Promise<ReconciliationResult> {
    const checkpointOrders = executionState.orders;
    const brokerOrders = await this.brokerFetcher.fetchRecentOrders(
      this.config.reconciliationLookback
    );

    return this.compareOrders(checkpointOrders, brokerOrders);
  }

  /**
   * Compare checkpoint orders with broker orders.
   */
  private compareOrders(
    checkpointOrders: OrderCheckpoint[],
    brokerOrders: BrokerOrder[]
  ): ReconciliationResult {
    const result: ReconciliationResult = {
      missingFromBroker: [],
      orphanedOrders: [],
      matchedOrders: [],
      discrepancies: [],
    };

    // Create lookup maps
    const brokerByClientId = new Map<string, BrokerOrder>();
    const brokerByOrderId = new Map<string, BrokerOrder>();

    for (const order of brokerOrders) {
      if (order.clientOrderId) {
        brokerByClientId.set(order.clientOrderId, order);
      }
      brokerByOrderId.set(order.orderId, order);
    }

    const matchedBrokerIds = new Set<string>();

    // Check each checkpoint order against broker
    for (const checkpointOrder of checkpointOrders) {
      // Try to find by client order ID
      let brokerOrder = brokerByClientId.get(checkpointOrder.clientOrderId);

      // If not found by client ID, try broker order ID
      if (!brokerOrder && checkpointOrder.brokerOrderId) {
        brokerOrder = brokerByOrderId.get(checkpointOrder.brokerOrderId);
      }

      if (brokerOrder) {
        matchedBrokerIds.add(brokerOrder.orderId);
        result.matchedOrders.push({
          checkpoint: checkpointOrder,
          broker: brokerOrder,
        });

        // Check for discrepancies
        const discrepancies = this.findOrderDiscrepancies(checkpointOrder, brokerOrder);
        result.discrepancies.push(...discrepancies);
      } else {
        // Order in checkpoint but not found at broker
        if (checkpointOrder.status === "submitted" || checkpointOrder.status === "pending") {
          result.missingFromBroker.push(checkpointOrder);
          result.discrepancies.push(
            `Order ${checkpointOrder.clientOrderId} (${checkpointOrder.symbol} ${checkpointOrder.side}) was ${checkpointOrder.status} but not found at broker`
          );
        }
      }
    }

    // Find orphaned orders (in broker but not in checkpoint)
    const checkpointClientIds = new Set(checkpointOrders.map((o) => o.clientOrderId));
    const checkpointBrokerIds = new Set(
      checkpointOrders.map((o) => o.brokerOrderId).filter(Boolean)
    );

    for (const brokerOrder of brokerOrders) {
      if (!matchedBrokerIds.has(brokerOrder.orderId)) {
        // This broker order wasn't matched to any checkpoint order
        const isKnownByClientId =
          brokerOrder.clientOrderId && checkpointClientIds.has(brokerOrder.clientOrderId);
        const isKnownByOrderId = checkpointBrokerIds.has(brokerOrder.orderId);

        if (!isKnownByClientId && !isKnownByOrderId) {
          result.orphanedOrders.push(brokerOrder);
          result.discrepancies.push(
            `Orphaned order at broker: ${brokerOrder.orderId} (${brokerOrder.symbol} ${brokerOrder.side})`
          );
        }
      }
    }

    return result;
  }

  /**
   * Find discrepancies between a checkpoint order and broker order.
   */
  private findOrderDiscrepancies(checkpoint: OrderCheckpoint, broker: BrokerOrder): string[] {
    const discrepancies: string[] = [];

    // Check symbol
    if (checkpoint.symbol !== broker.symbol) {
      discrepancies.push(
        `Order ${checkpoint.clientOrderId}: Symbol mismatch (checkpoint: ${checkpoint.symbol}, broker: ${broker.symbol})`
      );
    }

    // Check side
    if (checkpoint.side !== broker.side) {
      discrepancies.push(
        `Order ${checkpoint.clientOrderId}: Side mismatch (checkpoint: ${checkpoint.side}, broker: ${broker.side})`
      );
    }

    // Check quantity
    if (checkpoint.quantity !== broker.quantity) {
      discrepancies.push(
        `Order ${checkpoint.clientOrderId}: Quantity mismatch (checkpoint: ${checkpoint.quantity}, broker: ${broker.quantity})`
      );
    }

    // Check if filled when checkpoint shows submitted
    if (checkpoint.status === "submitted" && broker.status === "filled") {
      discrepancies.push(
        `Order ${checkpoint.clientOrderId}: Filled at broker but checkpoint shows submitted`
      );
    }

    return discrepancies;
  }

  /**
   * Determine if all orders in the execution state have been processed.
   */
  async areAllOrdersProcessed(executionState: ExecutionState): Promise<boolean> {
    const result = await this.reconcile(executionState);

    // All orders are processed if:
    // 1. No orders are missing from broker
    // 2. All matched orders are in a terminal state
    if (result.missingFromBroker.length > 0) {
      return false;
    }

    for (const match of result.matchedOrders) {
      const terminalStatuses = ["filled", "cancelled", "rejected", "expired"];
      if (!terminalStatuses.includes(match.broker.status.toLowerCase())) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get orders that still need processing.
   */
  async getPendingOrders(executionState: ExecutionState): Promise<OrderCheckpoint[]> {
    const pending: OrderCheckpoint[] = [];

    for (const order of executionState.orders) {
      if (order.status === "pending") {
        pending.push(order);
      } else if (order.status === "submitted") {
        // Check with broker
        const brokerOrder = await this.brokerFetcher.fetchOrderByClientId(order.clientOrderId);

        if (!brokerOrder) {
          // Order was supposedly submitted but not found at broker
          pending.push(order);
        } else {
          const terminalStatuses = ["filled", "cancelled", "rejected", "expired"];
          if (!terminalStatuses.includes(brokerOrder.status.toLowerCase())) {
            // Order is still active
            pending.push(order);
          }
        }
      }
    }

    return pending;
  }
}

/**
 * Create a new order reconciler.
 */
export function createOrderReconciler(
  brokerFetcher: BrokerOrderFetcher,
  config?: Partial<RecoveryConfig>
): OrderReconciler {
  return new OrderReconciler(brokerFetcher, config);
}

/**
 * Create a mock broker fetcher for testing.
 */
export function createMockBrokerFetcher(orders: BrokerOrder[] = []): BrokerOrderFetcher {
  return {
    async fetchRecentOrders(_lookbackMs: number): Promise<BrokerOrder[]> {
      return orders;
    },
    async fetchOrderByClientId(clientOrderId: string): Promise<BrokerOrder | null> {
      return orders.find((o) => o.clientOrderId === clientOrderId) ?? null;
    },
  };
}
