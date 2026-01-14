/**
 * ConfirmationDialog Component
 *
 * Pre-configured dialog for destructive actions requiring confirmation.
 *
 * @see docs/plans/ui/24-components.md confirmation dialogs
 */

"use client";

import { forwardRef, type ReactNode, useState } from "react";
import { Button } from "./button";
import {
	Dialog,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "./dialog";

// Simple className merger utility
function cn(...classes: (string | boolean | undefined | null)[]): string {
	return classes.filter(Boolean).join(" ");
}

export type ConfirmationDialogVariant = "warning" | "danger" | "info";

export interface ConfirmationDialogCheckbox {
	id: string;
	label: string;
	required?: boolean;
}

export interface ConfirmationDialogProps {
	/** Whether the dialog is open */
	open: boolean;
	/** Callback when dialog should close */
	onOpenChange: (open: boolean) => void;
	/** Dialog title */
	title: string;
	/** Description of the action and its consequences */
	description: string | ReactNode;
	/** Variant determines icon and styling */
	variant?: ConfirmationDialogVariant;
	/** Confirm button text */
	confirmText?: string;
	/** Cancel button text */
	cancelText?: string;
	/** Callback when confirmed */
	onConfirm: () => void | Promise<void>;
	/** Checkboxes for additional options */
	checkboxes?: ConfirmationDialogCheckbox[];
	/** Whether confirm is loading */
	isLoading?: boolean;
	/** Additional content in the body */
	children?: ReactNode;
}

function WarningIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
			<line x1="12" y1="9" x2="12" y2="13" />
			<line x1="12" y1="17" x2="12.01" y2="17" />
		</svg>
	);
}

function DangerIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" />
			<line x1="15" y1="9" x2="9" y2="15" />
			<line x1="9" y1="9" x2="15" y2="15" />
		</svg>
	);
}

function InfoIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="10" />
			<line x1="12" y1="16" x2="12" y2="12" />
			<line x1="12" y1="8" x2="12.01" y2="8" />
		</svg>
	);
}

const variantConfig: Record<
	ConfirmationDialogVariant,
	{
		Icon: typeof WarningIcon;
		iconColor: string;
		iconBg: string;
		confirmVariant: "primary" | "destructive";
	}
> = {
	warning: {
		Icon: WarningIcon,
		iconColor: "text-amber-600 dark:text-amber-400",
		iconBg: "bg-amber-100 dark:bg-amber-900/30",
		confirmVariant: "primary",
	},
	danger: {
		Icon: DangerIcon,
		iconColor: "text-red-600 dark:text-red-400",
		iconBg: "bg-red-100 dark:bg-red-900/30",
		confirmVariant: "destructive",
	},
	info: {
		Icon: InfoIcon,
		iconColor: "text-blue-600 dark:text-blue-400",
		iconBg: "bg-blue-100 dark:bg-blue-900/30",
		confirmVariant: "primary",
	},
};

/**
 * ConfirmationDialog - Dialog for confirming destructive actions.
 *
 * @example
 * ```tsx
 * const [open, setOpen] = useState(false);
 *
 * <ConfirmationDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   variant="danger"
 *   title="Stop Trading System"
 *   description="This will immediately halt all trading activity. Any open orders will remain until manually closed."
 *   confirmText="Stop System"
 *   onConfirm={handleStopSystem}
 *   checkboxes={[
 *     { id: "cancel-orders", label: "Cancel all open orders", required: false }
 *   ]}
 * />
 * ```
 */
