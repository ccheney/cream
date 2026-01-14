/**
 * Config Section Hooks
 *
 * Custom hooks for config section editing state management.
 */

import { useCallback, useState } from "react";
import type {
	AgentConfig,
	AlertSettings,
	ConstraintsConfig,
	RuntimeUniverseConfig,
} from "@/lib/api/types";

interface UseEditorStateOptions<T> {
	initialData: T | undefined;
	onSave: (data: T) => void;
}

interface EditorState<T> {
	editing: boolean;
	formData: Partial<T>;
	startEdit: () => void;
	cancelEdit: () => void;
	saveEdit: () => void;
	updateFormData: (data: Partial<T>) => void;
}

export function useEditorState<T>({
	initialData,
	onSave,
}: UseEditorStateOptions<T>): EditorState<T> {
	const [editing, setEditing] = useState(false);
	const [formData, setFormData] = useState<Partial<T>>({});

	const startEdit = useCallback(() => {
		if (initialData) {
			setFormData(initialData);
			setEditing(true);
		}
	}, [initialData]);

	const cancelEdit = useCallback(() => {
		setEditing(false);
		setFormData({});
	}, []);

	const saveEdit = useCallback(() => {
		if (formData && Object.keys(formData).length > 0) {
			onSave(formData as T);
		}
	}, [formData, onSave]);

	const updateFormData = useCallback((data: Partial<T>) => {
		setFormData((prev) => ({ ...prev, ...data }));
	}, []);

	return {
		editing,
		formData,
		startEdit,
		cancelEdit,
		saveEdit,
		updateFormData,
	};
}

export function useUniverseEditor(
	universe: RuntimeUniverseConfig | undefined,
	updateMutation: {
		mutate: (data: RuntimeUniverseConfig, options?: { onSuccess?: () => void }) => void;
		isPending: boolean;
	}
): EditorState<RuntimeUniverseConfig> & { isPending: boolean } {
	const [editing, setEditing] = useState(false);
	const [formData, setFormData] = useState<Partial<RuntimeUniverseConfig>>({});

	const startEdit = useCallback(() => {
		if (universe) {
			setFormData(universe);
			setEditing(true);
		}
	}, [universe]);

	const cancelEdit = useCallback(() => {
		setEditing(false);
		setFormData({});
	}, []);

	const saveEdit = useCallback(() => {
		if (formData && Object.keys(formData).length > 0) {
			updateMutation.mutate(formData as RuntimeUniverseConfig, {
				onSuccess: () => setEditing(false),
			});
		}
	}, [formData, updateMutation]);

	const updateFormData = useCallback((data: Partial<RuntimeUniverseConfig>) => {
		setFormData((prev) => ({ ...prev, ...data }));
	}, []);

	return {
		editing,
		formData,
		startEdit,
		cancelEdit,
		saveEdit,
		updateFormData,
		isPending: updateMutation.isPending,
	};
}

export function useConstraintsEditor(
	constraints: ConstraintsConfig | undefined,
	updateMutation: {
		mutate: (data: ConstraintsConfig, options?: { onSuccess?: () => void }) => void;
		isPending: boolean;
	}
): EditorState<ConstraintsConfig> & { isPending: boolean } {
	const [editing, setEditing] = useState(false);
	const [formData, setFormData] = useState<Partial<ConstraintsConfig>>({});

	const startEdit = useCallback(() => {
		if (constraints) {
			setFormData(constraints);
			setEditing(true);
		}
	}, [constraints]);

	const cancelEdit = useCallback(() => {
		setEditing(false);
		setFormData({});
	}, []);

	const saveEdit = useCallback(() => {
		if (formData && Object.keys(formData).length > 0) {
			updateMutation.mutate(formData as ConstraintsConfig, {
				onSuccess: () => setEditing(false),
			});
		}
	}, [formData, updateMutation]);

	const updateFormData = useCallback((data: Partial<ConstraintsConfig>) => {
		setFormData((prev) => ({ ...prev, ...data }));
	}, []);

	return {
		editing,
		formData,
		startEdit,
		cancelEdit,
		saveEdit,
		updateFormData,
		isPending: updateMutation.isPending,
	};
}

export function useAgentEditor(
	selectedAgent: string | null,
	config: AgentConfig | undefined,
	updateMutation: {
		mutate: (
			data: { agentType: string; config: Partial<AgentConfig> },
			options?: { onSuccess?: () => void }
		) => void;
		isPending: boolean;
	}
): EditorState<AgentConfig> & { isPending: boolean } {
	const [editing, setEditing] = useState(false);
	const [formData, setFormData] = useState<Partial<AgentConfig>>({});

	const startEdit = useCallback(() => {
		if (config) {
			setFormData(config);
			setEditing(true);
		}
	}, [config]);

	const cancelEdit = useCallback(() => {
		setEditing(false);
		setFormData({});
	}, []);

	const saveEdit = useCallback(() => {
		if (selectedAgent && formData && Object.keys(formData).length > 0) {
			updateMutation.mutate(
				{ agentType: selectedAgent, config: formData },
				{ onSuccess: () => setEditing(false) }
			);
		}
	}, [selectedAgent, formData, updateMutation]);

	const updateFormData = useCallback((data: Partial<AgentConfig>) => {
		setFormData((prev) => ({ ...prev, ...data }));
	}, []);

	return {
		editing,
		formData,
		startEdit,
		cancelEdit,
		saveEdit,
		updateFormData,
		isPending: updateMutation.isPending,
	};
}

export function useNotificationsEditor(
	settings: AlertSettings | undefined,
	updateMutation: {
		mutate: (data: AlertSettings, options?: { onSuccess?: () => void }) => void;
		isPending: boolean;
	}
): EditorState<AlertSettings> & { isPending: boolean } {
	const [editing, setEditing] = useState(false);
	const [formData, setFormData] = useState<Partial<AlertSettings>>({});

	const startEdit = useCallback(() => {
		if (settings) {
			setFormData(settings);
			setEditing(true);
		}
	}, [settings]);

	const cancelEdit = useCallback(() => {
		setEditing(false);
		setFormData({});
	}, []);

	const saveEdit = useCallback(() => {
		if (formData && Object.keys(formData).length > 0) {
			updateMutation.mutate(formData as AlertSettings, {
				onSuccess: () => setEditing(false),
			});
		}
	}, [formData, updateMutation]);

	const updateFormData = useCallback((data: Partial<AlertSettings>) => {
		setFormData((prev) => ({ ...prev, ...data }));
	}, []);

	return {
		editing,
		formData,
		startEdit,
		cancelEdit,
		saveEdit,
		updateFormData,
		isPending: updateMutation.isPending,
	};
}
