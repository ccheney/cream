"use client";

/**
 * Config Page - System configuration management
 */

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import {
	useActiveConfig,
	useConstraintsConfig,
	useRuntimeConfigHistory,
	useUniverseConfig,
} from "@/hooks/queries";

const ENV_COLORS = {
	PAPER: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
	LIVE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
} as const;

type ActiveConfigData = ReturnType<typeof useActiveConfig>["data"];
type UniverseConfigData = ReturnType<typeof useUniverseConfig>["data"];
type ConstraintsConfigData = ReturnType<typeof useConstraintsConfig>["data"];
type HistoryData = ReturnType<typeof useRuntimeConfigHistory>["data"];

function ConfigPageHeader({ config }: { config: ActiveConfigData }) {
	return (
		<div className="flex items-center justify-between">
			<h1 className="text-2xl font-semibold text-stone-900 dark:text-night-50">Configuration</h1>
			<div className="flex items-center gap-2">
				{config && (
					<>
						<span
							className={`px-3 py-1 text-sm font-medium rounded-full ${
								ENV_COLORS[config.trading.environment as keyof typeof ENV_COLORS] ??
								ENV_COLORS.PAPER
							}`}
						>
							{config.trading.environment}
						</span>
						<span className="text-sm text-stone-500 dark:text-night-300">
							v{config.trading.version}
						</span>
					</>
				)}
			</div>
		</div>
	);
}

function CoreConfigLoadingGrid() {
	return (
		<div className="grid grid-cols-3 gap-6">
			{[1, 2, 3].map((i) => (
				<div key={i} className="h-48 bg-cream-100 dark:bg-night-700 rounded-lg animate-pulse" />
			))}
		</div>
	);
}

function TradingConfigSummary({ config }: { config: ActiveConfigData }) {
	if (!config) {
		return null;
	}

	return (
		<ConfigSection title="Trading" href="/config/edit">
			<ConfigField label="Environment" value={config.trading.environment} />
			<ConfigField label="Global Model" value={config.trading.globalModel} />
			<ConfigField
				label="Cycle Interval"
				value={`${config.trading.tradingCycleIntervalMs / 60000}m`}
			/>
			<ConfigField
				label="Kelly Fraction"
				value={`${(config.trading.kellyFraction * 100).toFixed(0)}%`}
			/>
			<ConfigField
				label="Min Risk/Reward"
				value={`${config.trading.minRiskRewardRatio.toFixed(1)}:1`}
			/>
			<ConfigField
				label="Consensus Iterations"
				value={String(config.trading.maxConsensusIterations)}
			/>
		</ConfigSection>
	);
}

function UniverseConfigSummary({ universe }: { universe: UniverseConfigData }) {
	return (
		<ConfigSection title="Universe" href="/config/universe">
			<ConfigField label="Source" value={universe?.source ?? "--"} />
			<ConfigField label="Optionable Only" value={String(universe?.optionableOnly ?? false)} />
			<ConfigField label="Min Volume" value={universe?.minVolume?.toLocaleString() ?? "Not set"} />
			<ConfigField
				label="Min Market Cap"
				value={universe?.minMarketCap ? `$${(universe.minMarketCap / 1e9).toFixed(1)}B` : "Not set"}
			/>
		</ConfigSection>
	);
}

function ConstraintsConfigSummary({ constraints }: { constraints: ConstraintsConfigData }) {
	return (
		<ConfigSection title="Constraints" href="/config/constraints">
			<ConfigField
				label="Max Shares"
				value={constraints?.perInstrument?.maxShares?.toLocaleString() ?? "--"}
			/>
			<ConfigField
				label="Max Notional"
				value={`$${((constraints?.perInstrument?.maxNotional ?? 0) / 1000).toFixed(0)}K`}
			/>
			<ConfigField
				label="Max Gross Exposure"
				value={`${((constraints?.portfolio?.maxGrossExposure ?? 0) * 100).toFixed(0)}%`}
			/>
			<ConfigField
				label="Max Drawdown"
				value={`${((constraints?.portfolio?.maxDrawdown ?? 0) * 100).toFixed(0)}%`}
			/>
			<ConfigField label="Max Delta" value={String(constraints?.options?.maxDelta ?? "--")} />
		</ConfigSection>
	);
}

interface CoreConfigSectionsProps {
	configLoading: boolean;
	config: ActiveConfigData;
	universe: UniverseConfigData;
	constraints: ConstraintsConfigData;
}

