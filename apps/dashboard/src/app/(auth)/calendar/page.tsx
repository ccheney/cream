/**
 * Economic Calendar Page
 *
 * Full-page Schedule-X calendar showing economic events.
 * Links from the EconomicCalendarWidget in the Control Panel.
 *
 * @see docs/plans/41-economic-calendar-page.md
 * @see docs/plans/ui/23-layout.md - Page layout and spacing
 */

import type { Metadata } from "next";
import { EconomicCalendar } from "./components/EconomicCalendar";

export const metadata: Metadata = {
  title: "Economic Calendar | Cream",
  description: "Market-moving economic events calendar with FRED data",
};

export default function CalendarPage() {
  return (
    <div className="flex flex-col h-full">
      <header className="shrink-0 flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">
            Economic Calendar
          </h1>
          <p className="text-sm text-stone-500 dark:text-night-400 mt-0.5">
            Market-moving economic events from FRED
          </p>
        </div>
      </header>
      <main className="flex-1 min-h-0 overflow-hidden">
        <EconomicCalendar />
      </main>
    </div>
  );
}
