/**
 * Command Palette Context
 */

"use client";

import { createContext, useContext } from "react";
import type { CommandContextValue } from "./types.js";

export const CommandContext = createContext<CommandContextValue | null>(null);

export function useCommandContext(): CommandContextValue {
  const context = useContext(CommandContext);
  if (!context) {
    throw new Error("Command components must be used within CommandPalette");
  }
  return context;
}
