import { useCallback, useEffect, useRef, useState } from "react";

export type FlashDirection = "up" | "down" | null;

export interface FlashState {
	direction: FlashDirection;
	isFlashing: boolean;
}

export interface UsePriceFlashOptions {
	debounceMs?: number;
	flashDurationMs?: number;
}

export interface UsePriceFlashReturn {
	flash: FlashState;
	triggerFlash: (direction: FlashDirection) => void;
}

const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_FLASH_DURATION_MS = 1100; // 300ms in + 500ms hold + 300ms out

export function usePriceFlash(
	currentPrice: number,
	previousPrice: number | undefined,
	options: UsePriceFlashOptions = {},
): UsePriceFlashReturn {
	const { debounceMs = DEFAULT_DEBOUNCE_MS, flashDurationMs = DEFAULT_FLASH_DURATION_MS } = options;

	const [flash, setFlash] = useState<FlashState>({
		direction: null,
		isFlashing: false,
	});

	const lastFlashTimeRef = useRef<number>(0);
	const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const prevPriceRef = useRef<number | undefined>(previousPrice);

	const clearFlash = useCallback(() => {
		setFlash({ direction: null, isFlashing: false });
	}, []);

	const triggerFlash = useCallback(
		(direction: FlashDirection) => {
			const now = Date.now();

			if (now - lastFlashTimeRef.current < debounceMs) {
				return;
			}

			if (flashTimeoutRef.current) {
				clearTimeout(flashTimeoutRef.current);
			}

			lastFlashTimeRef.current = now;
			setFlash({ direction, isFlashing: true });

			flashTimeoutRef.current = setTimeout(clearFlash, flashDurationMs);
		},
		[debounceMs, flashDurationMs, clearFlash],
	);

	useEffect(() => {
		if (prevPriceRef.current === undefined) {
			prevPriceRef.current = currentPrice;
			return;
		}

		if (currentPrice === prevPriceRef.current) {
			return;
		}

		const direction: FlashDirection = currentPrice > prevPriceRef.current ? "up" : "down";
		triggerFlash(direction);
		prevPriceRef.current = currentPrice;
	}, [currentPrice, triggerFlash]);

	useEffect(() => {
		return () => {
			if (flashTimeoutRef.current) {
				clearTimeout(flashTimeoutRef.current);
			}
		};
	}, []);

	return { flash, triggerFlash };
}

export default usePriceFlash;
