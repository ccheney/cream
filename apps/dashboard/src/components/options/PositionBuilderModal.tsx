"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
	Dialog,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { OptionsContract } from "@/lib/api/types";
import { OrderPreview } from "./OrderPreview";

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";
export type TimeInForce = "day" | "gtc" | "ioc" | "fok";

export interface OptionsOrderRequest {
	symbol: string;
	side: OrderSide;
	quantity: number;
	orderType: OrderType;
	timeInForce: TimeInForce;
	limitPrice?: number;
	stopPrice?: number;
}

export interface PositionBuilderModalProps {
	isOpen: boolean;
	onClose: () => void;
	contract: OptionsContract | null;
	contractType: "call" | "put" | null;
	strike: number | null;
	underlying: string;
	expiration: string | null;
	onSubmit: (order: OptionsOrderRequest) => Promise<void>;
	"data-testid"?: string;
}

const ORDER_TYPE_OPTIONS = [
	{ value: "market", label: "Market" },
	{ value: "limit", label: "Limit" },
	{ value: "stop", label: "Stop" },
	{ value: "stop_limit", label: "Stop Limit" },
];

const TIME_IN_FORCE_OPTIONS = [
	{ value: "day", label: "Day" },
	{ value: "gtc", label: "GTC (Good Till Canceled)" },
	{ value: "ioc", label: "IOC (Immediate or Cancel)" },
	{ value: "fok", label: "FOK (Fill or Kill)" },
];

function isLimitOrderType(orderType: OrderType): boolean {
	return orderType === "limit" || orderType === "stop_limit";
}

function isStopOrderType(orderType: OrderType): boolean {
	return orderType === "stop" || orderType === "stop_limit";
}

function parseQuantity(value: string): number {
	return Number.parseInt(value, 10);
}

function getDefaultLimitPrice(contract: OptionsContract | null): number {
	if (!contract) {
		return 0;
	}
	if (contract.bid === null || contract.ask === null) {
		return contract.last ?? 0;
	}
	return (contract.bid + contract.ask) / 2;
}

function getContractDescription({
	strike,
	contractType,
	expiration,
	underlying,
}: {
	strike: number | null;
	contractType: "call" | "put" | null;
	expiration: string | null;
	underlying: string;
}) {
	if (!strike || !contractType || !expiration) {
		return "";
	}
	return `${underlying} ${expiration} $${strike} ${contractType === "call" ? "Call" : "Put"}`;
}

function validateOrderInputs({
	quantity,
	orderType,
	limitPrice,
	stopPrice,
}: {
	quantity: string;
	orderType: OrderType;
	limitPrice: string;
	stopPrice: string;
}): string | null {
	const qty = parseQuantity(quantity);
	if (Number.isNaN(qty) || qty <= 0) {
		return "Quantity must be a positive integer";
	}
	if (qty > 100) {
		return "Maximum 100 contracts per order";
	}
	if (
		isLimitOrderType(orderType) &&
		(!Number.parseFloat(limitPrice) || Number.parseFloat(limitPrice) <= 0)
	) {
		return "Limit price is required";
	}
	if (
		isStopOrderType(orderType) &&
		(!Number.parseFloat(stopPrice) || Number.parseFloat(stopPrice) <= 0)
	) {
		return "Stop price is required";
	}
	return null;
}

function usePositionBuilderState(contract: OptionsContract | null) {
	const [side, setSide] = useState<OrderSide>("buy");
	const [quantity, setQuantity] = useState("1");
	const [orderType, setOrderType] = useState<OrderType>("limit");
	const [timeInForce, setTimeInForce] = useState<TimeInForce>("day");
	const [limitPrice, setLimitPrice] = useState("");
	const [stopPrice, setStopPrice] = useState("");

	const defaultLimitPrice = useMemo(() => getDefaultLimitPrice(contract), [contract]);
	useEffect(() => {
		if (!limitPrice) {
			setLimitPrice(defaultLimitPrice.toFixed(2));
		}
	}, [defaultLimitPrice, limitPrice]);

	const validationError = useMemo(
		() => validateOrderInputs({ quantity, orderType, limitPrice, stopPrice }),
		[quantity, orderType, limitPrice, stopPrice],
	);

	const reset = useCallback(() => {
		setSide("buy");
		setQuantity("1");
		setOrderType("limit");
		setTimeInForce("day");
		setLimitPrice("");
		setStopPrice("");
	}, []);

	return {
		side,
		quantity,
		orderType,
		timeInForce,
		limitPrice,
		stopPrice,
		validationError,
		setSide,
		setQuantity,
		setOrderType,
		setTimeInForce,
		setLimitPrice,
		setStopPrice,
		reset,
	};
}

