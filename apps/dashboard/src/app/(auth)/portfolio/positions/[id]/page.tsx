"use client";

/**
 * Position Detail Page
 *
 * Shows complete position information including:
 * - Position header with symbol, side, quantity, entry price
 * - P&L breakdown (unrealized/realized)
 * - Entry/exit trade history
 * - Related decisions
 * - Stop-loss and take-profit levels
 * - Related thesis link
 */

import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
	useClosePosition,
	useModifyStop,
	useModifyTarget,
	usePositionDetail,
} from "@/hooks/queries";
import type { DecisionSummary, Trade } from "@/lib/api/types";

export default function PositionDetailPage() {
	const params = useParams();
	const router = useRouter();
	const id = params.id as string;

	const { data: position, isLoading, error } = usePositionDetail(id);
	const closePosition = useClosePosition();

	const [editingStop, setEditingStop] = useState(false);
	const [editingTarget, setEditingTarget] = useState(false);
	const [stopValue, setStopValue] = useState("");
	const [targetValue, setTargetValue] = useState("");

	const modifyStop = useModifyStop();
	const modifyTarget = useModifyTarget();

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div className="h-8 w-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				<div className="h-48 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
				<div className="h-64 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			</div>
		);
	}

	if (error || !position) {
		return (
			<div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-lg border border-red-200 dark:border-red-800">
				<h2 className="text-lg font-semibold text-red-800 dark:text-red-200">Position not found</h2>
				<p className="mt-2 text-sm text-red-600 dark:text-red-300">
					The position you&apos;re looking for doesn&apos;t exist or has been closed.
				</p>
				<button
					type="button"
					onClick={() => router.push("/portfolio")}
					className="mt-4 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-200 bg-red-100 dark:bg-red-900/30 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50"
				>
					Back to Portfolio
				</button>
			</div>
		);
	}

	const formatPrice = (price: number | null) =>
		price
			? new Intl.NumberFormat("en-US", {
					style: "currency",
					currency: "USD",
				}).format(price)
			: "--";

	const formatPct = (value: number | null) =>
		value !== null ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%` : "--";

	const handleSaveStop = () => {
		const value = parseFloat(stopValue);
		if (!Number.isNaN(value) && value > 0) {
			modifyStop.mutate({ positionId: id, stop: value });
		}
		setEditingStop(false);
	};

	const handleSaveTarget = () => {
		const value = parseFloat(targetValue);
		if (!Number.isNaN(value) && value > 0) {
			modifyTarget.mutate({ positionId: id, target: value });
		}
		setEditingTarget(false);
	};

	const handleClose = () => {
		if (confirm(`Are you sure you want to close this ${position.symbol} position?`)) {
			closePosition.mutate(id, {
				onSuccess: () => router.push("/portfolio"),
			});
		}
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<button
						type="button"
						onClick={() => router.back()}
						className="p-2 text-stone-500 dark:text-night-300 hover:text-stone-700 dark:text-night-100 dark:text-night-400 dark:hover:text-night-100"
						aria-label="Go back"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							className="h-5 w-5"
							viewBox="0 0 20 20"
							fill="currentColor"
							aria-hidden="true"
						>
							<path
								fillRule="evenodd"
								d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
								clipRule="evenodd"
							/>
						</svg>
					</button>
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">
							{position.symbol}
						</h1>
						<span
							className={`px-3 py-1 text-sm font-medium rounded ${
								position.side === "LONG"
									? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
									: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
							}`}
						>
							{position.side}
						</span>
					</div>
				</div>
				<button
					type="button"
					onClick={handleClose}
					disabled={closePosition.isPending}
					className="px-4 py-2 text-sm font-medium text-red-700 dark:text-red-200 bg-red-100 dark:bg-red-900/30 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
				>
					{closePosition.isPending ? "Closing..." : "Close Position"}
				</button>
			</div>

			{/* Position Details Card */}
			<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
				<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
					Position Details
				</h2>
				<div className="grid grid-cols-2 md:grid-cols-4 gap-6">
					<div>
						<span className="text-sm text-stone-500 dark:text-night-300">Quantity</span>
						<div className="text-lg font-medium text-stone-900 dark:text-night-50">
							{position.qty} shares
						</div>
					</div>
					<div>
						<span className="text-sm text-stone-500 dark:text-night-300">Avg Entry</span>
						<div className="text-lg font-medium text-stone-900 dark:text-night-50">
							{formatPrice(position.avgEntry)}
						</div>
					</div>
					<div>
						<span className="text-sm text-stone-500 dark:text-night-300">Current Price</span>
						<div className="text-lg font-medium text-stone-900 dark:text-night-50">
							{formatPrice(position.currentPrice)}
						</div>
					</div>
					<div>
						<span className="text-sm text-stone-500 dark:text-night-300">Market Value</span>
						<div className="text-lg font-medium text-stone-900 dark:text-night-50">
							{formatPrice(position.marketValue)}
						</div>
					</div>
				</div>

				{/* P&L Section */}
				<div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
					<h3 className="text-sm font-medium text-stone-900 dark:text-night-50 mb-3">
						Profit & Loss
					</h3>
					<div className="grid grid-cols-2 md:grid-cols-3 gap-6">
						<div>
							<span className="text-sm text-stone-500 dark:text-night-300">Unrealized P&L</span>
							<div
								className={`text-xl font-semibold ${
									(position.unrealizedPnl ?? 0) >= 0 ? "text-green-600" : "text-red-600"
								}`}
							>
								{(position.unrealizedPnl ?? 0) >= 0 ? "+" : ""}
								{formatPrice(position.unrealizedPnl)}
							</div>
						</div>
						<div>
							<span className="text-sm text-stone-500 dark:text-night-300">P&L %</span>
							<div
								className={`text-xl font-semibold ${
									(position.unrealizedPnlPct ?? 0) >= 0 ? "text-green-600" : "text-red-600"
								}`}
							>
								{formatPct(position.unrealizedPnlPct)}
							</div>
						</div>
						<div>
							<span className="text-sm text-stone-500 dark:text-night-300">Days Held</span>
							<div className="text-xl font-semibold text-stone-900 dark:text-night-50">
								{position.daysHeld} days
							</div>
						</div>
					</div>
				</div>

				{/* Risk Levels */}
				<div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
					<h3 className="text-sm font-medium text-stone-900 dark:text-night-50 mb-3">
						Risk Levels
					</h3>
					<div className="grid grid-cols-2 gap-6">
						<div className="flex items-center justify-between">
							<div>
								<span className="text-sm text-stone-500 dark:text-night-300">Stop Loss</span>
								{editingStop ? (
									<div className="flex items-center gap-2 mt-1">
										<input
											type="number"
											value={stopValue}
											onChange={(e) => setStopValue(e.target.value)}
											className="w-24 px-2 py-1 text-sm border border-cream-200 dark:border-night-600 rounded bg-white dark:bg-night-700 text-stone-900 dark:text-night-50"
											placeholder="0.00"
										/>
										<button
											type="button"
											onClick={handleSaveStop}
											className="px-2 py-1 text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded"
										>
											Save
										</button>
										<button
											type="button"
											onClick={() => setEditingStop(false)}
											className="px-2 py-1 text-xs bg-cream-100 text-stone-700 dark:bg-night-700 dark:text-night-400 rounded"
										>
											Cancel
										</button>
									</div>
								) : (
									<div className="flex items-center gap-2">
										<div className="text-lg font-medium text-red-600">
											{formatPrice(position.stop)}
										</div>
										<button
											type="button"
											onClick={() => {
												setStopValue(position.stop?.toString() || "");
												setEditingStop(true);
											}}
											className="text-xs text-stone-500 dark:text-night-300 hover:text-stone-700 dark:text-night-100 dark:text-night-400 dark:hover:text-night-100"
										>
											Edit
										</button>
									</div>
								)}
							</div>
						</div>
						<div className="flex items-center justify-between">
							<div>
								<span className="text-sm text-stone-500 dark:text-night-300">Take Profit</span>
								{editingTarget ? (
									<div className="flex items-center gap-2 mt-1">
										<input
											type="number"
											value={targetValue}
											onChange={(e) => setTargetValue(e.target.value)}
											className="w-24 px-2 py-1 text-sm border border-cream-200 dark:border-night-600 rounded bg-white dark:bg-night-700 text-stone-900 dark:text-night-50"
											placeholder="0.00"
										/>
										<button
											type="button"
											onClick={handleSaveTarget}
											className="px-2 py-1 text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded"
										>
											Save
										</button>
										<button
											type="button"
											onClick={() => setEditingTarget(false)}
											className="px-2 py-1 text-xs bg-cream-100 text-stone-700 dark:bg-night-700 dark:text-night-400 rounded"
										>
											Cancel
										</button>
									</div>
								) : (
									<div className="flex items-center gap-2">
										<div className="text-lg font-medium text-green-600">
											{formatPrice(position.target)}
										</div>
										<button
											type="button"
											onClick={() => {
												setTargetValue(position.target?.toString() || "");
												setEditingTarget(true);
											}}
											className="text-xs text-stone-500 dark:text-night-300 hover:text-stone-700 dark:text-night-100 dark:text-night-400 dark:hover:text-night-100"
										>
											Edit
										</button>
									</div>
								)}
							</div>
						</div>
					</div>
				</div>

				{/* Related Thesis */}
				{position.thesis && (
					<div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
						<h3 className="text-sm font-medium text-stone-900 dark:text-night-50 mb-2">
							Related Thesis
						</h3>
						<Link
							href={`/theses/${position.thesis.id}`}
							className="inline-flex items-center gap-2 px-3 py-2 bg-cream-50 dark:bg-night-700 rounded-md text-sm text-stone-700 dark:text-night-100 hover:bg-cream-100 dark:hover:bg-night-600"
						>
							<span className="font-medium">{position.thesis.symbol}</span>
							<span>&ndash;</span>
							<span>{position.thesis.title}</span>
						</Link>
					</div>
				)}

				{/* Position opened time */}
				<div className="mt-6 pt-6 border-t border-cream-100 dark:border-night-700">
					<div className="text-sm text-stone-500 dark:text-night-300">
						Opened {formatDistanceToNow(new Date(position.openedAt), { addSuffix: true })} &bull;{" "}
						{format(new Date(position.openedAt), "MMM d, yyyy HH:mm")}
					</div>
				</div>
			</div>

			{/* Trade History */}
			{position.trades && position.trades.length > 0 && (
				<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
					<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
						Trade History ({position.trades.length})
					</h2>
					<div className="overflow-x-auto">
						<table className="w-full">
							<thead className="bg-cream-50 dark:bg-night-700">
								<tr className="text-left text-sm text-stone-500 dark:text-night-300">
									<th className="px-4 py-3 font-medium">Time</th>
									<th className="px-4 py-3 font-medium">Side</th>
									<th className="px-4 py-3 font-medium text-right">Qty</th>
									<th className="px-4 py-3 font-medium text-right">Price</th>
									<th className="px-4 py-3 font-medium text-right">P&L</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-cream-100 dark:divide-night-700">
								{position.trades.map((trade) => (
									<TradeRow key={trade.id} trade={trade} />
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* Related Decisions */}
			{position.relatedDecisions && position.relatedDecisions.length > 0 && (
				<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
					<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
						Related Decisions ({position.relatedDecisions.length})
					</h2>
					<div className="space-y-2">
						{position.relatedDecisions.map((decision) => (
							<DecisionLink key={decision.id} decision={decision} />
						))}
					</div>
				</div>
			)}
		</div>
	);
}

function TradeRow({ trade }: { trade: Trade }) {
	const formatPrice = (price: number) =>
		new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
		}).format(price);

	return (
		<tr className="text-sm">
			<td className="px-4 py-3 text-stone-500 dark:text-night-300">
				{format(new Date(trade.timestamp), "MMM d, yyyy HH:mm:ss")}
			</td>
			<td className="px-4 py-3">
				<span
					className={`px-2 py-0.5 text-xs font-medium rounded ${
						trade.side === "BUY"
							? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
							: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
					}`}
				>
					{trade.side}
				</span>
			</td>
			<td className="px-4 py-3 text-right font-mono text-stone-900 dark:text-night-50">
				{trade.qty}
			</td>
			<td className="px-4 py-3 text-right font-mono text-stone-900 dark:text-night-50">
				{formatPrice(trade.price)}
			</td>
			<td
				className={`px-4 py-3 text-right font-mono ${
					trade.pnl === null
						? "text-stone-400 dark:text-night-400"
						: trade.pnl >= 0
							? "text-green-600"
							: "text-red-600"
				}`}
			>
				{trade.pnl !== null ? (
					<>
						{trade.pnl >= 0 ? "+" : ""}
						{formatPrice(trade.pnl)}
					</>
				) : (
					"--"
				)}
			</td>
		</tr>
	);
}

function DecisionLink({ decision }: { decision: DecisionSummary }) {
	const statusColors: Record<string, string> = {
		PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
		APPROVED: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
		EXECUTED: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
		REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
		FAILED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
	};

	const actionColors: Record<string, string> = {
		BUY: "text-green-600",
		SELL: "text-red-600",
		HOLD: "text-stone-600 dark:text-night-200",
		CLOSE: "text-amber-600",
	};

	return (
		<Link
			href={`/decisions/${decision.id}`}
			className="flex items-center justify-between p-3 bg-cream-50 dark:bg-night-700 rounded-lg hover:bg-cream-100 dark:hover:bg-night-600"
		>
			<div className="flex items-center gap-3">
				<span
					className={`font-medium ${actionColors[decision.action] || "text-stone-600 dark:text-night-200"}`}
				>
					{decision.action}
				</span>
				<span
					className={`px-2 py-0.5 text-xs font-medium rounded ${statusColors[decision.status] || ""}`}
				>
					{decision.status}
				</span>
			</div>
			<span className="text-sm text-stone-500 dark:text-night-300">
				{formatDistanceToNow(new Date(decision.createdAt), { addSuffix: true })}
			</span>
		</Link>
	);
}
