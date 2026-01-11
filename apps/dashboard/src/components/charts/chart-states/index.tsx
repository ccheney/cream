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
} from "./EmptyState";
export { ChartError } from "./ErrorState";
export { ChartSkeleton } from "./LoadingState";
export type {
  ChartEmptyProps,
  ChartErrorProps,
  ChartSkeletonProps,
  ChartWrapperProps,
  SkeletonVariant,
} from "./types";

import { ChartEmpty } from "./EmptyState";
import { ChartError } from "./ErrorState";
import { ChartSkeleton } from "./LoadingState";
import type { ChartWrapperProps } from "./types";

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