function usePositionBuilderActions({
	contract,
	form,
	onClose,
	onSubmit,
}: {
	contract: OptionsContract | null;
	form: ReturnType<typeof usePositionBuilderState>;
	onClose: () => void;
	onSubmit: (order: OptionsOrderRequest) => Promise<void>;
}) {
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleClose = useCallback(() => {
		form.reset();
		setError(null);
		onClose();
	}, [form, onClose]);

	const handleSubmit = useCallback(async () => {
		if (!contract || form.validationError) {
			return;
		}
		setIsSubmitting(true);
		setError(null);
		try {
			const order: OptionsOrderRequest = {
				symbol: contract.symbol,
				side: form.side,
				quantity: parseQuantity(form.quantity),
				orderType: form.orderType,
				timeInForce: form.timeInForce,
			};
			if (isLimitOrderType(form.orderType)) {
				order.limitPrice = Number.parseFloat(form.limitPrice);
			}
			if (isStopOrderType(form.orderType)) {
				order.stopPrice = Number.parseFloat(form.stopPrice);
			}
			await onSubmit(order);
			handleClose();
		} catch (submitError) {
			setError(submitError instanceof Error ? submitError.message : "Failed to submit order");
		} finally {
			setIsSubmitting(false);
		}
	}, [contract, form, onSubmit, handleClose]);

	return { error, isSubmitting, handleClose, handleSubmit };
}

function SideSelector({
	side,
	onChange,
}: {
	side: OrderSide;
	onChange: (value: OrderSide) => void;
}) {
	return (
		<fieldset className="mb-4">
			<legend className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-2">
				Side
			</legend>
			<div className="flex gap-2">
				<button
					type="button"
					onClick={() => onChange("buy")}
					className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
						side === "buy"
							? "bg-green-600 text-white"
							: "bg-cream-100 dark:bg-night-700 text-stone-700 dark:text-night-100 hover:bg-cream-200 dark:hover:bg-night-600"
					}`}
					data-testid="side-buy"
				>
					Buy to Open
				</button>
				<button
					type="button"
					onClick={() => onChange("sell")}
					className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
						side === "sell"
							? "bg-red-600 text-white"
							: "bg-cream-100 dark:bg-night-700 text-stone-700 dark:text-night-100 hover:bg-cream-200 dark:hover:bg-night-600"
					}`}
					data-testid="side-sell"
				>
					Sell to Open
				</button>
			</div>
		</fieldset>
	);
}

function NumberField({
	id,
	label,
	value,
	onChange,
	testId,
	min,
	max,
	step,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	testId: string;
	min: string;
	max?: string;
	step?: string;
}) {
	return (
		<div className="mb-4">
			<label
				htmlFor={id}
				className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-2"
			>
				{label}
			</label>
			<Input
				id={id}
				type="number"
				min={min}
				max={max}
				step={step}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				testId={testId}
			/>
		</div>
	);
}

