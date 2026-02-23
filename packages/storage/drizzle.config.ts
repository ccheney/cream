import { defineConfig } from "drizzle-kit";

// Environment-to-database mapping (mirrors db.ts logic)
function getDatabaseUrl(): string {
	const env = process.env.CREAM_ENV;
	if (!env) {
		throw new Error("CREAM_ENV environment variable is required. Set it to PAPER or LIVE.");
	}

	if (env === "PAPER") {
		const url = process.env.DATABASE_URL_PAPER;
		if (!url) {
			throw new Error("DATABASE_URL_PAPER environment variable is required when CREAM_ENV=PAPER.");
		}
		return url;
	}

	if (env === "LIVE") {
		const url = process.env.DATABASE_URL_LIVE;
		if (!url) {
			throw new Error("DATABASE_URL_LIVE environment variable is required when CREAM_ENV=LIVE.");
		}
		return url;
	}

	throw new Error(`Invalid CREAM_ENV value '${env}'. Supported values are PAPER and LIVE.`);
}

const databaseUrl = getDatabaseUrl();

export default defineConfig({
	schema: "./src/schema/index.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: databaseUrl,
	},
	verbose: true,
	strict: true,
});
