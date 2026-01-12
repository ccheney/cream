"use client";

/**
 * Notifications Section Editor
 *
 * Configuration editor for alert and notification preferences.
 */

import { useAlertSettings, useUpdateAlertSettings } from "@/hooks/queries";
import type { AlertSettings } from "@/lib/api/types";
import { useNotificationsEditor } from "../hooks";
import {
  EditorHeader,
  LoadingSkeleton,
  NotFoundMessage,
  NotificationRow,
  StatusBadge,
} from "./shared";

export function NotificationsSection() {
  const { data: settings, isLoading } = useAlertSettings();
  const updateSettings = useUpdateAlertSettings();
  const editor = useNotificationsEditor(settings, updateSettings);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (!settings) {
    return <NotFoundMessage message="No notification settings found" />;
  }

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
      <EditorHeader
        title="Notification Preferences"
        editing={editor.editing}
        isPending={editor.isPending}
        onStartEdit={editor.startEdit}
        onCancel={editor.cancelEdit}
        onSave={editor.saveEdit}
      />

      <NotificationSettings
        settings={settings}
        editing={editor.editing}
        formData={editor.formData}
        onFormChange={editor.updateFormData}
      />
    </div>
  );
}

interface NotificationSettingsProps {
  settings: AlertSettings;
  editing: boolean;
  formData: Partial<AlertSettings>;
  onFormChange: (data: Partial<AlertSettings>) => void;
}

function NotificationSettings({
  settings,
  editing,
  formData,
  onFormChange,
}: NotificationSettingsProps) {
  return (
    <div className="space-y-4">
      <NotificationRow
        title="Push Notifications"
        description="Receive browser push notifications for alerts"
        enabled={editing ? (formData.enablePush ?? false) : settings.enablePush}
        editing={editing}
        onToggle={(enabled) => onFormChange({ enablePush: enabled })}
      />

      <NotificationRow
        title="Email Notifications"
        description="Receive email notifications for critical alerts"
        enabled={editing ? (formData.enableEmail ?? false) : settings.enableEmail}
        editing={editing}
        onToggle={(enabled) => onFormChange({ enableEmail: enabled })}
      />

      <CriticalOnlyRow
        settings={settings}
        editing={editing}
        formData={formData}
        onFormChange={onFormChange}
      />

      {settings.emailAddress && <EmailAddressDisplay email={settings.emailAddress} />}
    </div>
  );
}

interface CriticalOnlyRowProps {
  settings: AlertSettings;
  editing: boolean;
  formData: Partial<AlertSettings>;
  onFormChange: (data: Partial<AlertSettings>) => void;
}

function CriticalOnlyRow({ settings, editing, formData, onFormChange }: CriticalOnlyRowProps) {
  const isEnabled = editing ? (formData.criticalOnly ?? false) : settings.criticalOnly;

  return (
    <div className="flex items-center justify-between py-3 border-b border-cream-100 dark:border-night-700">
      <div>
        <div className="text-sm font-medium text-stone-900 dark:text-night-50">Critical Only</div>
        <div className="text-xs text-stone-500 dark:text-night-300">
          Only send notifications for critical-level alerts
        </div>
      </div>
      {editing ? (
        <input
          type="checkbox"
          checked={formData.criticalOnly ?? false}
          onChange={(e) => onFormChange({ criticalOnly: e.target.checked })}
          className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
        />
      ) : (
        <StatusBadge
          enabled={isEnabled}
          enabledLabel="Critical Only"
          disabledLabel="All Alerts"
          variant="amber"
        />
      )}
    </div>
  );
}

interface EmailAddressDisplayProps {
  email: string;
}

function EmailAddressDisplay({ email }: EmailAddressDisplayProps) {
  return (
    <div className="py-3">
      <div className="text-sm font-medium text-stone-900 dark:text-night-50 mb-1">
        Email Address
      </div>
      <div className="text-sm text-stone-600 dark:text-night-200 dark:text-night-400">{email}</div>
    </div>
  );
}
