/**
 * SuccessText Component
 *
 * Animated success text with checkmark icon.
 */

import type React from "react";
import { checkmarkKeyframes } from "./animations";
import { Checkmark } from "./Checkmark";
import type { SuccessTextProps } from "./types";

/**
 * Animated success text.
 */
export function SuccessText({
	children = "Saved!",
	testId = "success-text",
}: SuccessTextProps): React.ReactElement {
	const styles: React.CSSProperties = {
		display: "inline-flex",
		alignItems: "center",
		gap: "6px",
		color: "#22c55e",
		fontWeight: 500,
		animation: "fade-in-scale 200ms ease-out",
	};

	return (
		<>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Safe - hardcoded CSS keyframes */}
			<style dangerouslySetInnerHTML={{ __html: checkmarkKeyframes }} />
			{/* biome-ignore lint/a11y/useSemanticElements: role="status" is appropriate for feedback */}
			<span role="status" aria-live="polite" data-testid={testId} style={styles}>
				<Checkmark size={16} />
				<span>{children}</span>
			</span>
		</>
	);
}
