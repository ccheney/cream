import { createTursoClient } from "@cream/storage";
import { createContext } from "@cream/domain";

const ctx = createContext("PAPER", "manual");
const db = await createTursoClient(ctx);
const result = await db.execute("SELECT id, cycle_id, created_at, symbol, direction, action, status FROM decisions ORDER BY created_at DESC LIMIT 20");
console.log("Recent decisions:");
for (const row of result.rows) {
  console.log(JSON.stringify(row));
}
