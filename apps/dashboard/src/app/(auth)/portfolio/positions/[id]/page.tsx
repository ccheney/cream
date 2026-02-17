"use client";

/**
 * Position Detail Page
 */

import {
	DecisionLink,
	DecisionsPanel,
	PositionDetailContent,
	PositionLoadingState,
	PositionNotFoundState,
} from "./positionDetailComponents";
import { usePositionPageState } from "./positionDetailState";

export default function PositionDetailPage() {
	const {
		id,
		position,
		isLoading,
		error,
		isClosing,
		isEditingStop,
		isEditingTarget,
		stopValue,
		targetValue,
		saveStop,
		saveTarget,
		handleClose,
		openStop,
		openTarget,
		setStopValue,
		setTargetValue,
		setEditingStop,
		setEditingTarget,
		navigateBackToPortfolio,
		navigateBack,
	} = usePositionPageState();

	if (isLoading) {
		return <PositionLoadingState />;
	}

	if (error || !position || id === "") {
		return <PositionNotFoundState onBack={navigateBackToPortfolio} />;
	}

	return (
		<PositionDetailContent
			position={position}
			onBack={navigateBack}
			onClose={handleClose}
			isClosing={isClosing}
			isEditingStop={isEditingStop}
			isEditingTarget={isEditingTarget}
			stopValue={stopValue}
			targetValue={targetValue}
			onStopValueChange={setStopValue}
			onTargetValueChange={setTargetValue}
			onSaveStop={saveStop}
			onSaveTarget={saveTarget}
			onOpenStop={openStop}
			onOpenTarget={openTarget}
			onCancelStop={() => setEditingStop(false)}
			onCancelTarget={() => setEditingTarget(false)}
		/>
	);
}

export { DecisionLink, DecisionsPanel };
