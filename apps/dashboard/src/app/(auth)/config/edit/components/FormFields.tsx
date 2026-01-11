"use client";

import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InfoIcon } from "./helpers";

export interface FormFieldProps {
  label: string;
  hint?: string;
  tooltip?: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
}

export function FormField({
  label,
  hint,
  tooltip,
  value,
  onChange,
  suffix,
  min,
  max,
  step = 1,
  id,
}: FormFieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-cream-700 dark:text-cream-300"
        >
          {label}
          {hint && <span className="ml-1 text-cream-400 font-normal">({hint})</span>}
        </label>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger>
              <InfoIcon className="w-3.5 h-3.5 text-cream-400 dark:text-cream-500 cursor-help" />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="relative">
        <input
          id={inputId}
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          className="w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-cream-400">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

type TimeUnit = "seconds" | "minutes" | "hours";

export interface DurationFieldProps {
  label: string;
  hint?: string;
  tooltip?: string;
  value: number;
  onChange: (valueMs: number) => void;
  minMs?: number;
  maxMs?: number;
  id?: string;
}

const TIME_UNIT_MS: Record<TimeUnit, number> = {
  seconds: 1000,
  minutes: 60 * 1000,
  hours: 60 * 60 * 1000,
};

function getBestUnit(ms: number): TimeUnit {
  if (ms >= TIME_UNIT_MS.hours && ms % TIME_UNIT_MS.hours === 0) {
    return "hours";
  }
  if (ms >= TIME_UNIT_MS.minutes && ms % TIME_UNIT_MS.minutes === 0) {
    return "minutes";
  }
  return "seconds";
}

export function DurationField({
  label,
  hint,
  tooltip,
  value,
  onChange,
  minMs = 0,
  maxMs,
  id,
}: DurationFieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
  const [unit, setUnit] = useState<TimeUnit>(() => getBestUnit(value));

  const displayValue = value / TIME_UNIT_MS[unit];

  function handleValueChange(newDisplayValue: number): void {
    const newMs = Math.round(newDisplayValue * TIME_UNIT_MS[unit]);
    onChange(newMs);
  }

  function handleUnitChange(newUnit: TimeUnit): void {
    setUnit(newUnit);
  }

  const minDisplay = minMs / TIME_UNIT_MS[unit];
  const maxDisplay = maxMs ? maxMs / TIME_UNIT_MS[unit] : undefined;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <label
          htmlFor={inputId}
          className="block text-sm font-medium text-cream-700 dark:text-cream-300"
        >
          {label}
          {hint && <span className="ml-1 text-cream-400 font-normal">({hint})</span>}
        </label>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger>
              <InfoIcon className="w-3.5 h-3.5 text-cream-400 dark:text-cream-500 cursor-help" />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="number"
          value={displayValue}
          onChange={(e) => handleValueChange(parseFloat(e.target.value) || 0)}
          min={minDisplay}
          max={maxDisplay}
          step={unit === "hours" ? 0.5 : 1}
          className="flex-1 px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
        />
        <select
          value={unit}
          onChange={(e) => handleUnitChange(e.target.value as TimeUnit)}
          className="px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-cream-900 dark:text-cream-100"
          aria-label="Time unit"
        >
          <option value="seconds">seconds</option>
          <option value="minutes">minutes</option>
          <option value="hours">hours</option>
        </select>
      </div>
    </div>
  );
}
