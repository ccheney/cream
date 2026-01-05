/**
 * Surface Components
 *
 * Layered surface components with elevation, shadows, and translucency.
 * Implements the Cream visual hierarchy without heavy skeuomorphism.
 *
 * @see docs/plans/ui/20-design-philosophy.md lines 91-92
 */

import type { ReactNode, HTMLAttributes } from "react";

// ============================================
// Types
// ============================================

export type ElevationLevel = 0 | 1 | 2 | 3 | 4;
export type SurfaceVariant = "default" | "interactive" | "translucent" | "inset";

// ============================================
// Card Component
// ============================================

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Elevation level (0-4) */
  elevation?: ElevationLevel;
  /** Card variant */
  variant?: SurfaceVariant;
  /** Padding size */
  padding?: "none" | "sm" | "md" | "lg";
  /** Children */
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

/**
 * Card component with configurable elevation and padding.
 *
 * @example
 * ```tsx
 * <Card elevation={1} padding="md">
 *   <h2>Portfolio Summary</h2>
 *   <p>Content here</p>
 * </Card>
 * ```
 */
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

// ============================================
// Panel Component
// ============================================

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  /** Use as semantic section */
  as?: "div" | "section" | "article" | "aside";
  /** Elevation level */
  elevation?: ElevationLevel;
  /** Full height */
  fullHeight?: boolean;
  /** Children */
  children: ReactNode;
}

/**
 * Panel component for larger content sections.
 *
 * @example
 * ```tsx
 * <Panel as="section" elevation={1} fullHeight>
 *   <PanelHeader>Positions</PanelHeader>
 *   <PanelBody>...</PanelBody>
 * </Panel>
 * ```
 */
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

// ============================================
// Panel Sub-components
// ============================================

export interface PanelHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Children */
  children: ReactNode;
}

export function PanelHeader({
  className = "",
  children,
  ...props
}: PanelHeaderProps) {
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
  /** Padding size */
  padding?: "none" | "sm" | "md" | "lg";
  /** Children */
  children: ReactNode;
}

export function PanelBody({
  padding = "md",
  className = "",
  children,
  ...props
}: PanelBodyProps) {
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
  /** Children */
  children: ReactNode;
}

export function PanelFooter({
  className = "",
  children,
  ...props
}: PanelFooterProps) {
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

// ============================================
// Backdrop Component
// ============================================

export interface BackdropProps extends HTMLAttributes<HTMLDivElement> {
  /** Backdrop type */
  type?: "modal" | "drawer";
  /** Whether visible */
  visible?: boolean;
  /** Click handler */
  onClose?: () => void;
}

/**
 * Backdrop overlay for modals and drawers.
 *
 * @example
 * ```tsx
 * <Backdrop type="modal" visible={isOpen} onClose={() => setIsOpen(false)} />
 * ```
 */
export function Backdrop({
  type = "modal",
  visible = true,
  onClose,
  className = "",
  ...props
}: BackdropProps) {
  if (!visible) return null;

  return (
    <div
      className={`
        fixed inset-0
        ${type === "modal" ? "backdrop-modal z-modal" : "backdrop-drawer z-drawer"}
        transition-opacity duration-200
        ${visible ? "opacity-100" : "opacity-0"}
        ${className}
      `.trim()}
      onClick={onClose}
      aria-hidden="true"
      {...props}
    />
  );
}

// ============================================
// Overlay Component
// ============================================

export interface OverlayProps extends HTMLAttributes<HTMLDivElement> {
  /** Overlay type */
  type?: "modal" | "drawer" | "popover";
  /** Position (for drawer) */
  position?: "left" | "right" | "top" | "bottom";
  /** Whether open */
  open?: boolean;
  /** Children */
  children: ReactNode;
}

/**
 * Overlay container for modals, drawers, and popovers.
 *
 * @example
 * ```tsx
 * <Overlay type="modal" open={isOpen}>
 *   <Card elevation={3}>Modal content</Card>
 * </Overlay>
 * ```
 */
export function Overlay({
  type = "modal",
  position = "right",
  open = true,
  className = "",
  children,
  ...props
}: OverlayProps) {
  if (!open) return null;

  const positionClasses =
    type === "drawer"
      ? {
          left: "left-0 top-0 h-full",
          right: "right-0 top-0 h-full",
          top: "top-0 left-0 w-full",
          bottom: "bottom-0 left-0 w-full",
        }[position]
      : "inset-0 flex items-center justify-center";

  const zClass =
    type === "modal"
      ? "z-modal"
      : type === "drawer"
        ? "z-drawer"
        : "z-popover";

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

// ============================================
// Floating Surface Component
// ============================================

export interface FloatingSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** Children */
  children: ReactNode;
}

/**
 * Floating surface that elevates on scroll.
 * Use data-scrolled="true" attribute to trigger elevation.
 *
 * @example
 * ```tsx
 * <FloatingSurface data-scrolled={isScrolled}>
 *   <nav>...</nav>
 * </FloatingSurface>
 * ```
 */
export function FloatingSurface({
  className = "",
  children,
  ...props
}: FloatingSurfaceProps) {
  return (
    <div
      className={`surface-floating ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================
// Divider Component
// ============================================

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  /** Orientation */
  orientation?: "horizontal" | "vertical";
}

/**
 * Visual divider between content sections.
 *
 * @example
 * ```tsx
 * <Divider />
 * <Divider orientation="vertical" />
 * ```
 */
export function Divider({
  orientation = "horizontal",
  className = "",
  ...props
}: DividerProps) {
  return (
    <hr
      className={`
        border-0 bg-border-default
        ${orientation === "horizontal"
          ? "h-px w-full"
          : "w-px h-full"}
        ${className}
      `.trim()}
      {...props}
    />
  );
}

// ============================================
// Exports
// ============================================

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
