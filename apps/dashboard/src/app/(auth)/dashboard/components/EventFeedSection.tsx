import type React from "react";
import { EventFeed } from "@/components/ui/event-feed";
import type { EventFeedSectionProps } from "../types";

export function EventFeedSection({ events }: EventFeedSectionProps): React.JSX.Element {
  return (
    <div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-cream-900 dark:text-cream-100">Event Feed</h2>
        <span className="text-sm text-cream-500 dark:text-cream-400">{events.length} events</span>
      </div>
      <EventFeed events={events} height={300} data-testid="dashboard-event-feed" />
    </div>
  );
}
