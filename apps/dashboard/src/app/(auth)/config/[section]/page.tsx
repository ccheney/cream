"use client";

/**
 * Config Section Page
 *
 * Dynamic routing for configuration sections:
 * - universe: Trading universe settings
 * - constraints: Position and portfolio limits
 * - agents: Agent configuration
 * - risk: Risk management settings (alias for constraints)
 * - notifications: Alert preferences
 */

import { notFound, useParams, useRouter } from "next/navigation";
import {
	AgentsSection,
	ConstraintsSection,
	NotificationsSection,
	UniverseSection,
} from "./components/index";
import { type Section, VALID_SECTIONS } from "./types";

export default function ConfigSectionPage() {
	const params = useParams();
	const router = useRouter();
	const section = params.section as string;

	if (!VALID_SECTIONS.includes(section as Section)) {
		notFound();
	}

	return (
		<div className="space-y-6">
			<PageHeader section={section} onBack={() => router.back()} />
			<SectionContent section={section as Section} />
		</div>
	);
}

interface PageHeaderProps {
	section: string;
	onBack: () => void;
}

function PageHeader({ section, onBack }: PageHeaderProps) {
	return (
		<div className="flex items-center gap-4">
			<button
				type="button"
				onClick={onBack}
				className="p-2 text-stone-500 dark:text-night-300 hover:text-stone-700 dark:text-night-100 dark:text-night-400 dark:hover:text-night-100"
				aria-label="Go back"
			>
				<BackArrowIcon />
			</button>
			<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50 capitalize">
				{section} Configuration
			</h1>
		</div>
	);
}

function BackArrowIcon() {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			className="h-5 w-5"
			viewBox="0 0 20 20"
			fill="currentColor"
			aria-hidden="true"
		>
			<path
				fillRule="evenodd"
				d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

interface SectionContentProps {
	section: Section;
}

function SectionContent({ section }: SectionContentProps) {
	switch (section) {
		case "universe":
			return <UniverseSection />;
		case "constraints":
		case "risk":
			return <ConstraintsSection />;
		case "agents":
			return <AgentsSection />;
		case "notifications":
			return <NotificationsSection />;
		default:
			return <UniverseSection />;
	}
}
