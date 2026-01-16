import { getDb } from "@cream/storage";
import { sql } from "drizzle-orm";

const db = getDb();
const result = await db.execute(sql`SELECT id, cycle_id, created_at, symbol, direction, action, status FROM decisions ORDER BY created_at DESC LIMIT 20`);
console.log("Recent decisions:");
for (const row of result.rows) {
  console.log(JSON.stringify(row));
}
