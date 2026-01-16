import { defineConfig } from "drizzle-kit";

// Get database URL from environment (use process.env for drizzle-kit compatibility)
const databaseUrl =
	process.env.DATABASE_URL ?? "postgresql://cream:cream_dev_password@localhost:5432/cream";

export default defineConfig({
	// Schema location
	schema: "./src/schema/index.ts",

	// Output directory for migrations
	out: "./drizzle",

	// Database dialect
	dialect: "postgresql",

	// Database connection
	dbCredentials: {
		url: databaseUrl,
	},

	// Enable verbose logging during migrations
	verbose: true,

	// Enable strict mode for type checking
	strict: true,

	// Table filtering (include all tables)
	tablesFilter: ["*"],
});
