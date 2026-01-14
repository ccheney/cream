/**
 * IndicatorGrid Component
 *
 * Responsive grid layout for indicator values.
 * Uses CSS Grid with configurable columns.
 */

import { cn } from "@/lib/utils";

export interface IndicatorGridProps {
	children: React.ReactNode;
	columns?: 2 | 3 | 4 | 5 | 6;
	className?: string;
}

const columnClasses = {
	2: "grid-cols-2",
	3: "grid-cols-2 sm:grid-cols-3",
	4: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
	5: "grid-cols-2 sm:grid-cols-3 md:grid-cols-5",
	6: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6",
};

export function IndicatorGrid({ children, columns = 4, className }: IndicatorGridProps) {
	return <div className={cn("grid gap-4", columnClasses[columns], className)}>{children}</div>;
}

export default IndicatorGrid;
