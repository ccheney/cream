/**
 * Activity Feed
 *
 * Timeline of recent indicator lifecycle events.
 */

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import type { IndicatorActivity } from "@/hooks/queries";

interface ActivityFeedProps {
  activities: IndicatorActivity[] | undefined;
  isLoading: boolean;
}

/**
 * Get icon and style for activity type.
 */
function getActivityStyle(type: IndicatorActivity["type"]) {
  switch (type) {
    case "generation":
      return {
        icon: "⚡",
        label: "Generated",
        bgColor: "bg-purple-100 dark:bg-purple-900/30",
        textColor: "text-purple-700 dark:text-purple-300",
        dotColor: "bg-purple-500",
      };
    case "promotion":
      return {
        icon: "🚀",
        label: "Promoted",
        bgColor: "bg-green-100 dark:bg-green-900/30",
        textColor: "text-green-700 dark:text-green-300",
        dotColor: "bg-green-500",
      };
    case "retirement":
      return {
        icon: "📦",
        label: "Retired",
        bgColor: "bg-cream-100 dark:bg-night-700",
        textColor: "text-cream-700 dark:text-cream-300",
        dotColor: "bg-cream-400",
      };
    case "paper_start":
      return {
        icon: "📝",
        label: "Paper Trading",
        bgColor: "bg-blue-100 dark:bg-blue-900/30",
        textColor: "text-blue-700 dark:text-blue-300",
        dotColor: "bg-blue-500",
      };
    default:
      return {
        icon: "•",
        label: "Activity",
        bgColor: "bg-cream-100 dark:bg-night-700",
        textColor: "text-cream-700 dark:text-cream-300",
        dotColor: "bg-cream-400",
      };
  }
}

export function ActivityFeed({ activities, isLoading }: ActivityFeedProps) {
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <div className="h-6 w-32 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
        </div>
        <div className="p-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
        <div className="p-4 border-b border-cream-200 dark:border-night-700">
          <h3 className="text-lg font-medium text-cream-900 dark:text-cream-100">
            Recent Activity
          </h3>
        </div>
        <div className="p-8 text-center text-cream-400 dark:text-cream-500">No recent activity</div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
      <div className="p-4 border-b border-cream-200 dark:border-night-700">
        <h3 className="text-lg font-medium text-cream-900 dark:text-cream-100">Recent Activity</h3>
      </div>

      <div className="p-4">
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-cream-200 dark:bg-night-700" />

          <div className="space-y-4">
            {activities.map((activity, index) => {
              const style = getActivityStyle(activity.type);
              const date = new Date(activity.timestamp);

              return (
                <div
                  key={`${activity.indicatorId}-${activity.type}-${index}`}
                  className="relative flex gap-4"
                >
                  {/* Timeline dot */}
                  <div
                    className={`w-6 h-6 rounded-full ${style.dotColor} flex items-center justify-center text-white text-xs z-10`}
                  >
                    {style.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded ${style.bgColor} ${style.textColor}`}
                      >
                        {style.label}
                      </span>
                      <Link
                        href={`/indicators/${activity.indicatorId}`}
                        className="text-cream-900 dark:text-cream-100 font-medium hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {activity.name}
                      </Link>
                      <span className="text-sm text-cream-400 dark:text-cream-500">
                        {formatDistanceToNow(date, { addSuffix: true })}
                      </span>
                    </div>
                    {activity.details && (
                      <p className="mt-1 text-sm text-cream-600 dark:text-cream-400 truncate">
                        {activity.details}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
