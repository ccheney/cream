/**
 * Table Component
 *
 * Data table with sticky headers, sorting, and compact mode.
 *
 * @see docs/plans/ui/24-components.md tables section
 */

"use client";

import {
	createContext,
	forwardRef,
	type HTMLAttributes,
	type ReactNode,
	type TdHTMLAttributes,
	type ThHTMLAttributes,
	useCallback,
	useContext,
	useState,
} from "react";

// Simple className merger utility
function cn(...classes: (string | boolean | undefined | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

// ============================================
// Types
// ============================================

export type TableVariant = "default" | "compact";
export type SortDirection = "asc" | "desc" | null;

export interface TableContextValue {
	variant: TableVariant;
	sortColumn: string | null;
	sortDirection: SortDirection;
	onSort: (column: string) => void;
}

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
	/** Table variant */
	variant?: TableVariant;
	/** Controlled sort column */
	sortColumn?: string | null;
	/** Controlled sort direction */
	sortDirection?: SortDirection;
	/** Callback when sort changes */
	onSortChange?: (column: string, direction: SortDirection) => void;
	/** Children (TableHeader, TableBody) */
	children: ReactNode;
}

export interface TableHeaderProps extends HTMLAttributes<HTMLTableSectionElement> {
	children: ReactNode;
}

export interface TableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {
	children: ReactNode;
}

export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
	/** Whether the row is selected */
	selected?: boolean;
	/** Whether the row is clickable */
	clickable?: boolean;
	children: ReactNode;
}

export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
	/** Column key for sorting (if sortable) */
	sortKey?: string;
	/** Whether the column is numeric (right-aligned) */
	numeric?: boolean;
	children: ReactNode;
}

export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
	/** Whether the cell contains numeric data */
	numeric?: boolean;
	/** Whether to truncate overflow text */
	truncate?: boolean;
	children: ReactNode;
}

// ============================================
// Context
// ============================================

const TableContext = createContext<TableContextValue | null>(null);

function useTableContext() {
	const context = useContext(TableContext);
	if (!context) {
		throw new Error("Table components must be used within a Table provider");
	}
	return context;
}

// ============================================
// Sort Icon
// ============================================

function SortIcon({ direction, active }: { direction: SortDirection; active: boolean }) {
	if (!active || !direction) {
		return (
			<svg
				className="h-4 w-4 text-stone-400 dark:text-stone-500"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				aria-hidden="true"
			>
				<path d="M7 10l5-5 5 5" />
				<path d="M7 14l5 5 5-5" />
			</svg>
		);
	}

	return (
		<svg
			className="h-4 w-4 text-stone-900 dark:text-stone-100"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			{direction === "asc" ? <path d="M7 14l5-5 5 5" /> : <path d="M7 10l5 5 5-5" />}
		</svg>
	);
}

// ============================================
// Table Root
// ============================================

/**
 * Table - Data table container with sorting support.
 *
 * @example
 * ```tsx
 * <Table variant="compact" onSortChange={(col, dir) => setSorting({ col, dir })}>
 *   <TableHeader>
 *     <TableRow>
 *       <TableHead sortKey="name">Name</TableHead>
 *       <TableHead sortKey="price" numeric>Price</TableHead>
 *     </TableRow>
 *   </TableHeader>
 *   <TableBody>
 *     {data.map(row => (
 *       <TableRow key={row.id}>
 *         <TableCell>{row.name}</TableCell>
 *         <TableCell numeric>{row.price}</TableCell>
 *       </TableRow>
 *     ))}
 *   </TableBody>
 * </Table>
 * ```
 */
export const Table = forwardRef<HTMLTableElement, TableProps>(
	(
		{
			variant = "default",
			sortColumn: controlledSortColumn,
			sortDirection: controlledSortDirection,
			onSortChange,
			children,
			className,
			...props
		},
		ref,
	) => {
		// Internal sort state (for uncontrolled mode)
		const [internalSortColumn, setInternalSortColumn] = useState<string | null>(null);
		const [internalSortDirection, setInternalSortDirection] = useState<SortDirection>(null);

		// Use controlled or internal state
		const isControlled = controlledSortColumn !== undefined;
		const sortColumn = isControlled ? controlledSortColumn : internalSortColumn;
		const sortDirection = isControlled ? (controlledSortDirection ?? null) : internalSortDirection;

		const handleSort = useCallback(
			(column: string) => {
				let newDirection: SortDirection = "asc";

				if (sortColumn === column) {
					if (sortDirection === "asc") {
						newDirection = "desc";
					} else if (sortDirection === "desc") {
						newDirection = null;
					}
				}

				if (!isControlled) {
					setInternalSortColumn(newDirection ? column : null);
					setInternalSortDirection(newDirection);
				}

				onSortChange?.(column, newDirection);
			},
			[sortColumn, sortDirection, isControlled, onSortChange],
		);

		return (
			<TableContext.Provider
				value={{
					variant,
					sortColumn,
					sortDirection,
					onSort: handleSort,
				}}
			>
				<div className="w-full overflow-auto">
					<table
						ref={ref}
						className={cn(
							"w-full border-collapse text-sm",
							variant === "compact" ? "text-[13px]" : "text-sm",
							className,
						)}
						{...props}
					>
						{children}
					</table>
				</div>
			</TableContext.Provider>
		);
	},
);

