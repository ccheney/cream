/**
 * Chart State Components
 *
 * Loading skeletons, error states, and empty states for charts.
 *
 * @see docs/plans/ui/28-states.md
 */

import type React from "react";

// ============================================
// Types
// ============================================

/**
 * Chart skeleton variant.
 */
export type SkeletonVariant =
  | "candlestick"
  | "line"
  | "area"
  | "bar"
  | "pie"
  | "sparkline"
  | "gauge"
  | "heatmap";

/**
 * Chart skeleton props.
 */
export interface ChartSkeletonProps {
  /** Skeleton variant */
  variant?: SkeletonVariant;
  /** Width in pixels */
  width?: number;
  /** Height in pixels */
  height?: number;
  /** Additional CSS classes */
  className?: string;
  /** Aria label for accessibility */
  "aria-label"?: string;
}

/**
 * Chart error props.
 */
export interface ChartErrorProps {
  /** Error object */
  error?: Error | null;
  /** Retry callback */
  onRetry?: () => void;
  /** Custom error message */
  message?: string;
  /** Show error details */
  showDetails?: boolean;
  /** Height in pixels (for layout stability) */
  height?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Chart empty props.
 */
export interface ChartEmptyProps {
  /** Icon (emoji or component) */
  icon?: React.ReactNode;
  /** Title text */
  title?: string;
  /** Description text */
  description?: string;
  /** Action button */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Height in pixels (for layout stability) */
  height?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Chart wrapper props.
 */
export interface ChartWrapperProps {
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  isError?: boolean;
  /** Empty state */
  isEmpty?: boolean;
  /** Error object */
  error?: Error | null;
  /** Retry callback */
  onRetry?: () => void;
  /** Skeleton variant */
  skeletonVariant?: SkeletonVariant;
  /** Empty state config */
  emptyConfig?: Omit<ChartEmptyProps, "height" | "className">;
  /** Height for states */
  height?: number;
  /** Children (the actual chart) */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

// ============================================
// Styles
// ============================================

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    backgroundColor: "#fafaf9", // stone-50
    borderRadius: "8px",
    padding: "24px",
    boxSizing: "border-box" as const,
  },
  skeleton: {
    backgroundColor: "#e7e5e4", // stone-200
    borderRadius: "4px",
    overflow: "hidden",
    position: "relative" as const,
  },
  shimmer: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background:
      "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
    animation: "shimmer 1.5s infinite",
  },
  icon: {
    fontSize: "48px",
    marginBottom: "16px",
    opacity: 0.5,
  },
  title: {
    fontSize: "18px",
    fontWeight: 600,
    color: "#44403c", // stone-700
    marginBottom: "8px",
    textAlign: "center" as const,
  },
  description: {
    fontSize: "14px",
    color: "#78716c", // stone-500
    textAlign: "center" as const,
    maxWidth: "300px",
    marginBottom: "16px",
  },
  errorIcon: {
    fontSize: "48px",
    marginBottom: "16px",
    color: "#dc2626", // red-600
  },
  errorMessage: {
    fontSize: "14px",
    color: "#dc2626", // red-600
    marginBottom: "16px",
    textAlign: "center" as const,
  },
  button: {
    padding: "8px 16px",
    fontSize: "14px",
    fontWeight: 500,
    backgroundColor: "#292524", // stone-800
    color: "#fafaf9", // stone-50
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  details: {
    marginTop: "8px",
    padding: "8px",
    backgroundColor: "#fef2f2", // red-50
    borderRadius: "4px",
    fontSize: "12px",
    color: "#991b1b", // red-800
    fontFamily: "monospace",
    maxWidth: "100%",
    overflow: "auto",
  },
};

// ============================================
// CSS Keyframes (for shimmer animation)
// ============================================

const shimmerKeyframes = `
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}
`;

// ============================================
// Skeleton Components
// ============================================

/**
 * Shimmer overlay for loading animation.
 */
function Shimmer() {
  return (
    <>
      <style>{shimmerKeyframes}</style>
      <div style={styles.shimmer} />
    </>
  );
}

/**
 * Candlestick skeleton.
 */
function CandlestickSkeleton({ width, height }: { width: number; height: number }) {
  const barCount = Math.floor(width / 20);
  const bars = Array.from({ length: barCount }, (_, i) => ({
    x: i * 20 + 4,
    height: 30 + Math.random() * 60,
    y: height - 50 - Math.random() * (height - 100),
  }));

  return (
    <svg width={width} height={height} style={styles.skeleton}>
      {bars.map((bar, i) => (
        <rect key={i} x={bar.x} y={bar.y} width={12} height={bar.height} fill="#d6d3d1" rx={2} />
      ))}
      <Shimmer />
    </svg>
  );
}

/**
 * Line chart skeleton.
 */
function LineSkeleton({ width, height }: { width: number; height: number }) {
  const points = Array.from({ length: 20 }, (_, i) => ({
    x: (i / 19) * width,
    y: height / 2 + Math.sin(i * 0.5) * (height * 0.3),
  }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <svg width={width} height={height} style={styles.skeleton}>
      <path
        d={pathD}
        fill="none"
        stroke="#d6d3d1"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Shimmer />
    </svg>
  );
}

/**
 * Area chart skeleton.
 */
function AreaSkeleton({ width, height }: { width: number; height: number }) {
  const points = Array.from({ length: 20 }, (_, i) => ({
    x: (i / 19) * width,
    y: height / 2 + Math.sin(i * 0.5) * (height * 0.25),
  }));
  const pathD = `M 0 ${height} ${points.map((p) => `L ${p.x} ${p.y}`).join(" ")} L ${width} ${height} Z`;

  return (
    <svg width={width} height={height} style={styles.skeleton}>
      <path d={pathD} fill="#d6d3d1" />
      <Shimmer />
    </svg>
  );
}

/**
 * Bar chart skeleton.
 */
function BarSkeleton({ width, height }: { width: number; height: number }) {
  const barCount = Math.min(12, Math.floor(width / 40));
  const barWidth = (width - (barCount + 1) * 8) / barCount;
  const bars = Array.from({ length: barCount }, (_, i) => ({
    x: 8 + i * (barWidth + 8),
    height: 40 + Math.random() * (height - 80),
  }));

  return (
    <svg width={width} height={height} style={styles.skeleton}>
      {bars.map((bar, i) => (
        <rect
          key={i}
          x={bar.x}
          y={height - bar.height - 20}
          width={barWidth}
          height={bar.height}
          fill="#d6d3d1"
          rx={4}
        />
      ))}
      <Shimmer />
    </svg>
  );
}

/**
 * Pie chart skeleton.
 */
function PieSkeleton({ width, height }: { width: number; height: number }) {
  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const r = size / 2 - 20;

  return (
    <svg width={width} height={height} style={styles.skeleton}>
      <circle cx={cx} cy={cy} r={r} fill="#d6d3d1" />
      <circle cx={cx} cy={cy} r={r * 0.5} fill="#fafaf9" />
      <Shimmer />
    </svg>
  );
}

/**
 * Sparkline skeleton.
 */
function SparklineSkeleton({ width, height }: { width: number; height: number }) {
  const points = Array.from({ length: 15 }, (_, i) => ({
    x: (i / 14) * width,
    y: height / 2 + Math.sin(i * 0.7) * (height * 0.3),
  }));
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <svg width={width} height={height} style={styles.skeleton}>
      <path d={pathD} fill="none" stroke="#d6d3d1" strokeWidth={2} strokeLinecap="round" />
      <Shimmer />
    </svg>
  );
}

/**
 * Gauge skeleton.
 */
function GaugeSkeleton({ width, height }: { width: number; height: number }) {
  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const r = size / 2 - 20;

  return (
    <svg width={width} height={height} style={styles.skeleton}>
      <path
        d={describeArc(cx, cy, r, 180, 360)}
        fill="none"
        stroke="#d6d3d1"
        strokeWidth={16}
        strokeLinecap="round"
      />
      <Shimmer />
    </svg>
  );
}

/**
 * Heatmap skeleton.
 */
function HeatmapSkeleton({ width, height }: { width: number; height: number }) {
  const cols = 8;
  const rows = 6;
  const cellWidth = (width - 16) / cols;
  const cellHeight = (height - 16) / rows;

  return (
    <svg width={width} height={height} style={styles.skeleton}>
      {Array.from({ length: rows * cols }, (_, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        return (
          <rect
            key={i}
            x={8 + col * cellWidth + 1}
            y={8 + row * cellHeight + 1}
            width={cellWidth - 2}
            height={cellHeight - 2}
            fill="#d6d3d1"
            rx={2}
          />
        );
      })}
      <Shimmer />
    </svg>
  );
}

// Helper for arc path
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, r: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(angleInRadians),
    y: cy + r * Math.sin(angleInRadians),
  };
}