function FormBody({
	contract,
	form,
	contractDescription,
	previewPrice,
	error,
}: {
	contract: OptionsContract;
	form: ReturnType<typeof usePositionBuilderState>;
	contractDescription: string;
	previewPrice: number;
	error: string | null;
}) {
	return (
		<DialogBody>
			<div className="mb-4 p-3 bg-cream-50 dark:bg-night-700 rounded-md">
				<div className="text-sm font-medium text-stone-700 dark:text-night-50">
					{contractDescription}
				</div>
				<div className="mt-1 flex items-center gap-4 text-xs text-stone-500 dark:text-night-300">
					{contract.bid !== null && <span>Bid: ${contract.bid.toFixed(2)}</span>}
					{contract.ask !== null && <span>Ask: ${contract.ask.toFixed(2)}</span>}
					{contract.last !== null && <span>Last: ${contract.last.toFixed(2)}</span>}
				</div>
			</div>
			<SideSelector side={form.side} onChange={form.setSide} />
			<NumberField
				id="quantity"
				label="Quantity (Contracts)"
				value={form.quantity}
				onChange={form.setQuantity}
				testId="quantity-input"
				min="1"
				max="100"
			/>
			<fieldset className="mb-4">
				<legend className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-2">
					Order Type
				</legend>
				<Select
					options={ORDER_TYPE_OPTIONS}
					value={form.orderType}
					onChange={(value) => form.setOrderType(value as OrderType)}
					testId="order-type-select"
				/>
			</fieldset>
			{isLimitOrderType(form.orderType) && (
				<NumberField
					id="limit-price"
					label="Limit Price"
					value={form.limitPrice}
					onChange={form.setLimitPrice}
					testId="limit-price-input"
					min="0.01"
					step="0.01"
				/>
			)}
			{isStopOrderType(form.orderType) && (
				<NumberField
					id="stop-price"
					label="Stop Price"
					value={form.stopPrice}
					onChange={form.setStopPrice}
					testId="stop-price-input"
					min="0.01"
					step="0.01"
				/>
			)}
			<fieldset className="mb-4">
				<legend className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-2">
					Time in Force
				</legend>
				<Select
					options={TIME_IN_FORCE_OPTIONS}
					value={form.timeInForce}
					onChange={(value) => form.setTimeInForce(value as TimeInForce)}
					testId="time-in-force-select"
				/>
			</fieldset>
			<OrderPreview
				side={form.side}
				quantity={parseQuantity(form.quantity) || 0}
				contractPrice={previewPrice}
				data-testid="order-preview"
			/>
			{(error || form.validationError) && (
				<div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
					<p className="text-sm text-red-600 dark:text-red-400">{error || form.validationError}</p>
				</div>
			)}
		</DialogBody>
	);
}

export const PositionBuilderModal = memo(function PositionBuilderModal({
	isOpen,
	onClose,
	contract,
	contractType,
	strike,
	underlying,
	expiration,
	onSubmit,
	"data-testid": testId = "position-builder-modal",
}: PositionBuilderModalProps) {
	const form = usePositionBuilderState(contract);
	const { error, isSubmitting, handleClose, handleSubmit } = usePositionBuilderActions({
		contract,
		form,
		onClose,
		onSubmit,
	});

	if (!contract) {
		return null;
	}

	const contractDescription = getContractDescription({
		strike,
		contractType,
		expiration,
		underlying,
	});
	const previewPrice =
		form.orderType === "market"
			? form.side === "buy"
				? (contract.ask ?? 0)
				: (contract.bid ?? 0)
			: Number.parseFloat(form.limitPrice) || 0;

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent maxWidth="max-w-lg" data-testid={testId}>
				<DialogHeader>
					<DialogTitle>Build Position</DialogTitle>
				</DialogHeader>
				<FormBody
					contract={contract}
					form={form}
					contractDescription={contractDescription}
					previewPrice={previewPrice}
					error={error}
				/>
				<DialogFooter>
					<DialogClose disabled={isSubmitting}>Cancel</DialogClose>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={isSubmitting || !!form.validationError}
						className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
							form.side === "buy"
								? "bg-green-600 hover:bg-green-700 text-white"
								: "bg-red-600 hover:bg-red-700 text-white"
						} disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
							form.side === "buy" ? "focus-visible:ring-green-500" : "focus-visible:ring-red-500"
						}`}
						data-testid="submit-order-button"
					>
						{isSubmitting ? (
							<span className="flex items-center gap-2">
								<Spinner size="sm" />
								Submitting...
							</span>
						) : (
							`${form.side === "buy" ? "Buy" : "Sell"} ${form.quantity} Contract${
								parseQuantity(form.quantity) !== 1 ? "s" : ""
							}`
						)}
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
});

export default PositionBuilderModal;
