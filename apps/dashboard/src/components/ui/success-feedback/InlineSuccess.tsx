/**
 * InlineSuccess Component
 *
 * Inline success indicator for forms with auto-fade.
 */

import type React from "react";
import { useEffect } from "react";
import { checkmarkKeyframes, SUCCESS_STATE_DURATION } from "./animations";
import { Checkmark } from "./Checkmark";
import type { InlineSuccessProps } from "./types";

/**
 * Inline success indicator for forms.
 *
 * Shows checkmark with optional text that fades out.
 */
export function InlineSuccess({
	text = "Saved",
	duration = SUCCESS_STATE_DURATION,
	onComplete,
	testId = "inline-success",
}: InlineSuccessProps): React.ReactElement {
	useEffect(() => {
		const timeout = setTimeout(() => {
			onComplete?.();
		}, duration);
		return () => clearTimeout(timeout);
	}, [duration, onComplete]);

	const styles: React.CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		gap: "6px",
		padding: "4px 8px",
		backgroundColor: "rgba(34, 197, 94, 0.1)",
		borderRadius: "4px",
		color: "#22c55e",
		fontSize: "13px",
		fontWeight: 500,
		animation: "fade-in-scale 200ms ease-out",
	};

	return (
		<>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
			<style dangerouslySetInnerHTML={{ __html: checkmarkKeyframes }} />
			{/* biome-ignore lint/a11y/useSemanticElements: role="status" is appropriate for feedback */}
			<span role="status" aria-live="polite" data-testid={testId} style={styles}>
				<Checkmark size={14} />
				<span>{text}</span>
			</span>
		</>
	);
}
