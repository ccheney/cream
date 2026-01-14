/**
 * Select Component Icons
 */

interface ChevronIconProps {
	isOpen: boolean;
}

export function ChevronIcon({ isOpen }: ChevronIconProps): React.ReactElement {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			style={{
				transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
				transition: "transform 0.2s",
			}}
			aria-hidden="true"
		>
			<path
				d="M4 6L8 10L12 6"
				stroke="#78716c"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function LoadingSpinner(): React.ReactElement {
	return (
		<svg
			width="20"
			height="20"
			viewBox="0 0 20 20"
			fill="none"
			style={{
				animation: "spin 1s linear infinite",
			}}
			aria-hidden="true"
		>
			<circle cx="10" cy="10" r="8" stroke="#e7e5e4" strokeWidth="2" />
			<path d="M10 2a8 8 0 018 8" stroke="#78716c" strokeWidth="2" strokeLinecap="round" />
			<style>
				{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
			</style>
		</svg>
	);
}

export function CheckIcon(): React.ReactElement {
	return (
		<svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
			<path
				d="M1 5L4 8L9 2"
				stroke="#ffffff"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