function CoreConfigSections({
	configLoading,
	config,
	universe,
	constraints,
}: CoreConfigSectionsProps) {
	if (configLoading) {
		return <CoreConfigLoadingGrid />;
	}
	if (!config) {
		return null;
	}

	return (
		<div className="grid grid-cols-3 gap-6">
			<TradingConfigSummary config={config} />
			<UniverseConfigSummary universe={universe} />
			<ConstraintsConfigSummary constraints={constraints} />
		</div>
	);
}

function PreferencesGrid() {
	return (
		<div className="grid grid-cols-3 gap-6">
			<ConfigSection title="Notifications" href="/config/notifications">
				<ConfigField label="Push" value="Browser alerts" />
				<ConfigField label="Email" value="Critical alerts" />
			</ConfigSection>
			<ConfigSection title="Sound" href="/config/sound">
				<ConfigField label="Market Bell" value="Open & Close" />
				<ConfigField label="Alerts" value="Critical / Warning" />
				<ConfigField label="Trades" value="Executions & Fills" />
			</ConfigSection>
			<ConfigSection title="Display" href="/config/display">
				<ConfigField label="Theme" value="Light / Dark" />
				<ConfigField label="Market Hours" value="Auto transition" />
				<ConfigField label="Privacy" value="Show values" />
			</ConfigSection>
		</div>
	);
}

function HistoryLoadingRows() {
	return (
		<div className="p-4 space-y-2">
			{[1, 2, 3].map((i) => (
				<div key={i} className="h-12 bg-cream-100 dark:bg-night-700 rounded animate-pulse" />
			))}
		</div>
	);
}

function HistoryRows({ history }: { history: HistoryData }) {
	if (!history || history.length === 0) {
		return <div className="p-4 text-stone-400 dark:text-night-400">No configuration changes</div>;
	}

	return (
		<div className="divide-y divide-cream-100 dark:divide-night-700">
			{history.map((entry, index) => (
				<div key={entry.id ?? index} className="p-4 flex items-center justify-between">
					<div>
						<span className="font-medium text-stone-900 dark:text-night-50">v{entry.version}</span>
						{entry.isActive && (
							<span className="ml-2 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 rounded">
								Active
							</span>
						)}
					</div>
					<div className="flex items-center gap-4">
						<span className="text-sm text-stone-500 dark:text-night-300">
							{entry.changedFields?.join(", ") ?? "Configuration updated"}
						</span>
						<span className="text-xs text-stone-400 dark:text-night-400">
							{entry.createdAt
								? formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })
								: "Unknown"}
						</span>
					</div>
				</div>
			))}
		</div>
	);
}

function ConfigHistoryPanel({
	historyLoading,
	history,
}: {
	historyLoading: boolean;
	history: HistoryData;
}) {
	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700">
			<div className="p-4 border-b border-cream-200 dark:border-night-700">
				<h2 className="text-lg font-medium text-stone-900 dark:text-night-50">
					Configuration History
				</h2>
			</div>
			{historyLoading ? <HistoryLoadingRows /> : <HistoryRows history={history} />}
		</div>
	);
}

export default function ConfigPage() {
	const { data: config, isLoading: configLoading } = useActiveConfig();
	const { data: universe } = useUniverseConfig();
	const { data: constraints } = useConstraintsConfig();
	const { data: history, isLoading: historyLoading } = useRuntimeConfigHistory();

	return (
		<div className="space-y-6">
			<ConfigPageHeader config={config} />
			<CoreConfigSections
				configLoading={configLoading}
				config={config}
				universe={universe}
				constraints={constraints}
			/>
			<PreferencesGrid />
			<ConfigHistoryPanel historyLoading={historyLoading} history={history} />
		</div>
	);
}

function ConfigSection({
	title,
	href,
	children,
}: {
	title: string;
	href?: string;
	children: React.ReactNode;
}) {
	const content = (
		<>
			<div className="flex items-center justify-between mb-4">
				<h2 className="text-lg font-medium text-stone-900 dark:text-night-50">{title}</h2>
				{href && (
					<span className="text-xs text-stone-400 dark:text-night-400 group-hover:text-blue-500">
						Edit &rarr;
					</span>
				)}
			</div>
			<div className="space-y-3">{children}</div>
		</>
	);

	if (href) {
		return (
			<Link
				href={href as `/config/${string}`}
				className="block bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors group"
			>
				{content}
			</Link>
		);
	}

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-4">
			{content}
		</div>
	);
}

function ConfigField({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex justify-between items-center">
			<span className="text-sm text-stone-600 dark:text-night-200 dark:text-night-400">
				{label}
			</span>
			<span className="text-sm font-mono text-stone-900 dark:text-night-50">{value}</span>
		</div>
	);
}
