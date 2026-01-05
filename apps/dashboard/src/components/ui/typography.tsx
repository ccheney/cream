/**
 * Typography Components
 *
 * Implements clear visual separation between "machine data" (monospace)
 * and "human interface" (sans) per the Cream design philosophy.
 *
 * @see docs/plans/ui/22-typography.md
 * @see docs/plans/ui/20-design-philosophy.md lines 88-89
 */

import type { ElementType, HTMLAttributes, ReactNode } from "react";

// ============================================
// Types
// ============================================

export type TextSize = "xs" | "sm" | "base" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
export type TextWeight = "normal" | "medium" | "semibold" | "bold";
export type TextColor =
  | "heading"
  | "primary"
  | "secondary"
  | "muted"
  | "profit"
  | "loss"
  | "neutral"
  | "inherit";

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type DataFormat = "price" | "percentage" | "number" | "currency" | "shares";

// ============================================
// Text Component (UI Sans - Satoshi)
// ============================================

export interface TextProps extends HTMLAttributes<HTMLSpanElement> {
  /** Font size */
  size?: TextSize;
  /** Font weight */
  weight?: TextWeight;
  /** Text color */
  color?: TextColor;
  /** Element to render as */
  as?: ElementType;
  /** Children */
  children: ReactNode;
}

const textSizeClasses: Record<TextSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
  "3xl": "text-3xl",
  "4xl": "text-4xl",
};

const textWeightClasses: Record<TextWeight, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
};

const textColorClasses: Record<TextColor, string> = {
  heading: "text-text-heading",
  primary: "text-text-primary",
  secondary: "text-text-secondary",
  muted: "text-text-muted",
  profit: "text-profit",
  loss: "text-loss",
  neutral: "text-neutral",
  inherit: "text-inherit",
};

/**
 * UI text component using Satoshi (geometric sans).
 * Use for all human-readable interface text.
 *
 * @example
 * ```tsx
 * <Text size="lg" weight="semibold">Dashboard</Text>
 * <Text color="secondary">Last updated 5 minutes ago</Text>
 * ```
 */
