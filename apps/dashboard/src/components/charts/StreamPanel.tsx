"use client";

/**
 * Stream Panel - Slide-out panel for symbol event stream on charts page
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 3.2
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { SymbolStream } from "@/components/feed/SymbolStream";

// ============================================
// Types
// ============================================

interface StreamPanelProps {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
  width?: number;
}

// ============================================
// Constants
// ============================================

const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 300;
const MAX_WIDTH = 600;

// ============================================
// Component
// ============================================

export function StreamPanel({
  symbol,
  isOpen,
  onClose,
  width: initialWidth = DEFAULT_WIDTH,
}: StreamPanelProps) {
  const [width, setWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);

  // Handle resize
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // Handle keyboard shortcut to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Handle resize drag
  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{ width }}
            className="fixed right-0 top-0 h-full bg-white dark:bg-night-800 border-l border-cream-200 dark:border-night-700 z-50 flex flex-col shadow-xl"
          >
            {/* Resize Handle */}
            <div
              role="slider"
              aria-label="Resize panel"
              aria-valuemin={MIN_WIDTH}
              aria-valuemax={MAX_WIDTH}
              aria-valuenow={width}
              tabIndex={0}
              onMouseDown={handleResizeStart}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") {
                  setWidth((w) => Math.min(MAX_WIDTH, w + 20));
                } else if (e.key === "ArrowRight") {
                  setWidth((w) => Math.max(MIN_WIDTH, w - 20));
                }
              }}
              className={`absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-cream-300 dark:hover:bg-night-600 transition-colors ${
                isResizing ? "bg-cream-400 dark:bg-night-500" : ""
              }`}
            />

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-cream-200 dark:border-night-700">
              <h2 className="text-lg font-semibold text-cream-900 dark:text-cream-100">
                {symbol} Event Stream
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-cream-500 hover:text-cream-700 dark:text-cream-400 dark:hover:text-cream-200 transition-colors"
                title="Close (Esc)"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  role="img"
                  aria-label="Close panel"
                >
                  <title>Close panel</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Stream Content */}
            <div className="flex-1 overflow-hidden">
              <SymbolStream
                symbol={symbol}
                showQuoteHeader={true}
                showStatistics={true}
                maxEvents={300}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================
// Toggle Button Component
// ============================================

interface StreamToggleButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

export function StreamToggleButton({ isOpen, onClick }: StreamToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors ${
        isOpen
          ? "bg-stone-700 dark:bg-night-200 text-cream-50 dark:text-night-900"
          : "bg-cream-300 dark:bg-night-700 text-stone-600 dark:text-night-300 hover:bg-cream-200 dark:hover:bg-night-800"
      }`}
      title="Toggle event stream (Shift+E)"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        role="img"
        aria-label="Stream"
      >
        <title>Stream</title>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
      <span>Stream</span>
    </button>
  );
}

export default StreamPanel;
