import type React from "react";
import type { AlertsBannerProps } from "../types";

function getSeverityColor(severity: "critical" | "warning" | "info"): string {
  switch (severity) {
    case "critical":
      return "bg-red-500";
    case "warning":
      return "bg-amber-500";
    default:
      return "bg-blue-500";
  }
}

export function AlertsBanner({ alerts }: AlertsBannerProps): React.JSX.Element | null {
  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 p-4">
      <h2 className="text-lg font-medium text-amber-800 dark:text-amber-200 mb-2">
        Active Alerts ({alerts.length})
      </h2>
      <ul className="space-y-2">
        {alerts.slice(0, 3).map((alert) => (
          <li
            key={alert.id}
            className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300"
          >
            <span className={`w-2 h-2 rounded-full ${getSeverityColor(alert.severity)}`} />
            {alert.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
