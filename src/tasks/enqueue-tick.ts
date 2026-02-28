import { migrateTasksDb } from "./migrations.js";
import { enqueueTask } from "./taskStore.js";
import { appendTaskEvent } from "./audit.js";

migrateTasksDb();

// Manual enqueue should NOT use a taskKey (we want a fresh task every time)
const id = enqueueTask({ type: "STRATEGY_TICK", payload: {} });

if (!id) {
  console.log("[enqueue] duplicate ignored (unexpected for manual enqueue)");
  process.exit(0);
}

appendTaskEvent({
  type: "TASK_ENQUEUED",
  taskId: id,
  taskType: "STRATEGY_TICK",
  runAfterMs: Date.now(),
  priority: 0,
});

console.log("[enqueue] STRATEGY_TICK", id);
