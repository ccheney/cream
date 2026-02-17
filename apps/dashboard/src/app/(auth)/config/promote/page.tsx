"use client";

import { useCallback } from "react";
import { PromotePageContent } from "./promote-page-content";
import { usePromoteFlowState } from "./promote-page-state";

export default function ConfigPromotePage() {
	const state = usePromoteFlowState();

	const closeLiveConfirm = useCallback(() => {
		state.setShowLiveConfirm(false);
	}, [state]);

	return (
		<PromotePageContent
			state={state}
			onCancelLiveConfirm={closeLiveConfirm}
			onConfirmLiveConfirm={state.handleLivePromotion}
		/>
	);
}
