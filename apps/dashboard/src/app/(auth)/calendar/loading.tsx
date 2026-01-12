/**
 * Calendar Page Loading State
 *
 * Route-level loading skeleton with calendar grid layout.
 *
 * @see docs/plans/ui/28-states.md - Loading states
 */

import { Skeleton, SkeletonContainer } from "@/components/ui/skeleton";

// ============================================
// Skeleton Components
// ============================================

function FiltersSkeleton() {
  return (
    <div className="flex items-center gap-3">
      {/* Country dropdown skeleton */}
      <Skeleton width={140} height={32} radius={6} />
      {/* Date range dropdown skeleton */}
      <Skeleton width={140} height={32} radius={6} />
      {/* Separator */}
      <div className="w-px h-5 bg-cream-300 dark:bg-night-600" />
      {/* Impact filter chips */}
      <div className="flex items-center gap-1.5">
        <Skeleton width={60} height={26} radius={13} />
        <Skeleton width={70} height={26} radius={13} />
        <Skeleton width={50} height={26} radius={13} />
      </div>
    </div>
  );
}

function LegendSkeleton() {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Skeleton width={10} height={10} radius="50%" />
          <Skeleton width={70} height={12} />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton width={10} height={10} radius="50%" />
          <Skeleton width={90} height={12} />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton width={10} height={10} radius="50%" />
          <Skeleton width={60} height={12} />
        </div>
      </div>
      <Skeleton width={150} height={12} />
    </div>
  );
}

function CalendarGridSkeleton() {
  // Week view: 5 columns (Mon-Fri), rows for time slots
  return (
    <div className="flex flex-col h-full p-2">
      {/* Day headers */}
      <div className="grid grid-cols-5 gap-1 mb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton layout, index is stable
          <div key={`header-${i}`} className="text-center py-2">
            <Skeleton width={60} height={14} className="mx-auto" />
            <Skeleton width={24} height={20} className="mx-auto mt-1" />
          </div>
        ))}
      </div>
      {/* Time grid */}
      <div className="flex-1 grid grid-cols-5 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton
            // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton layout, index is stable
            key={`cell-${i}`}
            height={i % 7 === 0 ? 48 : 24}
            radius={4}
            className="dark:bg-night-700"
          />
        ))}
      </div>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function CalendarLoading() {
  return (
    <SkeletonContainer isLoading label="Loading economic calendar">
      <div className="flex flex-col h-full">
        {/* Header */}
        <header className="shrink-0 flex items-center justify-between mb-4">
          <div>
            <Skeleton width={220} height={32} className="dark:bg-night-700" />
            <Skeleton width={280} height={16} className="mt-2 dark:bg-night-700" />
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 min-h-0 flex flex-col gap-3">
          {/* Filters */}
          <div className="shrink-0">
            <FiltersSkeleton />
          </div>

          {/* Legend */}
          <div className="shrink-0">
            <LegendSkeleton />
          </div>

          {/* Calendar grid */}
          <div className="flex-1 min-h-0 bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 overflow-hidden">
            <CalendarGridSkeleton />
          </div>
        </main>
      </div>
    </SkeletonContainer>
  );
}
