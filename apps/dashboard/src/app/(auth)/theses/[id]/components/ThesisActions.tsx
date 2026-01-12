"use client";

/**
 * Thesis Actions Component
 *
 * Modal dialogs for invalidating and realizing theses.
 */

import { Button } from "@/components/ui/button";
import type { InvalidateModalProps, ModalProps, RealizeModalProps } from "./types";

export function Modal({ title, children, onClose }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 cursor-default"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        aria-label="Close modal"
      />
      <div className="relative bg-white dark:bg-night-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function InvalidateModal({
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
  isPending,
}: InvalidateModalProps) {
  return (
    <Modal title="Invalidate Thesis" onClose={onCancel}>
      <div className="space-y-4">
        <p className="text-sm text-stone-600 dark:text-night-200 dark:text-night-400">
          This will mark the thesis as invalidated. Please provide a reason.
        </p>
        <div>
          <label
            htmlFor="invalidation-reason"
            className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-1"
          >
            Reason for invalidation
          </label>
          <textarea
            id="invalidation-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={3}
            className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-2 bg-white dark:bg-night-800 text-stone-900 dark:text-night-50"
            placeholder="e.g., Price broke below key support level"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={!reason.trim() || isPending}>
            {isPending ? "Invalidating..." : "Confirm Invalidate"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function RealizeModal({
  exitPrice,
  exitNotes,
  onExitPriceChange,
  onExitNotesChange,
  onConfirm,
  onCancel,
  isPending,
}: RealizeModalProps) {
  return (
    <Modal title="Realize Thesis" onClose={onCancel}>
      <div className="space-y-4">
        <p className="text-sm text-stone-600 dark:text-night-200 dark:text-night-400">
          Mark this thesis as realized. Enter the exit price to calculate final P&L.
        </p>
        <div>
          <label
            htmlFor="exit-price"
            className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-1"
          >
            Exit Price
          </label>
          <input
            id="exit-price"
            type="number"
            step="0.01"
            value={exitPrice}
            onChange={(e) => onExitPriceChange(e.target.value)}
            className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-2 bg-white dark:bg-night-800 text-stone-900 dark:text-night-50"
            placeholder="e.g., 185.50"
          />
        </div>
        <div>
          <label
            htmlFor="exit-notes"
            className="block text-sm font-medium text-stone-700 dark:text-night-100 mb-1"
          >
            Notes (optional)
          </label>
          <textarea
            id="exit-notes"
            value={exitNotes}
            onChange={(e) => onExitNotesChange(e.target.value)}
            rows={2}
            className="w-full text-sm border border-cream-200 dark:border-night-700 rounded-md px-3 py-2 bg-white dark:bg-night-800 text-stone-900 dark:text-night-50"
            placeholder="e.g., Catalyst played out as expected"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={!exitPrice || isPending}>
            {isPending ? "Realizing..." : "Confirm Realize"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
