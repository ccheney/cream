/**
 * NewTradesButton Component
 *
 * Floating button that appears when new trades arrive while user has scrolled up.
 */

"use client";

import { memo } from "react";

import type { NewTradesButtonProps } from "./types";

export const NewTradesButton = memo(function NewTradesButton({
  count,
  onClick,
}: NewTradesButtonProps): React.ReactElement | null {
  if (count === 0) {
    return null;
  }

  return (
    <button
      type="button"
      className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-full shadow-lg transition-all animate-slide-down"
      onClick={onClick}
      aria-label={`Show ${count} new ${count === 1 ? "trade" : "trades"}`}
    >
      <span className="inline-flex items-center gap-1">
        <span aria-hidden="true">↓</span>
        <span>
          {count} new {count === 1 ? "trade" : "trades"}
        </span>
      </span>
    </button>
  );
});

export default NewTradesButton;
