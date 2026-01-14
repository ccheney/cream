/**
 * Config Section Types
 *
 * Type definitions for the dynamic config section page.
 */

import type {
	AgentConfig,
	AgentStatus,
	AlertSettings,
	ConstraintsConfig,
	RuntimeUniverseConfig,
} from "@/lib/api/types";

export const VALID_SECTIONS = [
	"universe",
	"constraints",
	"agents",
	"risk",
	"notifications",
] as const;

export type Section = (typeof VALID_SECTIONS)[number];

export interface EditorHeaderProps {
	title: string;
	editing: boolean;
	isPending: boolean;
	onStartEdit: () => void;
	onCancel: () => void;
	onSave: () => void;
	editLabel?: string;
}

export interface UniverseSectionProps {
	universe: RuntimeUniverseConfig;
	editing: boolean;
	formData: Partial<RuntimeUniverseConfig>;
	onFormChange: (data: Partial<RuntimeUniverseConfig>) => void;
}

export interface ConstraintFieldProps {
	label: string;
	value: number;
	editing: boolean;
	suffix?: string;
	onChange: (value: number) => void;
}

export interface ConstraintsSectionProps {
	constraints: ConstraintsConfig;
	editing: boolean;
	formData: Partial<ConstraintsConfig>;
	onFormChange: (data: Partial<ConstraintsConfig>) => void;
}

export interface AgentCardProps {
	agent: AgentStatus;
	isSelected: boolean;
	onSelect: () => void;
}

export interface AgentConfigPanelProps {
	selectedAgent: string;
	displayName: string;
	config: AgentConfig | undefined;
	configLoading: boolean;
	editing: boolean;
	formData: Partial<AgentConfig>;
	isPending: boolean;
	onStartEdit: () => void;
	onCancel: () => void;
	onSave: () => void;
	onFormChange: (data: Partial<AgentConfig>) => void;
}

export interface NotificationRowProps {
	title: string;
	description: string;
	enabled: boolean;
	editing: boolean;
	onToggle: (enabled: boolean) => void;
	enabledLabel?: string;
	disabledLabel?: string;
}

export interface NotificationsSectionProps {
	settings: AlertSettings;
	editing: boolean;
	formData: Partial<AlertSettings>;
	onFormChange: (data: Partial<AlertSettings>) => void;
}
