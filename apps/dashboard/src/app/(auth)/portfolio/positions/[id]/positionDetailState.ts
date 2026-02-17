"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
	useClosePosition,
	useModifyStop,
	useModifyTarget,
	usePositionDetail,
} from "@/hooks/queries";
import type { PositionDetail } from "@/lib/api/types";

export interface UsePositionPageStateReturn {
	id: string;
	position?: PositionDetail;
	isLoading: boolean;
	error: Error | null;
	onBack: () => void;
	onClose: () => void;
	isClosing: boolean;
	isEditingStop: boolean;
	isEditingTarget: boolean;
	stopValue: string;
	targetValue: string;
	onStopValueChange: (value: string) => void;
	onTargetValueChange: (value: string) => void;
	onSaveStop: () => void;
	onSaveTarget: () => void;
	saveStop: () => void;
	saveTarget: () => void;
	handleClose: () => void;
	openStop: () => void;
	openTarget: () => void;
	onOpenStop: () => void;
	onOpenTarget: () => void;
	setStopValue: (value: string) => void;
	setTargetValue: (value: string) => void;
	setEditingStop: (value: boolean) => void;
	setEditingTarget: (value: boolean) => void;
	onCancelStop: () => void;
	onCancelTarget: () => void;
	navigateBackToPortfolio: () => void;
	navigateBack: () => void;
}

interface PositionQuery {
	id: string;
	position?: PositionDetail;
	isLoading: boolean;
	error: Error | null;
}

interface PositionRiskControls {
	isEditingStop: boolean;
	isEditingTarget: boolean;
	stopValue: string;
	targetValue: string;
	saveStop: () => void;
	saveTarget: () => void;
	openStop: () => void;
	openTarget: () => void;
	setStopValue: (value: string) => void;
	setTargetValue: (value: string) => void;
	setEditingStop: (value: boolean) => void;
	setEditingTarget: (value: boolean) => void;
}

function getPositionId(rawId: string | string[] | undefined): string {
	if (Array.isArray(rawId)) {
		return rawId[0] ?? "";
	}
	return rawId ?? "";
}

function parseNumber(value: string): number | null {
	const parsed = parseFloat(value);
	if (Number.isNaN(parsed) || parsed <= 0) {
		return null;
	}
	return parsed;
}

function usePositionId(): string {
	const params = useParams();
	return getPositionId(params.id);
}

function usePositionQuery(id: string): PositionQuery {
	const { data: position, isLoading, error } = usePositionDetail(id);
	return { id, position, isLoading, error };
}

function usePositionRiskControls({
	id,
	position,
	modifyStop,
	modifyTarget,
}: {
	id: string;
	position: PositionDetail | undefined;
	modifyStop: ReturnType<typeof useModifyStop>;
	modifyTarget: ReturnType<typeof useModifyTarget>;
}): PositionRiskControls {
	const [isEditingStop, setEditingStop] = useState(false);
	const [isEditingTarget, setEditingTarget] = useState(false);
	const [stopValue, setStopValue] = useState("");
	const [targetValue, setTargetValue] = useState("");

	const saveStop = () => {
		const value = parseNumber(stopValue);
		if (!value || !position) {
			setEditingStop(false);
			return;
		}

		modifyStop.mutate({ positionId: id, stop: value });
		setEditingStop(false);
	};

	const saveTarget = () => {
		const value = parseNumber(targetValue);
		if (!value || !position) {
			setEditingTarget(false);
			return;
		}

		modifyTarget.mutate({ positionId: id, target: value });
		setEditingTarget(false);
	};

	const openStop = () => {
		setStopValue(position?.stop?.toString() ?? "");
		setEditingStop(true);
	};

	const openTarget = () => {
		setTargetValue(position?.target?.toString() ?? "");
		setEditingTarget(true);
	};

	return {
		isEditingStop,
		isEditingTarget,
		stopValue,
		targetValue,
		saveStop,
		saveTarget,
		openStop,
		openTarget,
		setStopValue,
		setTargetValue,
		setEditingStop,
		setEditingTarget,
	};
}

function buildCloseHandler({
	id,
	position,
	closePosition,
	navigateToPortfolio,
}: {
	id: string;
	position: PositionDetail | undefined;
	closePosition: ReturnType<typeof useClosePosition>;
	navigateToPortfolio: () => void;
}): () => void {
	return () => {
		if (position && confirm(`Are you sure you want to close this ${position.symbol} position?`)) {
			closePosition.mutate(id, {
				onSuccess: navigateToPortfolio,
			});
		}
	};
}

function buildPositionPageState({
	id,
	position,
	isLoading,
	error,
	closePosition,
	riskControls,
	handleClose,
	navigateBackToPortfolio,
	navigateBack,
}: {
	id: string;
	position: PositionDetail | undefined;
	isLoading: boolean;
	error: Error | null;
	closePosition: ReturnType<typeof useClosePosition>;
	riskControls: PositionRiskControls;
	handleClose: () => void;
	navigateBackToPortfolio: () => void;
	navigateBack: () => void;
}) {
	return {
		id,
		position,
		isLoading,
		error,
		onBack: navigateBack,
		onClose: handleClose,
		isClosing: closePosition.isPending,
		isEditingStop: riskControls.isEditingStop,
		isEditingTarget: riskControls.isEditingTarget,
		stopValue: riskControls.stopValue,
		targetValue: riskControls.targetValue,
		onStopValueChange: riskControls.setStopValue,
		onTargetValueChange: riskControls.setTargetValue,
		onSaveStop: riskControls.saveStop,
		onSaveTarget: riskControls.saveTarget,
		saveStop: riskControls.saveStop,
		saveTarget: riskControls.saveTarget,
		handleClose,
		openStop: riskControls.openStop,
		openTarget: riskControls.openTarget,
		onOpenStop: riskControls.openStop,
		onOpenTarget: riskControls.openTarget,
		setStopValue: riskControls.setStopValue,
		setTargetValue: riskControls.setTargetValue,
		setEditingStop: riskControls.setEditingStop,
		setEditingTarget: riskControls.setEditingTarget,
		onCancelStop: () => riskControls.setEditingStop(false),
		onCancelTarget: () => riskControls.setEditingTarget(false),
		navigateBackToPortfolio,
		navigateBack,
	};
}

export function usePositionPageState(): UsePositionPageStateReturn {
	const id = usePositionId();
	const router = useRouter();
	const { position, isLoading, error } = usePositionQuery(id);
	const closePosition = useClosePosition();
	const modifyStop = useModifyStop();
	const modifyTarget = useModifyTarget();

	const riskControls = usePositionRiskControls({ id, position, modifyStop, modifyTarget });
	const navigateBackToPortfolio = () => router.push("/portfolio");
	const navigateBack = () => router.back();
	const handleClose = buildCloseHandler({
		id,
		position,
		closePosition,
		navigateToPortfolio: navigateBackToPortfolio,
	});

	return buildPositionPageState({
		id,
		position,
		isLoading,
		error,
		closePosition,
		riskControls,
		handleClose,
		navigateBackToPortfolio,
		navigateBack,
	});
}
