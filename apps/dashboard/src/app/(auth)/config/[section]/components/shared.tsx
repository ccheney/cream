"use client";

/**
 * Shared Components
 *
 * Common UI components used across config section editors.
 */

interface EditorHeaderProps {
  title: string;
  editing: boolean;
  isPending: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  editLabel?: string;
}

export function EditorHeader({
  title,
  editing,
  isPending,
  onStartEdit,
  onCancel,
  onSave,
  editLabel = "Edit",
}: EditorHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-lg font-medium text-stone-900 dark:text-night-50">{title}</h2>
      {editing ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-stone-700 dark:text-night-100 dark:text-night-200 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onStartEdit}
          className="px-4 py-2 text-sm font-medium text-stone-700 dark:text-night-100 dark:text-night-200 bg-cream-100 dark:bg-night-700 rounded-md hover:bg-cream-200 dark:hover:bg-night-600"
        >
          {editLabel}
        </button>
      )}
    </div>
  );
}

export function LoadingSkeleton() {
  return <div className="h-64 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />;
}

interface NotFoundMessageProps {
  message: string;
}

export function NotFoundMessage({ message }: NotFoundMessageProps) {
  return <div className="text-stone-500 dark:text-night-300">{message}</div>;
}

interface ConstraintFieldProps {
  label: string;
  value: number;
  editing: boolean;
  suffix?: string;
  onChange: (value: number) => void;
}

export function ConstraintField({ label, value, editing, suffix, onChange }: ConstraintFieldProps) {
  return (
    <div>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: input is inside label when editing */}
      <label className="block text-sm text-stone-600 dark:text-night-200 dark:text-night-400 mb-1">
        {label}
        {editing ? (
          <input
            type="number"
            defaultValue={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            className="mt-1 w-full px-3 py-2 border border-cream-200 dark:border-night-600 rounded-md bg-white dark:bg-night-700 text-stone-900 dark:text-night-50"
          />
        ) : (
          <div className="text-stone-900 dark:text-night-50">
            {value.toLocaleString()}
            {suffix}
          </div>
        )}
      </label>
    </div>
  );
}

interface NotificationRowProps {
  title: string;
  description: string;
  enabled: boolean;
  editing: boolean;
  onToggle: (enabled: boolean) => void;
  enabledLabel?: string;
  disabledLabel?: string;
}

export function NotificationRow({
  title,
  description,
  enabled,
  editing,
  onToggle,
  enabledLabel = "Enabled",
  disabledLabel = "Disabled",
}: NotificationRowProps) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-cream-100 dark:border-night-700">
      <div>
        <div className="text-sm font-medium text-stone-900 dark:text-night-50">{title}</div>
        <div className="text-xs text-stone-500 dark:text-night-300">{description}</div>
      </div>
      {editing ? (
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
        />
      ) : (
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded ${
            enabled
              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
              : "bg-cream-100 text-stone-600 dark:text-night-200 dark:bg-night-700 dark:text-night-400"
          }`}
        >
          {enabled ? enabledLabel : disabledLabel}
        </span>
      )}
    </div>
  );
}

interface StatusBadgeProps {
  enabled: boolean;
  enabledLabel?: string;
  disabledLabel?: string;
  variant?: "green" | "amber";
}

export function StatusBadge({
  enabled,
  enabledLabel = "Enabled",
  disabledLabel = "Disabled",
  variant = "green",
}: StatusBadgeProps) {
  const enabledStyles =
    variant === "green"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
      : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";

  return (
    <span
      className={`px-2 py-0.5 text-xs font-medium rounded ${
        enabled
          ? enabledStyles
          : "bg-cream-100 text-stone-600 dark:text-night-200 dark:bg-night-700 dark:text-night-400"
      }`}
    >
      {enabled ? enabledLabel : disabledLabel}
    </span>
  );
}
