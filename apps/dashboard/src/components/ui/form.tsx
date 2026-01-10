/**
 * Form Components
 *
 * Form field wrapper with inline error display for React Hook Form + Zod.
 *
 * @see docs/plans/ui/28-states.md lines 76-81
 */

"use client";

import React, { createContext, forwardRef, useContext, useId } from "react";
import type { ControllerProps, FieldPath, FieldValues } from "react-hook-form";
import { Controller, FormProvider, useFormContext } from "react-hook-form";

// ============================================
// Types
// ============================================

/**
 * Form field context value.
 */
interface FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> {
  name: TName;
}

/**
 * Form item context value.
 */
interface FormItemContextValue {
  id: string;
}

/**
 * Form error props.
 */
export interface FormErrorProps {
  /** Error message */
  message?: string;
  /** Custom class name */
  className?: string;
  /** Test ID */
  testId?: string;
}

/**
 * Form field props.
 */
export interface FormFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends ControllerProps<TFieldValues, TName> {}

/**
 * Form item props.
 */
export interface FormItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Test ID */
  testId?: string;
}

/**
 * Form label props.
 */
export interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /** Test ID */
  testId?: string;
}

/**
 * Form description props.
 */
export interface FormDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  /** Test ID */
  testId?: string;
}

// ============================================
// Contexts
// ============================================

const FormFieldContext = createContext<FormFieldContextValue | null>(null);
const FormItemContext = createContext<FormItemContextValue | null>(null);

// ============================================
// Hooks
// ============================================

/**
 * Hook to access form field context.
 */
export function useFormField() {
  const fieldContext = useContext(FormFieldContext);
  const itemContext = useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  if (!fieldContext) {
    throw new Error("useFormField must be used within FormField");
  }

  const fieldState = getFieldState(fieldContext.name, formState);

  const id = itemContext?.id;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-description`,
    formMessageId: `${id}-form-message`,
    ...fieldState,
  };
}

// ============================================
// Styles
// ============================================

const itemStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
};

const labelStyles: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 500,
  color: "#44403c", // stone-700
  cursor: "pointer",
};

const labelErrorStyles: React.CSSProperties = {
  color: "#dc2626", // red-600 (critical)
};

const descriptionStyles: React.CSSProperties = {
  fontSize: "13px",
  color: "#78716c", // stone-500
  marginTop: "-2px",
};

const errorStyles: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  fontSize: "14px",
  color: "#dc2626", // red-600 (critical)
  marginTop: "2px",
};

const errorIconStyles: React.CSSProperties = {
  width: "16px",
  height: "16px",
  flexShrink: 0,
};

// ============================================
// Components
// ============================================

/**
 * Form provider wrapper (re-export from react-hook-form).
 */
export { FormProvider as Form };

/**
 * Form field component - wraps Controller from react-hook-form.
 */
export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ ...props }: FormFieldProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

/**
 * Form item container - provides ID context for accessibility.
 */
export const FormItem = forwardRef<HTMLDivElement, FormItemProps>(
  ({ testId = "form-item", style, ...props }, ref) => {
    const id = useId();

    return (
      <FormItemContext.Provider value={{ id }}>
        <div ref={ref} data-testid={testId} style={{ ...itemStyles, ...style }} {...props} />
      </FormItemContext.Provider>
    );
  }
);
FormItem.displayName = "FormItem";

/**
 * Form label - automatically links to form control.
 */
export const FormLabel = forwardRef<HTMLLabelElement, FormLabelProps>(
  ({ testId = "form-label", style, ...props }, ref) => {
    const { formItemId, error } = useFormField();

    return (
      // biome-ignore lint/a11y/noLabelWithoutControl: Label is associated via htmlFor
      <label
        ref={ref}
        htmlFor={formItemId}
        data-testid={testId}
        style={{
          ...labelStyles,
          ...(error && labelErrorStyles),
          ...style,
        }}
        {...props}
      />
    );
  }
);
FormLabel.displayName = "FormLabel";

/**
 * Form control - wrapper that applies ARIA attributes.
 */
export function FormControl({ children }: { children: React.ReactElement }) {
  const { formItemId, formDescriptionId, formMessageId, error } = useFormField();

  const describedBy = error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId;

  return React.cloneElement(children, {
    id: formItemId,
    "aria-describedby": describedBy,
    "aria-invalid": !!error,
    // biome-ignore lint/suspicious/noExplicitAny: cloneElement requires any for arbitrary prop spreading
  } as any);
}

/**
 * Form description - helper text below the field.
 */
export const FormDescription = forwardRef<HTMLParagraphElement, FormDescriptionProps>(
  ({ testId = "form-description", style, ...props }, ref) => {
    const { formDescriptionId } = useFormField();

    return (
      <p
        ref={ref}
        id={formDescriptionId}
        data-testid={testId}
        style={{ ...descriptionStyles, ...style }}
        {...props}
      />
    );
  }
);
FormDescription.displayName = "FormDescription";

/**
 * Alert Circle Icon (inline SVG to avoid external dependency).
 */
function AlertCircleIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

/**
 * Form message - displays error message with icon.
 *
 * @example
 * ```tsx
 * // Within FormField context
 * <FormMessage />
 *
 * // Standalone with message
 * <FormError message="This field is required" />
 * ```
 */
export const FormMessage = forwardRef<HTMLParagraphElement, FormErrorProps>(
  ({ message, testId = "form-message", className, ...props }, ref) => {
    const { error, formMessageId } = useFormField();
    const body = message || error?.message;

    if (!body) {
      return null;
    }

    return (
      <p
        ref={ref}
        id={formMessageId}
        role="alert"
        data-testid={testId}
        className={className}
        style={errorStyles}
        {...props}
      >
        <AlertCircleIcon style={errorIconStyles} />
        <span>{body}</span>
      </p>
    );
  }
);
FormMessage.displayName = "FormMessage";

/**
 * Standalone form error component (not tied to form context).
 *
 * @example
 * ```tsx
 * <FormError message="Please enter a valid email address" />
 * ```
 */
export function FormError({ message, testId = "form-error", className }: FormErrorProps) {
  if (!message) {
    return null;
  }

  return (
    <p role="alert" data-testid={testId} className={className} style={errorStyles}>
      <AlertCircleIcon style={errorIconStyles} />
      <span>{message}</span>
    </p>
  );
}

// ============================================
// Exports
// ============================================

export default {
  Form: FormProvider,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormError,
  useFormField,
};
