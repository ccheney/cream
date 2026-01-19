"use client";

import type { ApprovalDetail, ApprovalRequiredChange, ApprovalViolation } from "@/lib/api/types";

export interface ApprovalSectionProps {
	riskApproval?: ApprovalDetail;
	criticApproval?: ApprovalDetail;
}

function ApprovalCard({
	title,
	approval,
}: {
	title: string;
	approval: ApprovalDetail;
}): React.ReactElement {
	const isApproved = approval.verdict === "APPROVE";

	return (
		<div
			className={`rounded-lg border p-4 ${
				isApproved
					? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20"
					: "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
			}`}
		>
			<div className="flex items-center gap-2 mb-3">
				<span
					className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
						isApproved
							? "bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100"
							: "bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100"
					}`}
				>
					{approval.verdict}
				</span>
				<span className="text-sm font-medium text-stone-700 dark:text-night-200">{title}</span>
			</div>

			{approval.notes && (
				<p className="text-sm text-stone-600 dark:text-night-300 mb-3">{approval.notes}</p>
			)}

			{approval.violations && approval.violations.length > 0 && (
				<div className="mb-3">
					<h4 className="text-xs font-medium text-stone-500 dark:text-night-400 uppercase tracking-wider mb-2">
						Violations
					</h4>
					<ul className="space-y-2">
						{approval.violations.map((violation: ApprovalViolation) => (
							<li
								key={`violation-${violation.constraint ?? ""}-${violation.severity ?? ""}`}
								className="text-sm bg-white dark:bg-night-800 rounded p-2 border border-red-100 dark:border-red-900"
							>
								<div className="flex items-center gap-2 mb-1">
									{violation.severity && (
										<span
											className={`text-xs px-1.5 py-0.5 rounded ${
												violation.severity === "CRITICAL"
													? "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300"
													: "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300"
											}`}
										>
											{violation.severity}
										</span>
									)}
									{violation.constraint && (
										<span className="font-medium text-stone-700 dark:text-night-200">
											{violation.constraint}
										</span>
									)}
								</div>
								{(violation.current_value !== undefined || violation.limit !== undefined) && (
									<div className="text-xs text-stone-500 dark:text-night-400">
										{violation.current_value !== undefined && (
											<span>Current: {String(violation.current_value)}</span>
										)}
										{violation.current_value !== undefined && violation.limit !== undefined && (
											<span className="mx-1">|</span>
										)}
										{violation.limit !== undefined && <span>Limit: {String(violation.limit)}</span>}
									</div>
								)}
							</li>
						))}
					</ul>
				</div>
			)}

			{approval.requiredChanges && approval.requiredChanges.length > 0 && (
				<div>
					<h4 className="text-xs font-medium text-stone-500 dark:text-night-400 uppercase tracking-wider mb-2">
						Required Changes
					</h4>
					<ul className="space-y-2">
						{approval.requiredChanges.map((change: ApprovalRequiredChange) => (
							<li
								key={`change-${change.change}`}
								className="text-sm bg-white dark:bg-night-800 rounded p-2 border border-amber-100 dark:border-amber-900"
							>
								<p className="text-stone-700 dark:text-night-200">{change.change}</p>
								{change.reason && (
									<p className="text-xs text-stone-500 dark:text-night-400 mt-1">{change.reason}</p>
								)}
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}

export function ApprovalSection({
	riskApproval,
	criticApproval,
}: ApprovalSectionProps): React.ReactElement | null {
	if (!riskApproval && !criticApproval) {
		return null;
	}

	return (
		<div className="bg-white dark:bg-night-800 rounded-lg border border-cream-200 dark:border-night-700 p-6">
			<h2 className="text-lg font-medium text-stone-900 dark:text-night-50 mb-4">
				Approval Status
			</h2>
			<div className="grid md:grid-cols-2 gap-4">
				{riskApproval && <ApprovalCard title="Risk Manager" approval={riskApproval} />}
				{criticApproval && <ApprovalCard title="Critic" approval={criticApproval} />}
			</div>
		</div>
	);
}
