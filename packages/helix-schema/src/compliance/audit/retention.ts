/**
 * Audit Retention Policy
 *
 * SEC Rule 17a-4 retention requirements:
 * - 6-year minimum retention
 * - First 2 years: easily accessible
 * - Years 3-6: may be archived
 *
 * @module @cream/helix-schema/compliance/audit/retention
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Retention policy for audit data.
 */
export const AuditRetentionPolicy = {
	/** Minimum retention period (6 years in days) */
	MIN_RETENTION_DAYS: 6 * 365,

	/** Hot storage period (2 years in days) */
	HOT_STORAGE_DAYS: 2 * 365,

	/** Archive storage period (4 years in days) */
	ARCHIVE_STORAGE_DAYS: 4 * 365,

	/** Check if a record is within hot storage period */
	isHotStorage(timestamp: string): boolean {
		const age = Date.now() - new Date(timestamp).getTime();
		return age < this.HOT_STORAGE_DAYS * MS_PER_DAY;
	},

	/** Check if a record should be archived */
	shouldArchive(timestamp: string): boolean {
		return !this.isHotStorage(timestamp);
	},

	/** Check if a record can be deleted */
	canDelete(timestamp: string): boolean {
		const age = Date.now() - new Date(timestamp).getTime();
		return age > this.MIN_RETENTION_DAYS * MS_PER_DAY;
	},

	/** Get retention status for a record */
	getRetentionStatus(timestamp: string): {
		tier: "hot" | "archive" | "deletable";
		daysRemaining: number;
	} {
		const age = Date.now() - new Date(timestamp).getTime();
		const ageDays = Math.floor(age / MS_PER_DAY);

		if (ageDays < this.HOT_STORAGE_DAYS) {
			return {
				tier: "hot",
				daysRemaining: this.HOT_STORAGE_DAYS - ageDays,
			};
		}

		if (ageDays < this.MIN_RETENTION_DAYS) {
			return {
				tier: "archive",
				daysRemaining: this.MIN_RETENTION_DAYS - ageDays,
			};
		}

		return {
			tier: "deletable",
			daysRemaining: 0,
		};
	},
} as const;
