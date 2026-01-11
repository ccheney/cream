/**
 * Select Component Context
 */

import { createContext, useContext } from "react";
import type { SelectContextValue } from "./types";

export const SelectContext = createContext<SelectContextValue | null>(null);

export function useSelectContext(): SelectContextValue {
  const context = useContext(SelectContext);
  if (!context) {
    throw new Error("Select components must be used within a Select provider");
  }
  return context;
}