export const ConfirmationDialog = forwardRef<HTMLDivElement, ConfirmationDialogProps>(
	(
		{
			open,
			onOpenChange,
			title,
			description,
			variant = "warning",
			confirmText = "Confirm",
			cancelText = "Cancel",
			onConfirm,
			checkboxes = [],
			isLoading = false,
			children,
		},
		_ref
	) => {
		const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
		const [isConfirming, setIsConfirming] = useState(false);

		const config = variantConfig[variant];
		const Icon = config.Icon;

		const requiredCheckboxes = checkboxes.filter((cb) => cb.required);
		const allRequiredChecked = requiredCheckboxes.every((cb) => checkedItems[cb.id]);
		const canConfirm = requiredCheckboxes.length === 0 || allRequiredChecked;

		const handleConfirm = async () => {
			if (!canConfirm) {
				return;
			}

			setIsConfirming(true);
			try {
				await onConfirm();
				onOpenChange(false);
			} finally {
				setIsConfirming(false);
			}
		};

		const handleCheckboxChange = (id: string, checked: boolean) => {
			setCheckedItems((prev) => ({ ...prev, [id]: checked }));
		};

		const handleOpenChange = (newOpen: boolean) => {
			if (!newOpen) {
				setCheckedItems({});
			}
			onOpenChange(newOpen);
		};

		const loading = isLoading || isConfirming;

		return (
			<Dialog open={open} onOpenChange={handleOpenChange} variant="confirmation">
				<DialogContent maxWidth="max-w-md">
					<DialogHeader>
						<div className="flex items-start gap-4">
							<div className={cn("p-2 rounded-full shrink-0", config.iconBg)}>
								<Icon className={cn("h-6 w-6", config.iconColor)} />
							</div>
							<div className="flex-1 min-w-0">
								<DialogTitle>{title}</DialogTitle>
								<DialogDescription>{description}</DialogDescription>
							</div>
						</div>
					</DialogHeader>

					{(checkboxes.length > 0 || children) && (
						<DialogBody>
							{children}

							{checkboxes.length > 0 && (
								<div className="space-y-3 mt-4">
									{checkboxes.map((checkbox) => (
										<label key={checkbox.id} className="flex items-center gap-3 cursor-pointer">
											<input
												type="checkbox"
												checked={checkedItems[checkbox.id] ?? false}
												onChange={(e) => handleCheckboxChange(checkbox.id, e.target.checked)}
												className={cn(
													"h-4 w-4 rounded border-stone-300 dark:border-stone-600",
													"text-blue-600 focus:ring-blue-500 focus:ring-offset-0",
													"dark:bg-stone-700"
												)}
											/>
											<span className="text-sm text-stone-700 dark:text-stone-300">
												{checkbox.label}
												{checkbox.required && (
													<span className="text-red-500 ml-1" aria-hidden="true">
														*
													</span>
												)}
											</span>
										</label>
									))}
								</div>
							)}
						</DialogBody>
					)}

					<DialogFooter>
						<DialogClose disabled={loading}>{cancelText}</DialogClose>
						<Button
							variant={config.confirmVariant}
							onClick={handleConfirm}
							disabled={!canConfirm}
							state={loading ? "loading" : "idle"}
						>
							{confirmText}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	}
);

ConfirmationDialog.displayName = "ConfirmationDialog";

export interface StopSystemDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (options: { cancelOrders: boolean }) => void | Promise<void>;
}

export function StopSystemDialog({ open, onOpenChange, onConfirm }: StopSystemDialogProps) {
	const [cancelOrders, setCancelOrders] = useState(false);

	return (
		<ConfirmationDialog
			open={open}
			onOpenChange={(newOpen) => {
				if (!newOpen) {
					setCancelOrders(false);
				}
				onOpenChange(newOpen);
			}}
			variant="danger"
			title="Stop Trading System"
			description="This will immediately halt all trading activity. The system will stop evaluating new positions and executing trades."
			confirmText="Stop System"
			onConfirm={() => onConfirm({ cancelOrders })}
			checkboxes={[
				{
					id: "cancel-orders",
					label: "Cancel all open orders",
				},
			]}
		/>
	);
}

export interface ClosePositionDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	symbol: string;
	quantity: number;
	onConfirm: () => void | Promise<void>;
}

export function ClosePositionDialog({
	open,
	onOpenChange,
	symbol,
	quantity,
	onConfirm,
}: ClosePositionDialogProps) {
	return (
		<ConfirmationDialog
			open={open}
			onOpenChange={onOpenChange}
			variant="warning"
			title={`Close ${symbol} Position`}
			description={`This will close your entire position of ${quantity.toLocaleString()} shares in ${symbol} at market price.`}
			confirmText="Close Position"
			onConfirm={onConfirm}
		/>
	);
}

export default ConfirmationDialog;
