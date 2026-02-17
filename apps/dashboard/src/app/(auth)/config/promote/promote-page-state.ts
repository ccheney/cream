"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
	useActiveConfig,
	useDraftConfig,
	usePromoteDraft,
	useTriggerCycle,
	useValidateDraft,
} from "@/hooks/queries";
import { useCycleProgress } from "@/hooks/useCycleProgress";
import type { CycleResult, Environment, FullRuntimeConfig } from "@/lib/api/types";

export interface ValidationResult {
	valid: boolean;
	errors: { field: string; message: string }[];
	warnings: string[];
}

export interface PromoteFlowHookReturn {
	activeConfig?: FullRuntimeConfig;
	draftConfig?: FullRuntimeConfig;
	isLoading: boolean;
	showLiveConfirm: boolean;
	validationResult: ValidationResult | null;
	cycleStatus: ReturnType<typeof useCycleProgress>["status"];
	cycleProgress: ReturnType<typeof useCycleProgress>["progress"];
	currentStep: ReturnType<typeof useCycleProgress>["currentStep"];
	testResult: CycleResult | null;
	isTestInProgress: boolean;
	canPromoteToPaper: boolean;
	canPromoteToLive: boolean;
	validateDraftPending: boolean;
	promoteDraftPending: boolean;
	handleValidate: () => Promise<ValidationResult | null>;
	handleTestInPaper: () => Promise<void>;
	handlePromote: (environment: Environment) => void;
	handleLivePromotion: () => Promise<void>;
	setShowLiveConfirm: (value: boolean) => void;
}

function isLivePromotionReady(
	validationResult: ValidationResult | null,
	testResult: CycleResult | null,
): boolean {
	return (
		validationResult?.valid === true && testResult?.status === "completed" && !testResult.error
	);
}

function usePromoteConfigs() {
	const { data: activeConfig, isLoading: activeLoading } = useActiveConfig();
	const { data: draftConfig, isLoading: draftLoading } = useDraftConfig();
	const triggerCycle = useTriggerCycle();
	const {
		status: cycleStatus,
		progress: cycleProgress,
		result: cycleResult,
		currentStep,
	} = useCycleProgress(triggerCycle.data?.cycleId ?? null);

	return {
		activeConfig,
		draftConfig,
		activeLoading,
		draftLoading,
		triggerCycle,
		cycleStatus,
		cycleProgress,
		cycleResult,
		currentStep,
	};
}

function usePromoteActions({
	triggerCycle,
	cycleStatus,
	cycleResult,
	validateDraft,
	promoteDraft,
}: {
	triggerCycle: ReturnType<typeof useTriggerCycle>;
	cycleStatus: ReturnType<typeof useCycleProgress>["status"];
	cycleResult: CycleResult | null;
	validateDraft: ReturnType<typeof useValidateDraft>;
	promoteDraft: ReturnType<typeof usePromoteDraft>;
}) {
	const [testResult, setTestResult] = useState<CycleResult | null>(null);
	const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

	const handleValidate = useCallback(async () => {
		const result = await validateDraft.mutateAsync();
		if (result) {
			setValidationResult(result);
		}
		return result;
	}, [validateDraft]);

	const handleTestInPaper = useCallback(async () => {
		const validation = await handleValidate();
		if (!validation?.valid) {
			return;
		}
		await triggerCycle.mutateAsync({
			environment: "PAPER",
			useDraftConfig: true,
		});
	}, [handleValidate, triggerCycle]);

	const handlePromote = useCallback(
		(environment: Environment) => {
			if (environment === "LIVE") {
				return;
			}
			void promoteDraft.mutateAsync();
		},
		[promoteDraft],
	);

	const handleLivePromotion = useCallback(async () => {
		await promoteDraft.mutateAsync();
	}, [promoteDraft]);

	useEffect(() => {
		if (cycleStatus === "completed" && cycleResult && !testResult) {
			setTestResult(cycleResult);
		}
	}, [cycleStatus, cycleResult, testResult]);

	return {
		testResult,
		validationResult,
		handleValidate,
		handleTestInPaper,
		handlePromote,
		handleLivePromotion,
	};
}

