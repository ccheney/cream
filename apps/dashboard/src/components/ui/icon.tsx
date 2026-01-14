/**
 * Icon Component
 *
 * Flexible icon utility component using Lucide Icons.
 * Supports consistent sizing, colors, and accessibility.
 *
 * @see docs/plans/ui/27-iconography.md
 */

import type { LucideIcon, LucideProps } from "lucide-react";
import * as Icons from "lucide-react";
import { memo } from "react";

// ============================================
// Types
// ============================================

/**
 * Icon size variants.
 */
export type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

/**
 * Icon component props.
 */
export interface IconProps extends Omit<LucideProps, "size"> {
	/** Lucide icon name (e.g., "Activity", "TrendingUp") */
	name: string;
	/** Size variant (default: 'md') */
	size?: IconSize;
	/** Custom size in pixels (overrides size variant) */
	pixelSize?: number;
	/** CSS color value (default: currentColor) */
	color?: string;
	/** Additional CSS class names */
	className?: string;
	/** Accessibility label for screen readers */
	ariaLabel?: string;
	/** Mark as decorative (hides from screen readers) */
	decorative?: boolean;
	/** Test ID for testing */
	"data-testid"?: string;
}

/**
 * Direct icon component props (when using IconByComponent).
 */
export interface DirectIconProps extends Omit<IconProps, "name"> {
	/** The Lucide icon component directly */
	icon: LucideIcon;
}

// ============================================
// Constants
// ============================================

/**
 * Size mapping in pixels.
 */
const SIZE_MAP: Record<IconSize, number> = {
	xs: 14,
	sm: 16,
	md: 20,
	lg: 24,
	xl: 32,
};

// ============================================
// Component
// ============================================

/**
 * Icon component using Lucide Icons.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <Icon name="Activity" />
 *
 * // With size
 * <Icon name="TrendingUp" size="lg" />
 *
 * // With custom color
 * <Icon name="AlertCircle" color="var(--color-status-error)" />
 *
 * // Decorative icon (hidden from screen readers)
 * <Icon name="ChevronRight" decorative />
 *
 * // Functional icon with label
 * <Icon name="Settings" ariaLabel="Open settings" />
 * ```
 */
export const Icon = memo(function Icon({
	name,
	size = "md",
	pixelSize,
	color = "currentColor",
	className,
	ariaLabel,
	decorative = false,
	"data-testid": testId,
	...props
}: IconProps) {
	// Lookup the icon component from the icons map
	// Note: Dynamic access is necessary for runtime icon lookup by name
	// biome-ignore lint/performance/noDynamicNamespaceImportAccess: Required for dynamic icon lookup
	const IconComponent = Icons[name as keyof typeof Icons] as LucideIcon | undefined;

	// Handle invalid icon name
	if (!IconComponent) {
		return null;
	}

	// Calculate final size
	const finalSize = pixelSize ?? SIZE_MAP[size];

	// Determine accessibility attributes
	const accessibilityProps = decorative
		? { "aria-hidden": true as const }
		: { "aria-label": ariaLabel ?? name, role: "img" as const };

	return (
		<IconComponent
			size={finalSize}
			color={color}
			className={className}
			data-testid={testId ?? `icon-${name.toLowerCase()}`}
			{...accessibilityProps}
			{...props}
		/>
	);
});

/**
 * Icon component that accepts a direct Lucide icon.
 * Useful when you already have the icon imported.
 *
 * @example
 * ```tsx
 * import { Activity, TrendingUp } from "lucide-react";
 *
 * <IconByComponent icon={Activity} size="lg" />
 * <IconByComponent icon={TrendingUp} color="#22c55e" />
 * ```
 */
export const IconByComponent = memo(function IconByComponent({
	icon: IconComponent,
	size = "md",
	pixelSize,
	color = "currentColor",
	className,
	ariaLabel,
	decorative = false,
	"data-testid": testId,
	...props
}: DirectIconProps) {
	// Calculate final size
	const finalSize = pixelSize ?? SIZE_MAP[size];

	// Determine accessibility attributes
	const accessibilityProps = decorative
		? { "aria-hidden": true as const }
		: { "aria-label": ariaLabel ?? IconComponent.displayName ?? "icon", role: "img" as const };

	return (
		<IconComponent
			size={finalSize}
			color={color}
			className={className}
			data-testid={testId}
			{...accessibilityProps}
			{...props}
		/>
	);
});

// ============================================
// Re-exports for convenience
// ============================================

/**
 * Re-export commonly used trading/finance icons for convenience.
 */
export {
	Activity,
	AlertCircle,
	AlertTriangle,
	ArrowDown,
	ArrowDownRight,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	ArrowUpRight,
	BarChart2,
	BarChart3,
	Bell,
	BookOpen,
	Calendar,
	Check,
	CheckCircle,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	Circle,
	Clock,
	Copy,
	DollarSign,
	Download,
	Edit,
	ExternalLink,
	Eye,
	EyeOff,
	FileText,
	Filter,
	HelpCircle,
	Home,
	Info,
	Layers,
	LineChart,
	Loader2,
	Lock,
	LogOut,
	Menu,
	Minus,
	Moon,
	MoreHorizontal,
	MoreVertical,
	Pause,
	PieChart,
	Play,
	Plus,
	RefreshCw,
	Search,
	Settings,
	Sliders,
	Sun,
	Target,
	Trash2,
	TrendingDown,
	TrendingUp,
	Unlock,
	Upload,
	User,
	Users,
	Wallet,
	X,
	XCircle,
	Zap,
} from "lucide-react";

// ============================================
// Exports
// ============================================

export default Icon;
