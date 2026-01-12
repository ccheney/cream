"use client";

import { memo, useCallback, useMemo, useState } from "react";
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
  const [side, setSide] = useState<OrderSide>("buy");
  const [quantity, setQuantity] = useState<string>("1");
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [timeInForce, setTimeInForce] = useState<TimeInForce>("day");
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [stopPrice, setStopPrice] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultLimitPrice = useMemo(() => {
    if (!contract?.bid || !contract?.ask) {
      return contract?.last ?? 0;
    }
    return (contract.bid + contract.ask) / 2;
  }, [contract]);

  useMemo(() => {
    if (contract && !limitPrice) {
      setLimitPrice(defaultLimitPrice.toFixed(2));
    }
  }, [contract, defaultLimitPrice, limitPrice]);

  const handleClose = useCallback(() => {
    setSide("buy");
    setQuantity("1");
    setOrderType("limit");
    setTimeInForce("day");
    setLimitPrice("");
    setStopPrice("");
    setError(null);
    onClose();
  }, [onClose]);

  const validationError = useMemo(() => {
    const qty = parseInt(quantity, 10);
    if (Number.isNaN(qty) || qty <= 0) {
      return "Quantity must be a positive integer";
    }
    if (qty > 100) {
      return "Maximum 100 contracts per order";
    }

    if (orderType === "limit" || orderType === "stop_limit") {
      const price = parseFloat(limitPrice);
      if (Number.isNaN(price) || price <= 0) {
        return "Limit price is required";
      }
    }

    if (orderType === "stop" || orderType === "stop_limit") {
      const price = parseFloat(stopPrice);
      if (Number.isNaN(price) || price <= 0) {
        return "Stop price is required";
      }
    }

    return null;
  }, [quantity, orderType, limitPrice, stopPrice]);

  const handleSubmit = useCallback(async () => {
    if (!contract || validationError) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const order: OptionsOrderRequest = {
        symbol: contract.symbol,
        side,
        quantity: parseInt(quantity, 10),
        orderType,
        timeInForce,
      };

      if (orderType === "limit" || orderType === "stop_limit") {
        order.limitPrice = parseFloat(limitPrice);
      }

      if (orderType === "stop" || orderType === "stop_limit") {
        order.stopPrice = parseFloat(stopPrice);
      }

      await onSubmit(order);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit order");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    contract,
    validationError,
    side,
    quantity,
    orderType,
    timeInForce,
    limitPrice,
    stopPrice,
    onSubmit,
    handleClose,
  ]);

  const contractDescription = useMemo(() => {
    if (!strike || !contractType || !expiration) {
      return "";
    }
    const typeLabel = contractType === "call" ? "Call" : "Put";
    return `${underlying} ${expiration} $${strike} ${typeLabel}`;
  }, [underlying, strike, contractType, expiration]);

  if (!contract) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent maxWidth="max-w-lg" data-testid={testId}>
        <DialogHeader>
          <DialogTitle>Build Position</DialogTitle>
        </DialogHeader>

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

          <div className="mb-4">
            {/* biome-ignore lint/a11y/noLabelWithoutControl: label for button group */}
            <label className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-2">
              Side
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSide("buy")}
                className={`
                  flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors
                  ${
                    side === "buy"
                      ? "bg-green-600 text-white"
                      : "bg-cream-100 dark:bg-night-700 text-stone-700 dark:text-night-100 hover:bg-cream-200 dark:hover:bg-night-600"
                  }
                `}
                data-testid="side-buy"
              >
                Buy to Open
              </button>
              <button
                type="button"
                onClick={() => setSide("sell")}
                className={`
                  flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors
                  ${
                    side === "sell"
                      ? "bg-red-600 text-white"
                      : "bg-cream-100 dark:bg-night-700 text-stone-700 dark:text-night-100 hover:bg-cream-200 dark:hover:bg-night-600"
                  }
                `}
                data-testid="side-sell"
              >
                Sell to Open
              </button>
            </div>
          </div>

          <div className="mb-4">
            <label
              htmlFor="quantity"
              className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-2"
            >
              Quantity (Contracts)
            </label>
            <Input
              id="quantity"
              type="number"
              min="1"
              max="100"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              testId="quantity-input"
            />
          </div>

          <div className="mb-4">
            {/* biome-ignore lint/a11y/noLabelWithoutControl: label for custom Select */}
            <label className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-2">
              Order Type
            </label>
            <Select
              options={ORDER_TYPE_OPTIONS}
              value={orderType}
              onChange={(value) => setOrderType(value as OrderType)}
              testId="order-type-select"
            />
          </div>

          {(orderType === "limit" || orderType === "stop_limit") && (
            <div className="mb-4">
              <label
                htmlFor="limit-price"
                className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-2"
              >
                Limit Price
              </label>
              <Input
                id="limit-price"
                type="number"
                min="0.01"
                step="0.01"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                testId="limit-price-input"
              />
            </div>
          )}

          {(orderType === "stop" || orderType === "stop_limit") && (
            <div className="mb-4">
              <label
                htmlFor="stop-price"
                className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-2"
              >
                Stop Price
              </label>
              <Input
                id="stop-price"
                type="number"
                min="0.01"
                step="0.01"
                value={stopPrice}
                onChange={(e) => setStopPrice(e.target.value)}
                testId="stop-price-input"
              />
            </div>
          )}

          <div className="mb-4">
            {/* biome-ignore lint/a11y/noLabelWithoutControl: label for custom Select */}
            <label className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-2">
              Time in Force
            </label>
            <Select
              options={TIME_IN_FORCE_OPTIONS}
              value={timeInForce}
              onChange={(value) => setTimeInForce(value as TimeInForce)}
              testId="time-in-force-select"
            />
          </div>

          <OrderPreview
            side={side}
            quantity={parseInt(quantity, 10) || 0}
            contractPrice={
              orderType === "market"
                ? side === "buy"
                  ? (contract.ask ?? 0)
                  : (contract.bid ?? 0)
                : parseFloat(limitPrice) || 0
            }
            data-testid="order-preview"
          />

          {(error || validationError) && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-sm text-red-600 dark:text-red-400">{error || validationError}</p>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <DialogClose disabled={isSubmitting}>Cancel</DialogClose>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !!validationError}
            className={`
              px-4 py-2 text-sm font-medium rounded-md
              transition-colors
              ${
                side === "buy"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : "bg-red-600 hover:bg-red-700 text-white"
              }
              disabled:opacity-50 disabled:cursor-not-allowed
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
              ${side === "buy" ? "focus-visible:ring-green-500" : "focus-visible:ring-red-500"}
            `}
            data-testid="submit-order-button"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" />
                Submitting...
              </span>
            ) : (
              `${side === "buy" ? "Buy" : "Sell"} ${quantity} Contract${parseInt(quantity, 10) !== 1 ? "s" : ""}`
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});

export default PositionBuilderModal;
