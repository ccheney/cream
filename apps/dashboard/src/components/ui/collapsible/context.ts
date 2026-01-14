"use client";

import { createContext, useContext } from "react";

import type { AccordionContextValue, CollapsibleContextValue } from "./types";

// ============================================
// Collapsible Context
// ============================================

export const CollapsibleContext = createContext<CollapsibleContextValue | null>(null);

export function useCollapsibleContext(): CollapsibleContextValue {
	const context = useContext(CollapsibleContext);
	if (!context) {
		throw new Error("Collapsible components must be used within a Collapsible provider");
	}
	return context;
}

// ============================================
// Accordion Context
// ============================================

export const AccordionContext = createContext<AccordionContextValue | null>(null);

export function useAccordionContext(): AccordionContextValue | null {
	return useContext(AccordionContext);
}
