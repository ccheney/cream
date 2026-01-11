"use client";

export interface ErrorStateProps {
  onNavigateBack: () => void;
}

export function ErrorState({ onNavigateBack }: ErrorStateProps): React.ReactElement {
  return (
    <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-lg border border-red-200 dark:border-red-800">
      <h2 className="text-lg font-semibold text-red-800 dark:text-red-200">Decision not found</h2>
      <p className="mt-2 text-sm text-red-600 dark:text-red-300">
        The decision you&apos;re looking for doesn&apos;t exist or has been removed.
      </p>
      <button
        type="button"
        onClick={onNavigateBack}
        className="mt-4 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-200 bg-red-100 dark:bg-red-900/30 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50"
      >
        Back to Decisions
      </button>
    </div>
  );
}
