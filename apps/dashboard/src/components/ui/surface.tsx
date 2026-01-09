/**
 * Surface Components
 *
 * Layered surface components with elevation, shadows, and translucency.
 * Implements the Cream visual hierarchy without heavy skeuomorphism.
 *
 * @see docs/plans/ui/20-design-philosophy.md lines 91-92
 */

import type { HTMLAttributes, ReactNode } from "react";

export type ElevationLevel = 0 | 1 | 2 | 3 | 4;
export type SurfaceVariant = "default" | "interactive" | "translucent" | "inset";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: ElevationLevel;
  variant?: SurfaceVariant;
  padding?: "none" | "sm" | "md" | "lg";
  children: ReactNode;
}

const elevationClasses: Record<ElevationLevel, string> = {
  0: "surface-0",
  1: "surface-1",
  2: "surface-2",
  3: "surface-3",
  4: "surface-4",
};

const paddingClasses = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export function Card({
  elevation = 1,
  variant = "default",
  padding = "md",
  className = "",
  children,
  ...props
}: CardProps) {
  const variantClass =
    variant === "interactive"
      ? "surface-interactive"
      : variant === "translucent"
        ? "surface-translucent"
        : variant === "inset"
          ? "surface-inset"
          : elevationClasses[elevation];

  return (
    <div
      className={`
        ${variantClass}
        ${paddingClasses[padding]}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article" | "aside";
  elevation?: ElevationLevel;
  fullHeight?: boolean;
  children: ReactNode;
}

export function Panel({
  as: Component = "div",
  elevation = 1,
  fullHeight = false,
  className = "",
  children,
  ...props
}: PanelProps) {
  return (
    <Component
      className={`
        ${elevationClasses[elevation]}
        ${fullHeight ? "h-full" : ""}
        overflow-hidden
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}

export interface PanelHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function PanelHeader({ className = "", children, ...props }: PanelHeaderProps) {
  return (
    <div
      className={`
        px-4 py-3
        border-b border-border-default
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

export interface PanelBodyProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md" | "lg";
  children: ReactNode;
}

export function PanelBody({ padding = "md", className = "", children, ...props }: PanelBodyProps) {
  return (
    <div
      className={`
        ${paddingClasses[padding]}
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

export interface PanelFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function PanelFooter({ className = "", children, ...props }: PanelFooterProps) {
  return (
    <div
      className={`
        px-4 py-3
        border-t border-border-default
        bg-bg-muted
        ${className}
      `.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

export interface BackdropProps extends HTMLAttributes<HTMLDivElement> {
  type?: "modal" | "drawer";
  visible?: boolean;
  onClose?: () => void;
}

export function Backdrop({
  type = "modal",
  visible = true,
  onClose,
  className = "",
  ...props
}: BackdropProps) {
  if (!visible) {
    return null;
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Backdrop needs click handler for dismiss
    <div
      className={`
        fixed inset-0
        ${type === "modal" ? "backdrop-modal z-modal" : "backdrop-drawer z-drawer"}
        transition-opacity duration-200
        ${visible ? "opacity-100" : "opacity-0"}
        ${className}
      `.trim()}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter") {
          onClose?.();
        }
      }}
      role="presentation"
      {...props}
    />
  );
}

export interface OverlayProps extends HTMLAttributes<HTMLDivElement> {
  type?: "modal" | "drawer" | "popover";
  position?: "left" | "right" | "top" | "bottom";
  open?: boolean;
  children: ReactNode;
}

export function Overlay({
  type = "modal",
  position = "right",
  open = true,
  className = "",
  children,
  ...props
}: OverlayProps) {
  if (!open) {
    return null;
  }

  const positionClasses =
    type === "drawer"
      ? {
          left: "left-0 top-0 h-full",
          right: "right-0 top-0 h-full",
          top: "top-0 left-0 w-full",
          bottom: "bottom-0 left-0 w-full",
        }[position]
      : "inset-0 flex items-center justify-center";

  const zClass = type === "modal" ? "z-modal" : type === "drawer" ? "z-drawer" : "z-popover";

  return (
    <div
      className={`
        fixed ${positionClasses} ${zClass}
        ${className}
      `.trim()}
      role={type === "modal" ? "dialog" : undefined}
      aria-modal={type === "modal" ? true : undefined}
      {...props}
    >
      {children}
    </div>
  );
}

export interface FloatingSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/** Use data-scrolled="true" attribute to trigger elevation. */
export function FloatingSurface({ className = "", children, ...props }: FloatingSurfaceProps) {
  return (
    <div className={`surface-floating ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  orientation?: "horizontal" | "vertical";
}

export function Divider({ orientation = "horizontal", className = "", ...props }: DividerProps) {
  return (
    <hr
      className={`
        border-0 bg-border-default
        ${orientation === "horizontal" ? "h-px w-full" : "w-px h-full"}
        ${className}
      `.trim()}
      {...props}
    />
  );
}

export default {
  Card,
  Panel,
  PanelHeader,
  PanelBody,
  PanelFooter,
  Backdrop,
  Overlay,
  FloatingSurface,
  Divider,
};