// ============================================
// Main Components
// ============================================

/**
 * Chart loading skeleton.
 */
export function ChartSkeleton({
  variant = "line",
  width = 400,
  height = 225,
  className,
  "aria-label": ariaLabel = "Loading chart",
}: ChartSkeletonProps) {
  const SkeletonComponent = {
    candlestick: CandlestickSkeleton,
    line: LineSkeleton,
    area: AreaSkeleton,
    bar: BarSkeleton,
    pie: PieSkeleton,
    sparkline: SparklineSkeleton,
    gauge: GaugeSkeleton,
    heatmap: HeatmapSkeleton,
  }[variant];

  return (
    <div role="status" aria-label={ariaLabel} className={className} style={{ width, height }}>
      <SkeletonComponent width={width} height={height} />
    </div>
  );
}

/**
 * Chart error state.
 */
export function ChartError({
  error,
  onRetry,
  message = "Failed to load chart data",
  showDetails = false,
  height = 225,
  className,
}: ChartErrorProps) {
  return (
    <div role="alert" className={className} style={{ ...styles.container, minHeight: height }}>
      <div style={styles.errorIcon}>⚠️</div>
      <div style={styles.title}>{message}</div>
      {showDetails && error && <div style={styles.details}>{error.message}</div>}
      {onRetry && (
        <button
          style={styles.button}
          onClick={onRetry}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1c1917")}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#292524")}
        >
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * Chart empty state.
 */
export function ChartEmpty({
  icon = "📊",
  title = "No data available",
  description,
  action,
  height = 225,
  className,
}: ChartEmptyProps) {
  return (
    <div role="status" className={className} style={{ ...styles.container, minHeight: height }}>
      <div style={styles.icon}>{icon}</div>
      <div style={styles.title}>{title}</div>
      {description && <div style={styles.description}>{description}</div>}
      {action && (
        <button
          style={styles.button}
          onClick={action.onClick}
          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1c1917")}
          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#292524")}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/**
 * Chart wrapper that handles loading, error, and empty states.
 */
export function ChartWrapper({
  isLoading = false,
  isError = false,
  isEmpty = false,
  error,
  onRetry,
  skeletonVariant = "line",
  emptyConfig,
  height = 225,
  children,
  className,
}: ChartWrapperProps) {
  if (isLoading) {
    return <ChartSkeleton variant={skeletonVariant} height={height} className={className} />;
  }

  if (isError) {
    return <ChartError error={error} onRetry={onRetry} height={height} className={className} />;
  }

  if (isEmpty) {
    return <ChartEmpty {...emptyConfig} height={height} className={className} />;
  }

  return <>{children}</>;
}

// ============================================
// Preset Empty States
// ============================================

/**
 * No positions empty state.
 */
export function NoPositionsEmpty(props: Omit<ChartEmptyProps, "icon" | "title">) {
  return (
    <ChartEmpty
      icon="📈"
      title="No positions yet"
      description="Positions will appear here once the system executes its first trade."
      {...props}
    />
  );
}

/**
 * No decisions empty state.
 */
export function NoDecisionsEmpty(props: Omit<ChartEmptyProps, "icon" | "title">) {
  return (
    <ChartEmpty
      icon="🎯"
      title="No decisions yet"
      description="Decisions will appear here as the trading cycle runs."
      {...props}
    />
  );
}

/**
 * No trades empty state.
 */
export function NoTradesEmpty(props: Omit<ChartEmptyProps, "icon" | "title">) {
  return (
    <ChartEmpty
      icon="💹"
      title="No trades in this period"
      description="Try expanding the date range or adjusting filters."
      {...props}
    />
  );
}

/**
 * No correlation data empty state.
 */
export function NoCorrelationEmpty(props: Omit<ChartEmptyProps, "icon" | "title">) {
  return (
    <ChartEmpty
      icon="🔗"
      title="No correlation data"
      description="Add more positions to see correlation analysis."
      {...props}
    />
  );
}

export default ChartWrapper;
