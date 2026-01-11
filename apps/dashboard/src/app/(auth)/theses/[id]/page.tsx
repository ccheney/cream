"use client";

/**
 * Thesis Detail Page
 *
 * Displays detailed thesis information including:
 * - Thesis header (symbol, direction, status, confidence)
 * - Lifecycle timeline
 * - Supporting evidence and citations
 * - Catalysts and invalidation conditions
 * - Related positions and decisions
 * - Edit/close actions for admins
 *
 * @see docs/plans/ui/03-views.md lines 807-880
 */

import Link from "next/link";
import {
  InvalidateModal,
  RealizeModal,
  ThesisDetails,
  ThesisHeader,
  useThesisPageData,
  useThesisPageState,
} from "./components/index.js";

export default function ThesisDetailPage() {
  const { id, thesis, thesisLoading, history, invalidateThesis, realizeThesis } =
    useThesisPageData();

  const {
    showInvalidateModal,
    showRealizeModal,
    invalidationReason,
    exitPrice,
    exitNotes,
    setShowInvalidateModal,
    setShowRealizeModal,
    setInvalidationReason,
    setExitPrice,
    setExitNotes,
    handleInvalidate,
    handleRealize,
  } = useThesisPageState(id, invalidateThesis, realizeThesis);

  if (thesisLoading) {
    return <LoadingSkeleton />;
  }

  if (!thesis) {
    return <NotFound />;
  }

  return (
    <div className="space-y-6">
      <ThesisHeader
        thesis={thesis}
        onRealize={() => setShowRealizeModal(true)}
        onInvalidate={() => setShowInvalidateModal(true)}
      />

      <ThesisDetails thesis={thesis} history={history} />

      {showInvalidateModal && (
        <InvalidateModal
          reason={invalidationReason}
          onReasonChange={setInvalidationReason}
          onConfirm={handleInvalidate}
          onCancel={() => setShowInvalidateModal(false)}
          isPending={invalidateThesis.isPending}
        />
      )}

      {showRealizeModal && (
        <RealizeModal
          exitPrice={exitPrice}
          exitNotes={exitNotes}
          onExitPriceChange={setExitPrice}
          onExitNotesChange={setExitNotes}
          onConfirm={handleRealize}
          onCancel={() => setShowRealizeModal(false)}
          isPending={realizeThesis.isPending}
        />
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
      <div className="h-64 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
      <div className="grid grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <p className="text-cream-500 dark:text-cream-400">Thesis not found</p>
      <Link href="/theses" className="mt-4 text-blue-600 dark:text-blue-400 hover:underline">
        ← Back to theses
      </Link>
    </div>
  );
}
