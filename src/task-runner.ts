import { migrateTasksDb } from "./tasks/migrations.js";
import { runTaskRunner } from "./tasks/runner.js";

async function main() {
  migrateTasksDb();
  await runTaskRunner();
}

main().catch((e) => {
  console.error("[task-runner] fatal:", e);
  process.exit(1);
});
