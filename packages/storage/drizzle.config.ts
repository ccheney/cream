import { defineConfig } from "drizzle-kit";

// Environment-to-database mapping (mirrors db.ts logic)
function getDatabaseUrl(): string {
	const env = process.env.CREAM_ENV ?? "PAPER";

	if (env === "PAPER") {
		return (
			process.env.DATABASE_URL_PAPER ??
			process.env.DATABASE_URL ??
			"postgresql://cream:cream_dev_password@localhost:5432/cream_paper"
		);
	}

	if (env === "LIVE") {
		return (
			process.env.DATABASE_URL_LIVE ??
			process.env.DATABASE_URL ??
			"postgresql://cream:cream_dev_password@localhost:5432/cream"
		);
	}

	return process.env.DATABASE_URL ?? "postgresql://cream:cream_dev_password@localhost:5432/cream";
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
