"use client";

/**
 * Stream Panel - Slide-out panel for symbol event stream on charts page
 *
 * @see docs/plans/ui/40-streaming-data-integration.md Part 3.2
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SymbolStream } from "@/components/feed/SymbolStream";

interface StreamPanelProps {
	symbol: string;
	isOpen: boolean;
	onClose: () => void;
	width?: number;
}

const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 300;
const MAX_WIDTH = 600;

function clampWidth(width: number): number {
	return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

function usePanelCloseOnEscape(isOpen: boolean, onClose: () => void) {
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" && isOpen) {
				onClose();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [isOpen, onClose]);
}

function useResizeControls(
	isOpen: boolean,
	setWidth: (value: number | ((current: number) => number)) => void,
) {
	const [isResizing, setIsResizing] = useState(false);

	const startResize = useCallback((event: React.MouseEvent) => {
		event.preventDefault();
		setIsResizing(true);
	}, []);

	const moveResize = useCallback(
		(event: MouseEvent) => {
			setWidth(window.innerWidth - event.clientX);
		},
		[setWidth],
	);

	const stopResize = useCallback(() => {
		setIsResizing(false);
	}, []);

	const adjustResize = useCallback(
		(event: React.KeyboardEvent) => {
			const { key } = event;
			const incrementsByKey = {
				ArrowLeft: 20,
				ArrowRight: -20,
			} as const;
			const nextDelta = incrementsByKey[key as keyof typeof incrementsByKey];
			if (nextDelta === undefined) {
				return;
			}

			setWidth((current) => clampWidth(current + nextDelta));
		},
		[setWidth],
	);

	useEffect(() => {
		if (!isOpen || !isResizing) {
			return;
		}

		window.addEventListener("mousemove", moveResize);
		window.addEventListener("mouseup", stopResize);

		return () => {
			window.removeEventListener("mousemove", moveResize);
			window.removeEventListener("mouseup", stopResize);
		};
	}, [isOpen, isResizing, moveResize, stopResize]);

	return { isResizing, startResize, adjustResize };
}

function PanelBackdrop({ onClose }: { onClose: () => void }) {
	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 0.3 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.2 }}
			className="fixed inset-0 bg-black z-40"
			onClick={onClose}
		/>
	);
}

function ResizeHandle({
	width,
	isResizing,
	onMouseDown,
	onKeyDown,
}: {
	width: number;
	isResizing: boolean;
	onMouseDown: (event: React.MouseEvent) => void;
	onKeyDown: (event: React.KeyboardEvent) => void;
}) {
	return (
		<div
			role="slider"
			aria-label="Resize panel"
			aria-valuemin={MIN_WIDTH}
			aria-valuemax={MAX_WIDTH}
			aria-valuenow={width}
			tabIndex={0}
			onMouseDown={onMouseDown}
			onKeyDown={onKeyDown}
			className={`absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-cream-300 dark:hover:bg-night-600 transition-colors ${
				isResizing ? "bg-cream-400 dark:bg-night-500" : ""
			}`}
		/>
	);
}

function StreamHeader({ symbol, onClose }: { symbol: string; onClose: () => void }) {
	return (
		<div className="flex items-center justify-between px-4 py-3 border-b border-cream-200 dark:border-night-700">
			<h2 className="text-lg font-semibold text-stone-900 dark:text-night-50">
				{symbol} Event Stream
			</h2>
			<button
				type="button"
				onClick={onClose}
				className="p-1 text-stone-500 dark:text-night-300 hover:text-stone-700 dark:hover:text-night-100 transition-colors"
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
	);
}

function StreamPanelFrame({
	isOpen,
	symbol,
	width,
	isResizing,
	onResizeStart,
	onResizeKeyDown,
	onClose,
}: {
	isOpen: boolean;
	symbol: string;
	width: number;
	isResizing: boolean;
	onResizeStart: (event: React.MouseEvent) => void;
	onResizeKeyDown: (event: React.KeyboardEvent) => void;
	onClose: () => void;
}) {
	if (!isOpen) {
		return null;
	}

	return (
		<>
			<PanelBackdrop onClose={onClose} />
			<motion.div
				initial={{ x: "100%" }}
				animate={{ x: 0 }}
				exit={{ x: "100%" }}
				transition={{ type: "spring", damping: 25, stiffness: 300 }}
				style={{ width }}
				className="fixed right-0 top-0 h-full bg-white dark:bg-night-800 border-l border-cream-200 dark:border-night-700 z-50 flex flex-col shadow-xl"
			>
				<ResizeHandle
					width={width}
					isResizing={isResizing}
					onMouseDown={onResizeStart}
					onKeyDown={onResizeKeyDown}
				/>
				<StreamHeader symbol={symbol} onClose={onClose} />
				<div className="flex-1 overflow-hidden">
					<SymbolStream symbol={symbol} showQuoteHeader showStatistics maxEvents={300} />
				</div>
			</motion.div>
		</>
	);
}

export function StreamPanel({
	symbol,
	isOpen,
	onClose,
	width: initialWidth = DEFAULT_WIDTH,
}: StreamPanelProps) {
	const [width, setWidth] = useState(initialWidth);
	const normalizedWidth = useMemo(() => clampWidth(width), [width]);

	usePanelCloseOnEscape(isOpen, onClose);

	const setClampedWidth = useCallback((value: number | ((current: number) => number)) => {
		setWidth((current) => clampWidth(typeof value === "function" ? value(current) : value));
	}, []);

	const { isResizing, startResize, adjustResize } = useResizeControls(isOpen, setClampedWidth);

	const handleResizeStart = useCallback(
		(event: React.MouseEvent) => {
			startResize(event);
		},
		[startResize],
	);
	const handleResizeKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			adjustResize(event);
		},
		[adjustResize],
	);

	return (
		<AnimatePresence>
			{isOpen && (
				<StreamPanelFrame
					isOpen={isOpen}
					symbol={symbol}
					width={normalizedWidth}
					isResizing={isResizing}
					onResizeStart={handleResizeStart}
					onResizeKeyDown={handleResizeKeyDown}
					onClose={onClose}
				/>
			)}
		</AnimatePresence>
	);
}

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
			title="Toggle events panel (Shift+E)"
		>
			<svg
				className="w-4 h-4"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
				role="img"
				aria-label="Events"
			>
				<title>Events</title>
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M13 10V3L4 14h7v7l9-11h-7z"
				/>
			</svg>
			<span>Events</span>
		</button>
	);
}

export default StreamPanel;
