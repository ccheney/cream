"use client";

import { useCallback, useId, useState } from "react";

import { CollapsibleContext } from "./context";
import type { CollapsibleProps } from "./types";

/**
 * Collapsible - Container for expandable content.
 *
 * @example
 * ```tsx
 * <Collapsible defaultOpen>
 *   <CollapsibleTrigger>
 *     Show Details
 *   </CollapsibleTrigger>
 *   <CollapsibleContent>
 *     Hidden content revealed on expand
 *   </CollapsibleContent>
 * </Collapsible>
 * ```
 */
export function Collapsible({
	open: controlledOpen,
	defaultOpen = false,
	onOpenChange,
	disabled = false,
	children,
}: CollapsibleProps) {
	const [internalOpen, setInternalOpen] = useState(defaultOpen);
	const contentId = useId();
	const triggerId = useId();

	const isControlled = controlledOpen !== undefined;
	const isOpen = isControlled ? controlledOpen : internalOpen;

	const toggle = useCallback(() => {
		if (disabled) {
			return;
		}

		const newOpen = !isOpen;
		if (!isControlled) {
			setInternalOpen(newOpen);
		}
		onOpenChange?.(newOpen);
	}, [isOpen, isControlled, onOpenChange, disabled]);

	return (
		<CollapsibleContext.Provider value={{ isOpen, toggle, contentId, triggerId }}>
			<div data-state={isOpen ? "open" : "closed"} data-disabled={disabled || undefined}>
				{children}
			</div>
		</CollapsibleContext.Provider>
	);
}
