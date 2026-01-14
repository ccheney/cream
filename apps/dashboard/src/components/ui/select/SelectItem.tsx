/**
 * SelectItem Component
 *
 * Individual option component for the Select dropdown.
 */

import type React from "react";
import { CheckIcon } from "./icons";
import {
	checkboxStyles,
	optionDisabledStyles,
	optionHoverStyles,
	optionSelectedStyles,
	optionStyles,
} from "./styles";
import type { OptionItemProps } from "./types";

export function SelectItem({
	option,
	isSelected,
	isHighlighted,
	multiple,
	onClick,
	onMouseEnter,
}: OptionItemProps): React.ReactElement {
	const computedStyles: React.CSSProperties = {
		...optionStyles,
		...(option.disabled && optionDisabledStyles),
		...(isSelected && optionSelectedStyles),
		...(isHighlighted && optionHoverStyles),
	};

	function handleKeyDown(e: React.KeyboardEvent): void {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onClick();
		}
	}

	return (
		<div
			style={computedStyles}
			onClick={onClick}
			onKeyDown={handleKeyDown}
			onMouseEnter={onMouseEnter}
			role="option"
			tabIndex={option.disabled ? -1 : 0}
			aria-selected={isSelected}
			aria-disabled={option.disabled}
		>
			{multiple && (
				<span
					style={{
						...checkboxStyles,
						backgroundColor: isSelected ? "#1c1917" : "#ffffff",
					}}
				>
					{isSelected && <CheckIcon />}
				</span>
			)}
			{option.label}
		</div>
	);
}