function usePromoteReadiness({
	validationResult,
	testResult,
	isLoadingState,
	isCycleRunning,
}: {
	validationResult: ValidationResult | null;
	testResult: CycleResult | null;
	isLoadingState: boolean;
	isCycleRunning: boolean;
}) {
	const canPromoteToPaper = validationResult?.valid === true;
	const canPromoteToLive = isLivePromotionReady(validationResult, testResult);

	return {
		canPromoteToPaper,
		canPromoteToLive,
		isLoading: isLoadingState,
		isTestInProgress: isCycleRunning,
	};
}

type PromoteActionState = {
	validationResult: ValidationResult | null;
	testResult: CycleResult | null;
	handleValidate: () => Promise<ValidationResult | null>;
	handleTestInPaper: () => Promise<void>;
	handlePromote: (environment: Environment) => void;
	handleLivePromotion: () => Promise<void>;
};

type PromoteFlowLifecycleArgs = {
	activeLoading: boolean;
	draftLoading: boolean;
	cycleStatus: ReturnType<typeof useCycleProgress>["status"];
	cycleResult: CycleResult | null;
	triggerCycle: ReturnType<typeof useTriggerCycle>;
	validateDraft: ReturnType<typeof useValidateDraft>;
	promoteDraft: ReturnType<typeof usePromoteDraft>;
	setShowLiveConfirm: (value: boolean) => void;
	router: ReturnType<typeof useRouter>;
};

type PromoteFlowLifecycleState = PromoteActionState & {
	canPromoteToPaper: boolean;
	canPromoteToLive: boolean;
	isLoading: boolean;
	isTestInProgress: boolean;
	validateDraftPending: boolean;
	promoteDraftPending: boolean;
	handlePromote: (environment: Environment) => void;
	handleLivePromotion: () => Promise<void>;
};

function usePromoteFlowRedirectHandlers({
	handlePromote,
	handleLivePromotion,
	setShowLiveConfirm,
	router,
}: {
	handlePromote: () => Promise<void>;
	handleLivePromotion: () => Promise<void>;
	setShowLiveConfirm: (value: boolean) => void;
	router: ReturnType<typeof useRouter>;
}) {
	const redirectToConfig = useCallback(() => {
		router.push("/config");
	}, [router]);

	const handlePromoteWithRedirect = useCallback(
		(environment: Environment) => {
			if (environment === "LIVE") {
				setShowLiveConfirm(true);
				return;
			}
			void handlePromote().then(redirectToConfig);
		},
		[handlePromote, redirectToConfig, setShowLiveConfirm],
	);

	const handleLivePromotionWithRedirect = useCallback(async () => {
		await handleLivePromotion();
		setShowLiveConfirm(false);
		redirectToConfig();
	}, [handleLivePromotion, setShowLiveConfirm, redirectToConfig]);

	return {
		handlePromote: handlePromoteWithRedirect,
		handleLivePromotion: handleLivePromotionWithRedirect,
	};
}

function buildPromoteFlowLifecycleState({
	actions,
	readiness,
	validateDraftPending,
	promoteDraftPending,
	handlePromote,
	handleLivePromotion,
}: {
	actions: PromoteActionState;
	readiness: {
		canPromoteToPaper: boolean;
		canPromoteToLive: boolean;
		isLoading: boolean;
		isTestInProgress: boolean;
	};
	validateDraftPending: boolean;
	promoteDraftPending: boolean;
	handlePromote: (environment: Environment) => void;
	handleLivePromotion: () => Promise<void>;
}): PromoteFlowLifecycleState {
	return {
		...actions,
		...readiness,
		validateDraftPending,
		promoteDraftPending,
		handlePromote,
		handleLivePromotion,
	};
}

