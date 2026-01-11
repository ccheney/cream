/**
 * Chart State Components
 *
 * Loading skeletons, error states, and empty states for charts.
 *
 * @see docs/plans/ui/28-states.md
 */

export {
  ChartEmpty,
  NoCorrelationEmpty,
  NoDecisionsEmpty,
  NoPositionsEmpty,
  NoTradesEmpty,
} from "./EmptyState.js";
export { ChartError } from "./ErrorState.js";
export { ChartSkeleton } from "./LoadingState.js";
export type {
  ChartEmptyProps,
  ChartErrorProps,
  ChartSkeletonProps,
  ChartWrapperProps,
  SkeletonVariant,
} from "./types.js";

import { ChartEmpty } from "./EmptyState.js";
import { ChartError } from "./ErrorState.js";
import { ChartSkeleton } from "./LoadingState.js";
import type { ChartWrapperProps } from "./types.js";

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
}: ChartWrapperProps): React.ReactElement {
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

export default ChartWrapper;
