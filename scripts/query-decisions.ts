import { decisions, getDb } from "@cream/storage";
import { desc } from "drizzle-orm";

const db = getDb();
const rows = await db
	.select({
		id: decisions.id,
		cycleId: decisions.cycleId,
		createdAt: decisions.createdAt,
		symbol: decisions.symbol,
		direction: decisions.direction,
		action: decisions.action,
		status: decisions.status,
	})
	.from(decisions)
	.orderBy(desc(decisions.createdAt))
	.limit(20);

process.stdout.write("Recent decisions:\n");
for (const row of rows) {
	process.stdout.write(`${JSON.stringify(row)}\n`);
}
