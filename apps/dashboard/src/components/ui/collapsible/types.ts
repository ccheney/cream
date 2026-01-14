/**
 * Collapsible Component Types
 *
 * @see docs/plans/ui/24-components.md Expandable Cards section
 */

import type { HTMLAttributes, ReactNode } from "react";

// ============================================
// Utility
// ============================================

export function cn(...classes: (string | boolean | undefined | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

// ============================================
// Collapsible Types
// ============================================

export interface CollapsibleContextValue {
	isOpen: boolean;
	toggle: () => void;
	contentId: string;
	triggerId: string;
}

export interface CollapsibleProps {
	/** Controlled open state */
	open?: boolean;
	/** Default open state (uncontrolled) */
	defaultOpen?: boolean;
	/** Callback when open state changes */
	onOpenChange?: (open: boolean) => void;
	/** Disable the collapsible */
	disabled?: boolean;
	/** Children (CollapsibleTrigger, CollapsibleContent) */
	children: ReactNode;
}

export interface CollapsibleTriggerProps extends HTMLAttributes<HTMLButtonElement> {
	/** Custom element to render (default: button) */
	asChild?: boolean;
	children: ReactNode;
}

export interface CollapsibleContentProps extends HTMLAttributes<HTMLElement> {
	/** Animation duration in ms (default: 200) */
	animationDuration?: number;
	/** Force mount (always render content, useful for SEO) */
	forceMount?: boolean;
	children: ReactNode;
}

// ============================================
// Accordion Types
// ============================================

export type AccordionType = "single" | "multiple";

export interface AccordionContextValue {
	type: AccordionType;
	value: string | string[];
	toggle: (itemValue: string) => void;
}

export interface AccordionProps {
	/** Whether only one or multiple items can be open */
	type?: AccordionType;
	/** Controlled value (item key or array of keys) */
	value?: string | string[];
	/** Default value (uncontrolled) */
	defaultValue?: string | string[];
	/** Callback when value changes */
	onValueChange?: (value: string | string[]) => void;
	/** Class name for the container */
	className?: string;
	/** Children (AccordionItem components) */
	children: ReactNode;
}

export interface AccordionItemProps {
	/** Unique value for this item */
	value: string;
	/** Disable the item */
	disabled?: boolean;
	/** Class name */
	className?: string;
	/** Children (AccordionTrigger, AccordionContent) */
	children: ReactNode;
}

export interface AccordionTriggerProps extends HTMLAttributes<HTMLButtonElement> {
	children: ReactNode;
}

export interface AccordionContentProps extends HTMLAttributes<HTMLDivElement> {
	children: ReactNode;
}
