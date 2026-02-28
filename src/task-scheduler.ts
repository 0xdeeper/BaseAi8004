import { migrateTasksDb } from "./tasks/migrations.js";
import { runScheduler } from "./tasks/scheduler.js";

async function main() {
  migrateTasksDb();
  await runScheduler();
}

main().catch((e) => {
  console.error("[task-scheduler] fatal:", e);
  process.exit(1);
});
