/**
 * Indicator Drawer - Slide-out panel for indicator snapshot
 *
 * Right-side drawer that displays the IndicatorSnapshotPanel.
 * Follows the StreamPanel pattern for consistent UX.
 *
 * @see docs/plans/ui/25-motion.md Panel transitions (250ms)
 * @see docs/plans/ui/23-layout.md Full drawer specs
 */

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, X } from "lucide-react";
import { useEffect } from "react";
import { type IndicatorCategory, IndicatorSnapshotPanel } from "./IndicatorSnapshotPanel";

interface IndicatorDrawerProps {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
  sections?: IndicatorCategory[];
}

const DRAWER_WIDTH = 420;

export function IndicatorDrawer({ symbol, isOpen, onClose, sections }: IndicatorDrawerProps) {
  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

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

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            style={{ width: DRAWER_WIDTH }}
            className="fixed right-0 top-0 h-full bg-white dark:bg-night-800 border-l border-cream-200 dark:border-night-700 z-50 flex flex-col shadow-xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-cream-200 dark:border-night-700 shrink-0">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-stone-500 dark:text-night-400" />
                <h2 className="text-lg font-semibold text-stone-900 dark:text-night-50">
                  {symbol} Indicators
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-stone-500 hover:text-stone-700 dark:text-night-400 dark:hover:text-night-200 hover:bg-cream-100 dark:hover:bg-night-700 rounded-md transition-colors"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content - scrollable */}
            <div className="flex-1 overflow-auto p-4">
              <IndicatorSnapshotPanel symbol={symbol} sections={sections} layout="compact" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

interface IndicatorDrawerToggleProps {
  isOpen: boolean;
  onClick: () => void;
}

export function IndicatorDrawerToggle({ isOpen, onClick }: IndicatorDrawerToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
        isOpen
          ? "bg-primary text-white"
          : "text-stone-600 dark:text-night-200 border border-cream-200 dark:border-night-700 hover:bg-cream-100 dark:hover:bg-night-700"
      }`}
      title="Toggle indicators panel (I)"
    >
      <BarChart3 className="w-4 h-4" />
      <span>Indicators</span>
    </button>
  );
}

export default IndicatorDrawer;