export function Text({
  size = "base",
  weight = "normal",
  color = "primary",
  as: Component = "span",
  className = "",
  children,
  ...props
}: TextProps) {
  return (
    <Component
      className={`
        font-ui
        ${textSizeClasses[size]}
        ${textWeightClasses[weight]}
        ${textColorClasses[color]}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}

// ============================================
// Heading Component (UI Sans - Satoshi)
// ============================================

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Heading level (semantic) */
  level?: HeadingLevel;
  /** Visual size override */
  size?: TextSize;
  /** Text color */
  color?: TextColor;
  /** Children */
  children: ReactNode;
}

const headingSizeDefaults: Record<HeadingLevel, TextSize> = {
  1: "4xl",
  2: "3xl",
  3: "2xl",
  4: "xl",
  5: "lg",
  6: "base",
};

/**
 * Heading component using Satoshi with tight letter-spacing.
 * Use for all section headers and titles.
 *
 * @example
 * ```tsx
 * <Heading level={1}>Portfolio Overview</Heading>
 * <Heading level={2} size="xl">Positions</Heading>
 * ```
 */
export function Heading({
  level = 2,
  size,
  color = "heading",
  className = "",
  children,
  ...props
}: HeadingProps) {
  const Component = `h${level}` as ElementType;
  const actualSize = size || headingSizeDefaults[level];

  return (
    <Component
      className={`
        headline
        ${textSizeClasses[actualSize]}
        ${textColorClasses[color]}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}

// ============================================
// DataValue Component (Monospace - Geist Mono)
// ============================================

export interface DataValueProps extends HTMLAttributes<HTMLSpanElement> {
  /** The numeric value to display */
  value: number | string;
  /** Display format */
  format?: DataFormat;
  /** Number of decimal places */
  decimals?: number;
  /** Show sign for positive numbers */
  showSign?: boolean;
  /** Font size */
  size?: TextSize;
  /** Auto-color based on sign (profit/loss) */
  colorBySign?: boolean;
  /** Manual color override */
  color?: TextColor;
}

/**
 * Format number according to specified format.
 */
function formatDataValue(
  value: number | string,
  format: DataFormat,
  decimals: number,
  showSign: boolean
): string {
  const num = typeof value === "string" ? parseFloat(value) : value;

  if (Number.isNaN(num)) {
    return String(value);
  }

  const sign = showSign && num > 0 ? "+" : "";

  switch (format) {
    case "price":
      return (
        sign +
        num.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      );

    case "currency":
      return (
        sign +
        num.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      );

    case "percentage":
      return `${sign + num.toFixed(decimals)}%`;

    case "shares":
      return num.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    default:
      return (
        sign +
        num.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      );
  }
}

/**
 * Data value component using Geist Mono (monospace).
 * Use for all machine-readable data: prices, percentages, numbers.
 *
 * Features:
 * - Tabular numbers for alignment in columns
 * - Auto-coloring based on sign (optional)
 * - Consistent decimal formatting
 *
 * @example
 * ```tsx
 * <DataValue value={187.50} format="price" decimals={2} />
 * <DataValue value={3.45} format="percentage" colorBySign />
 * <DataValue value={-2.1} format="percentage" colorBySign />
 * ```
 */
export function DataValue({
  value,
  format = "number",
  decimals = 2,
  showSign = false,
  size = "base",
  colorBySign = false,
  color,
  className = "",
  ...props
}: DataValueProps) {
  const num = typeof value === "string" ? parseFloat(value) : value;
  const formatted = formatDataValue(value, format, decimals, showSign);

  // Determine color
  let finalColor: TextColor = color || "heading";
  if (colorBySign && !color && !Number.isNaN(num)) {
    if (num > 0) {
      finalColor = "profit";
    } else if (num < 0) {
      finalColor = "loss";
    } else {
      finalColor = "muted";
    }
  }

  return (
    <span
      className={`
        data-value
        ${textSizeClasses[size]}
        ${textColorClasses[finalColor]}
        ${className}
      `.trim()}
      {...props}
    >
      {formatted}
    </span>
  );
}

// ============================================
// Code Component (Monospace - Geist Mono)
// ============================================

export interface CodeProps extends HTMLAttributes<HTMLElement> {
  /** Inline or block display */
  inline?: boolean;
  /** Font size */
  size?: TextSize;
  /** Children */
  children: ReactNode;
}

/**
 * Code component using Geist Mono.
 * Use for code snippets, IDs, technical identifiers.
 *
 * @example
 * ```tsx
 * <Code inline>ORDER-12345</Code>
 * <Code>
 *   {"const x = 1;"}
 * </Code>
 * ```
 */
export function Code({
  inline = true,
  size = "sm",
  className = "",
  children,
  ...props
}: CodeProps) {
  const Component = inline ? "code" : "pre";

  return (
    <Component
      className={`
        font-mono
        ${textSizeClasses[size]}
        ${
          inline
            ? "px-1.5 py-0.5 bg-bg-muted rounded text-text-heading"
            : "p-4 bg-bg-muted rounded-lg overflow-x-auto text-text-primary"
        }
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}

// ============================================
// Label Component (Small Caps)
// ============================================

export interface LabelProps extends HTMLAttributes<HTMLSpanElement> {
  /** Font size */
  size?: "xs" | "sm";
  /** Children */
  children: ReactNode;
}

/**
 * Label component using Satoshi with uppercase and letter-spacing.
 * Use for field labels, section markers, metadata tags.
 *
 * @example
 * ```tsx
 * <Label>SYMBOL</Label>
 * <Label size="sm">LAST UPDATED</Label>
 * ```
 */
export function Label({ size = "xs", className = "", children, ...props }: LabelProps) {
  return (
    <span
      className={`
        label
        ${size === "xs" ? "text-xs" : "text-sm"}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </span>
  );
}

// ============================================
// Prose Component (Body Text)
// ============================================

export interface ProseProps extends HTMLAttributes<HTMLDivElement> {
  /** Children */
  children: ReactNode;
}

/**
 * Prose component for longer-form text content.
 * Applies proper spacing and line height for readability.
 *
 * @example
 * ```tsx
 * <Prose>
 *   <p>This is a longer explanation of the trading strategy...</p>
 * </Prose>
 * ```
 */
export function Prose({ className = "", children, ...props }: ProseProps) {
  return (
    <div
      className={`
        reasoning
        space-y-4
        [&>p]:mb-4
        [&>ul]:list-disc
        [&>ul]:pl-5
        [&>ol]:list-decimal
        [&>ol]:pl-5
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================
// PriceChange Component (Convenience)
// ============================================

export interface PriceChangeProps {
  /** Change value (positive or negative) */
  value: number;
  /** Show as percentage */
  asPercentage?: boolean;
  /** Font size */
  size?: TextSize;
  /** Additional class names */
  className?: string;
}

/**
 * Price change indicator with automatic profit/loss coloring.
 *
 * @example
 * ```tsx
 * <PriceChange value={2.34} />
 * <PriceChange value={-1.5} asPercentage />
 * ```
 */
export function PriceChange({
  value,
  asPercentage = false,
  size = "base",
  className = "",
}: PriceChangeProps) {
  return (
    <DataValue
      value={value}
      format={asPercentage ? "percentage" : "price"}
      showSign
      colorBySign
      size={size}
      className={className}
    />
  );
}

// ============================================
// Exports
// ============================================

export default {
  Text,
  Heading,
  DataValue,
  Code,
  Label,
  Prose,
  PriceChange,
};
