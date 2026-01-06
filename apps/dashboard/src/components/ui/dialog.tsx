/**
 * Dialog Component
 *
 * Modal dialog for confirmations, alerts, and custom content.
 *
 * @see docs/plans/ui/24-components.md modals section
 */

"use client";

import {
  type ButtonHTMLAttributes,
  createContext,
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

// Simple className merger utility
function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ============================================
// Types
// ============================================

export type DialogVariant = "default" | "confirmation" | "alert" | "destructive";

export interface DialogContextValue {
  isOpen: boolean;
  close: () => void;
  titleId: string;
  descriptionId: string;
}

export interface DialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog should close */
  onOpenChange: (open: boolean) => void;
  /** Dialog variant */
  variant?: DialogVariant;
  /** Close on backdrop click (default: true) */
  closeOnBackdrop?: boolean;
  /** Close on escape key (default: true) */
  closeOnEscape?: boolean;
  /** Children (DialogContent, etc.) */
  children: ReactNode;
}

export interface DialogContentProps extends HTMLAttributes<HTMLDivElement> {
  /** Content children */
  children: ReactNode;
  /** Maximum width class (default: max-w-md) */
  maxWidth?: string;
}

export interface DialogHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export interface DialogTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children: ReactNode;
}

export interface DialogDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {
  children: ReactNode;
}

export interface DialogFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export interface DialogCloseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

// ============================================
// Context
// ============================================

const DialogContext = createContext<DialogContextValue | null>(null);

function useDialogContext() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error("Dialog components must be used within a Dialog provider");
  }
  return context;
}

// ============================================
// Dialog Root
// ============================================

/**
 * Dialog - Modal dialog container.
 *
 * @example
 * ```tsx
 * const [open, setOpen] = useState(false);
 *
 * <Dialog open={open} onOpenChange={setOpen}>
 *   <DialogContent>
 *     <DialogHeader>
 *       <DialogTitle>Confirm Action</DialogTitle>
 *       <DialogDescription>Are you sure?</DialogDescription>
 *     </DialogHeader>
 *     <DialogFooter>
 *       <DialogClose>Cancel</DialogClose>
 *       <button onClick={handleConfirm}>Confirm</button>
 *     </DialogFooter>
 *   </DialogContent>
 * </Dialog>
 * ```
 */
export function Dialog({
  open,
  onOpenChange,
  variant = "default",
  closeOnBackdrop = true,
  closeOnEscape = true,
  children,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [mounted, setMounted] = useState(false);

  // Mount check for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleEscape = useCallback(() => {
    if (closeOnEscape) {
      close();
    }
  }, [closeOnEscape, close]);

  const handleBackdropClick = useCallback(() => {
    if (closeOnBackdrop) {
      close();
    }
  }, [closeOnBackdrop, close]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
    return undefined;
  }, [open]);

  if (!mounted || !open) {
    return null;
  }

  return createPortal(
    <DialogContext.Provider value={{ isOpen: open, close, titleId, descriptionId }}>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />
      {/* Dialog */}
      <DialogPortalContent
        onEscape={handleEscape}
        variant={variant}
        titleId={titleId}
        descriptionId={descriptionId}
      >
        {children}
      </DialogPortalContent>
    </DialogContext.Provider>,
    document.body
  );
}

// ============================================
// DialogPortalContent (internal)
// ============================================

interface DialogPortalContentProps {
  children: ReactNode;
  onEscape: () => void;
  variant: DialogVariant;
  titleId: string;
  descriptionId: string;
}

function DialogPortalContent({
  children,
  onEscape,
  variant,
  titleId,
  descriptionId,
}: DialogPortalContentProps) {
  const { containerRef } = useFocusTrap({
    active: true,
    onEscape,
  });

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-variant={variant}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {children}
    </div>
  );
}

// ============================================
// DialogContent
// ============================================

/**
 * DialogContent - Main content container.
 */
export const DialogContent = forwardRef<HTMLDivElement, DialogContentProps>(
  ({ children, maxWidth = "max-w-md", className, ...props }, ref) => {
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: Event stops needed to prevent backdrop click from closing
      <div
        ref={ref}
        role="document"
        className={cn(
          "w-full rounded-lg bg-white dark:bg-stone-800 shadow-xl",
          "border border-stone-200 dark:border-stone-700",
          "animate-in fade-in-0 zoom-in-95 duration-200",
          maxWidth,
          className
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        {...props}
      >
        {children}
      </div>
    );
  }
);

DialogContent.displayName = "DialogContent";

// ============================================
// DialogHeader
// ============================================

/**
 * DialogHeader - Header section with title and description.
 */
export const DialogHeader = forwardRef<HTMLDivElement, DialogHeaderProps>(
  ({ children, className, ...props }, ref) => (
    <div ref={ref} className={cn("px-6 pt-6 pb-2", className)} {...props}>
      {children}
    </div>
  )
);

DialogHeader.displayName = "DialogHeader";

// ============================================
// DialogTitle
// ============================================

/**
 * DialogTitle - Dialog heading.
 */
export const DialogTitle = forwardRef<HTMLHeadingElement, DialogTitleProps>(
  ({ children, className, ...props }, ref) => {
    const { titleId } = useDialogContext();

    return (
      <h2
        ref={ref}
        id={titleId}
        className={cn("text-lg font-semibold text-stone-900 dark:text-stone-100", className)}
        {...props}
      >
        {children}
      </h2>
    );
  }
);

DialogTitle.displayName = "DialogTitle";

// ============================================
// DialogDescription
// ============================================

/**
 * DialogDescription - Descriptive text.
 */
export const DialogDescription = forwardRef<HTMLParagraphElement, DialogDescriptionProps>(
  ({ children, className, ...props }, ref) => {
    const { descriptionId } = useDialogContext();

    return (
      <p
        ref={ref}
        id={descriptionId}
        className={cn("mt-2 text-sm text-stone-600 dark:text-stone-400", className)}
        {...props}
      >
        {children}
      </p>
    );
  }
);

DialogDescription.displayName = "DialogDescription";

// ============================================
// DialogBody
// ============================================

/**
 * DialogBody - Main content area.
 */
export const DialogBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ children, className, ...props }, ref) => (
    <div ref={ref} className={cn("px-6 py-4", className)} {...props}>
      {children}
    </div>
  )
);

DialogBody.displayName = "DialogBody";

// ============================================
// DialogFooter
// ============================================

/**
 * DialogFooter - Footer with action buttons.
 */
export const DialogFooter = forwardRef<HTMLDivElement, DialogFooterProps>(
  ({ children, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("px-6 pb-6 pt-2 flex items-center justify-end gap-3", className)}
      {...props}
    >
      {children}
    </div>
  )
);

DialogFooter.displayName = "DialogFooter";

// ============================================
// DialogClose
// ============================================

/**
 * DialogClose - Close button that dismisses the dialog.
 */
export const DialogClose = forwardRef<HTMLButtonElement, DialogCloseProps>(
  ({ children, className, onClick, ...props }, ref) => {
    const { close } = useDialogContext();

    return (
      <button
        ref={ref}
        type="button"
        onClick={(e) => {
          onClick?.(e);
          close();
        }}
        className={cn(
          "px-4 py-2 text-sm font-medium rounded-md",
          "text-stone-700 dark:text-stone-300",
          "bg-stone-100 dark:bg-stone-700",
          "hover:bg-stone-200 dark:hover:bg-stone-600",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

DialogClose.displayName = "DialogClose";

// ============================================
// Exports
// ============================================

export default Dialog;