Table.displayName = "Table";

// ============================================
// TableHeader
// ============================================

/**
 * TableHeader - Table header section with sticky positioning.
 */
export const TableHeader = forwardRef<HTMLTableSectionElement, TableHeaderProps>(
	({ children, className, ...props }, ref) => (
		<thead
			ref={ref}
			className={cn(
				"sticky top-0 z-10",
				"bg-stone-50 dark:bg-stone-800/90",
				"backdrop-blur-sm",
				className,
			)}
			{...props}
		>
			{children}
		</thead>
	),
);

TableHeader.displayName = "TableHeader";

// ============================================
// TableBody
// ============================================

/**
 * TableBody - Table body section.
 */
export const TableBody = forwardRef<HTMLTableSectionElement, TableBodyProps>(
	({ children, className, ...props }, ref) => (
		<tbody
			ref={ref}
			className={cn("divide-y divide-stone-200 dark:divide-stone-700", className)}
			{...props}
		>
			{children}
		</tbody>
	),
);

TableBody.displayName = "TableBody";

// ============================================
// TableRow
// ============================================

/**
 * TableRow - Table row with hover state.
 */
export const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
	({ children, selected, clickable, className, ...props }, ref) => (
		<tr
			ref={ref}
			className={cn(
				"transition-colors",
				"hover:bg-stone-50 dark:hover:bg-stone-800/50",
				"even:bg-stone-50/50 dark:even:bg-stone-800/25",
				selected && "bg-blue-50 dark:bg-blue-900/20",
				clickable && "cursor-pointer",
				className,
			)}
			{...props}
		>
			{children}
		</tr>
	),
);

TableRow.displayName = "TableRow";

// ============================================
// TableHead
// ============================================

/**
 * TableHead - Table header cell with optional sorting.
 */
export const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(
	({ children, sortKey, numeric, className, ...props }, ref) => {
		const { variant, sortColumn, sortDirection, onSort } = useTableContext();
		const isSortable = Boolean(sortKey);
		const isActive = sortColumn === sortKey;

		const paddingClass = variant === "compact" ? "px-3 py-2" : "px-4 py-3";

		const handleClick = () => {
			if (sortKey) {
				onSort(sortKey);
			}
		};

		const handleKeyDown = (e: React.KeyboardEvent) => {
			if (sortKey && (e.key === "Enter" || e.key === " ")) {
				e.preventDefault();
				onSort(sortKey);
			}
		};

		return (
			<th
				ref={ref}
				scope="col"
				className={cn(
					paddingClass,
					"text-left font-medium text-stone-600 dark:text-stone-400",
					"border-b border-stone-200 dark:border-stone-700",
					numeric && "text-right tabular-nums",
					isSortable && "cursor-pointer select-none hover:text-stone-900 dark:hover:text-stone-100",
					className,
				)}
				onClick={isSortable ? handleClick : undefined}
				onKeyDown={isSortable ? handleKeyDown : undefined}
				tabIndex={isSortable ? 0 : undefined}
				role={isSortable ? "button" : undefined}
				aria-sort={
					isActive && sortDirection
						? sortDirection === "asc"
							? "ascending"
							: "descending"
						: undefined
				}
				{...props}
			>
				<div className={cn("inline-flex items-center gap-1", numeric && "justify-end w-full")}>
					{children}
					{isSortable && <SortIcon direction={isActive ? sortDirection : null} active={isActive} />}
				</div>
			</th>
		);
	},
);

TableHead.displayName = "TableHead";

// ============================================
// TableCell
// ============================================

/**
 * TableCell - Table data cell.
 */
export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
	({ children, numeric, truncate, className, ...props }, ref) => {
		const { variant } = useTableContext();
		const paddingClass = variant === "compact" ? "px-3 py-2" : "px-4 py-3";

		return (
			<td
				ref={ref}
				className={cn(
					paddingClass,
					"text-stone-900 dark:text-stone-100",
					numeric && "text-right font-mono tabular-nums",
					truncate && "max-w-0 truncate",
					className,
				)}
				{...props}
			>
				{children}
			</td>
		);
	},
);

TableCell.displayName = "TableCell";

// ============================================
// Empty State
// ============================================

export interface TableEmptyProps extends HTMLAttributes<HTMLTableRowElement> {
	/** Number of columns to span */
	colSpan: number;
	/** Empty message */
	children?: ReactNode;
}

/**
 * TableEmpty - Empty state row for tables with no data.
 */
export const TableEmpty = forwardRef<HTMLTableRowElement, TableEmptyProps>(
	({ colSpan, children, className, ...props }, ref) => {
		const { variant } = useTableContext();
		const paddingClass = variant === "compact" ? "px-3 py-8" : "px-4 py-12";

		return (
			<tr ref={ref} className={className} {...props}>
				<td
					colSpan={colSpan}
					className={cn(paddingClass, "text-center text-stone-500 dark:text-stone-400")}
				>
					{children ?? "No data available"}
				</td>
			</tr>
		);
	},
);

TableEmpty.displayName = "TableEmpty";

// ============================================
// Exports
// ============================================

export default Table;