function usePromoteFlowLifecycle(args: PromoteFlowLifecycleArgs) {
	const {
		activeLoading,
		draftLoading,
		cycleStatus,
		cycleResult,
		triggerCycle,
		validateDraft,
		promoteDraft,
		setShowLiveConfirm,
		router,
	} = args;

	const actionState = usePromoteActions({
		triggerCycle,
		cycleStatus,
		cycleResult,
		validateDraft,
		promoteDraft,
	});
	const readiness = usePromoteReadiness({
		validationResult: actionState.validationResult,
		testResult: actionState.testResult,
		isLoadingState: activeLoading || draftLoading,
		isCycleRunning: triggerCycle.isPending || cycleStatus === "running",
	});
	const redirectState = usePromoteFlowRedirectHandlers({
		handlePromote: async () => actionState.handlePromote("PAPER"),
		handleLivePromotion: actionState.handleLivePromotion,
		setShowLiveConfirm,
		router,
	});

	return buildPromoteFlowLifecycleState({
		actions: {
			...actionState,
			handlePromote: redirectState.handlePromote,
			handleLivePromotion: redirectState.handleLivePromotion,
		},
		readiness,
		validateDraftPending: validateDraft.isPending,
		promoteDraftPending: promoteDraft.isPending,
		handlePromote: redirectState.handlePromote,
		handleLivePromotion: redirectState.handleLivePromotion,
	});
}

function buildPromoteFlowState({
	activeConfig,
	draftConfig,
	isLoading,
	showLiveConfirm,
	validationResult,
	cycleStatus,
	cycleProgress,
	currentStep,
	testResult,
	isTestInProgress,
	canPromoteToPaper,
	canPromoteToLive,
	validateDraftPending,
	promoteDraftPending,
	handleValidate,
	handleTestInPaper,
	handlePromote,
	handleLivePromotion,
	setShowLiveConfirm,
}: {
	activeConfig?: FullRuntimeConfig;
	draftConfig?: FullRuntimeConfig;
	isLoading: boolean;
	showLiveConfirm: boolean;
	validationResult: ValidationResult | null;
	cycleStatus: ReturnType<typeof useCycleProgress>["status"];
	cycleProgress: ReturnType<typeof useCycleProgress>["progress"];
	currentStep: ReturnType<typeof useCycleProgress>["currentStep"];
	testResult: CycleResult | null;
	isTestInProgress: boolean;
	canPromoteToPaper: boolean;
	canPromoteToLive: boolean;
	validateDraftPending: boolean;
	promoteDraftPending: boolean;
	handleValidate: () => Promise<ValidationResult | null>;
	handleTestInPaper: () => Promise<void>;
	handlePromote: (environment: Environment) => void;
	handleLivePromotion: () => Promise<void>;
	setShowLiveConfirm: (value: boolean) => void;
}): PromoteFlowHookReturn {
	return {
		activeConfig,
		draftConfig,
		isLoading,
		showLiveConfirm,
		validationResult,
		cycleStatus,
		cycleProgress,
		currentStep,
		testResult,
		isTestInProgress,
		canPromoteToPaper,
		canPromoteToLive,
		validateDraftPending,
		promoteDraftPending,
		handleValidate,
		handleTestInPaper,
		handlePromote,
		handleLivePromotion,
		setShowLiveConfirm,
	};
}

export function usePromoteFlowState(): PromoteFlowHookReturn {
	const {
		activeConfig,
		draftConfig,
		activeLoading,
		draftLoading,
		triggerCycle,
		cycleStatus,
		cycleProgress,
		cycleResult,
		currentStep,
	} = usePromoteConfigs();
	const [showLiveConfirm, setShowLiveConfirm] = useState(false);
	const validateDraft = useValidateDraft();
	const promoteDraft = usePromoteDraft();
	const router = useRouter();

	const lifecycle = usePromoteFlowLifecycle({
		activeLoading,
		draftLoading,
		cycleStatus,
		cycleResult,
		triggerCycle,
		validateDraft,
		promoteDraft,
		setShowLiveConfirm,
		router,
	});

	return buildPromoteFlowState({
		activeConfig,
		draftConfig,
		isLoading: lifecycle.isLoading,
		showLiveConfirm,
		validationResult: lifecycle.validationResult,
		cycleStatus,
		cycleProgress,
		currentStep,
		testResult: lifecycle.testResult,
		isTestInProgress: lifecycle.isTestInProgress,
		canPromoteToPaper: lifecycle.canPromoteToPaper,
		canPromoteToLive: lifecycle.canPromoteToLive,
		validateDraftPending: lifecycle.validateDraftPending,
		promoteDraftPending: lifecycle.promoteDraftPending,
		handleValidate: lifecycle.handleValidate,
		handleTestInPaper: lifecycle.handleTestInPaper,
		handlePromote: lifecycle.handlePromote,
		handleLivePromotion: lifecycle.handleLivePromotion,
		setShowLiveConfirm,
	});
}
