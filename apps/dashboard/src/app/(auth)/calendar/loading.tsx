/**
 * Calendar Page Loading State
 *
 * @see docs/plans/ui/28-states.md - Loading states
 */

export default function CalendarLoading() {
  return (
    <div className="flex flex-col h-full">
      <header className="shrink-0 flex items-center justify-between mb-4">
        <div>
          <div className="h-8 w-56 bg-cream-200 dark:bg-night-700 rounded animate-pulse" />
          <div className="h-4 w-72 bg-cream-200 dark:bg-night-700 rounded animate-pulse mt-2" />
        </div>
      </header>
      <main className="flex-1 min-h-0 bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 overflow-hidden">
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-stone-500 dark:text-night-400">Loading calendar...</span>
          </div>
        </div>
      </main>
    </div>
  );
}
