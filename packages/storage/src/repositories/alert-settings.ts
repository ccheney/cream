/**
 * Alert Settings Repository (Drizzle ORM)
 *
 * Data access for alert_settings table. Manages per-user alert notification
 * preferences that persist across server restarts.
 *
 * @see apps/dashboard-api/src/routes/alerts.ts
 */
import { eq } from "drizzle-orm";
import { type Database, getDb } from "../db";
import { alertSettings } from "../schema/user-settings";

// ============================================
// Types
// ============================================

export interface QuietHours {
	start: string;
	end: string;
}

export interface AlertSettings {
	id: string;
	userId: string;
	enablePush: boolean;
	enableEmail: boolean;
	emailAddress: string | null;
	criticalOnly: boolean;
	quietHours: QuietHours | null;
	createdAt: string;
	updatedAt: string;
}

export interface CreateAlertSettingsInput {
	userId: string;
	enablePush?: boolean;
	enableEmail?: boolean;
	emailAddress?: string | null;
	criticalOnly?: boolean;
	quietHours?: QuietHours | null;
}

export interface UpdateAlertSettingsInput {
	enablePush?: boolean;
	enableEmail?: boolean;
	emailAddress?: string | null;
	criticalOnly?: boolean;
	quietHours?: QuietHours | null;
}

// ============================================
// Row Mapping
// ============================================

type AlertSettingsRow = typeof alertSettings.$inferSelect;

function mapAlertSettingsRow(row: AlertSettingsRow): AlertSettings {
	const quietHoursStart = row.quietHoursStart;
	const quietHoursEnd = row.quietHoursEnd;

	return {
		id: row.id,
		userId: row.userId,
		enablePush: row.enablePush,
		enableEmail: row.enableEmail,
		emailAddress: row.emailAddress,
		criticalOnly: row.criticalOnly,
		quietHours:
			quietHoursStart && quietHoursEnd ? { start: quietHoursStart, end: quietHoursEnd } : null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

// ============================================
// Repository
// ============================================

export class AlertSettingsRepository {
	private db: Database;

	constructor(db?: Database) {
		this.db = db ?? getDb();
	}

	async create(input: CreateAlertSettingsInput): Promise<AlertSettings> {
		const [row] = await this.db
			.insert(alertSettings)
			.values({
				userId: input.userId,
				enablePush: input.enablePush ?? true,
				enableEmail: input.enableEmail ?? true,
				emailAddress: input.emailAddress ?? null,
				criticalOnly: input.criticalOnly ?? false,
				quietHoursStart: input.quietHours?.start ?? null,
				quietHoursEnd: input.quietHours?.end ?? null,
			})
			.returning();

		if (!row) {
			throw new Error("Failed to create alert settings");
		}
		return mapAlertSettingsRow(row);
	}

	async findById(id: string): Promise<AlertSettings | null> {
		const [row] = await this.db
			.select()
			.from(alertSettings)
			.where(eq(alertSettings.id, id))
			.limit(1);

		return row ? mapAlertSettingsRow(row) : null;
	}

	async findByUserId(userId: string): Promise<AlertSettings | null> {
		const [row] = await this.db
			.select()
			.from(alertSettings)
			.where(eq(alertSettings.userId, userId))
			.limit(1);

		return row ? mapAlertSettingsRow(row) : null;
	}

	async getOrCreate(userId: string): Promise<AlertSettings> {
		const existing = await this.findByUserId(userId);
		if (existing) {
			return existing;
		}

		return this.create({
			userId,
			enablePush: true,
			enableEmail: true,
			emailAddress: null,
			criticalOnly: false,
			quietHours: null,
		});
	}

	async update(userId: string, input: UpdateAlertSettingsInput): Promise<AlertSettings> {
		const existing = await this.findByUserId(userId);

		if (!existing) {
			return this.create({
				userId,
				enablePush: input.enablePush ?? true,
				enableEmail: input.enableEmail ?? true,
				emailAddress: input.emailAddress ?? null,
				criticalOnly: input.criticalOnly ?? false,
				quietHours: input.quietHours ?? null,
			});
		}

		const updates: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		if (input.enablePush !== undefined) {
			updates.enablePush = input.enablePush;
		}
		if (input.enableEmail !== undefined) {
			updates.enableEmail = input.enableEmail;
		}
		if (input.emailAddress !== undefined) {
			updates.emailAddress = input.emailAddress;
		}
		if (input.criticalOnly !== undefined) {
			updates.criticalOnly = input.criticalOnly;
		}
		if (input.quietHours !== undefined) {
			updates.quietHoursStart = input.quietHours?.start ?? null;
			updates.quietHoursEnd = input.quietHours?.end ?? null;
		}

		const [row] = await this.db
			.update(alertSettings)
			.set(updates)
			.where(eq(alertSettings.id, existing.id))
			.returning();

		if (!row) {
			throw new Error("Failed to update alert settings");
		}
		return mapAlertSettingsRow(row);
	}

	async deleteByUserId(userId: string): Promise<boolean> {
		const result = await this.db
			.delete(alertSettings)
			.where(eq(alertSettings.userId, userId))
			.returning({ id: alertSettings.id });

		return result.length > 0;
	}

	async delete(id: string): Promise<boolean> {
		const result = await this.db
			.delete(alertSettings)
			.where(eq(alertSettings.id, id))
			.returning({ id: alertSettings.id });

		return result.length > 0;
	}
}
