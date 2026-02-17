"use client";

import { forwardRef, type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";

import { useCollapsibleContext } from "./context";
import { type CollapsibleContentProps, cn } from "./types";

/**
 * CollapsibleContent - Animated content that expands/collapses.
 */

function useCollapsibleAnimation(
	isOpen: boolean,
	animationDuration: number,
	contentRef: MutableRefObject<HTMLElement | null>,
) {
	const [height, setHeight] = useState<number | "auto">(isOpen ? "auto" : 0);
	const [isAnimating, setIsAnimating] = useState(false);

	useEffect(() => {
		const content = contentRef.current;
		if (!content) {
			return;
		}

		if (isOpen) {
			const scrollHeight = content.scrollHeight;
			setHeight(0);
			setIsAnimating(true);

			void content.offsetHeight;

			requestAnimationFrame(() => {
				setHeight(scrollHeight);
			});

			const timeout = setTimeout(() => {
				setHeight("auto");
				setIsAnimating(false);
			}, animationDuration);

			return () => clearTimeout(timeout);
		}

		const scrollHeight = content.scrollHeight;
		setHeight(scrollHeight);
		setIsAnimating(true);

		void content.offsetHeight;

		requestAnimationFrame(() => {
			setHeight(0);
		});

		const timeout = setTimeout(() => {
			setIsAnimating(false);
		}, animationDuration);

		return () => clearTimeout(timeout);
	}, [animationDuration, contentRef, isOpen]);

	return { height, isAnimating };
}

function useCollapsibleSectionRef(
	forwardedRef: React.Ref<HTMLElement> | undefined,
	contentRef: MutableRefObject<HTMLElement | null>,
) {
	return useCallback(
		(node: HTMLElement | null) => {
			contentRef.current = node;
			if (typeof forwardedRef === "function") {
				forwardedRef(node);
			} else if (forwardedRef) {
				forwardedRef.current = node;
			}
		},
		[forwardedRef, contentRef],
	);
}

export const CollapsibleContent = forwardRef<HTMLElement, CollapsibleContentProps>(
	function CollapsibleContent(
		{ children, animationDuration = 200, forceMount, className, style, ...props },
		ref,
	) {
		const { isOpen, contentId, triggerId } = useCollapsibleContext();
		const contentRef = useRef<HTMLElement>(null);
		const { height, isAnimating } = useCollapsibleAnimation(isOpen, animationDuration, contentRef);
		const handleRef = useCollapsibleSectionRef(ref, contentRef);

		if (!forceMount && !isOpen && height === 0 && !isAnimating) {
			return null;
		}

		return (
			<section
				ref={handleRef}
				id={contentId}
				aria-labelledby={triggerId}
				aria-hidden={!isOpen}
				className={cn("overflow-hidden", className)}
				style={{
					height: typeof height === "number" ? `${height}px` : height,
					transition: isAnimating ? `height ${animationDuration}ms ease-out` : undefined,
					...style,
				}}
				{...props}
			>
				{children}
			</section>
		);
	},
);
