/**
 * Thesis Detail Page Hooks
 *
 * Custom React hooks for thesis detail page state management.
 */

import { useParams } from "next/navigation";
import { useState } from "react";
import {
	useInvalidateThesis,
	useRealizeThesis,
	useThesis,
	useThesisHistory,
} from "@/hooks/queries";
import type { Thesis, ThesisHistoryEvent } from "./types";

export interface ThesisPageState {
	showInvalidateModal: boolean;
	showRealizeModal: boolean;
	invalidationReason: string;
	exitPrice: string;
	exitNotes: string;
}

export interface ThesisPageActions {
	setShowInvalidateModal: (show: boolean) => void;
	setShowRealizeModal: (show: boolean) => void;
	setInvalidationReason: (reason: string) => void;
	setExitPrice: (price: string) => void;
	setExitNotes: (notes: string) => void;
	handleInvalidate: () => Promise<void>;
	handleRealize: () => Promise<void>;
}

export interface ThesisPageData {
	id: string;
	thesis: Thesis | undefined;
	thesisLoading: boolean;
	history: ThesisHistoryEvent[] | undefined;
	invalidateThesis: ReturnType<typeof useInvalidateThesis>;
	realizeThesis: ReturnType<typeof useRealizeThesis>;
}

export function useThesisPageData(): ThesisPageData {
	const params = useParams();
	const id = params.id as string;

	const { data: thesis, isLoading: thesisLoading } = useThesis(id);
	const { data: history } = useThesisHistory(id);
	const invalidateThesis = useInvalidateThesis();
	const realizeThesis = useRealizeThesis();

	return {
		id,
		thesis: thesis as Thesis | undefined,
		thesisLoading,
		history: history as ThesisHistoryEvent[] | undefined,
		invalidateThesis,
		realizeThesis,
	};
}

export function useThesisPageState(
	id: string,
	invalidateThesis: ReturnType<typeof useInvalidateThesis>,
	realizeThesis: ReturnType<typeof useRealizeThesis>,
): ThesisPageState & ThesisPageActions {
	const [showInvalidateModal, setShowInvalidateModal] = useState(false);
	const [showRealizeModal, setShowRealizeModal] = useState(false);
	const [invalidationReason, setInvalidationReason] = useState("");
	const [exitPrice, setExitPrice] = useState("");
	const [exitNotes, setExitNotes] = useState("");

	async function handleInvalidate(): Promise<void> {
		if (invalidationReason.trim()) {
			await invalidateThesis.mutateAsync({ id, reason: invalidationReason });
			setShowInvalidateModal(false);
			setInvalidationReason("");
		}
	}

	async function handleRealize(): Promise<void> {
		const price = Number.parseFloat(exitPrice);
		if (!Number.isNaN(price)) {
			await realizeThesis.mutateAsync({
				id,
				exitPrice: price,
				notes: exitNotes || undefined,
			});
			setShowRealizeModal(false);
			setExitPrice("");
			setExitNotes("");
		}
	}

	return {
		showInvalidateModal,
		showRealizeModal,
		invalidationReason,
		exitPrice,
		exitNotes,
		setShowInvalidateModal,
		setShowRealizeModal,
		setInvalidationReason,
		setExitPrice,
		setExitNotes,
		handleInvalidate,
		handleRealize,
	};
}

export function formatPct(value: number | null): string {
	if (value === null) {
		return "--";
	}
	return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatPrice(value: number | null): string {
	if (value === null) {
		return "--";
	}
	return `$${value.toFixed(2)}`;
}
