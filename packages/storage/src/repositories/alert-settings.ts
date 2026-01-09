/**
 * Alert Settings Repository
 *
 * Data access for alert_settings table. Manages per-user alert notification
 * preferences that persist across server restarts.
 *
 * @see apps/dashboard-api/src/routes/alerts.ts
 */

import type { Row, TursoClient } from "../turso.js";
import { fromBoolean, RepositoryError, toBoolean } from "./base.js";

// ============================================
// Types
// ============================================

/**
 * Quiet hours configuration
 */
export interface QuietHours {
  /** Start time in HH:MM format (24-hour) */
  start: string;
  /** End time in HH:MM format (24-hour) */
  end: string;
}

/**
 * Alert settings entity
 */
export interface AlertSettings {
  id: string;
  userId: string;
  /** Enable push notifications */
  enablePush: boolean;
  /** Enable email notifications */
  enableEmail: boolean;
  /** Email address for alerts (null = use account email) */
  emailAddress: string | null;
  /** Only send critical alerts */
  criticalOnly: boolean;
  /** Quiet hours configuration (null = no quiet hours) */
  quietHours: QuietHours | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create alert settings input
 */
export interface CreateAlertSettingsInput {
  id: string;
  userId: string;
  enablePush?: boolean;
  enableEmail?: boolean;
  emailAddress?: string | null;
  criticalOnly?: boolean;
  quietHours?: QuietHours | null;
}

/**
 * Update alert settings input (partial)
 */
export interface UpdateAlertSettingsInput {
  enablePush?: boolean;
  enableEmail?: boolean;
  emailAddress?: string | null;
  criticalOnly?: boolean;
  quietHours?: QuietHours | null;
}

// ============================================
// Row Mapper
// ============================================

function mapAlertSettingsRow(row: Row): AlertSettings {
  const quietHoursStart = row.quiet_hours_start as string | null;
  const quietHoursEnd = row.quiet_hours_end as string | null;

  return {
    id: row.id as string,
    userId: row.user_id as string,
    enablePush: toBoolean(row.enable_push),
    enableEmail: toBoolean(row.enable_email),
    emailAddress: row.email_address as string | null,
    criticalOnly: toBoolean(row.critical_only),
    quietHours:
      quietHoursStart && quietHoursEnd ? { start: quietHoursStart, end: quietHoursEnd } : null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ============================================
// Repository
// ============================================

/**
 * Alert settings repository
 */
export class AlertSettingsRepository {
  private readonly table = "alert_settings";

  constructor(private readonly client: TursoClient) {}

  /**
   * Create new alert settings for a user
   */
  async create(input: CreateAlertSettingsInput): Promise<AlertSettings> {
    try {
      await this.client.run(
        `INSERT INTO ${this.table} (
          id, user_id, enable_push, enable_email, email_address,
          critical_only, quiet_hours_start, quiet_hours_end
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.id,
          input.userId,
          fromBoolean(input.enablePush ?? true),
          fromBoolean(input.enableEmail ?? true),
          input.emailAddress ?? null,
          fromBoolean(input.criticalOnly ?? false),
          input.quietHours?.start ?? null,
          input.quietHours?.end ?? null,
        ]
      );
    } catch (error) {
      throw RepositoryError.fromSqliteError(this.table, error as Error);
    }

    return this.findById(input.id) as Promise<AlertSettings>;
  }

  /**
   * Find alert settings by ID
   */
  async findById(id: string): Promise<AlertSettings | null> {
    const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE id = ?`, [id]);

    return row ? mapAlertSettingsRow(row) : null;
  }

  /**
   * Find alert settings by user ID
   */
  async findByUserId(userId: string): Promise<AlertSettings | null> {
    const row = await this.client.get<Row>(`SELECT * FROM ${this.table} WHERE user_id = ?`, [
      userId,
    ]);

    return row ? mapAlertSettingsRow(row) : null;
  }

  /**
   * Get or create alert settings for a user
   * Returns existing settings or creates default settings if none exist
   */
  async getOrCreate(userId: string): Promise<AlertSettings> {
    const existing = await this.findByUserId(userId);
    if (existing) {
      return existing;
    }

    // Create default settings
    const id = `as_${userId}_${Date.now()}`;
    return this.create({
      id,
      userId,
      enablePush: true,
      enableEmail: true,
      emailAddress: null,
      criticalOnly: false,
      quietHours: null,
    });
  }

  /**
   * Update alert settings for a user
   */
  async update(userId: string, input: UpdateAlertSettingsInput): Promise<AlertSettings> {
    const existing = await this.findByUserId(userId);
    const now = new Date().toISOString();

    if (!existing) {
      // Create with updates applied
      const id = `as_${userId}_${Date.now()}`;
      return this.create({
        id,
        userId,
        enablePush: input.enablePush ?? true,
        enableEmail: input.enableEmail ?? true,
        emailAddress: input.emailAddress ?? null,
        criticalOnly: input.criticalOnly ?? false,
        quietHours: input.quietHours ?? null,
      });
    }

    // Build update query
    const updateFields: string[] = [];
    const updateValues: unknown[] = [];

    if (input.enablePush !== undefined) {
      updateFields.push("enable_push = ?");
      updateValues.push(fromBoolean(input.enablePush));
    }
    if (input.enableEmail !== undefined) {
      updateFields.push("enable_email = ?");
      updateValues.push(fromBoolean(input.enableEmail));
    }
    if (input.emailAddress !== undefined) {
      updateFields.push("email_address = ?");
      updateValues.push(input.emailAddress);
    }
    if (input.criticalOnly !== undefined) {
      updateFields.push("critical_only = ?");
      updateValues.push(fromBoolean(input.criticalOnly));
    }
    if (input.quietHours !== undefined) {
      updateFields.push("quiet_hours_start = ?");
      updateFields.push("quiet_hours_end = ?");
      updateValues.push(input.quietHours?.start ?? null);
      updateValues.push(input.quietHours?.end ?? null);
    }

    if (updateFields.length > 0) {
      updateFields.push("updated_at = ?");
      updateValues.push(now);
      updateValues.push(existing.id);

      await this.client.run(
        `UPDATE ${this.table} SET ${updateFields.join(", ")} WHERE id = ?`,
        updateValues
      );
    }

    return this.findByUserId(userId) as Promise<AlertSettings>;
  }

  /**
   * Delete alert settings for a user
   */
  async deleteByUserId(userId: string): Promise<boolean> {
    const result = await this.client.run(`DELETE FROM ${this.table} WHERE user_id = ?`, [userId]);

    return result.changes > 0;
  }

  /**
   * Delete alert settings by ID
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.client.run(`DELETE FROM ${this.table} WHERE id = ?`, [id]);

    return result.changes > 0;
  }
}
