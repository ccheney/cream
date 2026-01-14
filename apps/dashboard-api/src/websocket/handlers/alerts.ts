/**
 * Alert Handlers
 *
 * Handlers for alert subscriptions and acknowledgment.
 */

import { requireEnv } from "@cream/domain";
import type { AcknowledgeAlertMessage } from "../../../../../packages/domain/src/websocket/index.js";
import { broadcast, sendError, sendMessage } from "../channels.js";
import type { WebSocketWithMetadata } from "../types.js";

/**
 * Handle alerts state request.
 * Returns unacknowledged alerts.
 */
export async function handleAlertsState(ws: WebSocketWithMetadata): Promise<void> {
	try {
		const { getAlertsRepo } = await import("../../db.js");
		const alertsRepo = await getAlertsRepo();
		const environment = requireEnv();
		const alerts = await alertsRepo.findUnacknowledged(environment, 50);

		for (const alert of alerts) {
			sendMessage(ws, {
				type: "alert",
				data: {
					id: alert.id,
					severity: alert.severity,
					title: alert.title,
					message: alert.message,
					category: alert.type as
						| "order"
						| "position"
						| "risk"
						| "system"
						| "agent"
						| "market"
						| undefined,
					acknowledged: alert.acknowledged,
					timestamp: alert.createdAt,
				},
			});
		}
	} catch (error) {
		sendError(
			ws,
			`Failed to get alerts state: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

/**
 * Handle acknowledge alert message.
 * Marks an alert as acknowledged in the database.
 */
export async function handleAcknowledgeAlert(
	ws: WebSocketWithMetadata,
	message: AcknowledgeAlertMessage
): Promise<void> {
	const { alertId } = message;
	const userId = ws.data.userId;

	try {
		const { getAlertsRepo } = await import("../../db.js");
		const alertsRepo = await getAlertsRepo();

		const alert = await alertsRepo.acknowledge(alertId, userId);

		broadcast("alerts", {
			type: "alert",
			data: {
				id: alert.id,
				severity: alert.severity,
				title: alert.title,
				message: alert.message,
				category: alert.type as
					| "order"
					| "position"
					| "risk"
					| "system"
					| "agent"
					| "market"
					| undefined,
				acknowledged: true,
				timestamp: alert.createdAt,
			},
		});

		sendMessage(ws, {
			type: "subscribed",
			channels: ["alerts"],
		});
	} catch (error) {
		sendError(
			ws,
			`Failed to acknowledge alert ${alertId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}
