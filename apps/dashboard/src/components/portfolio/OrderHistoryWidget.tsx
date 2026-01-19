/**
 * Order History Widget
 *
 * Displays order history from Alpaca with filtering by status.
 * Real-time updates via WebSocket (order_update messages) automatically
 * invalidate the query cache and trigger UI updates.
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 4.2
 */

"use client";

import { memo, useState } from "react";
import { Tab, TabList, TabPanel, Tabs } from "@/components/ui/tabs";
import { useAllOrders } from "@/hooks/queries/useOrders";
import type { AlpacaOrderStatus, Order } from "@/lib/api/types";

type OrderStatusFilter = "all" | "open" | "filled" | "canceled";

function cn(...classes: (string | boolean | undefined | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

function formatPrice(price: number | null): string {
	if (price === null) {
		return "-";
	}
	return price.toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
	});
}

function formatQty(qty: number): string {
	return qty.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function formatDate(dateStr: string): string {
	const date = new Date(dateStr);
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function getStatusColor(status: AlpacaOrderStatus): string {
	switch (status) {
		case "filled":
			return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20";
		case "partially_filled":
			return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20";
		case "new":
		case "accepted":
		case "pending_new":
			return "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20";
		case "canceled":
		case "expired":
		case "done_for_day":
			return "text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800";
		case "rejected":
			return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20";
		default:
			return "text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800";
	}
}

function getStatusLabel(status: AlpacaOrderStatus): string {
	switch (status) {
		case "new":
			return "New";
		case "accepted":
			return "Accepted";
		case "pending_new":
			return "Pending";
		case "accepted_for_bidding":
			return "Bidding";
		case "stopped":
			return "Stopped";
		case "rejected":
			return "Rejected";
		case "suspended":
			return "Suspended";
		case "calculated":
			return "Calculated";
		case "pending_cancel":
			return "Canceling";
		case "pending_replace":
			return "Replacing";
		case "done_for_day":
			return "Done for Day";
		case "canceled":
			return "Canceled";
		case "expired":
			return "Expired";
		case "replaced":
			return "Replaced";
		case "partially_filled":
			return "Partial Fill";
		case "filled":
			return "Filled";
		default:
			return status;
	}
}

function isOpenOrder(status: AlpacaOrderStatus): boolean {
	return [
		"new",
		"accepted",
		"pending_new",
		"partially_filled",
		"pending_cancel",
		"pending_replace",
	].includes(status);
}

function isFilledOrder(status: AlpacaOrderStatus): boolean {
	return status === "filled";
}

function isCanceledOrder(status: AlpacaOrderStatus): boolean {
	return ["canceled", "expired", "rejected", "done_for_day", "replaced"].includes(status);
}

interface OrderRowProps {
	order: Order;
}

const OrderRow = memo(function OrderRow({ order }: OrderRowProps) {
	const sideColor =
		order.side === "buy" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";

	return (
		<tr className="hover:bg-cream-50 dark:hover:bg-night-750 transition-colors">
			<td className="px-4 py-3 font-mono text-sm font-medium text-stone-900 dark:text-night-50">
				{order.symbol}
			</td>
			<td className={cn("px-4 py-3 text-sm font-medium uppercase", sideColor)}>{order.side}</td>
			<td className="px-4 py-3 text-sm text-stone-900 dark:text-night-50 text-right font-mono">
				{formatQty(order.filledQty)}/{formatQty(order.qty)}
			</td>
			<td className="px-4 py-3 text-sm text-stone-600 dark:text-night-300 capitalize">
				{order.type.replace("_", " ")}
			</td>
			<td className="px-4 py-3 text-sm text-stone-900 dark:text-night-50 text-right font-mono">
				{order.limitPrice ? formatPrice(order.limitPrice) : "-"}
			</td>
			<td className="px-4 py-3 text-sm text-stone-900 dark:text-night-50 text-right font-mono">
				{order.filledAvgPrice ? formatPrice(order.filledAvgPrice) : "-"}
			</td>
			<td className="px-4 py-3">
				<span
					className={cn(
						"inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
						getStatusColor(order.status)
					)}
				>
					{getStatusLabel(order.status)}
				</span>
			</td>
			<td className="px-4 py-3 text-sm text-stone-500 dark:text-night-400 text-right">
				{formatDate(order.createdAt)}
			</td>
		</tr>
	);
});

interface OrdersTableProps {
	orders: Order[];
	isLoading?: boolean;
	emptyMessage?: string;
}

const OrdersTable = memo(function OrdersTable({
	orders,
	isLoading = false,
	emptyMessage = "No orders",
}: OrdersTableProps) {
	if (isLoading) {
		return (
			<div className="p-4 space-y-2">
				{[1, 2, 3].map((i) => (
					<div key={i} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				))}
			</div>
		);
	}

	if (orders.length === 0) {
		return <div className="p-8 text-center text-stone-400 dark:text-night-400">{emptyMessage}</div>;
	}

	return (
		<div className="overflow-x-auto">
			<table className="w-full">
				<thead className="bg-cream-50 dark:bg-night-750">
					<tr className="text-left text-sm text-stone-500 dark:text-night-300">
						<th className="px-4 py-3 font-medium">Symbol</th>
						<th className="px-4 py-3 font-medium">Side</th>
						<th className="px-4 py-3 font-medium text-right">Filled/Qty</th>
						<th className="px-4 py-3 font-medium">Type</th>
						<th className="px-4 py-3 font-medium text-right">Limit</th>
						<th className="px-4 py-3 font-medium text-right">Avg Fill</th>
						<th className="px-4 py-3 font-medium">Status</th>
						<th className="px-4 py-3 font-medium text-right">Created</th>
					</tr>
				</thead>
				<tbody className="divide-y divide-cream-100 dark:divide-night-700">
					{orders.map((order) => (
						<OrderRow key={order.id} order={order} />
					))}
				</tbody>
			</table>
		</div>
	);
});

export interface OrderHistoryWidgetProps {
	limit?: number;
}

export const OrderHistoryWidget = memo(function OrderHistoryWidget({
	limit = 100,
}: OrderHistoryWidgetProps) {
	const [activeTab, setActiveTab] = useState<OrderStatusFilter>("all");

	const { data, isLoading, error } = useAllOrders({ limit });

	const orders = data?.orders ?? [];

	const openOrders = orders.filter((o) => isOpenOrder(o.status));
	const filledOrders = orders.filter((o) => isFilledOrder(o.status));
	const canceledOrders = orders.filter((o) => isCanceledOrder(o.status));

	const hasOpenOrders = openOrders.length > 0;

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			<div className="p-4 border-b border-cream-200 dark:border-night-700 flex items-center justify-between">
				<h2 className="text-lg font-medium text-stone-900 dark:text-night-50">Order History</h2>
				<div className="flex items-center gap-3">
					{hasOpenOrders && (
						<div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
							<span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
							{openOrders.length} pending
						</div>
					)}
					<span className="text-sm text-stone-500 dark:text-night-300">{orders.length} orders</span>
				</div>
			</div>

			{error ? (
				<div className="p-8 text-center text-red-500 dark:text-red-400">
					Failed to load orders: {error instanceof Error ? error.message : "Unknown error"}
				</div>
			) : (
				<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as OrderStatusFilter)}>
					<TabList className="px-4">
						<Tab value="all">All ({orders.length})</Tab>
						<Tab value="open">
							Open ({openOrders.length})
							{hasOpenOrders && (
								<span className="ml-1.5 w-2 h-2 rounded-full bg-amber-500 inline-block" />
							)}
						</Tab>
						<Tab value="filled">Filled ({filledOrders.length})</Tab>
						<Tab value="canceled">Canceled ({canceledOrders.length})</Tab>
					</TabList>

					<TabPanel value="all">
						<OrdersTable orders={orders} isLoading={isLoading} emptyMessage="No orders found" />
					</TabPanel>

					<TabPanel value="open">
						<OrdersTable
							orders={openOrders}
							isLoading={isLoading}
							emptyMessage="No pending orders"
						/>
					</TabPanel>

					<TabPanel value="filled">
						<OrdersTable
							orders={filledOrders}
							isLoading={isLoading}
							emptyMessage="No filled orders"
						/>
					</TabPanel>

					<TabPanel value="canceled">
						<OrdersTable
							orders={canceledOrders}
							isLoading={isLoading}
							emptyMessage="No canceled orders"
						/>
					</TabPanel>
				</Tabs>
			)}
		</div>
	);
});

export default OrderHistoryWidget;
