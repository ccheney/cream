"use client";

import { MultiFileDiff } from "@pierre/diffs/react";
import { useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/collapsible";
import type { Configuration, FullRuntimeConfig } from "@/lib/api/types";
import {
  calculateDiff,
  type DiffEntry,
  filterChangesOnly,
  formatKey,
  formatValue,
  revertChange,
} from "@/lib/config-diff";

export type ConfigType = Configuration | FullRuntimeConfig;

export interface ConfigDiffProps<T extends ConfigType = ConfigType> {
  before: T;
  after: T;
  showUnchanged?: boolean;
  onRevert?: (path: string[], oldValue: unknown, newConfig: T) => void;
  viewMode?: "diff" | "tree";
}

export function ConfigDiff<T extends ConfigType>({
  before,
  after,
  showUnchanged = false,
  onRevert,
  viewMode = "diff",
}: ConfigDiffProps<T>) {
  const [mode, setMode] = useState<"diff" | "tree">(viewMode);

  const diffResult = useMemo(
    () =>
      calculateDiff(
        before as unknown as Record<string, unknown>,
        after as unknown as Record<string, unknown>
      ),
    [before, after]
  );

  const displayEntries = useMemo(
    () => (showUnchanged ? diffResult.entries : filterChangesOnly(diffResult.entries)),
    [diffResult.entries, showUnchanged]
  );

  const hasChanges =
    diffResult.stats.added > 0 || diffResult.stats.removed > 0 || diffResult.stats.changed > 0;

  if (!hasChanges) {
    return (
      <div className="p-4 text-center text-cream-500 dark:text-cream-400">
        No configuration changes
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          {diffResult.stats.added > 0 && (
            <span className="text-emerald-600 dark:text-emerald-400">
              +{diffResult.stats.added} added
            </span>
          )}
          {diffResult.stats.removed > 0 && (
            <span className="text-red-600 dark:text-red-400">
              -{diffResult.stats.removed} removed
            </span>
          )}
          {diffResult.stats.changed > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              ~{diffResult.stats.changed} changed
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 bg-cream-100 dark:bg-night-700 rounded-lg p-1">
          <button
            type="button"
            onClick={() => setMode("diff")}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              mode === "diff"
                ? "bg-white dark:bg-night-600 text-cream-900 dark:text-cream-100 shadow-sm"
                : "text-cream-600 dark:text-cream-400 hover:text-cream-900 dark:hover:text-cream-100"
            }`}
          >
            Diff
          </button>
          <button
            type="button"
            onClick={() => setMode("tree")}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              mode === "tree"
                ? "bg-white dark:bg-night-600 text-cream-900 dark:text-cream-100 shadow-sm"
                : "text-cream-600 dark:text-cream-400 hover:text-cream-900 dark:hover:text-cream-100"
            }`}
          >
            Tree
          </button>
        </div>
      </div>

      {mode === "diff" ? (
        <DiffView before={before} after={after} />
      ) : (
        <TreeView entries={displayEntries} onRevert={onRevert} after={after} />
      )}
    </div>
  );
}

function DiffView({ before, after }: { before: ConfigType; after: ConfigType }) {
  const oldContents = JSON.stringify(before, null, 2);
  const newContents = JSON.stringify(after, null, 2);

  return (
    <div className="rounded-lg border border-cream-200 dark:border-night-700 overflow-hidden">
      <MultiFileDiff
        oldFile={{
          name: "config.json",
          contents: oldContents,
        }}
        newFile={{
          name: "config.json",
          contents: newContents,
        }}
      />
    </div>
  );
}

interface TreeViewProps<T extends ConfigType> {
  entries: DiffEntry[];
  onRevert?: (path: string[], oldValue: unknown, newConfig: T) => void;
  after: T;
}

function TreeView<T extends ConfigType>({ entries, onRevert, after }: TreeViewProps<T>) {
  const handleRevert = (entry: DiffEntry) => {
    if (!onRevert) {
      return;
    }
    const newConfig = revertChange(
      after as unknown as Record<string, unknown>,
      entry.path,
      entry.oldValue
    ) as unknown as T;
    onRevert(entry.path, entry.oldValue, newConfig);
  };

  return (
    <div className="rounded-lg border border-cream-200 dark:border-night-700 bg-white dark:bg-night-800">
      <Accordion type="multiple" defaultValue={entries.map((e) => e.key)}>
        {entries.map((entry) => (
          <DiffEntryRow
            key={entry.path.join(".")}
            entry={entry}
            depth={0}
            onRevert={onRevert ? handleRevert : undefined}
          />
        ))}
      </Accordion>
    </div>
  );
}

interface DiffEntryRowProps {
  entry: DiffEntry;
  depth: number;
  onRevert?: (entry: DiffEntry) => void;
}

function DiffEntryRow({ entry, depth, onRevert }: DiffEntryRowProps) {
  const hasChildren = entry.children && entry.children.length > 0;

  const typeStyles = {
    added: "bg-emerald-50 dark:bg-emerald-900/20 border-l-2 border-emerald-500",
    removed: "bg-red-50 dark:bg-red-900/20 border-l-2 border-red-500",
    changed: "bg-amber-50 dark:bg-amber-900/20 border-l-2 border-amber-500",
    unchanged: "",
  };

  const valueBadgeStyles = {
    added: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    removed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    changed: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    unchanged: "bg-cream-100 text-cream-600 dark:bg-night-700 dark:text-cream-400",
  };

  if (hasChildren) {
    return (
      <AccordionItem value={entry.key} className={typeStyles[entry.type]}>
        <AccordionTrigger className="px-4 py-2">
          <span className="font-medium text-cream-900 dark:text-cream-100">
            {formatKey(entry.key)}
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="pl-4 border-l border-cream-200 dark:border-night-600 ml-4">
            {entry.children?.map((child) => (
              <DiffEntryRow
                key={child.path.join(".")}
                entry={child}
                depth={depth + 1}
                onRevert={onRevert}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  }

  return (
    <div
      className={`flex items-center justify-between px-4 py-2 ${typeStyles[entry.type]} ${
        depth > 0 ? "border-b border-cream-100 dark:border-night-700" : ""
      }`}
      style={{ paddingLeft: `${1 + depth * 0.75}rem` }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm text-cream-700 dark:text-cream-300">{formatKey(entry.key)}</span>
      </div>

      <div className="flex items-center gap-3">
        {entry.type === "changed" && (
          <>
            <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 line-through">
              {formatValue(entry.oldValue)}
            </span>
            <span className="text-cream-400">&rarr;</span>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              {formatValue(entry.newValue)}
            </span>
          </>
        )}

        {entry.type === "added" && (
          <span className={`text-xs px-2 py-0.5 rounded ${valueBadgeStyles.added}`}>
            {formatValue(entry.newValue)}
          </span>
        )}

        {entry.type === "removed" && (
          <span className={`text-xs px-2 py-0.5 rounded ${valueBadgeStyles.removed}`}>
            {formatValue(entry.oldValue)}
          </span>
        )}

        {entry.type === "unchanged" && (
          <span className={`text-xs px-2 py-0.5 rounded ${valueBadgeStyles.unchanged}`}>
            {formatValue(entry.oldValue)}
          </span>
        )}

        {onRevert && entry.type !== "unchanged" && (
          <button
            type="button"
            onClick={() => onRevert(entry)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            title="Revert this change"
          >
            Revert
          </button>
        )}
      </div>
    </div>
  );
}

export default ConfigDiff;
